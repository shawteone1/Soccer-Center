/**
 * GET /api/parent/players/:playerId/coach-links
 *
 * Lists all share links the parent has created for this player.
 * Includes revoked and expired links so the parent can see the full history.
 *
 * Returns 503 when no durable store is available.
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 * Cache-Control: no-store.
 */

import type { Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
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

  const playerId = String(req.params.playerId);

  // ── Verify player ownership ───────────────────────────────────────────────
  let playerRows: Array<{ id: string }>;
  try {
    playerRows = await db
      .select({ id: scPlayerProfiles.id })
      .from(scPlayerProfiles)
      .where(
        and(
          eq(scPlayerProfiles.id, playerId),
          eq(scPlayerProfiles.userId, user.id),
          isNull(scPlayerProfiles.deletedAt),
        ),
      )
      .limit(1) as Array<{ id: string }>;
  } catch (e) {
    console.error('[GET coach-links] player ownership check error:', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (playerRows.length === 0) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const records = await store.listForPlayer(playerId, user.id);
  const now = new Date();

  const links = records.map(r => {
    let status: 'active' | 'revoked' | 'expired';
    if (r.revokedAt != null) {
      status = 'revoked';
    } else if (r.expiresAt != null && r.expiresAt < now) {
      status = 'expired';
    } else {
      status = 'active';
    }
    return {
      id: r.id,
      label: r.label,
      approvedFields: r.approvedFields,
      selectedMatchRecordCount: r.selectedMatchRecords.length,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      status,
    };
  });

  res.json({ links });
}
