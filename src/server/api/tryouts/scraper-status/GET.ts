/**
 * GET /api/tryouts/scraper-status
 *
 * Returns the current scraper job status, merging in-memory state with
 * durable DB state so the response is accurate even after a server restart.
 */

import type { Request, Response } from 'express';
import { getJobStatus } from '../../../tryout-scraper-job.js';
import { db } from '../../../db/client.js';
import { scScraperJobState } from '../../../db/schema.js';

export default async function handler(_req: Request, res: Response) {
  const mem = getJobStatus();

  try {
    const rows = await db.select().from(scScraperJobState);
    const daily = rows.find((r) => r.jobType === 'daily_refresh');
    const discovery = rows.find((r) => r.jobType === 'weekly_discovery');

    return res.json({
      ...mem,
      // Prefer DB values (survive restarts) over in-memory (only valid since last boot)
      dailyLastRunAt: mem.dailyLastRunAt ?? (daily?.lastRunAt?.toISOString() ?? null),
      dailyNextRunAt: mem.dailyNextRunAt ?? (daily?.nextRunAt?.toISOString() ?? null),
      dailyLastRefreshed: mem.dailyLastRefreshed || (daily?.lastRunFound ?? 0),
      discoveryLastRunAt: mem.discoveryLastRunAt ?? (discovery?.lastRunAt?.toISOString() ?? null),
      discoveryNextRunAt: mem.discoveryNextRunAt ?? (discovery?.nextRunAt?.toISOString() ?? null),
      discoveryLastFound: mem.discoveryLastFound || (discovery?.lastRunFound ?? 0),
    });
  } catch {
    return res.json(mem);
  }
}
