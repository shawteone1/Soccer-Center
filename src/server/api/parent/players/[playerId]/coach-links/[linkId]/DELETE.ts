/**
 * DELETE /api/parent/players/:playerId/coach-links/:linkId
 *
 * Revokes a share link permanently. After revocation the coach view returns
 * 404 for that token — identical to a link that was never issued.
 *
 * Returns 503 when no durable store is available.
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 * Cache-Control: no-store.
 */

import type { Request, Response } from 'express';
import { requireParentAccess } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';



function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export default async function handler(req: Request, res: Response) {
  noStore(res);

  const user = await requireParentAccess(req, res);
  if (!user) return;

  if (!isCoachProfileEnabled()) {
    res.status(403).json({ error: 'FEATURE_DISABLED' });
    return;
  }

  const store = getCoachLinkStore((k) => { const v = getSecret(k); return typeof v === 'string' ? v : undefined; });
  if (!store) {
    res.status(503).json({
      error: 'STORE_UNAVAILABLE',
      message: 'Coach profile sharing is not yet available.',
    });
    return;
  }

  const linkId = String(req.params.linkId);

  const revoked = await store.revoke(linkId, user.id);
  if (!revoked) {
    // Not found, wrong owner, or already revoked — all return 404
    res.status(404).json({ error: 'Link not found or already revoked' });
    return;
  }

  res.json({ revoked: true, linkId });
}
