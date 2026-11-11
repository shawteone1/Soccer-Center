/**
 * POST /api/parent/admin/run-schema-v4
 *
 * Schema v4 — calendar feed portal context + display prefs.
 *
 * Adds columns to sc_calendar_feeds:
 *   - portal_context VARCHAR(8) NULL  — 'fan' | 'parent' | NULL (legacy = fan)
 *   - color          VARCHAR(16) NULL — user-chosen hex color for the feed chip
 *   - visible        TINYINT(1) NOT NULL DEFAULT 1 — show/hide toggle
 *
 * MySQL 5.7 compatible — uses information_schema to check before ALTER.
 * Idempotent. Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows
    const result = await db.execute(sql.raw(
      `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`
    )) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length > 0;
  } catch {
    return false;
  }
}

async function addColumn(
  table: string,
  column: string,
  ddl: string,
): Promise<{ column: string; status: string }> {
  try {
    const exists = await columnExists(table, column);
    if (exists) return { column, status: 'skipped — already exists' };
    await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`));
    return { column, status: 'ok' };
  } catch (e) {
    return { column, status: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export default async function handler(req: Request, res: Response) {
  const authed = await requireAdmin(req, res);
  if (!authed) return;

  const results = await Promise.all([
    addColumn('sc_calendar_feeds', 'portal_context',
      "`portal_context` VARCHAR(8) NULL COMMENT 'fan | parent | NULL=legacy fan'"),
    addColumn('sc_calendar_feeds', 'color',
      "`color` VARCHAR(16) NULL COMMENT 'user hex color for feed chip'"),
    addColumn('sc_calendar_feeds', 'visible',
      '`visible` TINYINT(1) NOT NULL DEFAULT 1'),
    // v4b: avatar photo URL on parent profiles
    addColumn('sc_parent_profiles', 'avatar_url',
      '`avatar_url` VARCHAR(1024) NULL'),
  ]);

  const allOk = results.every(r => r.status === 'ok' || r.status.startsWith('skipped'));
  res.status(allOk ? 200 : 207).json({ ok: allOk, results });
}
