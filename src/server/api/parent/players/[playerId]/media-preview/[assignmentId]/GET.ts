/**
 * GET /api/parent/players/:playerId/media-preview/:assignmentId
 *
 * Owner-authenticated media preview proxy. Serves the raw video file to the
 * authenticated parent so they can preview a highlight before sharing it.
 *
 * SECURITY
 * ────────
 * - requireParentAccess() enforces authentication.
 * - Player ownership verified: player must belong to the authenticated user.
 * - Assignment ownership verified: assignment must belong to this player+user.
 * - Only media_type='video' assignments are served.
 * - deleted_at IS NULL enforced.
 * - Cache-Control: private, no-store (short — owner preview, not CDN).
 *
 * RANGE REQUESTS
 * ──────────────
 * Supports HTTP Range requests for video seek support.
 *
 * This endpoint is independent of COACH_PROFILE_LINKS_ENABLED — the parent
 * can preview their own media regardless of whether sharing is enabled.
 */

import type { Request, Response } from 'express';
import { resolveUploadPath, streamFile } from '@/server/lib/private-uploads.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);
  res.setHeader('Cache-Control', 'private, no-store');

  const playerId     = String(req.params.playerId     ?? '').trim();
  const assignmentId = String(req.params.assignmentId ?? '').trim();

  if (!playerId || !assignmentId) {
    res.status(404).end();
    return;
  }

  // ── Fetch assignment + media row, enforce ownership ───────────────────────
  type MediaRow = {
    storage_path: string;
    media_type: string;
    deleted_at: string | null;
  };

  let mediaRow: MediaRow | null = null;
  try {
    const rows = await db.execute(
      sql`SELECT m.storage_path, m.media_type, m.deleted_at
           FROM sc_player_media_assignments a
           INNER JOIN sc_parent_media m ON m.id = a.media_id AND m.user_id = a.user_id
           INNER JOIN sc_player_profiles p ON p.id = a.player_id AND p.user_id = a.user_id AND p.deleted_at IS NULL
           WHERE a.id        = ${assignmentId}
             AND a.player_id = ${playerId}
             AND a.user_id   = ${user.id}
             AND m.media_type = 'video'
             AND m.user_id = ${user.id}
           LIMIT 1`
    ) as unknown;
    const arr = (rows as [MediaRow[]])[0];
    if (arr.length > 0) mediaRow = arr[0];
  } catch (e: unknown) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code
      ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (code !== 'ER_NO_SUCH_TABLE') {
      console.error('[GET media-preview] assignment lookup:', e);
    }
    res.status(404).end();
    return;
  }

  if (!mediaRow || mediaRow.deleted_at != null) {
    res.status(404).end();
    return;
  }

  if (mediaRow.media_type !== 'video') {
    res.status(404).end();
    return;
  }

  // Use the same private + legacy resolver as the coach and parent media routes.
  const { path, found } = resolveUploadPath(mediaRow.storage_path);
  if (!found) { res.status(404).end(); return; }
  streamFile(path, res, { isVideo: true, noStore: true });
}
