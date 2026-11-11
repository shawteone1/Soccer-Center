/**
 * POST /api/parent/admin/run-schema-coach-profile-v1
 *
 * Additive, idempotent migration for the coach profile feature.
 *
 * Adds to sc_player_profiles:
 *   graduation_year   INT NULL
 *   profile_introduction TEXT NULL
 *   achievements      TEXT NULL
 *   playing_level     VARCHAR(64) NULL
 *
 * Creates new tables:
 *   sc_coach_profile_links
 *   sc_coach_profile_requests
 *
 * SAFETY RULES:
 *   - Admin-only (isAdmin check, not just requireParentAccess)
 *   - Every ALTER uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
 *   - Read-only INFORMATION_SCHEMA check reported before any DDL
 *   - Never triggered by a page load or GET request
 *   - Returns a structured report of what was applied vs already present
 *
 * Do not run against production until staging tests and recovery checks pass.
 */

import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';

interface StepResult {
  step: string;
  status: 'applied' | 'already_present' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  // Admin-only — requireParentAccess only checks PARENT access type
  if (!user.isAdmin) {
    res.status(403).json({});
    return;
  }

  // Migration gate: COACH_PROFILE_SCHEMA_ENABLED allows running the migration
  // independently of COACH_PROFILE_LINKS_ENABLED (the public-sharing feature flag).
  // This lets the schema be prepared and verified before the feature is exposed.
  // Either flag being 'true' authorizes the migration.
  const schemaEnabled = getSecret('COACH_PROFILE_SCHEMA_ENABLED') === 'true';
  const linksEnabled  = getSecret('COACH_PROFILE_LINKS_ENABLED')  === 'true';
  if (!schemaEnabled && !linksEnabled) {
    res.status(403).json({ error: 'Set COACH_PROFILE_SCHEMA_ENABLED=true (or COACH_PROFILE_LINKS_ENABLED=true) to run this migration without enabling public sharing' });
    return;
  }

  setPrivateCacheHeaders(res);

  // Connect directly (not through Drizzle) so we can run raw DDL
  let conn: mysql.Connection | null = null;
  const results: StepResult[] = [];

  try {
    const cfg = JSON.parse(readFileSync('/local/config.json', 'utf-8'));
    const db = cfg.DATABASE.VALUE;
    conn = await mysql.createConnection({
      host: db.HOST, port: db.PORT,
      user: db.USERNAME, password: db.PASSWORD,
      database: db.NAME,
      ssl: { rejectUnauthorized: false },
      multipleStatements: false,
    });

    const dbName: string = db.NAME as string;

    // ── Helper: check column existence ──────────────────────────────────────
    async function columnExists(table: string, column: string): Promise<boolean> {
      const [rows] = await conn!.execute(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [dbName, table, column],
      );
      return (rows as unknown[]).length > 0;
    }

    // ── Helper: check table existence ────────────────────────────────────────
    async function tableExists(table: string): Promise<boolean> {
      const [rows] = await conn!.execute(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
        [dbName, table],
      );
      return (rows as unknown[]).length > 0;
    }

    // ── 1. graduation_year ───────────────────────────────────────────────────
    {
      const exists = await columnExists('sc_player_profiles', 'graduation_year');
      if (exists) {
        results.push({ step: 'sc_player_profiles.graduation_year', status: 'already_present' });
      } else {
        await conn.execute(
          `ALTER TABLE sc_player_profiles ADD COLUMN graduation_year INT NULL`,
        );
        results.push({ step: 'sc_player_profiles.graduation_year', status: 'applied' });
      }
    }

    // ── 2. profile_introduction ──────────────────────────────────────────────
    {
      const exists = await columnExists('sc_player_profiles', 'profile_introduction');
      if (exists) {
        results.push({ step: 'sc_player_profiles.profile_introduction', status: 'already_present' });
      } else {
        await conn.execute(
          `ALTER TABLE sc_player_profiles ADD COLUMN profile_introduction TEXT NULL`,
        );
        results.push({ step: 'sc_player_profiles.profile_introduction', status: 'applied' });
      }
    }

    // ── 3. achievements ──────────────────────────────────────────────────────
    {
      const exists = await columnExists('sc_player_profiles', 'achievements');
      if (exists) {
        results.push({ step: 'sc_player_profiles.achievements', status: 'already_present' });
      } else {
        await conn.execute(
          `ALTER TABLE sc_player_profiles ADD COLUMN achievements TEXT NULL`,
        );
        results.push({ step: 'sc_player_profiles.achievements', status: 'applied' });
      }
    }

    // ── 4. playing_level ─────────────────────────────────────────────────────
    {
      const exists = await columnExists('sc_player_profiles', 'playing_level');
      if (exists) {
        results.push({ step: 'sc_player_profiles.playing_level', status: 'already_present' });
      } else {
        await conn.execute(
          `ALTER TABLE sc_player_profiles ADD COLUMN playing_level VARCHAR(64) NULL`,
        );
        results.push({ step: 'sc_player_profiles.playing_level', status: 'applied' });
      }
    }

    // ── 5. sc_coach_profile_links ────────────────────────────────────────────
    {
      const exists = await tableExists('sc_coach_profile_links');
      if (exists) {
        results.push({ step: 'CREATE TABLE sc_coach_profile_links', status: 'already_present' });
      } else {
        await conn.execute(`
          CREATE TABLE sc_coach_profile_links (
            id              VARCHAR(36)  NOT NULL PRIMARY KEY,
            player_id       VARCHAR(36)  NOT NULL,
            user_id         VARCHAR(36)  NOT NULL,
            token_hash      VARCHAR(64)  NOT NULL UNIQUE,
            approved_fields TEXT         NOT NULL,
            selected_media  TEXT         NOT NULL,
            selected_match_records TEXT  NOT NULL,
            selected_events TEXT         NULL,
            selected_collection_id VARCHAR(36) NULL,
            expires_at      TIMESTAMP    NULL,
            revoked_at      TIMESTAMP    NULL,
            label           VARCHAR(255) NULL,
            created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_cpl_player FOREIGN KEY (player_id)
              REFERENCES sc_player_profiles(id) ON DELETE CASCADE,
            CONSTRAINT fk_cpl_user FOREIGN KEY (user_id)
              REFERENCES user(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        results.push({ step: 'CREATE TABLE sc_coach_profile_links', status: 'applied' });
      }
    }

    // ── 6. sc_coach_profile_requests ─────────────────────────────────────────
    {
      const exists = await tableExists('sc_coach_profile_requests');
      if (exists) {
        results.push({ step: 'CREATE TABLE sc_coach_profile_requests', status: 'already_present' });
      } else {
        await conn.execute(`
          CREATE TABLE sc_coach_profile_requests (
            id               VARCHAR(36)  NOT NULL PRIMARY KEY,
            link_id          VARCHAR(36)  NOT NULL,
            player_id        VARCHAR(36)  NOT NULL,
            requester_name   VARCHAR(255) NULL,
            requester_email  VARCHAR(255) NULL,
            message          TEXT         NULL,
            status           VARCHAR(16)  NOT NULL DEFAULT 'pending',
            created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_cpr_link FOREIGN KEY (link_id)
              REFERENCES sc_coach_profile_links(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        results.push({ step: 'CREATE TABLE sc_coach_profile_requests', status: 'applied' });
      }
    }

    // ── 7. sc_coach_profile_links.selected_events ───────────────────────────
    // Added in v1 rev2 — existing tables created before this step lack the column.
    // NULL default is intentional: _rowToRecord parses NULL as [] (no events shared).
    {
      const exists = await columnExists('sc_coach_profile_links', 'selected_events');
      if (exists) {
        results.push({ step: 'sc_coach_profile_links.selected_events', status: 'already_present' });
      } else {
        await conn.execute(
          `ALTER TABLE sc_coach_profile_links ADD COLUMN selected_events TEXT NULL`,
        );
        results.push({ step: 'sc_coach_profile_links.selected_events', status: 'applied' });
      }
    }

    const applied = results.filter(r => r.status === 'applied').length;
    const alreadyPresent = results.filter(r => r.status === 'already_present').length;

    res.json({
      ok: true,
      applied,
      alreadyPresent,
      results,
    });

  } catch (err) {
    console.error('[run-schema-coach-profile-v1]', err);
    const message = err instanceof Error ? err.message : String(err);
    results.push({ step: 'FATAL', status: 'error', detail: message });
    res.status(500).json({ ok: false, results });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
