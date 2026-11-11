/**
 * PATCH /api/parent/media/:mediaId
 * Update the caption of a media item owned by the authenticated parent.
 *
 * Body: { caption: string }
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentMedia } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { mediaId: mediaIdParam } = req.params;
  const mediaId = Array.isArray(mediaIdParam) ? mediaIdParam[0] : mediaIdParam;
  const { caption } = req.body as { caption?: string };

  if (!mediaId?.trim()) {
    return res.status(400).json({ error: 'mediaId is required' });
  }

  try {
    const [existing] = await db
      .select({ id: scParentMedia.id })
      .from(scParentMedia)
      .where(and(eq(scParentMedia.id, mediaId), eq(scParentMedia.userId, user.id)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Media not found' });
    }

    await db
      .update(scParentMedia)
      .set({ caption: caption?.slice(0, 512) ?? null })
      .where(and(eq(scParentMedia.id, mediaId), eq(scParentMedia.userId, user.id)));

    res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /api/parent/media/:mediaId]', e);
    res.status(500).json({ error: 'Failed to update caption' });
  }
}
