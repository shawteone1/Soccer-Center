/**
 * POST /api/parent/admin/run-schema-v3
 * Creates the three new tables added in schema v3:
 *   - sc_parent_media
 *   - sc_parent_connections
 *   - sc_parent_manual_events
 *
 * MySQL 5.7 compatible — checks information_schema before creating.
 * Idempotent. Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';

async function tableExists(table: string): Promise<boolean> {
  try {
    const result = await db.execute(sql.raw(
      `SHOW TABLES LIKE '${table}'`
    )) as unknown;
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows.
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length > 0;
  } catch {
    return false;
  }
}

async function createTable(
  table: string,
  ddl: string,
): Promise<{ table: string; status: string }> {
  try {
    const exists = await tableExists(table);
    if (exists) return { table, status: 'skipped — already exists' };
    await db.execute(sql.raw(ddl));
    return { table, status: 'ok' };
  } catch (e) {
    return { table, status: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export default async function handler(req: Request, res: Response) {
  const authed = await requireAdmin(req, res);
  if (!authed) return;

  const results = await Promise.all([
    createTable('sc_parent_media', `
      CREATE TABLE \`sc_parent_media\` (
        id              VARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id         VARCHAR(36)   NOT NULL,
        post_id         VARCHAR(36)   NULL,
        storage_path    VARCHAR(512)  NOT NULL,
        public_url      VARCHAR(512)  NOT NULL,
        media_type      VARCHAR(8)    NOT NULL,
        original_name   VARCHAR(255)  NULL,
        mime_type       VARCHAR(64)   NULL,
        size_bytes      BIGINT        NULL,
        caption         VARCHAR(512)  NULL,
        deleted_at      TIMESTAMP     NULL,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_spm_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),

    createTable('sc_parent_connections', `
      CREATE TABLE \`sc_parent_connections\` (
        id            VARCHAR(36)   NOT NULL PRIMARY KEY,
        requester_id  VARCHAR(36)   NOT NULL,
        addressee_id  VARCHAR(36)   NOT NULL,
        status        VARCHAR(16)   NOT NULL DEFAULT 'pending',
        message       VARCHAR(256)  NULL,
        accepted_at   TIMESTAMP     NULL,
        rejected_at   TIMESTAMP     NULL,
        removed_at    TIMESTAMP     NULL,
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_spc_requester FOREIGN KEY (requester_id) REFERENCES \`user\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_spc_addressee FOREIGN KEY (addressee_id) REFERENCES \`user\`(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),

    createTable('sc_parent_manual_events', `
      CREATE TABLE \`sc_parent_manual_events\` (
        id          VARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id     VARCHAR(36)   NOT NULL,
        title       VARCHAR(512)  NOT NULL,
        start_at    VARCHAR(32)   NOT NULL,
        end_at      VARCHAR(32)   NULL,
        all_day     TINYINT(1)    NOT NULL DEFAULT 0,
        location    VARCHAR(512)  NULL,
        notes       TEXT          NULL,
        event_type  VARCHAR(32)   NULL DEFAULT 'event',
        player_id   VARCHAR(36)   NULL,
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_spme_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  ]);

  const allOk = results.every(r => r.status === 'ok' || r.status.startsWith('skipped'));
  res.status(allOk ? 200 : 207).json({ ok: allOk, results });
}
