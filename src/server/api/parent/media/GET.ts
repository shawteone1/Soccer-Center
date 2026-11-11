/**
 * GET /api/parent/media
 * Returns the authenticated parent's uploaded media items (not soft-deleted).
 * Ordered newest first.
 *
 * Query params:
 *   limit  — max items (default 50, max 100)
 *   offset — pagination offset (default 0)
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentMedia } from '@/server/db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const limitRaw = parseInt((req.query.limit as string | undefined) ?? '50', 10);
  const offsetRaw = parseInt((req.query.offset as string | undefined) ?? '0', 10);
  const limit = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 100);
  const offset = isNaN(offsetRaw) ? 0 : offsetRaw;

  try {
    const items = await db
      .select()
      .from(scParentMedia)
      .where(and(eq(scParentMedia.userId, user.id), isNull(scParentMedia.deletedAt)))
      .orderBy(desc(scParentMedia.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      media: items.map(m => ({
        id: m.id,
        postId: m.postId,
        publicUrl: m.publicUrl,
        mediaType: m.mediaType,
        caption: m.caption,
        originalName: m.originalName,
        sizeBytes: m.sizeBytes,
        createdAt: m.createdAt?.toISOString() ?? null,
      })),
      total: items.length,
    });
  } catch (e) {
    console.error('[GET /api/parent/media]', e);
    res.status(500).json({ error: 'Failed to load media' });
  }
}
