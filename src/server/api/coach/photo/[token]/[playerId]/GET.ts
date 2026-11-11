import { playerPhotoPath } from '../../../../../lib/player-photo-path.js';
/**
 * GET /api/coach/photo/:token/:playerId
 *
 * Token-gated photo proxy for coach-facing player avatar images.
 *
 * SECURITY
 * ────────
 * - No authentication required — the token is the credential.
 * - Token is hashed on arrival; the raw token is never logged or stored.
 * - Expired and revoked links return 404 (same as never-issued).
 * - 'photo' must appear in link.approvedFields — if the parent did not
 *   approve the photo field, the image is withheld (same fail-closed rule
 *   as selectedEvents and selectedMedia).
 * - playerId in the URL is validated against the link's own player_id —
 *   a token cannot be used to fetch a different player's photo.
 * - avatarUrl is resolved from sc_player_profiles. Two URL shapes are
 *   supported:
 *     (a) /api/parent/uploads/player-photo/{playerId}  — new private route
 *     (b) /airo-assets/uploads/player-photos/{userId}/{playerId}.{ext}  — legacy
 *   External URLs are rejected.
 * - The file is read from /private/uploads/ (new) or the legacy public path
 *   and streamed with Cache-Control: private, no-store.
 * - Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 *
 * MIME TYPE
 * ─────────
 * Inferred from the file extension. Falls back to image/jpeg.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { redactCoachToken } from '@/server/lib/redact-coach-token.js';
import { resolveUploadPath, streamFile } from '@/server/lib/private-uploads.js';

// Legacy public storage URL prefix — files written before private-uploads migration
// New authenticated route URL prefix — avatar_url set by photo upload after migration



export default async function handler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!isCoachProfileEnabled()) {
    res.status(404).end();
    return;
  }

  const rawToken = String(req.params.token    ?? '').trim();
  const playerId = String(req.params.playerId ?? '').trim();

  if (!rawToken || rawToken.length < 10 || !playerId) {
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
    link = await store.findByToken(redactCoachToken(rawToken));
  } catch {
    res.status(404).end();
    return;
  }

  if (!link || link.revokedAt || (link.expiresAt && new Date(link.expiresAt) < new Date())) {
    res.status(404).end();
    return;
  }

  // ── Validate playerId matches the link ────────────────────────────────────
  if (link.playerId !== playerId) {
    res.status(404).end();
    return;
  }

  // ── Check photo is in approvedFields ─────────────────────────────────────
  // 'photo' must be explicitly approved — fail-closed.
  if (!link.approvedFields.includes('photo')) {
    res.status(404).end();
    return;
  }

  // ── Fetch avatarUrl from player profile ───────────────────────────────────
  type AvatarRow = { avatar_url: string | null };
  let avatarUrl: string | null = null;
  try {
    const rows = await db.execute(
      sql`SELECT avatar_url
           FROM sc_player_profiles
           WHERE id      = ${playerId}
             AND user_id = ${link.userId}
             AND deleted_at IS NULL
           LIMIT 1`
    ) as unknown;
    const arr = (rows as [AvatarRow[]])[0];
    if (arr.length > 0) avatarUrl = arr[0].avatar_url ?? null;
  } catch {
    res.status(404).end();
    return;
  }

  if (!avatarUrl) {
    res.status(404).end();
    return;
  }

  // ── Resolve storage path ──────────────────────────────────────────────────
  // avatar_url may be one of three shapes:
  //   (a) /api/parent/uploads/player-photo/{playerId}  — new private route URL
  //       → scan /private/uploads/player-photos/{userId}/{playerId}.{ext}
  //   (b) /airo-assets/uploads/player-photos/{userId}/{playerId}.{ext}  — legacy public URL
  //       → extract relative path and resolve via resolveUploadPath()
  //   (c) anything else — external URL, refuse to proxy

  const relative = playerPhotoPath(avatarUrl, link.userId, String(playerId));
  const absolutePath = relative ? resolveUploadPath(relative).path : null;

  if (!absolutePath) {
    res.status(404).end();
    return;
  }
  // absolutePath was set only when resolveUploadPath found the file (found=true)

  streamFile(absolutePath, res, { noStore: true });
}
