/**
 * POST /api/parent/admin/run-schema-stats
 *
 * Additive migration: adds season-statistics columns to sc_player_profiles.
 * Columns added (all nullable INT, no defaults):
 *   stat_gp       INT NULL  — games played
 *   stat_goals    INT NULL  — goals scored (outfield)
 *   stat_assists  INT NULL  — assists (outfield)
 *   stat_shots    INT NULL  — shots (outfield)
 *   stat_ga       INT NULL  — goals against (goalkeeper)
 *   stat_saves    INT NULL  — saves (goalkeeper)
 *   stat_so       INT NULL  — shutouts (goalkeeper)
 *
 * Idempotent — safe to re-run. Uses SHOW COLUMNS to skip existing columns.
 * Protected by requireParentAccess (any authenticated parent-portal user may run it).
 */
import type { Request, Response } from 'express';
import { requireParentAccess } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

const TABLE = 'sc_player_profiles';

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'stat_gp',      ddl: 'INT NULL' },
  { name: 'stat_goals',   ddl: 'INT NULL' },
  { name: 'stat_assists', ddl: 'INT NULL' },
  { name: 'stat_shots',   ddl: 'INT NULL' },
  { name: 'stat_ga',      ddl: 'INT NULL' },
  { name: 'stat_saves',   ddl: 'INT NULL' },
  { name: 'stat_so',      ddl: 'INT NULL' },
];

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const steps: Array<{ column: string; status: 'added' | 'already_exists' | 'error'; detail?: string }> = [];

  for (const col of COLUMNS) {
    try {
      // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows
      const result = await db.execute(
        sql.raw(`SHOW COLUMNS FROM \`${TABLE}\` LIKE '${col.name}'`)
      ) as unknown;
      const [resultRows] = result as [unknown[], unknown];
      const existing = Array.isArray(resultRows) ? resultRows : [];

      if (existing.length > 0) {
        steps.push({ column: col.name, status: 'already_exists' });
        continue;
      }

      await db.execute(
        sql.raw(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${col.name}\` ${col.ddl}`)
      );
      steps.push({ column: col.name, status: 'added' });
    } catch (err) {
      steps.push({ column: col.name, status: 'error', detail: String(err) });
    }
  }

  const errors = steps.filter(s => s.status === 'error');
  res.status(errors.length > 0 ? 207 : 200).json({
    ok: errors.length === 0,
    table: TABLE,
    steps,
  });
}
