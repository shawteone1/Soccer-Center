/**
 * POST /api/parent/pilot/records
 *
 * Creates or updates a pilot game record for a player.
 * Admin-only.
 *
 * Body: { playerId, fixtureId, participated, goals?, assists?, ga?, saves?, shutouts?, notes? }
 *
 * Duplicate prevention: one record per (playerId, fixtureId).
 * Scheduled games do NOT auto-count as played — participated must be explicitly true.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { upsertRecord, calcTotals } from '@/server/pilot/store.js';
import { DEMO_FIXTURES } from '@/server/pilot/demoData.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const {
    playerId, fixtureId, participated,
    goals, assists, ga, saves, shutouts, notes,
  } = req.body as {
    playerId: string;
    fixtureId: string;
    participated: boolean;
    goals?: number | null;
    assists?: number | null;
    ga?: number | null;
    saves?: number | null;
    shutouts?: number | null;
    notes?: string;
  };

  if (!playerId || !fixtureId) {
    res.status(400).json({ error: 'playerId and fixtureId are required' });
    return;
  }

  const fixture = DEMO_FIXTURES.find(f => f.id === fixtureId);
  if (!fixture) {
    res.status(404).json({ error: 'Fixture not found' });
    return;
  }

  // Scheduled games must not auto-count — participated must be explicit
  if (fixture.status === 'scheduled' && participated) {
    // Allowed: parent is explicitly confirming participation for a completed game
    // that was still marked scheduled in the demo data. We accept it.
  }

  const record = upsertRecord(playerId, fixtureId, {
    participated: participated ?? false,
    goals: goals ?? null,
    assists: assists ?? null,
    ga: ga ?? null,
    saves: saves ?? null,
    shutouts: shutouts ?? null,
    notes,
  });

  const totals = calcTotals(playerId);
  res.status(201).json({ ok: true, record, totals });
}
