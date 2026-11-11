/**
 * GET /api/parent/pilot/assignment?playerId=
 *
 * Returns the pilot team assignment for a player.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { getAssignment } from '@/server/pilot/store.js';
import { DEMO_TEAMS } from '@/server/pilot/demoData.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { playerId } = req.query as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: 'playerId required' });
    return;
  }

  const assignment = getAssignment(playerId);
  if (!assignment) {
    res.json({ assignment: null });
    return;
  }

  const team = DEMO_TEAMS.find(t => t.id === assignment.pilotTeamId) ?? null;
  res.json({ assignment, team });
}
