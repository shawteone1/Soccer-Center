/**
 * GET /api/coach/media/:token/:assignmentId
 *
 * Token-gated media proxy for coach-facing highlight playback.
 *
 * SECURITY
 * ────────
 * - No authentication required — the token is the credential.
 * - Token is hashed on arrival; the raw token is never logged or stored.
 * - Expired and revoked links return 404 (same as never-issued).
 * - assignmentId must appear in link.selectedMedia — foreign IDs are rejected.
 * - Ownership (playerId + userId) is re-validated against sc_player_media_assignments.
 * - Only media_type='video' assignments are served through this endpoint.
 * - The file path is resolved from sc_parent_media.storage_path. Files are
 *   checked in /private/uploads/ first (new), then /shared-storage/public/assets/uploads/
 *   (legacy, for files written before the private-uploads migration).
 * - Cache-Control: private, no-store (5 min) — short TTL, not public CDN.
 * - Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 *
 * RANGE REQUESTS
 * ──────────────
 * Supports HTTP Range requests so video players can seek without downloading
 * the full file. Responds with 206 Partial Content when a Range header is present.
 *
 * MIME TYPE
 * ─────────
 * Inferred from the file extension. Falls back to video/mp4.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { redactCoachToken } from '@/server/lib/redact-coach-token.js';
import { resolveUploadPath, streamFile } from '@/server/lib/private-uploads.js';



export default async function handler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!isCoachProfileEnabled()) {
    res.status(404).end();
    return;
  }

  const rawToken     = String(req.params.token        ?? '').trim();
  const assignmentId = String(req.params.assignmentId ?? '').trim();

  if (!rawToken || rawToken.length < 10 || !assignmentId) {
    res.status(404).end();
    return;
  }

  // ── Resolve link ──────────────────────────────────────────────────────────
  const store = getCoachLinkStore((k) => { const v = getSecret(k); return typeof v === 'string' ? v : undefined; });
  if (!store) {
    res.status(503).end();
    return;
  }

  let link: Awaited<ReturnType<typeof store.findByToken>>;
  try {
    link = await store.findByToken(rawToken);
  } catch (e) {
    console.error('[GET coach/media] link lookup:', redactCoachToken(req.url), e);
    res.status(503).end();
    return;
  }

  if (!link) { res.status(404).end(); return; }

  const now = new Date();
  if (link.revokedAt != null || (link.expiresAt != null && link.expiresAt < now)) {
    res.status(404).end();
    return;
  }

  // Demo links never serve real media
  if (link.demoMode) {
    res.status(404).end();
    return;
  }

  // ── Verify assignmentId is in selectedMedia ───────────────────────────────
  const selectedSet = new Set(link.selectedMedia);
  if (!selectedSet.has(assignmentId)) {
    res.status(404).end();
    return;
  }

  // ── Fetch assignment + media row, re-validate ownership ──────────────────
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
             AND a.player_id = ${link.playerId}
             AND a.user_id   = ${link.userId}
             AND m.media_type = 'video'
           LIMIT 1`
    ) as unknown;
    const arr = (rows as [MediaRow[]])[0];
    if (arr.length > 0) mediaRow = arr[0];
  } catch (e: unknown) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code
      ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (code !== 'ER_NO_SUCH_TABLE') {
      console.error('[GET coach/media] assignment lookup:', redactCoachToken(req.url), e);
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

  // ── Resolve file path ─────────────────────────────────────────────────────
  // storage_path is a relative path, e.g. "parent-media/userId/file.mp4".
  // resolveUploadPath() checks /private/uploads/ first, then the legacy
  // /shared-storage/public/assets/uploads/ path.
  const relativePath = mediaRow.storage_path.replace(/^\/+/, '');
  const { path: absolutePath } = resolveUploadPath(relativePath);

  streamFile(absolutePath, res, { isVideo: true, noStore: true });
}
