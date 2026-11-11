/**
 * GET /api/highlights/leagues
 *
 * Returns the cached YouTube snapshot for the four official league channels only.
 * Public — no auth required. Reads the database only; never calls YouTube API.
 *
 * Slugs returned: premier-league, laliga, bundesliga, ligue-1
 */
import type { Request, Response } from 'express';
import { getHighlightsFeedService } from '../../../highlights-cache.js';

const LEAGUE_SLUGS = new Set(['premier-league', 'laliga', 'bundesliga', 'ligue-1']);

export default async function handler(_req: Request, res: Response): Promise<void> {
  try {
    const service = getHighlightsFeedService();
    const snapshot = await service.snapshot();

    // Filter to league channels only
    const leagueChannels = snapshot.channels.filter((ch) => LEAGUE_SLUGS.has(ch.slug));

    res
      .set('Cache-Control', 'public, max-age=120')
      .json({ ...snapshot, channels: leagueChannels });
  } catch (err) {
    console.error('highlights.leagues.api.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(503).json({ error: 'League feed is temporarily unavailable.' });
  }
}
