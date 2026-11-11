/**
 * GET /api/highlights
 *
 * Returns the cached YouTube channel snapshot.
 * NEVER triggers a YouTube API call — reads the database only.
 * Visitors cannot exhaust quota through this endpoint.
 */
import type { Request, Response } from 'express';
import { getHighlightsFeedService } from '../../highlights-cache.js';

export default async function handler(_req: Request, res: Response): Promise<void> {
  try {
    const service = getHighlightsFeedService();
    const snapshot = await service.snapshot();
    res
      .set('Cache-Control', 'public, max-age=120')
      .json(snapshot);
  } catch (err) {
    console.error('highlights.api.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(503).json({ error: 'Video feed is temporarily unavailable.' });
  }
}
