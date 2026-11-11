/**
 * GET /api/highlights/all
 *
 * Returns the cached YouTube snapshot for ALL enabled channels:
 *   - 4 official league channels (premier-league, laliga, bundesliga, ligue-1)
 *   - 20 Premier League club channels
 *
 * Public — no auth required. Reads the database only; never calls YouTube API.
 *
 * Query params:
 *   kind — 'league' | 'club' | '' (all, default)
 */
import type { Request, Response } from 'express';
import { getHighlightsFeedService } from '../../../highlights-cache.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const service = getHighlightsFeedService();
    const snapshot = await service.snapshot();

    const kind = (req.query.kind as string | undefined)?.toLowerCase();
    const channels = kind
      ? snapshot.channels.filter(ch => ch.kind === kind)
      : snapshot.channels;

    res
      .set('Cache-Control', 'public, max-age=120')
      .json({ ...snapshot, channels });
  } catch (err) {
    console.error('highlights.all.api.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(503).json({ error: 'Video feed is temporarily unavailable.' });
  }
}
