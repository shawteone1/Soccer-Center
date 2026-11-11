/**
 * DELETE /api/parent/follows/:followId
 * Unfollow a source. Owner only.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentFollows } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const followId = String(req.params.followId);

  try {
    const [existing] = await db
      .select({ userId: scParentFollows.userId })
      .from(scParentFollows)
      .where(eq(scParentFollows.id, followId))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Follow not found' });
    if (existing.userId !== user.id) return res.status(403).json({ error: 'Forbidden' });

    await db
      .delete(scParentFollows)
      .where(and(eq(scParentFollows.id, followId), eq(scParentFollows.userId, user.id)));

    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/parent/follows/:followId]', e);
    res.status(500).json({ error: 'Failed to unfollow' });
  }
}
