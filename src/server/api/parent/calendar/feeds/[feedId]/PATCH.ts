/**
 * PATCH /api/parent/calendar/feeds/:feedId
 *
 * Update mutable fields on a saved iCal feed.
 *
 * Body (all optional):
 *   addPlayerId — add one owned active player without replacing existing scope
 *   label     — friendly name
 *   playerIds — string[] of sc_player_profiles.id to scope this feed to.
 *               Pass null or [] to make the feed family-wide (shown for all players).
 *
 * Protected by requireParentAccess(). Feed must belong to the caller.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const feedId = Array.isArray(req.params.feedId) ? req.params.feedId[0] : req.params.feedId;

  const { label, playerIds, addPlayerId } = (req.body ?? {}) as {
    addPlayerId?: unknown;
    label?: string;
    playerIds?: string[] | null;
  };

  // Existing-feed UI sends an additive request, never a replacement list.
  if (addPlayerId !== undefined) {
    if (typeof addPlayerId !== 'string' || !addPlayerId.trim() || playerIds !== undefined) {
      res.status(400).json({error:'Provide one valid addPlayerId without playerIds.'}); return;
    }
    const id = addPlayerId.trim();
    try {
      const result = await db.transaction(async tx => {
        const players = await tx.execute(sql`SELECT id FROM sc_player_profiles WHERE id = ${id} AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`);
        if (!(players as unknown as [unknown[]])[0].length) return {status:404, error:'Player not found'};
        const rows = await tx.execute(sql`SELECT player_ids FROM sc_calendar_feeds WHERE id = ${feedId} AND user_id = ${user.id} AND portal_context = 'parent' FOR UPDATE`);
        const feed = (rows as unknown as [Array<{player_ids:string|null}>])[0][0];
        if (!feed) return {status:404, error:'Feed not found'};
        const stored: unknown = typeof feed.player_ids === 'string' ? JSON.parse(feed.player_ids) : feed.player_ids;
        if (stored !== null && (!Array.isArray(stored) || !stored.every(p => typeof p === 'string'))) throw new Error('Invalid stored player scope');
        // null/[] already means every player in this family. Never narrow it.
        const next = !stored || !(stored as string[]).length ? null : [...new Set([...(stored as string[]), id])];
        await tx.execute(sql`UPDATE sc_calendar_feeds SET player_ids = ${next ? JSON.stringify(next) : null} WHERE id = ${feedId} AND user_id = ${user.id} AND portal_context = 'parent'`);
        return {status:200, playerIds:next};
      });
      if (result.status !== 200) {res.status(result.status).json({error:result.error}); return;}
      res.json({ok:true,playerIds:result.playerIds});
    } catch (e) {
      console.error('[PATCH calendar feed] additive link failed');
      res.status(500).json({error:'Could not link the feed. Existing player links were preserved. Please retry.'});
    }
    return;
  }

  // Build update payload — only include fields that were provided
  const updates: Partial<{
    label: string;
    playerIds: string | null;
  }> = {};

  if (typeof label === 'string' && label.trim()) {
    updates.label = label.trim();
  }

  if (playerIds !== undefined) {
    if (playerIds === null || (Array.isArray(playerIds) && playerIds.length === 0)) {
      // Explicitly family-wide
      updates.playerIds = null;
    } else if (Array.isArray(playerIds)) {
      const valid = playerIds.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      updates.playerIds = valid.length > 0 ? JSON.stringify(valid) : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided. Supported: label, playerIds.' });
    return;
  }

  try {
    const result = await db
      .update(scCalendarFeeds)
      .set(updates)
      .where(and(eq(scCalendarFeeds.id, feedId), eq(scCalendarFeeds.userId, user.id)));

    // mysql2 returns [ResultSetHeader, ...] — check affectedRows
    const header = (result as unknown as [{ affectedRows?: number }])[0];
    if (!header?.affectedRows) {
      res.status(404).json({ error: 'Feed not found' });
      return;
    }

    res.json({
      ok: true,
      playerIds: updates.playerIds !== undefined
        ? (updates.playerIds ? (JSON.parse(updates.playerIds) as string[]) : null)
        : undefined,
    });
  } catch (e) {
    console.error('[PATCH /api/parent/calendar/feeds/:feedId]', e);
    res.status(500).json({ error: 'Failed to update feed' });
  }
}
