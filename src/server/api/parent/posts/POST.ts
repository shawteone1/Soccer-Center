/**
 * POST /api/parent/posts
 * Create a new parent post.
 * audience must be 'only_me' | 'family' | 'connections'.
 * 'connections' is blocked until connections feature is live.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentPosts, scParentProfiles } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const VALID_AUDIENCES = ['only_me', 'family'] as const;
type Audience = typeof VALID_AUDIENCES[number];

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { body: postBody, audience, mediaUrls } = req.body as {
    body?: string;
    audience?: string;
    mediaUrls?: { url: string; type: string; caption?: string }[];
  };

  // Validate
  if (!postBody?.trim() && (!mediaUrls || mediaUrls.length === 0)) {
    return res.status(400).json({ error: 'Post must have text or media' });
  }
  if (!audience || !VALID_AUDIENCES.includes(audience as Audience)) {
    return res.status(400).json({ error: `audience must be one of: ${VALID_AUDIENCES.join(', ')}` });
  }
  if ((postBody?.length ?? 0) > 2000) {
    return res.status(400).json({ error: 'Post body exceeds 2000 characters' });
  }

  try {
    // Look up familyId for this parent
    const [parentProfile] = await db
      .select({ familyId: scParentProfiles.familyId })
      .from(scParentProfiles)
      .where(eq(scParentProfiles.userId, user.id))
      .limit(1);

    const id = randomUUID();
    await db.insert(scParentPosts).values({
      id,
      authorUserId: user.id,
      familyId: parentProfile?.familyId ?? null,
      audience: audience as Audience,
      body: postBody?.trim() ?? null,
      mediaUrls: mediaUrls && mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
    });

    // Return the full Post shape so the frontend can render the new post
    // immediately without a separate GET. All fields must match the GET response
    // shape — omitting any field causes a crash when PostCard accesses it.
    res.status(201).json({
      id,
      audience,
      body: postBody?.trim() ?? null,
      mediaUrls: mediaUrls && mediaUrls.length > 0 ? mediaUrls : [],
      sharedSourceUrl: null,
      sharedSourceTitle: null,
      sharedSourceAttribution: null,
      editedAt: null,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[POST /api/parent/posts]', e);
    res.status(500).json({ error: 'Failed to create post' });
  }
}
