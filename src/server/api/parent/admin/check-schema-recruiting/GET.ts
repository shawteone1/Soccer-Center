/**
 * GET /api/parent/admin/check-schema-recruiting
 *
 * Read-only schema probe for the six recruiting tables.
 * Checks table existence and a representative set of columns per table.
 * Uses the same production DB connection as all recruiting endpoints.
 * Does NOT seed data, modify rows, or change access permissions.
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

// ── Expected schema ───────────────────────────────────────────────────────────

interface ExpectedTable {
  table: string;
  label: string;
  columns: string[];
}

const EXPECTED: ExpectedTable[] = [
  {
    table: 'sc_college_programs',
    label: 'College programs',
    columns: ['id', 'import_key', 'institution', 'gender', 'division', 'regions', 'active'],
  },
  {
    table: 'sc_college_coaches',
    label: 'College coaches',
    columns: ['id', 'import_key', 'program_id', 'name', 'role', 'email', 'active'],
  },
  {
    table: 'sc_id_camps',
    label: 'ID camps',
    columns: ['id', 'import_key', 'institution', 'camp_name', 'region', 'listing_status', 'active'],
  },
  {
    table: 'sc_showcases',
    label: 'Showcases',
    columns: ['id', 'import_key', 'name', 'region', 'listing_status', 'active'],
  },
  {
    table: 'sc_recruiting_saved',
    label: 'Saved opportunities',
    columns: ['id', 'user_id', 'player_id', 'item_type', 'item_id', 'status'],
  },
  {
    table: 'sc_outreach_drafts',
    label: 'Outreach drafts',
    // v2 columns (subject, recipient_name, recipient_email, sent_at) are added
    // by run-schema-recruiting-v2. Include them here so the admin panel reports
    // their actual presence rather than silently passing without them.
    columns: ['id', 'user_id', 'player_id', 'coach_id', 'draft_status',
              'subject', 'recipient_name', 'recipient_email', 'sent_at'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tableExists(table: string): Promise<boolean> {
  try {
    const rows = await db.execute(sql.raw(`SHOW TABLES LIKE '${table}'`));
    const arr = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? []) as unknown[];
    return arr.length > 0;
  } catch {
    return false;
  }
}

async function getExistingColumns(table: string): Promise<Set<string>> {
  try {
    const rows = await db.execute(sql.raw(`SHOW COLUMNS FROM \`${table}\``));
    const arr = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
    return new Set(arr.map(r => String(r['Field'] ?? r['field'] ?? '')));
  } catch {
    return new Set();
  }
}

async function getRowCount(table: string): Promise<number | null> {
  try {
    const rows = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM \`${table}\``));
    const arr = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
    const val = arr[0]?.['cnt'] ?? arr[0]?.['CNT'];
    return val !== undefined ? Number(val) : null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export interface RecruitingSchemaCheckResult {
  checkedAt: string;
  allTablesPresent: boolean;
  allColumnsPresent: boolean;
  readyToSeed: boolean;
  tables: Array<{
    table: string;
    label: string;
    exists: boolean;
    rowCount: number | null;
    columns: Array<{ name: string; exists: boolean }>;
    allColumnsPresent: boolean;
  }>;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const tableResults: RecruitingSchemaCheckResult['tables'] = [];

  for (const expected of EXPECTED) {
    const exists = await tableExists(expected.table);
    const existingCols = exists ? await getExistingColumns(expected.table) : new Set<string>();
    const rowCount = exists ? await getRowCount(expected.table) : null;

    const columns = expected.columns.map(col => ({
      name: col,
      exists: existingCols.has(col),
    }));

    tableResults.push({
      table: expected.table,
      label: expected.label,
      exists,
      rowCount,
      columns,
      allColumnsPresent: exists && columns.every(c => c.exists),
    });
  }

  const allTablesPresent = tableResults.every(t => t.exists);
  const allColumnsPresent = tableResults.every(t => t.allColumnsPresent);

  // readyToSeed: tables exist but the two data tables (programs + coaches) are empty
  const programsRow = tableResults.find(t => t.table === 'sc_college_programs');
  const coachesRow  = tableResults.find(t => t.table === 'sc_college_coaches');
  const readyToSeed =
    allTablesPresent &&
    allColumnsPresent &&
    (programsRow?.rowCount ?? -1) === 0 &&
    (coachesRow?.rowCount ?? -1) === 0;

  const result: RecruitingSchemaCheckResult = {
    checkedAt: new Date().toISOString(),
    allTablesPresent,
    allColumnsPresent,
    readyToSeed,
    tables: tableResults,
  };

  res.json(result);
}
