/**
 * DELETE /api/parent/posts/:postId
 * Soft-delete a post. Author only.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentPosts } from '@/server/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const postId = String(req.params.postId);

  try {
    const [existing] = await db
      .select({ authorUserId: scParentPosts.authorUserId })
      .from(scParentPosts)
      .where(and(eq(scParentPosts.id, postId), isNull(scParentPosts.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Post not found' });
    if (existing.authorUserId !== user.id) return res.status(403).json({ error: 'Forbidden' });

    await db
      .update(scParentPosts)
      .set({ deletedAt: new Date() })
      .where(eq(scParentPosts.id, postId));

    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/parent/posts/:postId]', e);
    res.status(500).json({ error: 'Failed to delete post' });
  }
}
