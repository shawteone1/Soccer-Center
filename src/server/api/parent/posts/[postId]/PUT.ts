/**
 * PUT /api/parent/posts/:postId
 * Edit a post's body or audience. Author only.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentPosts } from '@/server/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

const VALID_AUDIENCES = ['only_me', 'family'] as const;
type Audience = typeof VALID_AUDIENCES[number];

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const postId = String(req.params.postId);
  const { body: postBody, audience } = req.body as { body?: string; audience?: string };

  if (audience && !VALID_AUDIENCES.includes(audience as Audience)) {
    return res.status(400).json({ error: 'Invalid audience' });
  }

  try {
    const [existing] = await db
      .select()
      .from(scParentPosts)
      .where(and(eq(scParentPosts.id, postId), isNull(scParentPosts.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Post not found' });
    if (existing.authorUserId !== user.id) return res.status(403).json({ error: 'Forbidden' });

    await db
      .update(scParentPosts)
      .set({
        ...(postBody !== undefined ? { body: postBody.trim() } : {}),
        ...(audience ? { audience: audience as Audience } : {}),
        editedAt: new Date(),
      })
      .where(eq(scParentPosts.id, postId));

    res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /api/parent/posts/:postId]', e);
    res.status(500).json({ error: 'Failed to update post' });
  }
}
