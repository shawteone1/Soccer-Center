/**
 * GET /api/parent/admin/migrate-check
 *
 * Pre-migration readiness check. Verifies that all schema columns and tables
 * added in Step 1 actually exist in the live database before the migration
 * script is run.
 *
 * Also shows the proposed account mappings (dry-run preview) so the operator
 * can confirm the plan before applying.
 *
 * Admin-only. Returns 403 if the caller is not an admin.
 * Returns 503 if the database is unavailable.
 *
 * Response shape:
 * {
 *   ready: boolean,          // true = safe to run migration
 *   columns: { table, column, exists }[],
 *   tables: { table, exists }[],
 *   backupReminder: string,
 *   rollbackCommand: string,
 *   proposedMappings: {
 *     total: number,
 *     fan: number,
 *     parent: number,
 *     flagged: number,
 *     skipped: number,
 *     flaggedAccounts: { email: string, memberType: string }[]
 *   }
 * }
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

// Columns that must exist before the migration runs
const REQUIRED_COLUMNS: { table: string; column: string }[] = [
  { table: 'user', column: 'access_type' },
  { table: 'sc_member_profiles', column: 'fan_onboarding_done' },
  { table: 'sc_member_profiles', column: 'parent_onboarding_done' },
  { table: 'sc_member_profiles', column: 'consent_version' },
  { table: 'sc_member_profiles', column: 'consent_accepted_at' },
  { table: 'sc_member_profiles', column: 'last_portal_preference' },
];

// Tables that must exist before the migration runs
const REQUIRED_TABLES: string[] = [
  'sc_families',
  'sc_family_sharing',
  'sc_account_migration_log',
];

// Tables that schema-v3 creates (checked separately to show post-migration state)
const V3_TABLES: string[] = [
  'sc_parent_media',
  'sc_parent_connections',
  'sc_parent_manual_events',
];

// Fan system tables (created by drizzle migration 0004)
const FAN_TABLES: string[] = [
  'sc_sources',
  'sc_user_following',
  'sc_parent_follows',
  'sc_parent_posts',
];

interface ColumnCheck { table: string; column: string; exists: boolean }
interface TableCheck { table: string; exists: boolean }

async function checkColumn(table: string, column: string): Promise<boolean> {
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

async function checkTable(table: string): Promise<boolean> {
  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows
    const result = await db.execute(sql.raw(
      `SHOW TABLES LIKE '${table}'`
    )) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    return Array.isArray(resultRows) && resultRows.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    // 1. Check columns
    const columnChecks: ColumnCheck[] = await Promise.all(
      REQUIRED_COLUMNS.map(async ({ table, column }) => ({
        table,
        column,
        exists: await checkColumn(table, column),
      })),
    );

    // 2. Check tables
    const tableChecks: TableCheck[] = await Promise.all(
      REQUIRED_TABLES.map(async (table) => ({
        table,
        exists: await checkTable(table),
      })),
    );

    // 3. Check v3 tables (post-migration state)
    const v3TableChecks: TableCheck[] = await Promise.all(
      V3_TABLES.map(async (table) => ({
        table,
        exists: await checkTable(table),
      })),
    );

    // 4. Check fan system tables
    const fanTableChecks: TableCheck[] = await Promise.all(
      FAN_TABLES.map(async (table) => ({
        table,
        exists: await checkTable(table),
      })),
    );

    const allColumnsExist = columnChecks.every(c => c.exists);
    const allTablesExist  = tableChecks.every(t => t.exists);
    const ready = allColumnsExist && allTablesExist;
    const v3Done = v3TableChecks.every(t => t.exists);

    // 3. Proposed mappings (dry-run preview) — only if schema is ready
    let proposedMappings = null;
    if (ready) {
      // Load users with their member profiles
      const rows = await db.execute(sql`
        SELECT
          u.id,
          u.email,
          u.access_type,
          p.member_type
        FROM user u
        LEFT JOIN sc_member_profiles p ON p.user_id = u.id
        ORDER BY u.created_at ASC
      `) as unknown as {
        id: string;
        email: string;
        access_type: string | null;
        member_type: string | null;
      }[];

      let fan = 0, parent = 0, flagged = 0, skipped = 0;
      const flaggedAccounts: { email: string; memberType: string }[] = [];

      for (const row of rows) {
        if (row.access_type !== null) {
          skipped++;
          continue;
        }
        const mt = row.member_type;
        if (mt === 'both') {
          parent++;
        } else if (mt === 'fan' || mt === 'player' || mt === null) {
          fan++;
        } else {
          flagged++;
          flaggedAccounts.push({ email: row.email, memberType: mt ?? '(none)' });
        }
      }

      proposedMappings = {
        total: rows.length,
        fan,
        parent,
        flagged,
        skipped,
        flaggedAccounts,
      };
    }

    res.json({
      ready,
      v3Done,
      columns: columnChecks,
      tables: tableChecks,
      v3Tables: v3TableChecks,
      fanTables: fanTableChecks,
      backupReminder:
        'Run before migration: mysqldump -u <user> -p <db> user sc_member_profiles > backup-pre-migration.sql',
      rollbackCommand:
        'npx tsx scripts/rollback-account-types.ts --dry-run --verbose',
      proposedMappings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: 'Database check failed', detail: message });
  }
}
