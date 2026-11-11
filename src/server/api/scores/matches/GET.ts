/**
 * GET /api/scores/matches
 *
 * Proxies football-data.org /v4/competitions/{code}/matches for a given date.
 * Auth-required. Cached per competition per calendar day (server-side Map).
 *
 * Query params:
 *   league  — channel slug (e.g. "premier-league"). Required.
 *   date    — ISO date string YYYY-MM-DD. Defaults to today (Denver time).
 *
 * Response: { matches, competition, date, cachedAt, live }
 */

import type { Request, Response } from 'express';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import { getSecret } from '#airo/secrets';

// ── League slug → football-data.org competition code ─────────────────────────
// Only free-tier competitions are listed. MLS and NWSL are excluded —
// they return HTTP 403 on the free plan (confirmed 2026-10-10).
const SLUG_TO_CODE: Record<string, string> = {
  'premier-league':   'PL',
  'laliga':           'PD',
  'bundesliga':       'BL1',
  'ligue-1':          'FL1',
  'serie-a':          'SA',
  'mls':              'MLS',
  'nwsl':             'NWSL',
  'champions-league': 'CL',
  'europa-league':    'EL',
};

// ── Server-side cache: key = "CODE:YYYY-MM-DD", value = { data, cachedAt } ───
interface CacheEntry {
  data: FootballDataResponse;
  cachedAt: string; // ISO
}
const cache = new Map<string, CacheEntry>();

// ── Rate-limit queue: football-data.org free tier = 10 req/min ───────────────
// We enforce a minimum 7-second gap between outgoing requests to stay safely
// under the 10/minute limit even when multiple leagues are fetched in parallel.
// Requests for the same cache key that arrive while a fetch is in-flight share
// the same Promise so only one outgoing request is made.
const MIN_GAP_MS = 7_000;
let lastRequestAt = 0;
const inFlight = new Map<string, Promise<FootballDataResponse>>();

async function fetchFromProvider(code: string, dateParam: string, apiKey: string): Promise<FootballDataResponse> {
  const cacheKey = `${code}:${dateParam}`;

  // Coalesce concurrent requests for the same key
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<FootballDataResponse> => {
    // Enforce minimum gap between outgoing requests
    const now = Date.now();
    const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();

    const url = `https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${dateParam}&dateTo=${dateParam}`;
    const fdRes = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });

    if (fdRes.status === 429) {
      const err = new Error('rate_limited') as Error & { status: number };
      err.status = 429;
      throw err;
    }
    if (fdRes.status === 403) {
      const err = new Error('scores_forbidden') as Error & { status: number };
      err.status = 403;
      throw err;
    }
    if (!fdRes.ok) {
      const body = await fdRes.text().catch(() => '');
      console.error(`[scores] football-data.org ${fdRes.status} for ${code}:`, body);
      const err = new Error('upstream_error') as Error & { status: number };
      err.status = 502;
      throw err;
    }

    const raw = await fdRes.json() as FootballDataResponse;
    return {
      ...raw,
      matches: (raw.matches ?? []).map(m => ({
        ...m,
        goals: Array.isArray(m.goals) ? m.goals : [],
      })),
    };
  })();

  inFlight.set(cacheKey, promise);
  promise.finally(() => inFlight.delete(cacheKey));
  return promise;
}

// ── football-data.org response shape (subset we use) ─────────────────────────
interface FdGoal {
  minute: number | null;
  type: 'REGULAR' | 'OWN_GOAL' | 'PENALTY' | null;
  scorer: { name: string } | null;
  team: { id: number } | null;
}
interface FdTeam { id: number; name: string; shortName: string; tla: string; crest: string }
interface FdScore {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: FdScore;
  goals: FdGoal[];
}
interface FootballDataResponse {
  competition: { id: number; name: string; code: string; emblem: string };
  matches: FdMatch[];
}

// ── Denver date helper ────────────────────────────────────────────────────────
function denverToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

// ── Cache TTL: live matches refresh every 60 s; finished/no-live: 5 min ──────
function isStale(entry: CacheEntry): boolean {
  const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
  const hasLive = entry.data.matches.some(
    m => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'HALF_TIME',
  );
  const ttlMs = hasLive ? 60_000 : 5 * 60_000;
  return ageMs > ttlMs;
}

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const leagueSlug = typeof req.query.league === 'string' ? req.query.league : '';
  const dateParam  = typeof req.query.date  === 'string' ? req.query.date  : denverToday();

  const code = SLUG_TO_CODE[leagueSlug];
  if (!code) {
    return res.status(400).json({ error: 'Unknown league slug', slug: leagueSlug });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  const cacheKey = `${code}:${dateParam}`;
  const cached = cache.get(cacheKey);
  if (cached && !isStale(cached)) {
    return res.json({
      matches: cached.data.matches,
      competition: cached.data.competition,
      date: dateParam,
      cachedAt: cached.cachedAt,
      live: false,
    });
  }

  const apiKey = getSecret('FOOTBALL_DATA_API_KEY');
  if (!apiKey) {
    return res.status(503).json({ error: 'scores_unavailable', message: 'Scores API key not configured.' });
  }

  try {
    const data = await fetchFromProvider(code, dateParam, String(apiKey));
    const entry: CacheEntry = { data, cachedAt: new Date().toISOString() };
    cache.set(cacheKey, entry);

    const hasLive = data.matches.some(
      m => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'HALF_TIME',
    );

    return res.json({
      matches: data.matches,
      competition: data.competition,
      date: dateParam,
      cachedAt: entry.cachedAt,
      live: hasLive,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.message === 'rate_limited') {
      if (cached) {
        return res.json({
          matches: cached.data.matches,
          competition: cached.data.competition,
          date: dateParam,
          cachedAt: cached.cachedAt,
          live: false,
          stale: true,
        });
      }
      return res.status(429).json({ error: 'rate_limited', message: 'Scores temporarily unavailable. Try again shortly.' });
    }
    if (e.message === 'scores_forbidden') {
      return res.status(403).json({ error: 'scores_forbidden', message: 'This competition is not available on the current plan.' });
    }
    if (e.message === 'upstream_error') {
      if (cached) {
        return res.json({
          matches: cached.data.matches,
          competition: cached.data.competition,
          date: dateParam,
          cachedAt: cached.cachedAt,
          live: false,
          stale: true,
        });
      }
      return res.status(502).json({ error: 'upstream_error', message: 'Scores provider returned an error.' });
    }
    // Network error
    console.error('[scores] fetch error:', err);
    if (cached) {
      return res.json({
        matches: cached.data.matches,
        competition: cached.data.competition,
        date: dateParam,
        cachedAt: cached.cachedAt,
        live: false,
        stale: true,
      });
    }
    return res.status(502).json({ error: 'network_error', message: 'Could not reach scores provider.' });
  }
}
