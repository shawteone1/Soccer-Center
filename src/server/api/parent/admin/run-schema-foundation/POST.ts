/**
 * POST /api/parent/admin/run-schema-foundation
 *
 * Creates ALL tables and columns that the migrate-check endpoint requires
 * as prerequisites before schema-v3 can run.
 *
 * MySQL 5.7 compatible — does NOT use ADD COLUMN IF NOT EXISTS or
 * CREATE TABLE IF NOT EXISTS with IF NOT EXISTS on ALTER. Instead we
 * check information_schema first and skip if already present.
 *
 * Admin-only. Safe to run multiple times (idempotent).
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

interface StepResult {
  step: string;
  status: 'ok' | 'skipped' | 'error';
  detail?: string;
}

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

async function tableExists(table: string): Promise<boolean> {
  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows
    const result = await db.execute(sql.raw(
      `SHOW TABLES LIKE '${table}'`
    )) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length > 0;
  } catch {
    return false;
  }
}

function extractErrorDetail(err: unknown): string {
  if (err === null || err === undefined) return 'unknown error (null/undefined)';
  if (typeof err === 'string') return err;
  if (typeof err !== 'object') return String(err);
  // Always dump the full object first so we never lose info
  const allProps = JSON.stringify(err, Object.getOwnPropertyNames(err));
  const e = err as Record<string, unknown>;
  // Walk up to 3 levels of .cause to find sqlMessage / message
  function dig(o: unknown, depth: number): string {
    if (!o || typeof o !== 'object' || depth > 3) return '';
    const x = o as Record<string, unknown>;
    if (typeof x['sqlMessage'] === 'string' && x['sqlMessage']) return x['sqlMessage'] as string;
    if (typeof x['message'] === 'string' && x['message']) return x['message'] as string;
    return dig(x['cause'], depth + 1);
  }
  const msg = dig(e, 0);
  const code = typeof e['code'] === 'string' ? ` [${e['code']}]` : '';
  const errno = typeof e['errno'] === 'number' ? ` errno=${e['errno']}` : '';
  const short = `${msg}${code}${errno}`.trim();
  // Return short summary + full dump so nothing is hidden
  return short ? `${short} || FULL: ${allProps}` : allProps;
}

async function addColumn(label: string, table: string, column: string, definition: string): Promise<StepResult> {
  try {
    const exists = await columnExists(table, column);
    if (exists) return { step: label, status: 'skipped', detail: 'column already exists' };
    await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
    return { step: label, status: 'ok' };
  } catch (err) {
    return { step: label, status: 'error', detail: extractErrorDetail(err) };
  }
}

async function createTable(label: string, table: string, ddl: string): Promise<StepResult> {
  try {
    const exists = await tableExists(table);
    if (exists) return { step: label, status: 'skipped', detail: 'table already exists' };
    await db.execute(sql.raw(ddl));
    return { step: label, status: 'ok' };
  } catch (err) {
    return { step: label, status: 'error', detail: extractErrorDetail(err) };
  }
}

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const results: StepResult[] = [];

  // ── 1. user.access_type ──────────────────────────────────────────────────────
  results.push(await addColumn(
    'user.access_type column',
    'user', 'access_type',
    `VARCHAR(8) NULL`,
  ));

  // ── 2. sc_member_profiles phase-2 columns ────────────────────────────────────  // Guard: only attempt ALTER if the table itself exists
  const profilesExists = await tableExists('sc_member_profiles');
  if (!profilesExists) {
    results.push({ step: 'sc_member_profiles (table check)', status: 'error', detail: 'sc_member_profiles table does not exist — the base Drizzle migration has not run yet. Check your database connection and Drizzle migration state.' });
    results.push({ step: 'sc_member_profiles.fan_onboarding_done', status: 'skipped', detail: 'parent table missing' });
    results.push({ step: 'sc_member_profiles.parent_onboarding_done', status: 'skipped', detail: 'parent table missing' });
    results.push({ step: 'sc_member_profiles.consent_version', status: 'skipped', detail: 'parent table missing' });
    results.push({ step: 'sc_member_profiles.consent_accepted_at', status: 'skipped', detail: 'parent table missing' });
    results.push({ step: 'sc_member_profiles.last_portal_preference', status: 'skipped', detail: 'parent table missing' });
  } else {
    results.push(await addColumn(
      'sc_member_profiles.fan_onboarding_done',
      'sc_member_profiles', 'fan_onboarding_done',
      `TINYINT(1) NOT NULL DEFAULT 0`,
    ));
    results.push(await addColumn(
      'sc_member_profiles.parent_onboarding_done',
      'sc_member_profiles', 'parent_onboarding_done',
      `TINYINT(1) NOT NULL DEFAULT 0`,
    ));
    results.push(await addColumn(
      'sc_member_profiles.consent_version',
      'sc_member_profiles', 'consent_version',
      `VARCHAR(16) NULL`,
    ));
    results.push(await addColumn(
      'sc_member_profiles.consent_accepted_at',
      'sc_member_profiles', 'consent_accepted_at',
      `TIMESTAMP NULL`,
    ));
    results.push(await addColumn(
      'sc_member_profiles.last_portal_preference',
      'sc_member_profiles', 'last_portal_preference',
      `VARCHAR(8) NULL`,
    ));
  }

  // ── 3. sc_sources ─────────────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_sources',
    'sc_sources',
    `CREATE TABLE \`sc_sources\` (
      id                  VARCHAR(36)   NOT NULL PRIMARY KEY,
      import_key          VARCHAR(256)  NOT NULL UNIQUE,
      label               VARCHAR(255)  NULL,
      url                 VARCHAR(1024) NULL,
      format              VARCHAR(64)   NULL,
      authority           VARCHAR(32)   NULL,
      scope               VARCHAR(32)   NULL,
      integration_status  VARCHAR(32)   NULL,
      feed_endpoint       VARCHAR(1024) NULL,
      connector_enabled   TINYINT(1)    NOT NULL DEFAULT 0,
      rights_status       VARCHAR(32)   NULL,
      verification_status VARCHAR(64)   NULL,
      evidence_url        VARCHAR(512)  NULL,
      notes               TEXT          NULL,
      last_checked        VARCHAR(16)   NULL,
      created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 4. sc_user_following ──────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_user_following',
    'sc_user_following',
    `CREATE TABLE \`sc_user_following\` (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id     VARCHAR(36)  NOT NULL,
      entity_type VARCHAR(32)  NOT NULL,
      entity_id   VARCHAR(36)  NOT NULL,
      followed_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_suf_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 5. sc_parent_follows ──────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_parent_follows',
    'sc_parent_follows',
    `CREATE TABLE \`sc_parent_follows\` (
      id          VARCHAR(36)   NOT NULL PRIMARY KEY,
      user_id     VARCHAR(36)   NOT NULL,
      source_type VARCHAR(16)   NOT NULL,
      source_id   VARCHAR(128)  NOT NULL,
      source_name VARCHAR(256)  NULL,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_spf_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 6. sc_families ────────────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_families',
    'sc_families',
    `CREATE TABLE \`sc_families\` (
      id              VARCHAR(36)   NOT NULL PRIMARY KEY,
      owner_user_id   VARCHAR(36)   NOT NULL,
      display_name    VARCHAR(128)  NULL,
      created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sf_owner FOREIGN KEY (owner_user_id) REFERENCES \`user\`(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 7. sc_parent_posts ────────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_parent_posts',
    'sc_parent_posts',
    `CREATE TABLE \`sc_parent_posts\` (
      id                        VARCHAR(36)   NOT NULL PRIMARY KEY,
      author_user_id            VARCHAR(36)   NOT NULL,
      family_id                 VARCHAR(36)   NULL,
      audience                  VARCHAR(16)   NOT NULL DEFAULT 'only_me',
      body                      TEXT          NULL,
      media_urls                TEXT          NULL,
      shared_source_url         VARCHAR(512)  NULL,
      shared_source_title       VARCHAR(256)  NULL,
      shared_source_attribution VARCHAR(128)  NULL,
      edited_at                 TIMESTAMP     NULL,
      deleted_at                TIMESTAMP     NULL,
      created_at                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_spp_author FOREIGN KEY (author_user_id) REFERENCES \`user\`(id) ON DELETE CASCADE,
      CONSTRAINT fk_spp_family FOREIGN KEY (family_id)      REFERENCES \`sc_families\`(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 8. sc_family_sharing ──────────────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_family_sharing',
    'sc_family_sharing',
    `CREATE TABLE \`sc_family_sharing\` (
      id                VARCHAR(36)   NOT NULL PRIMARY KEY,
      family_id         VARCHAR(36)   NOT NULL,
      grantee_user_id   VARCHAR(36)   NOT NULL,
      permissions       VARCHAR(256)  NOT NULL,
      player_scope      VARCHAR(36)   NULL,
      status            VARCHAR(16)   NOT NULL DEFAULT 'pending',
      invite_token_hash VARCHAR(64)   NULL,
      invite_email      VARCHAR(255)  NULL,
      accepted_at       TIMESTAMP     NULL,
      expires_at        TIMESTAMP     NULL,
      revoked_at        TIMESTAMP     NULL,
      revoked_by        VARCHAR(36)   NULL,
      created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sfs_family  FOREIGN KEY (family_id)       REFERENCES \`sc_families\`(id) ON DELETE CASCADE,
      CONSTRAINT fk_sfs_grantee FOREIGN KEY (grantee_user_id) REFERENCES \`user\`(id)        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  // ── 9. sc_account_migration_log ───────────────────────────────────────────────
  results.push(await createTable(
    'CREATE TABLE sc_account_migration_log',
    'sc_account_migration_log',
    `CREATE TABLE \`sc_account_migration_log\` (
      id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
      user_id               VARCHAR(36)  NOT NULL,
      action                VARCHAR(16)  NOT NULL,
      previous_member_type  VARCHAR(16)  NULL,
      previous_access_type  VARCHAR(8)   NULL,
      new_access_type       VARCHAR(8)   NULL,
      reason                TEXT         NULL,
      dry_run               TINYINT(1)   NOT NULL DEFAULT 0,
      resolved_at           TIMESTAMP    NULL,
      resolved_by           VARCHAR(36)  NULL,
      created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_saml_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ));

  const errors = results.filter(r => r.status === 'error');
  const allOk  = errors.length === 0;

  res.status(allOk ? 200 : 207).json({
    success: allOk,
    summary: {
      total:   results.length,
      ok:      results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors:  errors.length,
    },
    steps: results,
    ...(errors.length > 0 && { errors }),
    next: allOk
      ? 'Foundation complete. Run Check DB state to confirm, then run schema-v3, then seed sources.'
      : 'Some steps errored. Check the errors array and paste the result.',
  });
}
