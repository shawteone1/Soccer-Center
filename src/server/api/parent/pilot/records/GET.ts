/**
 * GET /api/parent/pilot/records?playerId=
 *
 * Returns pilot game records for a player, with totals.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { getRecordsForPlayer, calcTotals } from '@/server/pilot/store.js';
import { DEMO_FIXTURES } from '@/server/pilot/demoData.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { playerId } = req.query as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: 'playerId required' });
    return;
  }

  const records = getRecordsForPlayer(playerId);
  const totals = calcTotals(playerId);

  // Enrich records with fixture data
  const enriched = records.map(r => ({
    ...r,
    fixture: DEMO_FIXTURES.find(f => f.id === r.fixtureId) ?? null,
  }));

  res.json({ records: enriched, totals });
}
