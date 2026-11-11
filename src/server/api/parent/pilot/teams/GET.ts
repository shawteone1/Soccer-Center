/**
 * GET /api/parent/pilot/teams
 *
 * Returns available pilot teams and seasons.
 * Admin-only — pilot is not exposed to regular parent accounts.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { DEMO_TEAMS, DEMO_SEASONS } from '@/server/pilot/demoData.js';
import { getConnectorState } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  res.json({
    teams: DEMO_TEAMS,
    seasons: DEMO_SEASONS,
    connector: getConnectorState(),
  });
}
