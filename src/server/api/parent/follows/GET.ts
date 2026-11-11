/**
 * GET /api/parent/follows
 * Returns the authenticated parent's source follows.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentFollows } from '@/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  try {
    const follows = await db
      .select()
      .from(scParentFollows)
      .where(eq(scParentFollows.userId, user.id))
      .orderBy(desc(scParentFollows.createdAt));

    res.json({ follows: follows.map(f => ({
      id: f.id,
      sourceType: f.sourceType,
      sourceId: f.sourceId,
      sourceName: f.sourceName,
      createdAt: f.createdAt?.toISOString() ?? null,
    })) });
  } catch (e) {
    console.error('[GET /api/parent/follows]', e);
    res.status(500).json({ error: 'Failed to load follows' });
  }
}
