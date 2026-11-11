/**
 * GET /api/parent/uploads/media/:mediaId
 *
 * Ownership-enforced delivery of a parent media file (photo or video).
 *
 * SECURITY
 * ────────
 * - Requires a valid BetterAuth session (requireParentAccess).
 * - The authenticated user must own the media record (user_id match).
 * - Returns 404 for unknown records, wrong owner, deleted items, or missing file.
 * - No information leakage: 404 is returned for all failure modes.
 * - Supports HTTP Range requests for video seeking.
 *
 * MIGRATION
 * ─────────
 * Files written before this change live at:
 *   /shared-storage/public/assets/uploads/parent-media/{userId}/{uuid}.{ext}
 * New files are written to:
 *   /private/uploads/parent-media/{userId}/{uuid}.{ext}
 *
 * On first access, if the private file is absent but the legacy file exists,
 * it is copied to private storage before serving. The DB is updated to point
 * to the new route URL so subsequent requests skip the migration check.
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { resolveUploadPath, migrateToPrivate, streamFile, isVideoMime } from '@/server/lib/private-uploads.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { mediaId } = req.params;
  if (!mediaId) { res.status(404).end(); return; }

  // ── Verify ownership and fetch storage_path ───────────────────────────────
  type Row = { storage_path: string | null; mime_type: string | null };
  let storagePath: string | null = null;
  let mimeType: string | null = null;
  try {
    const result = await db.execute(
      sql`SELECT storage_path, mime_type
           FROM sc_parent_media
           WHERE id = ${mediaId} AND user_id = ${user.id} AND deleted_at IS NULL
           LIMIT 1`
    ) as unknown;
    const rows = (result as [Row[]])[0];
    if (!rows.length) { res.status(404).end(); return; }
    storagePath = rows[0].storage_path ?? null;
    mimeType    = rows[0].mime_type    ?? null;
  } catch {
    res.status(404).end();
    return;
  }

  if (!storagePath) { res.status(404).end(); return; }

  // storage_path is a relative path under the storage root:
  //   parent-media/{userId}/{uuid}.{ext}
  const { path: filePath, legacy } = resolveUploadPath(storagePath);
  const isVideo = isVideoMime(mimeType ?? '');

  if (legacy) {
    try {
      const privatePath = await migrateToPrivate(storagePath);
      // Update DB to new route URL
      await db.execute(
        sql`UPDATE sc_parent_media
            SET public_url = ${`/api/parent/uploads/media/${mediaId}`}
            WHERE id = ${mediaId} AND user_id = ${user.id}`
      );
      streamFile(privatePath, res, { isVideo });
      return;
    } catch {
      streamFile(filePath, res, { isVideo });
      return;
    }
  }

  streamFile(filePath, res, { isVideo });
}
