/**
 * POST /api/parent/admin/run-schema-fan-profile
 *
 * Step 3d — Additive migration: adds fan identity columns to sc_member_profiles.
 * Columns added (all nullable, no defaults changed):
 *   display_name   VARCHAR(128)
 *   bio            TEXT
 *   avatar_url     VARCHAR(512)
 *   cover_image_url VARCHAR(512)
 *   location       VARCHAR(128)
 *
 * Idempotent — safe to re-run. Uses SHOW COLUMNS to skip existing columns.
 * Protected by requireAdmin (isAdmin=true). PARENT access alone is insufficient.
 */
import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

const TABLE = 'sc_member_profiles';

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'display_name',    ddl: 'VARCHAR(128) NULL' },
  { name: 'bio',             ddl: 'TEXT NULL' },
  { name: 'avatar_url',      ddl: 'VARCHAR(512) NULL' },
  { name: 'cover_image_url', ddl: 'VARCHAR(512) NULL' },
  { name: 'location',        ddl: 'VARCHAR(128) NULL' },
];

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;
  // requireAdmin enforces isAdmin=true. PARENT access alone is insufficient for DDL.

  const steps: Array<{ column: string; status: 'added' | 'already_exists' | 'error'; detail?: string }> = [];

  for (const col of COLUMNS) {
    try {
      // mysql2 execute() returns [ResultRows[], FieldPacket[]] — a 2-element tuple.
      // Unwrap [0] to get the actual rows; the raw tuple always has length 2 and
      // cannot be used as a column-existence check.
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
