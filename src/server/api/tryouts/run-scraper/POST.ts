/**
 * POST /api/tryouts/run-scraper
 *
 * Manually triggers a scraper job immediately.
 * Protected by SOCCER_TRYOUT_WRITE_TOKEN.
 *
 * Query params:
 *   ?job=daily (default) | discovery
 *   ?region=colorado     (optional, discovery only — limits to one region)
 *
 * Returns: { triggered: boolean, message: string, status: JobStatus }
 */

import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { runDailyRefresh, runWeeklyDiscovery, getJobStatus } from '../../../tryout-scraper-job.js';

export default async function handler(req: Request, res: Response) {
  const token = getSecret('SOCCER_TRYOUT_WRITE_TOKEN');
  const authHeader = req.headers['authorization'] ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || provided !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const current = getJobStatus();
  if (current.isRunning) {
    return res.json({
      triggered: false,
      message: 'Job is already running — check back shortly',
      status: current,
    });
  }

  const job = (req.query.job as string | undefined) ?? 'daily';
  const region = req.query.region as string | undefined;

  if (job === 'discovery') {
    void runWeeklyDiscovery(region);
    return res.json({
      triggered: true,
      message: region
        ? `Weekly discovery started for region: ${region}`
        : 'Weekly discovery started for all regions',
      status: getJobStatus(),
    });
  }

  void runDailyRefresh();
  return res.json({
    triggered: true,
    message: 'Daily refresh job started',
    status: getJobStatus(),
  });
}
