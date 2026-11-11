/**
 * POST /api/parent/admin/run-schema-recruiting
 *
 * Additive migration — creates six new tables for the private recruiting feature:
 *
 *   sc_college_programs   — college soccer programs (institution + gender)
 *   sc_college_coaches    — coaches linked to programs; official contacts only
 *   sc_id_camps           — college ID camps with confirmed/historical/estimated status
 *   sc_showcases          — established showcases with recruiting relevance
 *   sc_recruiting_saved   — parent-saved opportunities scoped to a player
 *   sc_outreach_drafts    — coach outreach drafts (no email sending)
 *
 * All CREATE TABLE statements use IF NOT EXISTS — safe to re-run.
 * Does NOT touch existing tables or rows. Admin-only.
 * All tables are private: never exposed through public APIs or sitemaps.
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

  // ── sc_college_programs ───────────────────────────────────────────────────
  results.push(await createTable('sc_college_programs', `
    CREATE TABLE IF NOT EXISTS sc_college_programs (
      id           VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key   VARCHAR(128) NOT NULL UNIQUE,
      institution  VARCHAR(255) NOT NULL,
      short_name   VARCHAR(128),
      gender       VARCHAR(8)   NOT NULL,
      division     VARCHAR(32),
      conference   VARCHAR(128),
      city         VARCHAR(128),
      state        VARCHAR(64),
      regions      VARCHAR(512) NOT NULL,
      program_url  VARCHAR(512),
      staff_url    VARCHAR(512),
      checked_date VARCHAR(16),
      source_url   VARCHAR(512),
      active       TINYINT(1)   NOT NULL DEFAULT 1,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_college_coaches ────────────────────────────────────────────────────
  results.push(await createTable('sc_college_coaches', `
    CREATE TABLE IF NOT EXISTS sc_college_coaches (
      id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key         VARCHAR(128) NOT NULL UNIQUE,
      program_id         VARCHAR(36)  NOT NULL,
      name               VARCHAR(255) NOT NULL,
      role               VARCHAR(128),
      email              VARCHAR(255),
      email_is_personal  TINYINT(1),
      phone              VARCHAR(64),
      staff_page_url     VARCHAR(512),
      checked_date       VARCHAR(16),
      source_url         VARCHAR(512),
      active             TINYINT(1)   NOT NULL DEFAULT 1,
      created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_coach_program FOREIGN KEY (program_id) REFERENCES sc_college_programs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_id_camps ───────────────────────────────────────────────────────────
  results.push(await createTable('sc_id_camps', `
    CREATE TABLE IF NOT EXISTS sc_id_camps (
      id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key            VARCHAR(128) NOT NULL UNIQUE,
      program_id            VARCHAR(36),
      institution           VARCHAR(255) NOT NULL,
      camp_name             VARCHAR(255) NOT NULL,
      region                VARCHAR(64)  NOT NULL,
      city                  VARCHAR(128),
      state                 VARCHAR(64),
      gender                VARCHAR(8),
      age_eligibility       VARCHAR(128),
      start_date            VARCHAR(16),
      end_date              VARCHAR(16),
      registration_opens    VARCHAR(16),
      registration_deadline VARCHAR(16),
      price                 VARCHAR(64),
      registration_url      VARCHAR(512),
      listing_status        VARCHAR(32)  NOT NULL,
      estimate_evidence     TEXT,
      source_url            VARCHAR(512),
      checked_date          VARCHAR(16),
      active                TINYINT(1)   NOT NULL DEFAULT 1,
      created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_camp_program FOREIGN KEY (program_id) REFERENCES sc_college_programs(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_showcases ──────────────────────────────────────────────────────────
  results.push(await createTable('sc_showcases', `
    CREATE TABLE IF NOT EXISTS sc_showcases (
      id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key            VARCHAR(128) NOT NULL UNIQUE,
      name                  VARCHAR(255) NOT NULL,
      organizer             VARCHAR(255),
      region                VARCHAR(64)  NOT NULL,
      city                  VARCHAR(128),
      state                 VARCHAR(64),
      official_url          VARCHAR(512),
      gender                VARCHAR(8),
      age_groups            VARCHAR(128),
      start_date            VARCHAR(16),
      end_date              VARCHAR(16),
      registration_deadline VARCHAR(16),
      entry_type            VARCHAR(16),
      listing_status        VARCHAR(32)  NOT NULL,
      recruiting_evidence   TEXT,
      historical_attendance TEXT,
      source_url            VARCHAR(512),
      checked_date          VARCHAR(16),
      active                TINYINT(1)   NOT NULL DEFAULT 1,
      created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_recruiting_saved ───────────────────────────────────────────────────
  results.push(await createTable('sc_recruiting_saved', `
    CREATE TABLE IF NOT EXISTS sc_recruiting_saved (
      id                VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id           VARCHAR(36)  NOT NULL,
      player_id         VARCHAR(36)  NOT NULL,
      item_type         VARCHAR(16)  NOT NULL,
      item_id           VARCHAR(36)  NOT NULL,
      status            VARCHAR(16)  NOT NULL DEFAULT 'interested',
      calendar_event_id VARCHAR(36),
      notes             TEXT,
      saved_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_rs_user   FOREIGN KEY (user_id)   REFERENCES user(id)                ON DELETE CASCADE,
      CONSTRAINT fk_rs_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)  ON DELETE CASCADE,
      UNIQUE KEY uq_rs_player_item (player_id, item_type, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_outreach_drafts ────────────────────────────────────────────────────
  results.push(await createTable('sc_outreach_drafts', `
    CREATE TABLE IF NOT EXISTS sc_outreach_drafts (
      id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id                 VARCHAR(36)  NOT NULL,
      player_id               VARCHAR(36)  NOT NULL,
      coach_id                VARCHAR(36)  NOT NULL,
      approved_fields         TEXT,
      selected_collection_id  VARCHAR(36),
      selected_media          TEXT,
      selected_match_records  TEXT,
      introduction            TEXT,
      draft_status            VARCHAR(16)  NOT NULL DEFAULT 'draft',
      created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_od_user   FOREIGN KEY (user_id)   REFERENCES user(id)                ON DELETE CASCADE,
      CONSTRAINT fk_od_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)  ON DELETE CASCADE,
      CONSTRAINT fk_od_coach  FOREIGN KEY (coach_id)  REFERENCES sc_college_coaches(id)  ON DELETE CASCADE
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
