/**
 * GET /api/parent/players/match-records-summary
 *
 * Returns aggregated game-record totals for ALL players belonging to the
 * authenticated parent. One call replaces N individual player fetches on the
 * My Players card.
 *
 * Response shape:
 * {
 *   tableAvailable: boolean,
 *   totals: {
 *     [playerId]: {
 *       lifetime: { games, goals, assists, ga, saves, shutouts },
 *       bySeason: { [season]: { games, goals, assists, ga, saves, shutouts } }
 *     }
 *   }
 * }
 *
 * If sc_player_match_records does not exist yet, returns { tableAvailable: false, totals: {} }.
 * We detect this by catching MySQL ER_NO_SUCH_TABLE (1146) from the SELECT itself —
 * SHOW TABLES and information_schema queries cannot be prepared by Drizzle's pipeline.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

interface StatBucket {
  games:    number;
  goals:    number;
  assists:  number;
  ga:       number | null;
  saves:    number | null;
  shutouts: number | null;
}

interface PlayerSummary {
  lifetime: StatBucket;
  bySeason: Record<string, StatBucket>;
}

function emptyBucket(): StatBucket {
  return { games: 0, goals: 0, assists: 0, ga: null, saves: null, shutouts: null };
}

function addRow(
  bucket: StatBucket,
  row: { stat_goals: number | null; stat_assists: number | null; stat_ga: number | null; stat_saves: number | null; stat_so: number | null },
) {
  bucket.games   += 1;
  bucket.goals   += row.stat_goals   ?? 0;
  bucket.assists += row.stat_assists ?? 0;
  if (row.stat_ga    != null) { bucket.ga       = (bucket.ga       ?? 0) + row.stat_ga; }
  if (row.stat_saves != null) { bucket.saves    = (bucket.saves    ?? 0) + row.stat_saves; }
  if (row.stat_so    != null) { bucket.shutouts = (bucket.shutouts ?? 0) + row.stat_so; }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  console.log(`[match-records-summary] hit — userId=${user.id}`);

  try {
    // Query directly — if the table doesn't exist MySQL throws ER_NO_SUCH_TABLE (1146).
    // We catch that below and return tableAvailable:false.
    // We do NOT use SHOW TABLES or information_schema: Drizzle cannot prepare those statements.
    const rows = await db.execute(
      sql`SELECT r.player_id, r.season,
               r.stat_goals, r.stat_assists,
               r.stat_ga, r.stat_saves, r.stat_so
          FROM sc_player_match_records r
          INNER JOIN sc_player_profiles p ON p.id = r.player_id
          WHERE p.user_id = ${user.id}
          ORDER BY r.player_id, r.match_date DESC`,
    );

    type RawRow = {
      player_id:    string;
      season:       string | null;
      stat_goals:   number | null;
      stat_assists: number | null;
      stat_ga:      number | null;
      stat_saves:   number | null;
      stat_so:      number | null;
    };

    const records = rows[0] as unknown as RawRow[];
    const totals: Record<string, PlayerSummary> = {};

    for (const row of records) {
      const pid = row.player_id;
      if (!totals[pid]) totals[pid] = { lifetime: emptyBucket(), bySeason: {} };

      addRow(totals[pid].lifetime, row);

      const season = row.season ?? 'Unknown';
      if (!totals[pid].bySeason[season]) totals[pid].bySeason[season] = emptyBucket();
      addRow(totals[pid].bySeason[season], row);
    }

    console.log(`[match-records-summary] returning ${records.length} rows, ${Object.keys(totals).length} players`);
    res.json({ tableAvailable: true, totals });
  } catch (err) {
    // ER_NO_SUCH_TABLE = MySQL error 1146 — migration hasn't been run yet
    const code   = (err as { code?: string }).code   ?? '';
    const errno  = (err as { errno?: number }).errno  ?? 0;
    if (code === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      console.log('[match-records-summary] sc_player_match_records not found — tableAvailable:false');
      res.json({ tableAvailable: false, totals: {} });
      return;
    }
    console.error('[match-records-summary GET] error:', err);
    res.status(500).json({ error: 'Failed to load match record summaries', detail: String(err) });
  }
}
