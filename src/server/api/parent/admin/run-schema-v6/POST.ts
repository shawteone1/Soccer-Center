/**
 * POST /api/parent/admin/run-schema-v6
 *
 * Additive migration — adds player_ids column to sc_calendar_feeds.
 *
 *   sc_calendar_feeds.player_ids  VARCHAR(2048) NULL
 *     JSON array of sc_player_profiles.id values this feed is scoped to.
 *     NULL or '[]' means the feed is shown for ALL of the parent's players
 *     (legacy behaviour — preserved for existing feeds until the parent
 *     explicitly assigns them).
 *
 * Uses ADD COLUMN IF NOT EXISTS syntax — safe to re-run on MySQL 8.0+.
 * On MySQL 5.7 (which does not support IF NOT EXISTS on ALTER TABLE),
 * the handler catches the "Duplicate column name" error (errno 1060) and
 * treats it as already_exists.
 *
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
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

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  type StepResult = { column: string; status: 'added' | 'already_exists' | 'error'; detail?: string };
  const results: StepResult[] = [];

  // ── sc_calendar_feeds.player_ids ─────────────────────────────────────────
  const alreadyExists = await columnExists('sc_calendar_feeds', 'player_ids');
  if (alreadyExists) {
    results.push({ column: 'sc_calendar_feeds.player_ids', status: 'already_exists' });
  } else {
    try {
      await db.execute(sql.raw(`
        ALTER TABLE sc_calendar_feeds
        ADD COLUMN player_ids VARCHAR(2048) NULL COMMENT 'JSON array of sc_player_profiles.id; NULL = all players'
      `));
      results.push({ column: 'sc_calendar_feeds.player_ids', status: 'added' });
    } catch (err) {
      const errno = (err as { errno?: number; cause?: { errno?: number } }).errno
        ?? (err as { cause?: { errno?: number } }).cause?.errno;
      if (errno === 1060) {
        // Duplicate column name — already exists (MySQL 5.7 path)
        results.push({ column: 'sc_calendar_feeds.player_ids', status: 'already_exists' });
      } else {
        const detail = err instanceof Error
          ? ((err as { cause?: { sqlMessage?: string } }).cause?.sqlMessage ?? err.message)
          : String(err);
        results.push({ column: 'sc_calendar_feeds.player_ids', status: 'error', detail });
      }
    }
  }

  const errors = results.filter(r => r.status === 'error').length;
  res.status(errors > 0 ? 207 : 200).json({
    ok: errors === 0,
    summary: {
      added:         results.filter(r => r.status === 'added').length,
      already_exists: results.filter(r => r.status === 'already_exists').length,
      errors,
    },
    results,
  });
}
