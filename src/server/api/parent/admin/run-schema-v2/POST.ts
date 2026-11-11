/**
 * POST /api/parent/admin/run-schema-v2
 *
 * Additive schema migration for Parent Portal v2.
 * Adds new columns to sc_parent_profiles and sc_player_profiles,
 * and creates sc_player_affiliations and sc_onboarding_drafts tables.
 *
 * ALL operations are additive — no existing columns or rows are modified.
 * Safe to run multiple times.
 *
 * Uses raw mysql2 (not Drizzle) because DDL cannot run as prepared statements.
 * Uses SHOW COLUMNS to check existence before ALTER TABLE because
 * ADD COLUMN IF NOT EXISTS requires MySQL 8.0.3+ and production runs 5.7.
 *
 * Admin-only. Returns a step-by-step result log.
 */

import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { requireAdmin } from '@/server/auth-policy.js';
import { getDatabaseCredentials } from '@/server/db/config.js';

interface StepResult {
  step: string;
  status: 'ok' | 'skipped' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const creds = getDatabaseCredentials();
  const conn = await mysql.createConnection({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
  });

  /** Check whether a column exists via SHOW COLUMNS */
  async function columnExists(table: string, column: string): Promise<boolean> {
    const [rows] = await conn.query(
      `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
      [column],
    ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
    return rows.length > 0;
  }

  /** Add a column only if it doesn't already exist */
  async function addColumn(
    table: string,
    column: string,
    definition: string,
  ): Promise<StepResult> {
    const label = `${table}.${column}`;
    try {
      const exists = await columnExists(table, column);
      if (exists) return { step: label, status: 'skipped', detail: 'column already present' };
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      return { step: label, status: 'ok' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[run-schema-v2] addColumn "${label}" error:`, err);
      return { step: label, status: 'error', detail: msg };
    }
  }

  /** Create a table only if it doesn't already exist */
  async function createTable(label: string, ddl: string): Promise<StepResult> {
    try {
      await conn.query(ddl);
      return { step: label, status: 'ok' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code;
      if (code === 'ER_TABLE_EXISTS_ERROR' || msg.includes('already exists')) {
        return { step: label, status: 'skipped', detail: 'table already exists' };
      }
      console.error(`[run-schema-v2] createTable "${label}" error:`, err);
      return { step: label, status: 'error', detail: msg };
    }
  }

  const results: StepResult[] = [];

  try {
    // ── sc_parent_profiles ──────────────────────────────────────────────────────
    results.push(await addColumn('sc_parent_profiles', 'display_name',            `VARCHAR(255) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'bio',                     `TEXT NULL`));
    results.push(await addColumn('sc_parent_profiles', 'avatar_initials',         `VARCHAR(4) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'avatar_url',              `VARCHAR(1024) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'cover_style',             `VARCHAR(32) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'city',                    `VARCHAR(128) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'timezone',                `VARCHAR(64) NULL DEFAULT 'America/Denver'`));
    results.push(await addColumn('sc_parent_profiles', 'privacy_private',         `TINYINT(1) NULL DEFAULT 1`));
    results.push(await addColumn('sc_parent_profiles', 'marketing_opt_in',        `TINYINT(1) NULL DEFAULT 0`));
    results.push(await addColumn('sc_parent_profiles', 'onboarding_stage',        `VARCHAR(32) NULL`));
    results.push(await addColumn('sc_parent_profiles', 'onboarding_steps_completed', `TEXT NULL`));

    // ── sc_player_profiles ──────────────────────────────────────────────────────
    results.push(await addColumn('sc_player_profiles', 'birth_year',          `INT NULL`));
    results.push(await addColumn('sc_player_profiles', 'jersey',              `VARCHAR(8) NULL`));
    results.push(await addColumn('sc_player_profiles', 'avatar_initials',     `VARCHAR(4) NULL`));
    results.push(await addColumn('sc_player_profiles', 'primary_position',    `VARCHAR(64) NULL`));
    results.push(await addColumn('sc_player_profiles', 'secondary_position',  `VARCHAR(64) NULL`));
    results.push(await addColumn('sc_player_profiles', 'foot',                `VARCHAR(8) NULL`));
    results.push(await addColumn('sc_player_profiles', 'goals',               `TEXT NULL`));
    // Club directory link — stable directory ID from directory_regions.json
    results.push(await addColumn('sc_player_profiles', 'club_directory_id',   `VARCHAR(128) NULL`));

    // ── sc_player_affiliations ──────────────────────────────────────────────────
    results.push(await createTable(
      'CREATE TABLE sc_player_affiliations',
      `CREATE TABLE IF NOT EXISTS sc_player_affiliations (
        id              VARCHAR(36)  NOT NULL PRIMARY KEY,
        player_id       VARCHAR(36)  NOT NULL,
        user_id         VARCHAR(36)  NOT NULL,
        org_key         VARCHAR(64)  NULL,
        org_name        VARCHAR(255) NOT NULL,
        season          VARCHAR(32)  NULL,
        age_group_label VARCHAR(64)  NULL,
        parent_entered  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_spa_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE,
        CONSTRAINT fk_spa_user   FOREIGN KEY (user_id)   REFERENCES user(id)               ON DELETE CASCADE
      )`,
    ));

    // ── sc_onboarding_drafts ────────────────────────────────────────────────────
    results.push(await createTable(
      'CREATE TABLE sc_onboarding_drafts',
      `CREATE TABLE IF NOT EXISTS sc_onboarding_drafts (
        user_id          VARCHAR(36) NOT NULL PRIMARY KEY,
        stage            VARCHAR(32) NULL DEFAULT 'you',
        steps_completed  TEXT        NULL,
        draft_data       TEXT        NULL,
        updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sod_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )`,
    ));

  } finally {
    await conn.end();
  }

  const errors = results.filter(r => r.status === 'error');
  const allOk  = errors.length === 0;

  res.status(allOk ? 200 : 500).json({
    success: allOk,
    steps: results,
    summary: {
      total:   results.length,
      ok:      results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors:  errors.length,
    },
    ...(errors.length > 0 && { errors }),
  });
}
