/**
 * POST /api/parent/admin/run-schema-coach-profile-v4
 *
 * One-shot migration: adds v4 coach profile columns to sc_player_profiles.
 * Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS pattern via
 * SHOW COLUMNS probe + conditional ALTER TABLE.
 *
 * Admin-only. Requires isAdmin=true on the authenticated user.
 * Returns { added: string[], skipped: string[], error?: string }.
 */

import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';

const NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'gpa',           ddl: 'ADD COLUMN `gpa` VARCHAR(8) NULL' },
  { name: 'gpa_scale',     ddl: 'ADD COLUMN `gpa_scale` VARCHAR(8) NULL' },
  { name: 'gpa_weighted',  ddl: 'ADD COLUMN `gpa_weighted` VARCHAR(12) NULL' },
  { name: 'intended_major',ddl: 'ADD COLUMN `intended_major` VARCHAR(128) NULL' },
  { name: 'college_goals', ddl: 'ADD COLUMN `college_goals` TEXT NULL' },
  { name: 'contact_email', ddl: 'ADD COLUMN `contact_email` VARCHAR(255) NULL' },
];

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

  for (const col of NEW_COLUMNS) {
    try {
      const exists = await columnExists('sc_player_profiles', col.name);
      if (exists) {
        skipped.push(col.name);
        continue;
      }
      await db.execute(sql.raw(`ALTER TABLE \`sc_player_profiles\` ${col.ddl}`));
      added.push(col.name);
    } catch (e) {
      errors.push(`${col.name}: ${String(e)}`);
    }
  }

  res.json({ added, skipped, errors });
}
