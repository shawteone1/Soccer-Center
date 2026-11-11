/**
 * POST /api/parent/admin/run-schema-player-softdelete
 *
 * Additive migration: adds deleted_at TIMESTAMP NULL to sc_player_profiles.
 * Safe to run multiple times — uses ADD COLUMN only when the column is absent.
 * Requires isAdmin.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireAdmin, setPrivateCacheHeaders } from '@/server/auth-policy.js';

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
  setPrivateCacheHeaders(res);

  const steps: string[] = [];

  try {
    const hasDeletedAt = await columnExists('sc_player_profiles', 'deleted_at');
    if (!hasDeletedAt) {
      await db.execute(sql.raw(
        `ALTER TABLE \`sc_player_profiles\` ADD COLUMN \`deleted_at\` TIMESTAMP NULL DEFAULT NULL`
      ));
      steps.push('Added deleted_at column to sc_player_profiles');
    } else {
      steps.push('deleted_at column already present — skipped');
    }

    res.json({ ok: true, steps });
  } catch (e) {
    console.error('[run-schema-player-softdelete]', e);
    res.status(500).json({ error: String(e), steps });
  }
}
