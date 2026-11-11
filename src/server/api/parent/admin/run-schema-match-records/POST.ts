/**
 * POST /api/parent/admin/run-schema-match-records
 *
 * Additive migration: creates sc_player_match_records table for
 * calendar-linked match performance records.
 *
 * Idempotent — safe to re-run. Uses CREATE TABLE IF NOT EXISTS.
 * Requires admin access.
 *
 * This migration must be run before calendar-linked player stats
 * can be saved. The feature is gated on this table existing.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  // Admin-only
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sc_player_match_records (
        id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
        user_id               VARCHAR(36)  NOT NULL,
        player_id             VARCHAR(36)  NOT NULL,
        event_ref             VARCHAR(256) NOT NULL,
        match_date            VARCHAR(10)  NULL,
        opponent              VARCHAR(256) NULL,
        season                VARCHAR(64)  NULL,
        position_played       VARCHAR(64)  NULL,
        participated          BOOLEAN      NOT NULL DEFAULT FALSE,
        stat_gp               INT          NULL,
        stat_goals            INT          NULL,
        stat_assists          INT          NULL,
        stat_shots            INT          NULL,
        stat_ga               INT          NULL,
        stat_saves            INT          NULL,
        stat_so               INT          NULL,
        notes                 TEXT         NULL,
        season_totals_override BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_player_event (player_id, event_ref),
        CONSTRAINT fk_pmr_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    res.json({
      ok: true,
      message: 'sc_player_match_records table created (or already existed).',
    });
  } catch (err) {
    console.error('[run-schema-match-records] error:', err);
    res.status(500).json({ error: 'Migration failed', message: String(err) });
  }
}
