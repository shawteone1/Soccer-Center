/**
 * GET /api/parent/pilot/fixtures?teamId=&season=
 *
 * Returns fixtures for a pilot team/season.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { DEMO_FIXTURES, DEMO_TEAMS } from '@/server/pilot/demoData.js';
import { getConnectorState } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { teamId, season } = req.query as { teamId?: string; season?: string };

  let fixtures = DEMO_FIXTURES;
  if (season) fixtures = fixtures.filter(f => f.season === season);
  if (teamId) {
    const team = DEMO_TEAMS.find(t => t.id === teamId || t.providerTeamId === teamId);
    if (team) {
      fixtures = fixtures.filter(f => f.providerTeamId === team.providerTeamId);
    }
  }

  res.json({
    fixtures,
    connector: getConnectorState(),
  });
}
