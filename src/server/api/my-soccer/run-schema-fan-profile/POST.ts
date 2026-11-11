/**
 * POST /api/my-soccer/run-schema-fan-profile
 *
 * LOCKED: Schema-altering operations require administrator authorization.
 * This endpoint is retained for route compatibility but returns 403 for all
 * non-admin callers. Admins should use /api/parent/admin/run-schema-fan-profile.
 */
import type { Request, Response } from 'express';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

const TABLE = 'sc_member_profiles';

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'display_name',     ddl: 'VARCHAR(128) NULL' },
  { name: 'bio',              ddl: 'TEXT NULL' },
  { name: 'avatar_url',       ddl: 'VARCHAR(512) NULL' },
  { name: 'cover_image_url',  ddl: 'VARCHAR(512) NULL' },
  { name: 'location',         ddl: 'VARCHAR(128) NULL' },
];

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Administrator authorization required for schema operations.' });
    return;
  }

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
      console.error(`[fan-profile migration] column ${col.name}:`, err);
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
