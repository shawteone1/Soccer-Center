/**
 * POST /api/parent/admin/run-schema-recruiting-v2
 *
 * Idempotent migration: adds email-draft columns to sc_outreach_drafts.
 * MySQL 5.7 compatible — uses SHOW COLUMNS + ALTER TABLE ADD COLUMN because
 * ADD COLUMN IF NOT EXISTS requires MySQL 8.0.3+.
 *
 * New columns:
 *   subject          VARCHAR(500)  — email subject line
 *   recipient_name   VARCHAR(255)  — name captured at draft time
 *   recipient_email  VARCHAR(255)  — email captured at draft time
 *   sent_at          TIMESTAMP     — set when user manually marks as sent
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

interface StepResult {
  column: string;
  status: 'added' | 'already_exists' | 'error';
  detail?: string;
}

const TABLE = 'sc_outreach_drafts';

const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'subject',         ddl: "VARCHAR(500)  NULL AFTER introduction" },
  { name: 'recipient_name',  ddl: "VARCHAR(255)  NULL AFTER subject" },
  { name: 'recipient_email', ddl: "VARCHAR(255)  NULL AFTER recipient_name" },
  { name: 'sent_at',         ddl: "TIMESTAMP     NULL AFTER recipient_email" },
];

async function columnExists(column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`${TABLE}\` LIKE '${column}'`)
    );
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(_req: Request, res: Response): Promise<void> {
  // Verify table exists first
  try {
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE '${TABLE}'`));
    const tableRows = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableRows.length) {
      res.status(503).json({
        ok: false,
        error: `Table ${TABLE} does not exist. Run run-schema-recruiting first.`,
      });
      return;
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Table check failed', detail: String(err) });
    return;
  }

  const results: StepResult[] = [];

  for (const col of COLUMNS) {
    try {
      const exists = await columnExists(col.name);
      if (exists) {
        results.push({ column: col.name, status: 'already_exists' });
      } else {
        await db.execute(sql.raw(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${col.name}\` ${col.ddl}`));
        results.push({ column: col.name, status: 'added' });
      }
    } catch (err) {
      results.push({ column: col.name, status: 'error', detail: String(err) });
    }
  }

  const added   = results.filter(r => r.status === 'added').length;
  const skipped = results.filter(r => r.status === 'already_exists').length;
  const errors  = results.filter(r => r.status === 'error').length;

  res.status(errors > 0 ? 207 : 200).json({
    ok: errors === 0,
    table: TABLE,
    summary: { added, skipped, errors },
    results,
  });
}
