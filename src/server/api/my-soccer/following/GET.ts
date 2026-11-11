/**
 * GET /api/my-soccer/following
 * Returns all entities the current user follows (fan-scoped).
 * Response: { follows: Array<{ id, entityType, entityId, followedAt }> }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scUserFollowing } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select({
        id: scUserFollowing.id,
        entityType: scUserFollowing.entityType,
        entityId: scUserFollowing.entityId,
        followedAt: scUserFollowing.followedAt,
      })
      .from(scUserFollowing)
      .where(eq(scUserFollowing.userId, userId));

    res.json({ follows: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load follows', message: String(err) });
  }
}
