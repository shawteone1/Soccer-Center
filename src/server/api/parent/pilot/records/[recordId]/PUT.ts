/**
 * PUT /api/parent/pilot/records/:recordId
 *
 * Updates a pilot game record. Private stats are preserved on fixture updates.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { getRecord, upsertRecord, calcTotals } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const recordId = String(req.params.recordId ?? '');
  const existing = getRecord(recordId);
  if (!existing) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  const {
    participated, goals, assists, ga, saves, shutouts, notes,
  } = req.body as {
    participated?: boolean;
    goals?: number | null;
    assists?: number | null;
    ga?: number | null;
    saves?: number | null;
    shutouts?: number | null;
    notes?: string;
  };

  const updated = upsertRecord(
    existing.playerId,
    existing.fixtureId,
    {
      participated: participated ?? existing.participated,
      goals:    goals    !== undefined ? goals    : existing.goals,
      assists:  assists  !== undefined ? assists  : existing.assists,
      ga:       ga       !== undefined ? ga       : existing.ga,
      saves:    saves    !== undefined ? saves    : existing.saves,
      shutouts: shutouts !== undefined ? shutouts : existing.shutouts,
      notes:    notes    !== undefined ? notes    : existing.notes,
    },
    recordId,
  );

  const totals = calcTotals(existing.playerId);
  res.json({ ok: true, record: updated, totals });
}
