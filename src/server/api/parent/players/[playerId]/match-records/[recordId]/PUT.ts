/**
 * PUT /api/parent/players/:playerId/match-records/:recordId
 *
 * Updates a match record. Verifies ownership via player → parent chain.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const { playerId, recordId } = req.params;
  const { match_date, opponent, goals, assists, ga, saves, shutouts, notes, season, event_ref } = req.body as {
    match_date?: string;
    opponent?:   string;
    goals?:      number | null;
    assists?:    number | null;
    ga?:         number | null;
    saves?:      number | null;
    shutouts?:   number | null;
    notes?:      string | null;
    season?:     string | null;
    event_ref?:  string | null;
  };

  // Verify player belongs to this parent
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    if (!(rows[0] as unknown as Array<unknown>).length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Database error' });
    return;
  }

  try {
    await db.execute(
      sql`UPDATE sc_player_match_records SET
          match_date   = COALESCE(${match_date ?? null}, match_date),
          opponent     = COALESCE(${opponent ?? null}, opponent),
          stat_goals   = ${goals   ?? null},
          stat_assists = ${assists  ?? null},
          stat_ga      = ${ga       ?? null},
          stat_saves   = ${saves    ?? null},
          stat_so      = ${shutouts ?? null},
          notes        = ${notes    ?? null},
          season       = ${season   ?? null},
          event_ref    = COALESCE(${event_ref ?? null}, event_ref)
          WHERE id = ${recordId} AND player_id = ${playerId}`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[match-records PUT] update error:', e);
    res.status(500).json({ error: 'Failed to update match record' });
  }
}
