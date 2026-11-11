/**
 * POST /api/parent/admin/run-schema-player-media
 *
 * Additive migration — creates three new tables for the production
 * player media/schedule/collections feature:
 *
 *   sc_player_media_assignments
 *     Links an existing sc_parent_media item to a player + season + optional
 *     game event reference. One media item may be assigned to multiple players.
 *
 *   sc_player_highlight_collections
 *     Named, ordered highlight collections per player.
 *
 *   sc_player_collection_items
 *     Ordered clips within a collection.
 *
 * All CREATE TABLE statements use IF NOT EXISTS — safe to re-run.
 * Does NOT touch existing tables or rows. Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

interface StepResult {
  table: string;
  status: 'created' | 'already_exists' | 'error';
  detail?: string;
}

async function tableExists(table: string): Promise<boolean> {
  try {
    const rows = await db.execute(sql.raw(`SHOW TABLES LIKE '${table}'`));
    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const arr = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? []) as unknown[];
    return arr.length > 0;
  } catch {
    return false;
  }
}

async function createTable(name: string, ddl: string): Promise<StepResult> {
  const existed = await tableExists(name);
  if (existed) return { table: name, status: 'already_exists' };
  try {
    await db.execute(sql.raw(ddl));
    return { table: name, status: 'created' };
  } catch (err) {
    const detail = err instanceof Error
      ? ((err as { cause?: { sqlMessage?: string } }).cause?.sqlMessage ?? err.message)
      : String(err);
    return { table: name, status: 'error', detail };
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const results: StepResult[] = [];

  // ── sc_player_media_assignments ───────────────────────────────────────────
  // Links sc_parent_media → player + season + optional game event ref.
  // One media item can be assigned to multiple players (no FK on media_id to
  // allow reassignment without cascade issues; ownership enforced at API layer).
  results.push(await createTable('sc_player_media_assignments', `
    CREATE TABLE IF NOT EXISTS sc_player_media_assignments (
      id            VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id       VARCHAR(36)  NOT NULL,
      media_id      VARCHAR(36)  NOT NULL,
      player_id     VARCHAR(36)  NOT NULL,
      season        VARCHAR(64),
      game_event_ref VARCHAR(256),
      kind          VARCHAR(16)  NOT NULL DEFAULT 'photo',
      title         VARCHAR(255),
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_pma_user   FOREIGN KEY (user_id)   REFERENCES user(id)                  ON DELETE CASCADE,
      CONSTRAINT fk_pma_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)    ON DELETE CASCADE,
      UNIQUE KEY uq_pma_media_player (media_id, player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_player_highlight_collections ──────────────────────────────────────
  results.push(await createTable('sc_player_highlight_collections', `
    CREATE TABLE IF NOT EXISTS sc_player_highlight_collections (
      id         VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id    VARCHAR(36)  NOT NULL,
      player_id  VARCHAR(36)  NOT NULL,
      name       VARCHAR(255) NOT NULL,
      sort_order INT          NOT NULL DEFAULT 0,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_phc_user   FOREIGN KEY (user_id)   REFERENCES user(id)               ON DELETE CASCADE,
      CONSTRAINT fk_phc_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_player_collection_items ────────────────────────────────────────────
  results.push(await createTable('sc_player_collection_items', `
    CREATE TABLE IF NOT EXISTS sc_player_collection_items (
      id              VARCHAR(36) NOT NULL PRIMARY KEY,
      collection_id   VARCHAR(36) NOT NULL,
      assignment_id   VARCHAR(36) NOT NULL,
      sort_order      INT         NOT NULL DEFAULT 0,
      created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pci_collection FOREIGN KEY (collection_id) REFERENCES sc_player_highlight_collections(id) ON DELETE CASCADE,
      CONSTRAINT fk_pci_assignment FOREIGN KEY (assignment_id) REFERENCES sc_player_media_assignments(id)     ON DELETE CASCADE,
      UNIQUE KEY uq_pci_coll_assign (collection_id, assignment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'already_exists').length;
  const errors  = results.filter(r => r.status === 'error').length;

  res.status(errors > 0 ? 207 : 200).json({
    ok: errors === 0,
    summary: { created, skipped, errors },
    results,
  });
}
