/**
 * POST /api/parent/pilot/assignment
 *
 * Assigns a player to a pilot team. Does NOT modify official rosters.
 * Admin-only.
 *
 * Body: { playerId, pilotTeamId, calendarSynced? }
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { setAssignment, seedDemoRecords, getDemoPilotPlayerId, setDemoPilotPlayerId } from '@/server/pilot/store.js';
import { DEMO_TEAMS } from '@/server/pilot/demoData.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { playerId, pilotTeamId, calendarSynced } = req.body as {
    playerId: string;
    pilotTeamId: string;
    calendarSynced?: boolean;
  };

  if (!playerId || !pilotTeamId) {
    res.status(400).json({ error: 'playerId and pilotTeamId are required' });
    return;
  }

  const team = DEMO_TEAMS.find(t => t.id === pilotTeamId);
  if (!team) {
    res.status(404).json({ error: 'Pilot team not found' });
    return;
  }

  // Verify the player exists and belongs to this admin's account
  // (admins can access any player in the system for the pilot)
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} LIMIT 1`
    );
    if (!(rows[0] as unknown as Array<unknown>).length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Database error verifying player' });
    return;
  }

  const assignment = setAssignment(playerId, pilotTeamId, calendarSynced ?? false);

  // Track the demo pilot player id for seeding
  if (!getDemoPilotPlayerId()) {
    setDemoPilotPlayerId(playerId);
  }

  // Seed demo records if this is the first assignment
  seedDemoRecords(playerId);

  res.json({ ok: true, assignment, team });
}
