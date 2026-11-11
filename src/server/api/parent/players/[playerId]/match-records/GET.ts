/**
 * GET /api/parent/players/:playerId/match-records
 *
 * Returns all match records for a player owned by the authenticated parent.
 * Gated on sc_player_match_records table existing — returns { tableAvailable: false }
 * if the migration has not been run yet.
 *
 * Table-existence is detected by catching ER_NO_SUCH_TABLE (1146) from the SELECT.
 * SHOW TABLES and information_schema queries cannot be prepared by Drizzle's pipeline.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const { playerId } = req.params;

  // Verify player belongs to this parent (column is user_id, not parent_user_id)
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    const playerRows = rows[0] as unknown as Array<{ id: string }>;
    if (!playerRows.length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch (err) {
    console.error('[match-records GET] ownership check error:', err);
    res.status(500).json({ error: 'Database error checking player', detail: String(err) });
    return;
  }

  try {
    const rows = await db.execute(
      sql`SELECT id, match_date, opponent,
               stat_goals    AS goals,
               stat_assists  AS assists,
               stat_ga       AS ga,
               stat_saves    AS saves,
               stat_so       AS shutouts,
               notes, season, event_ref
          FROM sc_player_match_records
          WHERE player_id = ${playerId}
          ORDER BY match_date DESC`
    );
    res.json({ tableAvailable: true, records: rows[0] });
  } catch (err) {
    // ER_NO_SUCH_TABLE = MySQL error 1146 — migration hasn't been run yet
    const code  = (err as { code?: string }).code  ?? '';
    const errno = (err as { errno?: number }).errno ?? 0;
    if (code === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      res.json({ tableAvailable: false, records: [] });
      return;
    }
    console.error('[match-records GET] records query error:', err);
    res.status(500).json({ error: 'Failed to load match records', detail: String(err) });
  }
}
