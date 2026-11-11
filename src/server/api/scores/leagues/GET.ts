/**
 * GET /api/scores/leagues
 *
 * Public endpoint — returns the list of supported leagues with their slugs,
 * names, and football-data.org competition codes.
 * No auth required (used by ticker to build the league list before auth check).
 */

import type { Request, Response } from 'express';

export const SUPPORTED_LEAGUES = [
  { slug: 'premier-league',   code: 'PL',   name: 'Premier League',          country: 'ENG' },
  { slug: 'laliga',           code: 'PD',   name: 'LaLiga',                  country: 'ESP' },
  { slug: 'bundesliga',       code: 'BL1',  name: 'Bundesliga',              country: 'GER' },
  { slug: 'ligue-1',          code: 'FL1',  name: 'Ligue 1',                 country: 'FRA' },
  { slug: 'serie-a',          code: 'SA',   name: 'Serie A',                 country: 'ITA' },
  { slug: 'champions-league', code: 'CL',   name: 'UEFA Champions League',   country: 'UEFA' },
] as const;
// NOTE: MLS (MLS) and NWSL (NWSL) are excluded — they return HTTP 403 on the
// football-data.org free tier. They appear in channels.json for video coverage
// but cannot be served via the scores proxy without a paid plan upgrade.

export default function handler(_req: Request, res: Response) {
  res.json({ leagues: SUPPORTED_LEAGUES });
}
