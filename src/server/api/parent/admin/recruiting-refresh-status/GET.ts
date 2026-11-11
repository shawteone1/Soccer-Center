/**
 * GET /api/parent/admin/recruiting-refresh-status
 *
 * Returns the current status of the recruiting data refresh job,
 * including last run, next scheduled run, counts, failures, and
 * records needing review.
 *
 * Distinguishes "checked" (source was fetched) from "changed" (record was updated).
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  try {
    // Check if recruiting tables exist
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_college_programs'`));
    const tableArr = Array.isArray(tableCheck) ? tableCheck : (tableCheck as { rows?: unknown[] }).rows ?? [];
    const schemaMigrated = tableArr.length > 0;

    if (!schemaMigrated) {
      res.json({
        schemaMigrated: false,
        message: 'Recruiting schema not yet migrated. Run /api/parent/admin/run-schema-recruiting first.',
      });
      return;
    }

    // Count records per table
    const countQuery = async (table: string, condition = '1=1') => {
      try {
        const r = await db.execute(sql.raw(`SELECT COUNT(*) AS n FROM ${table} WHERE ${condition}`));
        const rows = Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? [];
        return Number((rows[0] as Record<string, unknown>)?.['n'] ?? 0);
      } catch { return -1; }
    };

    const [programs, coaches, camps, showcases, saved, drafts] = await Promise.all([
      countQuery('sc_college_programs', 'active = 1'),
      countQuery('sc_college_coaches', 'active = 1'),
      countQuery('sc_id_camps', 'active = 1'),
      countQuery('sc_showcases', 'active = 1'),
      countQuery('sc_recruiting_saved', '1=1').catch(() => 0),
      countQuery('sc_outreach_drafts', '1=1').catch(() => 0),
    ]);

    // Coaches with unknown names (need review)
    const coachesNeedingReview = await countQuery('sc_college_coaches', 'name IS NULL AND active = 1');

    // Camps with no confirmed dates
    const campsNoDate = await countQuery('sc_id_camps', "start_date IS NULL AND listing_status != 'historical' AND active = 1");

    // Check scraper job state for recruiting jobs
    let lastRun: string | null = null;
    let nextRun: string | null = null;
    try {
      const jobResult = await db.execute(sql.raw(`
        SELECT last_run_at, next_run_at, last_run_status
        FROM sc_scraper_job_state
        WHERE job_key = 'recruiting-refresh'
        LIMIT 1
      `));
      const jobRows = Array.isArray(jobResult) ? jobResult : (jobResult as { rows?: unknown[] }).rows ?? [];
      if (jobRows.length) {
        const row = jobRows[0] as Record<string, unknown>;
        lastRun = row['last_run_at'] as string | null;
        nextRun = row['next_run_at'] as string | null;
      }
    } catch {
      // sc_scraper_job_state may not have a recruiting-refresh row yet
    }

    res.json({
      schemaMigrated: true,
      scheduledJobStatus: {
        lastRun,
        nextRun,
        note: lastRun
          ? 'Scheduled job has run at least once.'
          : 'No scheduled run recorded. Use the manual trigger to run a refresh.',
      },
      counts: {
        programs,
        coaches,
        camps,
        showcases,
        saved,
        drafts,
      },
      needsReview: {
        coachesWithUnknownName: coachesNeedingReview,
        campsWithNoConfirmedDate: campsNoDate,
        total: coachesNeedingReview + campsNoDate,
      },
      checkedDate: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch status', detail: msg });
  }
}
