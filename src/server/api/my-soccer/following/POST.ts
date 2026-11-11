/**
 * POST /api/my-soccer/following
 * Toggle follow/unfollow for a source, team, or competition.
 * Body: { entityId: string, entityType: 'team' | 'competition' | 'source', action: 'follow' | 'unfollow' }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scUserFollowing } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { entityId, entityType, action } = req.body as Record<string, unknown>;

  if (typeof entityId !== 'string' || !entityId) {
    res.status(400).json({ error: 'entityId required' });
    return;
  }
  if (!['team', 'competition', 'source'].includes(entityType as string)) {
    res.status(400).json({ error: 'entityType must be team | competition | source' });
    return;
  }
  if (!['follow', 'unfollow'].includes(action as string)) {
    res.status(400).json({ error: 'action must be follow | unfollow' });
    return;
  }

  const existing = await db
    .select({ id: scUserFollowing.id })
    .from(scUserFollowing)
    .where(
      and(
        eq(scUserFollowing.userId, userId),
        eq(scUserFollowing.entityId, entityId),
        eq(scUserFollowing.entityType, entityType as string),
      )
    )
    .limit(1);

  if (action === 'follow') {
    if (existing.length === 0) {
      await db.insert(scUserFollowing).values({
        id: randomUUID(),
        userId,
        entityType: entityType as string,
        entityId,
      });
    }
    res.json({ ok: true, following: true });
  } else {
    if (existing.length > 0) {
      await db.delete(scUserFollowing).where(eq(scUserFollowing.id, existing[0].id));
    }
    res.json({ ok: true, following: false });
  }
}
