/**
 * POST /api/parent/follows
 * Follow a source. Idempotent — re-following an already-followed source is a no-op.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentFollows } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const VALID_TYPES = ['club', 'team', 'org', 'vendor', 'media'] as const;
type SourceType = typeof VALID_TYPES[number];

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { sourceType, sourceId, sourceName } = req.body as {
    sourceType?: string;
    sourceId?: string;
    sourceName?: string;
  };

  if (!sourceType || !VALID_TYPES.includes(sourceType as SourceType)) {
    return res.status(400).json({ error: `sourceType must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (!sourceId?.trim()) {
    return res.status(400).json({ error: 'sourceId is required' });
  }

  try {
    // Idempotent — check if already following
    const [existing] = await db
      .select({ id: scParentFollows.id })
      .from(scParentFollows)
      .where(and(
        eq(scParentFollows.userId, user.id),
        eq(scParentFollows.sourceId, sourceId.trim()),
      ))
      .limit(1);

    if (existing) {
      return res.json({ id: existing.id, alreadyFollowing: true });
    }

    const id = randomUUID();
    await db.insert(scParentFollows).values({
      id,
      userId: user.id,
      sourceType: sourceType as SourceType,
      sourceId: sourceId.trim(),
      sourceName: sourceName?.trim() ?? null,
    });

    res.status(201).json({ id, alreadyFollowing: false });
  } catch (e) {
    console.error('[POST /api/parent/follows]', e);
    res.status(500).json({ error: 'Failed to follow source' });
  }
}
