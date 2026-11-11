/**
 * POST /api/parent/admin/run-schema-v5
 *
 * Creates the team catalog tables that seed-teams and seed-team-sources require:
 *   - sc_teams            (canonical team/league/org directory)
 *   - sc_competitions     (competition/cup catalog)
 *   - sc_team_competitions (team ↔ competition membership)
 *   - sc_team_sources     (team ↔ source join table)
 *   - sc_import_log       (seed import audit log)
 *
 * All CREATE TABLE statements use IF NOT EXISTS — safe to re-run.
 * Admin-only.
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
    const result = await db.execute(sql.raw(`SHOW TABLES LIKE '${table}'`)) as unknown;
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows.
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
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

  // ── sc_teams ──────────────────────────────────────────────────────────────
  results.push(await createTable('sc_teams', `
    CREATE TABLE IF NOT EXISTS sc_teams (
      id                        VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key                VARCHAR(128) NOT NULL UNIQUE,
      organization_key          VARCHAR(128),
      entity_type               VARCHAR(32)  NOT NULL,
      display_name              VARCHAR(255) NOT NULL,
      gender                    VARCHAR(16),
      association_code          VARCHAR(16),
      aliases                   TEXT,
      official_profile_url      VARCHAR(512),
      official_website          VARCHAR(512),
      website_verification_status VARCHAR(64),
      media_coverage            VARCHAR(32),
      social_discovery_status   VARCHAR(32),
      podcast_discovery_status  VARCHAR(32),
      last_checked              VARCHAR(16),
      created_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_competitions ───────────────────────────────────────────────────────
  results.push(await createTable('sc_competitions', `
    CREATE TABLE IF NOT EXISTS sc_competitions (
      id                VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key        VARCHAR(128) NOT NULL UNIQUE,
      display_name      VARCHAR(255) NOT NULL,
      competition_type  VARCHAR(64),
      association_code  VARCHAR(16),
      gender            VARCHAR(16),
      age_group         VARCHAR(32),
      region            VARCHAR(64),
      official_website  VARCHAR(512),
      media_coverage    VARCHAR(32),
      created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_team_competitions ──────────────────────────────────────────────────
  results.push(await createTable('sc_team_competitions', `
    CREATE TABLE IF NOT EXISTS sc_team_competitions (
      id                VARCHAR(36) NOT NULL PRIMARY KEY,
      team_id           VARCHAR(36) NOT NULL,
      competition_id    VARCHAR(36) NOT NULL,
      season            VARCHAR(32),
      membership_status VARCHAR(64),
      evidence_url      VARCHAR(512),
      created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tc_team   FOREIGN KEY (team_id)        REFERENCES sc_teams(id)        ON DELETE CASCADE,
      CONSTRAINT fk_tc_comp   FOREIGN KEY (competition_id) REFERENCES sc_competitions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_team_sources ───────────────────────────────────────────────────────
  results.push(await createTable('sc_team_sources', `
    CREATE TABLE IF NOT EXISTS sc_team_sources (
      id         VARCHAR(36) NOT NULL PRIMARY KEY,
      team_id    VARCHAR(36) NOT NULL,
      source_id  VARCHAR(36) NOT NULL,
      created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ts_team   FOREIGN KEY (team_id)   REFERENCES sc_teams(id)   ON DELETE CASCADE,
      CONSTRAINT fk_ts_source FOREIGN KEY (source_id) REFERENCES sc_sources(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));

  // ── sc_import_log ─────────────────────────────────────────────────────────
  results.push(await createTable('sc_import_log', `
    CREATE TABLE IF NOT EXISTS sc_import_log (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      import_key  VARCHAR(256) NOT NULL,
      entity_type VARCHAR(32)  NOT NULL,
      action      VARCHAR(32)  NOT NULL,
      reason      TEXT,
      payload     TEXT,
      resolved_at TIMESTAMP    NULL,
      resolved_by VARCHAR(36),
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
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
