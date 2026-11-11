/**
 * POST /api/parent/players/:playerId/media-assignments
 *
 * Assigns an existing sc_parent_media item to a player.
 *
 * Body: { mediaId, season?, gameEventRef?, kind?, title? }
 *
 * Protected by requireParentAccess(). Both player and media must belong to caller.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;
  const { mediaId, season, gameEventRef, kind, title } = (req.body ?? {}) as {
    mediaId?: string; season?: string; gameEventRef?: string; kind?: string; title?: string;
  };

  if (typeof mediaId !== 'string' || !mediaId.trim()) { res.status(400).json({ error: 'mediaId is required' }); return; }

  if (gameEventRef != null && (typeof gameEventRef !== 'string' || !gameEventRef.trim() || gameEventRef.length > 256)) {
    res.status(400).json({ error: 'Invalid game reference' }); return;
  }
  if (title != null && typeof title !== 'string') {
    res.status(400).json({ error: 'Invalid title' }); return;
  }
  const gameRef = gameEventRef?.trim() || null;

  // Verify player ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`
    );
    if (!(rows as unknown as [unknown[]])[0].length) {
      res.status(404).json({ error: 'Player not found' }); return;
    }
  } catch (e) {
    console.error('[POST /media-assignments] player check', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  let mediaType = 'image';
  // Verify media ownership
  try {
    const rows = await db.execute(
      sql`SELECT id, media_type FROM sc_parent_media WHERE id = ${mediaId} AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`
    );
    const mediaRows = (rows as unknown as [Array<{id: string; media_type: string}>])[0];
    if (!mediaRows.length) {
      res.status(404).json({ error: 'Media not found' }); return;
    }
    mediaType = mediaRows[0].media_type;
  } catch (e) {
    console.error('[POST /media-assignments] media check', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  // A game reference must resolve within this parent's player/family schedule.
  if (gameRef) {
    try {
      const manual = await db.execute(sql`SELECT id FROM sc_parent_manual_events
        WHERE id = ${gameRef} AND user_id = ${user.id}
          AND (player_id = ${playerId} OR player_id IS NULL) AND event_type = 'game' LIMIT 1`);
      let found = (manual as unknown as [unknown[]])[0].length > 0;
      if (!found) {
        const feed = await db.execute(sql`SELECT ce.id FROM sc_calendar_events ce
          INNER JOIN sc_calendar_feeds f ON f.id = ce.feed_id
          WHERE ce.user_id = ${user.id} AND f.user_id = ${user.id} AND f.portal_context = 'parent' AND f.visible = 1
            AND (f.player_ids IS NULL OR f.player_ids = '[]'
                 OR JSON_CONTAINS(f.player_ids, ${JSON.stringify(playerId)}))
            AND CONCAT(f.id, ':', ce.uid) = ${gameRef}
            AND ce.event_type = 'game' LIMIT 1`);
        found = (feed as unknown as [unknown[]])[0].length > 0;
      }
      if (!found) { res.status(404).json({ error: 'Game not found in this player’s schedule' }); return; }
    } catch (e) {
      console.error('[POST /media-assignments] game check', e);
      res.status(503).json({ error: 'Could not verify the game. Please retry.' }); return;
    }
  }

  const id = randomUUID();
  const safeKind = mediaType === 'video' ? (kind === 'highlight' ? 'highlight' : 'video') : 'photo';

  try {
    // Keep the existing unique (media_id, player_id) contract. A previously
    // untagged library assignment can be attached without changing its ID,
    // so existing collections and explicitly selected coach links stay valid.
    const result = await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO sc_player_media_assignments
        (id, user_id, media_id, player_id, season, game_event_ref, kind, title)
        VALUES (${id}, ${user.id}, ${mediaId}, ${playerId}, ${season ?? null}, ${gameRef}, ${safeKind}, ${title?.slice(0, 255) ?? null})
        ON DUPLICATE KEY UPDATE id = id`);
      const rows = await tx.execute(sql`SELECT id, game_event_ref FROM sc_player_media_assignments
        WHERE media_id = ${mediaId} AND player_id = ${playerId} AND user_id = ${user.id} FOR UPDATE`);
      const existing = (rows as unknown as [Array<{ id: string; game_event_ref: string | null }>])[0][0];
      if (!existing) throw new Error('Assignment unavailable');
      if (gameRef && existing.game_event_ref && existing.game_event_ref !== gameRef) {
        return { conflict: true as const };
      }
      if (gameRef && !existing.game_event_ref) {
        await tx.execute(sql`UPDATE sc_player_media_assignments SET game_event_ref = ${gameRef}
          WHERE id = ${existing.id} AND user_id = ${user.id} AND player_id = ${playerId}`);
      }
      return { conflict: false as const, id: existing.id, created: existing.id === id };
    });
    if (result.conflict) {
      res.status(409).json({ error: 'This media is attached to another game. Detach it from that game first.', code: 'MEDIA_ATTACHED_TO_OTHER_GAME' });
      return;
    }
    res.status(result.created ? 201 : 200).json({ id: result.id, ok: true });
  } catch (err) {
    console.error('[POST /media-assignments]', err);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
}
