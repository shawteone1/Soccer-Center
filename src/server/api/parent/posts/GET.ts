/**
 * GET /api/parent/posts
 * Returns the authenticated parent's own posts (audience: only_me).
 * Family/connections posts will be added when those features are live.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentPosts } from '@/server/db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  try {
    const posts = await db
      .select()
      .from(scParentPosts)
      .where(
        and(
          eq(scParentPosts.authorUserId, user.id),
          isNull(scParentPosts.deletedAt),
        )
      )
      .orderBy(desc(scParentPosts.createdAt))
      .limit(50);

    const result = posts.map(p => ({
      id: p.id,
      audience: p.audience,
      body: p.body,
      mediaUrls: p.mediaUrls ? (JSON.parse(p.mediaUrls) as { url: string; type: string; caption?: string }[]) : [],
      sharedSourceUrl: p.sharedSourceUrl,
      sharedSourceTitle: p.sharedSourceTitle,
      sharedSourceAttribution: p.sharedSourceAttribution,
      editedAt: p.editedAt?.toISOString() ?? null,
      createdAt: p.createdAt?.toISOString() ?? null,
    }));

    res.json({ posts: result });
  } catch (e) {
    console.error('[GET /api/parent/posts]', e);
    res.status(500).json({ error: 'Failed to load posts' });
  }
}
