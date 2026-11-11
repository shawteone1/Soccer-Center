import { canonicalRegionSlug } from '@/lib/region-slugs';
/**
 * GET /api/tryouts/:region
 *
 * Scrapes tryout information from every Club listing in directory_regions.json
 * for the requested region. Results are cached in-memory for 1 hour.
 *
 * Response shape:
 * {
 *   region: string,
 *   tryouts: TryoutListing[],
 *   cachedAt: string (ISO),
 *   fromCache: boolean,
 *   sourcesChecked: number,
 *   sourcesWithData: number,
 *   partial: boolean,        — true when the 8s wall-clock deadline fired before all clubs were checked
 *   diagnostics: {           — aggregate failure counts for the completed portion of the scan
 *     timedOut: number,      — per-URL AbortController fired (3s)
 *     httpError: number,     — non-2xx response
 *     noContent: number,     — 200 OK but no tryout keywords found
 *     completed: number,     — clubs fully checked (success or definitive failure)
 *   }
 * }
 */

import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TryoutListing {
  clubName: string;
  clubUrl: string;
  region: string;
  city: string;
  level: string;
  ageGroups: string[];
  dates: string[];
  times: string[];
  registrationUrl: string | null;
  location: string;
  notes: string;
  sourceUrl: string;
  scrapedAt: string;
}

interface DirectoryListing {
  id: string;
  name: string;
  type: string;
  level: string;
  city: string;
  url: string;
}

interface DirectoryRegion {
  id: string;
  slug: string;
  label: string;
  listings: DirectoryListing[];
}

interface CacheEntry {
  data: TryoutListing[];
  fetchedAt: number;
  diagnostics: ScanDiagnostics;
}

/** Aggregate failure counts for the completed portion of a scan. */
export interface ScanDiagnostics {
  timedOut: number;
  httpError: number;
  noContent: number;
  completed: number;
}

/** Internal result from scrapeClub — carries the listing (if found) plus failure reason. */
type ScrapeResult =
  | { kind: 'found'; listing: TryoutListing }
  | { kind: 'timedOut' }
  | { kind: 'httpError' }
  | { kind: 'noContent' };

function emptyDiagnostics(): ScanDiagnostics {
  return { timedOut: 0, httpError: 0, noContent: 0, completed: 0 };
}

function mergeDiagnostics(results: ScrapeResult[]): ScanDiagnostics {
  const d = emptyDiagnostics();
  for (const r of results) {
    d.completed++;
    if (r.kind === 'timedOut') d.timedOut++;
    else if (r.kind === 'httpError') d.httpError++;
    else if (r.kind === 'noContent') d.noContent++;
  }
  return d;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Load directory data ──────────────────────────────────────────────────────

function loadRegions(): DirectoryRegion[] {
  try {
    // Works in both dev (src/) and prod (dist/server.bundle.mjs next to client/)
    const candidates = [
      join(process.cwd(), 'src/content/data/directory_regions.json'),
      join(process.cwd(), 'dist/data/directory_regions.json'),
      join(process.cwd(), 'public/data/directory_regions.json'),
      join(dirname(fileURLToPath(import.meta.url)), 'data/directory_regions.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../src/content/data/directory_regions.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../content/data/directory_regions.json'),
    ];
    for (const p of candidates) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8')) as DirectoryRegion[];
      } catch {
        // try next
      }
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

const TRYOUT_KEYWORDS = [
  'tryout', 'try-out', 'try out', 'trial', 'evaluation', 'open training',
  'player assessment', 'player evaluation', 'id camp', 'identification camp',
  'open tryout', 'team tryout', 'club tryout', 'academy tryout',
];

const DATE_PATTERNS: RegExp[] = [
  // "January 15, 2025" / "Jan 15, 2025"
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}\b/gi,
  // "15 January 2025"
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b/gi,
  // MM/DD/YYYY or MM-DD-YYYY
  /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-]20\d{2}\b/g,
  // "Saturday, January 15" / "Sat, Jan 15"
  /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?\b/gi,
  // "Spring 2025" / "Fall 2025"
  /\b(?:Spring|Summer|Fall|Winter|Autumn)\s+20\d{2}\b/gi,
];

const TIME_PATTERNS: RegExp[] = [
  // "9:00 AM" / "9:00am" / "9am"
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\b/g,
  // "9:00 - 11:00" (time range without am/pm)
  /\b\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b/g,
];

const AGE_PATTERNS: RegExp[] = [
  /\bU-?(\d{1,2})\b/gi,
  /\bUnder[-\s]?(\d{1,2})\b/gi,
  /\b(?:Boys?|Girls?|Men|Women|Coed)\s+U-?\d{1,2}\b/gi,
  /\bBorn\s+(?:in\s+)?(?:19|20)\d{2}\b/gi,
  /\b(?:19|20)\d{2}\s+(?:birth\s+year|boys?|girls?|players?)\b/gi,
  /\b(?:Class\s+of\s+)?(?:19|20)\d{2}\b/gi,
  /\b(?:Recreational|Competitive|Elite|Premier|Academy|Select)\b/gi,
];

const REGISTRATION_LINK_PATTERNS = [
  /href="([^"]*(?:register|registration|signup|sign-up|tryout|enroll|apply)[^"]*)"/gi,
  /href='([^']*(?:register|registration|signup|sign-up|tryout|enroll|apply)[^']*)'/gi,
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasTryoutContent(text: string): boolean {
  const lower = text.toLowerCase();
  return TRYOUT_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractDates(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of DATE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = text.match(pattern) ?? [];
    for (const m of matches) {
      const clean = m.trim().replace(/\s+/g, ' ');
      if (clean.length > 3) found.add(clean);
    }
  }
  return Array.from(found).slice(0, 8);
}

function extractTimes(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of TIME_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern) ?? [];
    for (const m of matches) found.add(m.trim());
  }
  return Array.from(found).slice(0, 6);
}

function extractAgeGroups(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of AGE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern) ?? [];
    for (const m of matches) {
      const clean = m.trim();
      // Filter out noise — birth years that look like page years, etc.
      if (clean.length >= 2 && clean.length <= 40) found.add(clean);
    }
  }
  return Array.from(found).slice(0, 10);
}

function extractRegistrationUrl(html: string, baseUrl: string): string | null {
  for (const pattern of REGISTRATION_LINK_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(html);
    if (match) {
      const href = match[1];
      if (href.startsWith('http')) return href;
      if (href.startsWith('/')) {
        try {
          const base = new URL(baseUrl);
          return `${base.origin}${href}`;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractLocation(text: string): string {
  const patterns = [
    /(?:location|venue|field|facility|park|complex|stadium)[:\s]+([A-Z][^\n.]{5,70})/i,
    /(?:held at|taking place at|located at|meet at)[:\s]+([A-Z][^\n.]{5,70})/i,
    /(?:at\s+)([A-Z][a-zA-Z\s]{5,50}(?:Park|Field|Complex|Stadium|Center|Centre|Facility|Academy))/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 100);
  }
  return '';
}

function extractNotes(text: string): string {
  // Find the most tryout-relevant sentence (prefer ones with dates or age groups)
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);

  const scored = sentences
    .filter((s) => {
      const lower = s.toLowerCase();
      return TRYOUT_KEYWORDS.some((kw) => lower.includes(kw));
    })
    .map((s) => {
      let score = 0;
      if (/\d{4}/.test(s)) score += 2; // has a year
      if (/(?:am|pm)/i.test(s)) score += 1; // has a time
      if (/U-?\d{1,2}/i.test(s)) score += 2; // has age group
      if (/register|sign.?up|apply/i.test(s)) score += 1;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.s.slice(0, 250) ?? '';
}

// ─── Candidate URL builder ────────────────────────────────────────────────────

function tryoutUrlCandidates(baseUrl: string): string[] {
  try {
    const u = new URL(baseUrl);
    const origin = u.origin;
    const base = baseUrl.replace(/\/$/, '');
    return [
      `${base}/tryouts`,
      `${base}/tryout`,
      `${base}/tryouts/`,
      `${origin}/tryouts`,
      `${origin}/tryout`,
      `${origin}/academy/tryouts`,
      `${origin}/programs/tryouts`,
      `${origin}/join/tryouts`,
      `${origin}/players/tryouts`,
      baseUrl, // fall back to the club's main page
    ];
  } catch {
    return [baseUrl];
  }
}

// ─── Core scraper ─────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 3000; // per-URL timeout — keep short so slow sites don't stall the batch

/** Typed result from a single URL fetch attempt. */
type FetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: 'timedOut' | 'httpError' | 'networkError' };

async function fetchPage(url: string): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let fetchRes: Awaited<ReturnType<typeof fetch>>;
    try {
      fetchRes = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; SoccerCenter/1.0; +https://soccercenter.org)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return { ok: false, reason: isAbort ? 'timedOut' : 'networkError' };
    }
    clearTimeout(timer);
    if (!fetchRes.ok) return { ok: false, reason: 'httpError' };
    const html = await fetchRes.text();
    return { ok: true, html, finalUrl: fetchRes.url };
  } catch {
    return { ok: false, reason: 'networkError' };
  }
}

async function scrapeClub(
  listing: DirectoryListing,
  region: string,
): Promise<ScrapeResult> {
  const candidates = tryoutUrlCandidates(listing.url);

  // Track the worst failure seen across all candidate URLs for this club.
  // Priority: timedOut > httpError > noContent (timedOut is most actionable).
  let worstFailure: 'timedOut' | 'httpError' | 'noContent' = 'noContent';

  for (const url of candidates) {
    const result = await fetchPage(url);
    if (!result.ok) {
      // networkError is treated the same as timedOut for diagnostic purposes
      const reason = result.reason === 'timedOut' || result.reason === 'networkError'
        ? 'timedOut'
        : 'httpError';
      if (reason === 'timedOut') worstFailure = 'timedOut';
      else if (worstFailure !== 'timedOut') worstFailure = 'httpError';
      continue;
    }

    const { html, finalUrl } = result;
    const text = stripHtml(html);

    if (!hasTryoutContent(text)) continue;

    const dates = extractDates(text);
    const times = extractTimes(text);
    const ageGroups = extractAgeGroups(text);
    const location = extractLocation(text);
    const notes = extractNotes(text);
    const registrationUrl = extractRegistrationUrl(html, finalUrl);

    // Require at least one meaningful signal beyond just the keyword match
    if (dates.length === 0 && ageGroups.length === 0 && !notes && !registrationUrl) {
      continue;
    }

    return {
      kind: 'found',
      listing: {
        clubName: listing.name,
        clubUrl: listing.url,
        region,
        city: listing.city,
        level: listing.level,
        ageGroups,
        dates,
        times,
        registrationUrl,
        location,
        notes,
        sourceUrl: finalUrl,
        scrapedAt: new Date().toISOString(),
      },
    };
  }

  return { kind: worstFailure };
}

// ─── Concurrency helpers ──────────────────────────────────────────────────────

/** Run `tasks` in parallel batches of `size`. */
async function batchedAll<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size).map((fn) => fn());
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // Support both /api/tryouts/:region (route param) and /api/tryouts?region=... (query)
  const regionSlug = (
    (req.params as Record<string, string>).region ??
    (req.query.region as string | undefined)
  )
    ?.toLowerCase()
    .trim();

  if (!regionSlug) {
    return res.status(400).json({ error: 'Region slug required — use /api/tryouts/:region' });
  }

  // Load regions from content file
  const regions = loadRegions();
  const region = regions.find((r) => canonicalRegionSlug(r.slug) === canonicalRegionSlug(regionSlug));

  if (!region) {
    return res.status(404).json({
      error: `Region not found: ${regionSlug}`,
      available: regions.map((r) => r.slug),
    });
  }

  // Serve from cache if still fresh
  const cached = cache.get(regionSlug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json({
      region: regionSlug,
      regionLabel: region.label,
      tryouts: cached.data,
      cachedAt: new Date(cached.fetchedAt).toISOString(),
      fromCache: true,
      sourcesChecked: region.listings.filter((l) => l.type === 'Club').length,
      sourcesWithData: cached.data.length,
      diagnostics: cached.diagnostics,
    });
  }

  // Only scrape Club listings — leagues don't run tryouts
  const clubListings = region.listings.filter((l) => l.type === 'Club');

  // Respond immediately with whatever finishes within 8 seconds.
  // Each club fetch has a 3s per-URL timeout; we race the whole batch against
  // an 8s wall-clock deadline so the HTTP response always arrives promptly.
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));

  const scrapeAll = batchedAll(
    clubListings.map((listing) => () => scrapeClub(listing, regionSlug)),
    4, // 4 clubs at a time keeps outbound connections manageable
  );

  // Race: whichever resolves first wins. If deadline fires first we get null.
  const raceResult = await Promise.race([scrapeAll, deadline]);

  const scrapeResults = Array.isArray(raceResult) ? raceResult : [];
  const tryouts = scrapeResults
    .filter((r): r is Extract<ScrapeResult, { kind: 'found' }> => r.kind === 'found')
    .map((r) => r.listing);
  const diagnostics = mergeDiagnostics(scrapeResults);

  // Cache even a partial/empty result so repeated fast refreshes don't re-scrape
  cache.set(regionSlug, { data: tryouts, fetchedAt: Date.now(), diagnostics });

  // Fire-and-forget: keep scraping in the background and update the cache
  // so the next request (or a refresh) gets fuller results.
  if (!Array.isArray(raceResult)) {
    scrapeAll
      .then((results) => {
        const fullTryouts = results
          .filter((r): r is Extract<ScrapeResult, { kind: 'found' }> => r.kind === 'found')
          .map((r) => r.listing);
        const fullDiagnostics = mergeDiagnostics(results);
        cache.set(regionSlug, { data: fullTryouts, fetchedAt: Date.now(), diagnostics: fullDiagnostics });
      })
      .catch(() => {/* ignore background errors */});
  }

  return res.json({
    region: regionSlug,
    regionLabel: region.label,
    tryouts,
    cachedAt: new Date().toISOString(),
    fromCache: false,
    sourcesChecked: clubListings.length,
    sourcesWithData: tryouts.length,
    partial: !Array.isArray(raceResult), // true if deadline fired before all clubs were checked
    diagnostics,
  });
}
