/**
 * DELETE /api/parent/pilot/records/:recordId
 *
 * Deletes a pilot game record. Totals are recalculated immediately.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { getRecord, deleteRecord, calcTotals } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const recordId = String(req.params.recordId ?? '');
  const existing = getRecord(recordId);
  if (!existing) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  const { playerId } = existing;
  deleteRecord(recordId);
  const totals = calcTotals(playerId);
  res.json({ ok: true, totals });
}
