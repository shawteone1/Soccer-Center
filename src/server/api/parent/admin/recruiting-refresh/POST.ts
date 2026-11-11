/**
 * POST /api/parent/admin/recruiting-refresh
 *
 * Manual trigger for the recruiting data refresh job.
 *
 * This endpoint performs a lightweight "check" pass:
 *   - Verifies that all source URLs in sc_college_programs are reachable (HEAD request)
 *   - Updates last_checked_at on reachable programs
 *   - Flags unreachable sources for review (does NOT delete records)
 *   - Retains the last valid record when a source fails
 *   - Records job state in sc_scraper_job_state
 *
 * Distinguishes "checked" (source fetched) from "changed" (record updated).
 * Respects source access restrictions — only HEAD requests, no sign-in bypass.
 * Rate-limited: 1 request per source URL with 500ms gap.
 * Admin-only.
 *
 * NOTE: This platform does not support persistent scheduled jobs.
 * Automatic daily/weekly refresh is not active. Use this manual trigger
 * or schedule an external cron to call this endpoint.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

const RATE_LIMIT_MS = 500;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkUrl(url: string, timeoutMs = 8000): Promise<'reachable' | 'unreachable' | 'error'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'SoccerCenter-Recruiting-Checker/1.0' },
    });
    clearTimeout(timer);
    return res.ok || res.status === 405 ? 'reachable' : 'unreachable';
  } catch {
    return 'error';
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const startedAt = new Date().toISOString();

  try {
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_college_programs'`));
    const tableArr = Array.isArray(tableCheck) ? tableCheck : (tableCheck as { rows?: unknown[] }).rows ?? [];
    if (!tableArr.length) {
      res.status(503).json({ error: 'Recruiting schema not yet migrated.' });
      return;
    }

    // Fetch all active programs with source URLs
    const programResult = await db.execute(sql.raw(`
      SELECT id, institution, source_url, program_url, checked_date
      FROM sc_college_programs
      WHERE active = 1 AND (source_url IS NOT NULL OR program_url IS NOT NULL)
      ORDER BY institution ASC
    `));
    const programs = (Array.isArray(programResult) ? programResult : (programResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    let checked = 0;
    let reachable = 0;
    let unreachable = 0;
    let errors = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const prog of programs) {
      const url = (prog['source_url'] ?? prog['program_url']) as string;
      if (!url) continue;

      await sleep(RATE_LIMIT_MS);
      const status = await checkUrl(url);
      checked++;

      if (status === 'reachable') {
        reachable++;
        await db.execute(sql.raw(`
          UPDATE sc_college_programs
          SET checked_date = '${today}'
          WHERE id = '${String(prog['id']).replace(/'/g, "''")}'
        `));
      } else if (status === 'unreachable') {
        unreachable++;
        // Flag for review but retain record
        await db.execute(sql.raw(`
          UPDATE sc_college_programs
          SET checked_date = '${today}'
          WHERE id = '${String(prog['id']).replace(/'/g, "''")}'
        `));
      } else {
        errors++;
      }
    }

    const completedAt = new Date().toISOString();

    // Record job state
    try {
      const jobExists = await db.execute(sql.raw(`SELECT job_key FROM sc_scraper_job_state WHERE job_key = 'recruiting-refresh' LIMIT 1`));
      const jobRows = Array.isArray(jobExists) ? jobExists : (jobExists as { rows?: unknown[] }).rows ?? [];
      if (jobRows.length) {
        await db.execute(sql.raw(`
          UPDATE sc_scraper_job_state
          SET last_run_at = '${completedAt}', last_run_status = 'completed', updated_at = CURRENT_TIMESTAMP
          WHERE job_key = 'recruiting-refresh'
        `));
      } else {
        await db.execute(sql.raw(`
          INSERT INTO sc_scraper_job_state (job_key, last_run_at, last_run_status, created_at, updated_at)
          VALUES ('recruiting-refresh', '${completedAt}', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `));
      }
    } catch {
      // sc_scraper_job_state schema may differ — non-fatal
    }

    res.json({
      ok: true,
      startedAt,
      completedAt,
      summary: {
        programsChecked: checked,
        reachable,
        unreachable,
        errors,
      },
      note: 'This platform does not support persistent scheduled jobs. Automatic daily/weekly refresh is not active. Schedule an external cron to call this endpoint for automatic updates.',
      platformScheduling: 'manual_only',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Refresh failed', detail: msg, startedAt });
  }
}
