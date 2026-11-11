/**
 * POST /api/coach/profile/:token/requests
 *
 * Submits an information request through a coach profile link.
 * No authentication required — the token is the credential.
 *
 * SECURITY
 * ────────
 * - Token is hashed on arrival; the raw token is never logged or stored.
 * - Expired and revoked links return 404 (same as never-issued).
 * - Rate-limited: max 3 requests per linkId per 24 hours.
 * - Duplicate prevention: same requesterEmail + linkId within 24h is rejected.
 * - requesterName and requesterEmail are self-reported and unverified.
 * - No automatic email or document release occurs on submission.
 * - Cache-Control: no-store on all responses.
 * - Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 *
 * Body: { requesterName, requesterEmail, message }
 * Returns: { ok: true, requestId } on success.
 */

import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { redactCoachToken } from '@/server/lib/redact-coach-token.js';



function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}



const MAX_REQUESTS_PER_LINK_PER_DAY = 3;

export default async function handler(req: Request, res: Response): Promise<void> {
  noStore(res);

  if (!isCoachProfileEnabled()) {
    res.status(404).json({});
    return;
  }

  const rawToken = String(req.params.token ?? '').trim();
  if (!rawToken) { res.status(404).json({}); return; }

  // ── Resolve link ──────────────────────────────────────────────────────────
  const store = getCoachLinkStore((k) => { const v = getSecret(k); return typeof v === 'string' ? v : undefined; });
  if (!store) { res.status(503).json({ error: 'Service unavailable' }); return; }

  let link: { id: string; playerId: string; expiresAt: Date | null; revokedAt: Date | null } | null = null;
  try {
    // findByToken accepts the raw token and hashes it internally
    link = await store.findByToken(rawToken);
  } catch (e) {
    console.error('[POST coach/requests] link lookup:', redactCoachToken(req.url), e);
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }

  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
    res.status(404).json({});
    return;
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  const requesterName  = typeof body.requesterName  === 'string' ? body.requesterName.trim().slice(0, 255)  : '';
  const requesterEmail = typeof body.requesterEmail === 'string' ? body.requesterEmail.trim().slice(0, 255) : '';
  const message        = typeof body.message        === 'string' ? body.message.trim().slice(0, 2000)       : '';

  if (!requesterName) {
    res.status(400).json({ error: 'requesterName is required' }); return;
  }
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    res.status(400).json({ error: 'A valid requesterEmail is required' }); return;
  }
  if (!message) {
    res.status(400).json({ error: 'message is required' }); return;
  }

  // ── Rate limit: max 3 requests per linkId per 24h ─────────────────────────
  try {
    const countRows = await db.execute(
      sql`SELECT COUNT(*) AS cnt
          FROM sc_coach_profile_requests
          WHERE link_id = ${link.id}
            AND created_at >= NOW() - INTERVAL 1 DAY`
    ) as unknown;
    const cnt = Number(((countRows as [Array<{ cnt: number }>])[0][0])?.cnt ?? 0);
    if (cnt >= MAX_REQUESTS_PER_LINK_PER_DAY) {
      res.status(429).json({ error: 'Too many requests for this link. Please try again tomorrow.' });
      return;
    }
  } catch (e) {
    console.error('[POST coach/requests] rate-limit check:', redactCoachToken(req.url), e);
    res.status(503).json({ error: 'Service unavailable' }); return;
  }

  // ── Duplicate prevention: same email + linkId within 24h ─────────────────
  try {
    const dupRows = await db.execute(
      sql`SELECT id
          FROM sc_coach_profile_requests
          WHERE link_id         = ${link.id}
            AND requester_email = ${requesterEmail}
            AND created_at      >= NOW() - INTERVAL 1 DAY
          LIMIT 1`
    ) as unknown;
    const dups = (dupRows as [unknown[]])[0];
    if (Array.isArray(dups) && dups.length > 0) {
      res.status(409).json({ error: 'A request from this email address was already submitted for this link today.' });
      return;
    }
  } catch (e) {
    console.error('[POST coach/requests] duplicate check:', redactCoachToken(req.url), e);
    res.status(503).json({ error: 'Service unavailable' }); return;
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  const requestId = randomUUID();
  try {
    await db.execute(
      sql`INSERT INTO sc_coach_profile_requests
            (id, link_id, player_id, requester_name, requester_email, message, status)
          VALUES
            (${requestId}, ${link.id}, ${link.playerId},
             ${requesterName}, ${requesterEmail}, ${message}, 'pending')`
    );
  } catch (e) {
    console.error('[POST coach/requests] insert:', redactCoachToken(req.url), e);
    res.status(503).json({ error: 'Service unavailable' }); return;
  }

  res.status(201).json({ ok: true, requestId });
}
