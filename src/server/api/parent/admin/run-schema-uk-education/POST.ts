/**
 * POST /api/parent/admin/run-schema-uk-education
 *
 * One-shot migration: adds uk_education column to sc_player_profiles.
 * Safe to run multiple times — probes with SHOW COLUMNS before ALTER TABLE.
 * Preserves all existing data; nullable column, no default.
 *
 * Admin-only. Requires isAdmin=true on the authenticated user.
 * Returns { added: string[], skipped: string[], errors: string[] }.
 */

import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';

const COLUMN = { name: 'uk_education', ddl: 'ADD COLUMN `uk_education` TEXT NULL' };

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`)
    ) as unknown;
    const [rows] = result as [unknown[], unknown];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const added: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const exists = await columnExists('sc_player_profiles', COLUMN.name);
    if (exists) {
      skipped.push(COLUMN.name);
    } else {
      await db.execute(sql.raw(`ALTER TABLE \`sc_player_profiles\` ${COLUMN.ddl}`));
      added.push(COLUMN.name);
    }
  } catch (e) {
    errors.push(`${COLUMN.name}: ${String(e)}`);
  }

  res.json({ added, skipped, errors });
}
