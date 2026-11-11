import { canonicalRegionSlug } from '@/lib/region-slugs';
/**
 * tryout-scraper-job.ts  — v2
 *
 * Two-cadence background job for tryout data:
 *
 *   DAILY REFRESH    — re-fetches every known sourceUrl to pick up changes.
 *                      Runs 3 min after boot, then every 24 h.
 *
 *   WEEKLY DISCOVERY — crawls each club's website for newly published tryout
 *                      pages. Runs 5 min after boot, then every 7 days.
 *
 * ── Validation rules (v2 fixes) ──────────────────────────────────────────────
 *
 *  DATE CLASSIFICATION (fixes validation point 1)
 *   - A date is PAST if it is strictly before today (midnight local).
 *   - A date is UPCOMING if it is today or later.
 *   - A date string without a 4-digit year is UNPUBLISHED (stored as TBD).
 *   - We NEVER infer the current year from a bare month/day.
 *   - "Stale" means ALL extracted dates are in the past AND the page has no
 *     upcoming dates. A page with mixed past+upcoming dates is still 'ok'.
 *
 *  MULTIPLE SESSIONS (fixes validation point 2)
 *   - Each distinct (ageKey × date) combination gets its own DB row.
 *   - Boys/Girls schedules on the same page produce separate rows.
 *   - Multiple dates for the same age group each get their own row, keyed
 *     by region::club::ageKey::dateIndex so re-runs update not duplicate.
 *
 *  DURABLE SCHEDULER (fixes validation point 3)
 *   - Run state is persisted in sc_scraper_job_state (survives restarts).
 *   - Atomic DB claim (claim_token + claim_expires_at) prevents two
 *     containers running the same job simultaneously.
 *   - On boot the scheduler reads last_run_at from DB and schedules the
 *     next run relative to that, not relative to boot time.
 *
 *  STABLE IDs
 *   - Scraped rows: sc-<sha256(region::club::ageKey::dateIndex)>
 *   - Hand-entered rows (UUID, no sourceUrl): never touched.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { db } from './db/client.js';
import { soccerTryoutEvents, scScraperJobState } from './db/schema.js';
import { eq, and, like, isNotNull, sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirectoryListing {
  id: string;
  name: string;
  type: string;
  level: string;
  city: string;
  url?: string;
  importId?: string;
  programTypes?: string;
  email?: string;
  phone?: string;
}

interface DirectoryRegion {
  id: string;
  slug: string;
  label: string;
  listings: DirectoryListing[];
}

/**
 * One logical tryout session.
 * dateIndex: 0-based index within the age group's date list — used for stable IDs
 * when a club has multiple sessions for the same age group.
 */
interface ExtractedSession {
  ageKey: string;       // normalised age group label
  ageGroups: string[];  // display labels
  dateIndex: number;    // 0 for first date, 1 for second, etc.
  eventDate: string | null;   // null = TBD (no year found)
  eventTime: string | null;
  isPast: boolean;
  isUpcoming: boolean;  // has a parseable future date
  location: string;
  registrationUrl: string | null;
  notes: string;
  season: string | null;
}

interface ScrapeOutcome {
  clubName: string;
  clubUrl: string | null;
  city: string;
  level: string;
  sourceUrl: string;
  sessions: ExtractedSession[];
  reviewStatus: 'ok' | 'stale_season' | 'no_tryout_page' | 'stale_source';
  reviewNote: string;
}

// ─── In-memory status (for /api/tryouts/scraper-status) ──────────────────────

export interface JobStatus {
  dailyLastRunAt: string | null;
  dailyLastDurationMs: number | null;
  dailyLastRefreshed: number;
  dailyLastErrors: string[];
  dailyNextRunAt: string | null;
  discoveryLastRunAt: string | null;
  discoveryLastDurationMs: number | null;
  discoveryLastFound: number;
  discoveryLastErrors: string[];
  discoveryNextRunAt: string | null;
  isRunning: boolean;
  runCount: number;
}

const memStatus: JobStatus = {
  dailyLastRunAt: null,
  dailyLastDurationMs: null,
  dailyLastRefreshed: 0,
  dailyLastErrors: [],
  dailyNextRunAt: null,
  discoveryLastRunAt: null,
  discoveryLastDurationMs: null,
  discoveryLastFound: 0,
  discoveryLastErrors: [],
  discoveryNextRunAt: null,
  isRunning: false,
  runCount: 0,
};

export function getJobStatus(): JobStatus { return { ...memStatus }; }

// ─── Stable IDs ───────────────────────────────────────────────────────────────

function scrapedId(regionSlug: string, clubName: string, ageKey: string, dateIndex: number): string {
  const hash = createHash('sha256')
    .update(`${regionSlug}::${clubName.toLowerCase().trim()}::${ageKey.toLowerCase().trim()}::${dateIndex}`)
    .digest('hex')
    .slice(0, 28);
  return `sc-${hash}`;
}

// ─── Load directory ───────────────────────────────────────────────────────────

function loadRegions(): DirectoryRegion[] {
  const candidates = [
    join(process.cwd(), 'src/content/data/directory_regions.json'),
    join(process.cwd(), 'dist/data/directory_regions.json'),
    join(process.cwd(), 'public/data/directory_regions.json'),
    join(dirname(fileURLToPath(import.meta.url)), 'data/directory_regions.json'),
    join(dirname(fileURLToPath(import.meta.url)), '../../../src/content/data/directory_regions.json'),
    join(dirname(fileURLToPath(import.meta.url)), '../../content/data/directory_regions.json'),
  ];
  for (const p of candidates) {
    try { return JSON.parse(readFileSync(p, 'utf-8')) as DirectoryRegion[]; }
    catch { /* try next */ }
  }
  console.warn('[tryout-scraper] Could not load directory_regions.json');
  return [];
}

// ─── Club-specific tryout page overrides ─────────────────────────────────────

const TRYOUT_PAGE_OVERRIDES: Record<string, string> = {
  'colorado united': 'https://www.coloradounitedsoccer.com/competitive---tryout-information',
};

// ─── Extraction helpers ───────────────────────────────────────────────────────

const TRYOUT_KEYWORDS = [
  'tryout', 'try-out', 'try out', 'trial', 'evaluation', 'open training',
  'player assessment', 'player evaluation', 'id camp', 'identification camp',
  'open tryout', 'team tryout', 'club tryout', 'academy tryout',
  'player placement', 'team placement', 'supplemental tryout',
];

/**
 * DATE_PATTERNS — only match dates that include a 4-digit year.
 * Bare "October 25" without a year is intentionally excluded to prevent
 * year inference.
 */
const DATE_PATTERNS_WITH_YEAR: RegExp[] = [
  // "October 25, 2026" / "Oct 25 2026"
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}\b/gi,
  // "25 October 2026"
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b/gi,
  // "10/25/2026" or "10-25-2026"
  /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-]20\d{2}\b/g,
  // "Monday, October 25, 2026"
  /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}\b/gi,
  // "Fall 2026" / "Spring 2027" — season labels with year
  /\b(?:Spring|Summer|Fall|Winter|Autumn)\s+20\d{2}\b/gi,
  // "2026-2027 season"
  /\b20\d{2}[-\/]20\d{2}\b/g,
];

const TIME_PATTERNS: RegExp[] = [
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\b/g,
  /\b\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b/g,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
];

const AGE_PATTERNS: RegExp[] = [
  /\bU-?(\d{1,2})\b/gi,
  /\bUnder[-\s]?(\d{1,2})\b/gi,
  /\b(?:Boys?|Girls?)\s+U-?\d{1,2}\b/gi,
  /\bBorn\s+(?:in\s+)?(?:19|20)\d{2}\b/gi,
  /\b(?:19|20)\d{2}\s+(?:birth\s+year|boys?|girls?|players?)\b/gi,
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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s{2,}/g, ' ').trim();
}

function hasTryoutContent(text: string): boolean {
  const lower = text.toLowerCase();
  return TRYOUT_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Extract only dates that include a 4-digit year. */
function extractDatesWithYear(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of DATE_PATTERNS_WITH_YEAR) {
    pattern.lastIndex = 0;
    for (const m of text.match(pattern) ?? []) {
      const clean = m.trim().replace(/\s+/g, ' ');
      if (clean.length > 3) found.add(clean);
    }
  }
  return Array.from(found).slice(0, 16);
}

function extractTimes(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of TIME_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of text.match(pattern) ?? []) found.add(m.trim());
  }
  return Array.from(found).slice(0, 8);
}

function extractAgeGroups(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of AGE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of text.match(pattern) ?? []) {
      const clean = m.trim();
      if (clean.length >= 2 && clean.length <= 40) found.add(clean);
    }
  }
  return Array.from(found).slice(0, 16);
}

function extractRegistrationUrl(html: string, baseUrl: string): string | null {
  for (const pattern of REGISTRATION_LINK_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(html);
    if (match) {
      const href = match[1];
      let url: string | null = null;
      if (href.startsWith('http')) url = href;
      else if (href.startsWith('/')) {
        try { url = `${new URL(baseUrl).origin}${href}`; } catch { return null; }
      }
      // Truncate to fit VARCHAR(512) — prefer the base URL if the resolved URL is too long
      if (url && url.length > 512) {
        try { return `${new URL(url).origin}${new URL(url).pathname}`.slice(0, 512); }
        catch { return null; }
      }
      return url;
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
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);
  const scored = sentences
    .filter((s) => TRYOUT_KEYWORDS.some((kw) => s.toLowerCase().includes(kw)))
    .map((s) => {
      let score = 0;
      if (/\d{4}/.test(s)) score += 2;
      if (/(?:am|pm)/i.test(s)) score += 1;
      if (/U-?\d{1,2}/i.test(s)) score += 2;
      if (/register|sign.?up|apply/i.test(s)) score += 1;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.s.slice(0, 250) ?? '';
}

// ─── Date classification ──────────────────────────────────────────────────────

/** Midnight today in local time (server TZ). */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Parse a date string that MUST contain a 4-digit year.
 * Returns null if the string cannot be parsed or has no year.
 */
function parseDateWithYear(s: string): Date | null {
  if (!/\b20\d{2}\b/.test(s)) return null;
  // Season labels → approximate date
  const seasonMatch = s.match(/\b(Spring|Summer|Fall|Winter|Autumn)\s+(20\d{2})\b/i);
  if (seasonMatch) {
    const season = seasonMatch[1].toLowerCase();
    const year = parseInt(seasonMatch[2], 10);
    const monthMap: Record<string, number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };
    return new Date(year, (monthMap[season] ?? 9) - 1, 1);
  }
  // Season range "2026-2027" → start of first year
  const rangeMatch = s.match(/\b(20\d{2})[-\/]20\d{2}\b/);
  if (rangeMatch) return new Date(parseInt(rangeMatch[1], 10), 8, 1); // Sep of start year
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

interface DateClassification {
  raw: string;
  parsed: Date | null;
  isPast: boolean;
  isUpcoming: boolean;
}

function classifyDate(raw: string): DateClassification {
  const parsed = parseDateWithYear(raw);
  if (!parsed) return { raw, parsed: null, isPast: false, isUpcoming: false };
  const today = todayMidnight();
  const isPast = parsed < today;
  const isUpcoming = !isPast;
  return { raw, parsed, isPast, isUpcoming };
}

/** Detect the season label from page text. */
function detectSeason(text: string): string | null {
  const m =
    text.match(/\b(20\d{2}[-\/]20\d{2})\b/) ??
    text.match(/\b(?:Fall|Spring|Summer|Winter)\s+(20\d{2})\b/i) ??
    text.match(/\b(20\d{2})\s+(?:season|tryout|tryouts)\b/i);
  return m ? m[1] : null;
}

// ─── Session extraction ───────────────────────────────────────────────────────

/**
 * Extract sessions from a page.
 *
 * Strategy:
 * 1. Try to find table-row patterns: age group + date + time on the same line.
 *    If found with ≥2 distinct age groups, produce one session per (age, date).
 * 2. Try to find gender-split patterns: "Boys ... date" / "Girls ... date".
 * 3. Fall back to a single session with all dates and age groups.
 *
 * Each session has exactly one eventDate (or null for TBD).
 * Multiple dates for the same age group → multiple sessions with dateIndex 0,1,2…
 */
function extractSessions(text: string, html: string, finalUrl: string): ExtractedSession[] {
  const allDates = extractDatesWithYear(text);
  const allTimes = extractTimes(text);
  const allAgeGroups = extractAgeGroups(text);
  const location = extractLocation(text);
  const notes = extractNotes(text);
  const registrationUrl = extractRegistrationUrl(html, finalUrl);
  const season = detectSeason(text);

  // ── Strategy 1: table-row pattern ──────────────────────────────────────────
  // Matches: "U15 ... October 25, 2026 ... 1:00 PM"
  const tableRowPattern = /\b((?:Boys?\s+|Girls?\s+)?U-?\d{1,2}|Under\s*\d{1,2})\b[^\n]{0,150}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n]{0,60}20\d{2})[^\n]{0,80}(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/gi;
  const rowMatches: Array<{ age: string; date: string; time: string }> = [];
  let m: RegExpExecArray | null;
  tableRowPattern.lastIndex = 0;
  while ((m = tableRowPattern.exec(text)) !== null) {
    rowMatches.push({ age: m[1].trim(), date: m[2].trim(), time: m[3].trim() });
  }

  if (rowMatches.length >= 2) {
    // Group by age key, preserving multiple dates per age
    const byAge = new Map<string, { dates: string[]; times: string[] }>();
    for (const row of rowMatches) {
      const key = row.age.toUpperCase().replace(/\s+/g, '');
      if (!byAge.has(key)) byAge.set(key, { dates: [], times: [] });
      const entry = byAge.get(key)!;
      if (!entry.dates.includes(row.date)) entry.dates.push(row.date);
      if (!entry.times.includes(row.time)) entry.times.push(row.time);
    }
    if (byAge.size >= 2) {
      const sessions: ExtractedSession[] = [];
      for (const [ageKey, { dates, times }] of byAge.entries()) {
        dates.forEach((dateStr, idx) => {
          const cls = classifyDate(dateStr);
          sessions.push({
            ageKey,
            ageGroups: [ageKey],
            dateIndex: idx,
            eventDate: cls.parsed ? dateStr : null,
            eventTime: times[idx] ?? times[0] ?? null,
            isPast: cls.isPast,
            isUpcoming: cls.isUpcoming,
            location,
            registrationUrl,
            notes,
            season,
          });
        });
      }
      return sessions;
    }
  }

  // ── Strategy 2: gender-split pattern ───────────────────────────────────────
  // Matches: "Boys ... October 25, 2026" and "Girls ... October 26, 2026"
  const genderPattern = /\b(Boys?|Girls?)\b[^\n]{0,200}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n]{0,60}20\d{2})/gi;
  const genderMatches: Array<{ gender: string; date: string }> = [];
  genderPattern.lastIndex = 0;
  while ((m = genderPattern.exec(text)) !== null) {
    genderMatches.push({ gender: m[1].trim(), date: m[2].trim() });
  }
  if (genderMatches.length >= 2) {
    const byGender = new Map<string, string[]>();
    for (const gm of genderMatches) {
      const key = gm.gender.toLowerCase().startsWith('boy') ? 'Boys' : 'Girls';
      if (!byGender.has(key)) byGender.set(key, []);
      const arr = byGender.get(key)!;
      if (!arr.includes(gm.date)) arr.push(gm.date);
    }
    if (byGender.size >= 2) {
      const sessions: ExtractedSession[] = [];
      for (const [gender, dates] of byGender.entries()) {
        dates.forEach((dateStr, idx) => {
          const cls = classifyDate(dateStr);
          sessions.push({
            ageKey: gender,
            ageGroups: allAgeGroups.length > 0 ? allAgeGroups : [gender],
            dateIndex: idx,
            eventDate: cls.parsed ? dateStr : null,
            eventTime: allTimes[0] ?? null,
            isPast: cls.isPast,
            isUpcoming: cls.isUpcoming,
            location,
            registrationUrl,
            notes,
            season,
          });
        });
      }
      return sessions;
    }
  }

  // ── Strategy 3: single session, one row per date ───────────────────────────
  const ageKey = allAgeGroups.length > 0
    ? allAgeGroups.map((a) => a.toUpperCase().replace(/\s+/g, '')).sort().join(',')
    : 'general';

  if (allDates.length === 0) {
    // No year-qualified dates found — TBD session
    return [{
      ageKey,
      ageGroups: allAgeGroups,
      dateIndex: 0,
      eventDate: null,
      eventTime: allTimes[0] ?? null,
      isPast: false,
      isUpcoming: false,
      location,
      registrationUrl,
      notes,
      season,
    }];
  }

  // One row per date
  return allDates.map((dateStr, idx) => {
    const cls = classifyDate(dateStr);
    return {
      ageKey,
      ageGroups: allAgeGroups,
      dateIndex: idx,
      eventDate: cls.parsed ? dateStr : null,
      eventTime: allTimes[idx] ?? allTimes[0] ?? null,
      isPast: cls.isPast,
      isUpcoming: cls.isUpcoming,
      location,
      registrationUrl,
      notes,
      season,
    };
  });
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 9000;

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SoccerCenter/1.0; +https://soccercenter.org)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return { html: await res.text(), finalUrl: res.url };
  } catch { return null; }
}

// ─── URL candidate generation ─────────────────────────────────────────────────

function tryoutUrlCandidates(baseUrl: string): string[] {
  try {
    const u = new URL(baseUrl);
    const origin = u.origin;
    const base = baseUrl.replace(/\/$/, '');
    return [
      `${base}/tryouts`, `${base}/tryout`, `${base}/tryouts/`,
      `${origin}/tryouts`, `${origin}/tryout`,
      `${origin}/academy/tryouts`, `${origin}/programs/tryouts`,
      `${origin}/join/tryouts`, `${origin}/players/tryouts`,
      `${origin}/competitive/tryouts`, `${origin}/teams/tryouts`,
      `${origin}/join`, `${origin}/competitive`,
      baseUrl,
    ];
  } catch { return [baseUrl]; }
}

// ─── Scrape a single club ─────────────────────────────────────────────────────

async function scrapeClub(listing: DirectoryListing): Promise<ScrapeOutcome | null> {
  if (!listing.url) return null;

  const override = TRYOUT_PAGE_OVERRIDES[listing.name.toLowerCase().trim()];
  const candidates = override
    ? [override, ...tryoutUrlCandidates(listing.url).filter((u) => u !== override)]
    : tryoutUrlCandidates(listing.url);

  for (const url of candidates) {
    const result = await fetchPage(url);
    if (!result) continue;
    const { html, finalUrl } = result;
    const text = stripHtml(html);
    if (!hasTryoutContent(text)) continue;

    const sessions = extractSessions(text, html, finalUrl);

    // Classify outcome: ok if any session is upcoming or TBD; stale if all are past
    const hasUpcoming = sessions.some((s) => s.isUpcoming || s.eventDate === null);
    const allPast = sessions.length > 0 && sessions.every((s) => s.isPast);

    if (allPast) {
      return {
        clubName: listing.name, clubUrl: listing.url ?? null,
        city: listing.city, level: listing.level,
        sourceUrl: finalUrl, sessions,
        reviewStatus: 'stale_season',
        reviewNote: `All extracted dates are in the past. Most recent: ${sessions[0]?.eventDate ?? 'unknown'}`,
      };
    }

    return {
      clubName: listing.name, clubUrl: listing.url ?? null,
      city: listing.city, level: listing.level,
      sourceUrl: finalUrl, sessions,
      reviewStatus: hasUpcoming ? 'ok' : 'ok', // TBD dates are ok — not stale
      reviewNote: '',
    };
  }

  return {
    clubName: listing.name, clubUrl: listing.url ?? null,
    city: listing.city, level: listing.level,
    sourceUrl: listing.url ?? '',
    sessions: [],
    reviewStatus: 'no_tryout_page',
    reviewNote: `No tryout page found after checking ${candidates.length} URL candidates`,
  };
}

// ─── Refresh a single known source URL ───────────────────────────────────────

async function refreshSourceUrl(
  row: { id: string; clubName: string; clubUrl: string | null; city: string | null; level: string | null; sourceUrl: string; regionSlug: string },
  now: Date,
): Promise<'refreshed' | 'stale' | 'unavailable'> {
  const result = await fetchPage(row.sourceUrl);
  const checkedAt = now;

  if (!result) {
    await db.update(soccerTryoutEvents).set({
      lastCheckedAt: checkedAt,
      reviewStatus: 'stale_source',
      reviewNote: `Source URL returned no response at ${now.toISOString()}`,
    }).where(eq(soccerTryoutEvents.id, row.id));
    return 'unavailable';
  }

  const { html, finalUrl } = result;
  const text = stripHtml(html);

  if (!hasTryoutContent(text)) {
    await db.update(soccerTryoutEvents).set({
      lastCheckedAt: checkedAt,
      reviewStatus: 'stale_source',
      reviewNote: 'Source page no longer contains tryout content',
    }).where(eq(soccerTryoutEvents.id, row.id));
    return 'stale';
  }

  const sessions = extractSessions(text, html, finalUrl);
  const session = sessions[0];
  if (!session) return 'stale';

  const allPast = sessions.every((s) => s.isPast);
  if (allPast) {
    await db.update(soccerTryoutEvents).set({
      lastCheckedAt: checkedAt,
      reviewStatus: 'stale_season',
      reviewNote: 'Source still live but all extracted dates are in the past',
    }).where(eq(soccerTryoutEvents.id, row.id));
    return 'stale';
  }

  await db.update(soccerTryoutEvents).set({
    ageGroups: JSON.stringify(session.ageGroups),
    eventDate: session.eventDate,
    eventTime: session.eventTime,
    location: session.location || null,
    registrationUrl: session.registrationUrl,
    notes: session.notes || null,
    isPast: session.isPast,
    sourceUrl: finalUrl,
    lastVerifiedAt: checkedAt,
    lastCheckedAt: checkedAt,
    reviewStatus: 'ok',
    reviewNote: null,
    scrapedSeason: session.season,
  }).where(eq(soccerTryoutEvents.id, row.id));

  return 'refreshed';
}

// ─── Upsert a session row ─────────────────────────────────────────────────────

async function upsertSession(
  regionSlug: string,
  outcome: ScrapeOutcome,
  session: ExtractedSession,
  now: Date,
): Promise<void> {
  const id = scrapedId(regionSlug, outcome.clubName, session.ageKey, session.dateIndex);
  const row = {
    regionSlug,
    clubName: outcome.clubName,
    clubUrl: outcome.clubUrl,
    city: outcome.city || null,
    level: outcome.level || null,
    ageGroups: JSON.stringify(session.ageGroups),
    eventDate: session.eventDate,
    eventTime: session.eventTime,
    location: session.location || null,
    registrationUrl: session.registrationUrl,
    notes: session.notes || null,
    isPast: session.isPast,
    sortOrder: session.isUpcoming ? 100 : (session.eventDate === null ? 150 : 180),
    sourceUrl: outcome.sourceUrl,
    lastVerifiedAt: outcome.reviewStatus === 'ok' ? now : null,
    lastCheckedAt: now,
    reviewStatus: outcome.reviewStatus,
    reviewNote: outcome.reviewNote || null,
    scrapedSeason: session.season,
  };

  const existing = await db
    .select({ id: soccerTryoutEvents.id })
    .from(soccerTryoutEvents)
    .where(eq(soccerTryoutEvents.id, id))
    .limit(1);

  if (existing.length > 0) {
    await db.update(soccerTryoutEvents).set(row).where(eq(soccerTryoutEvents.id, id));
  } else {
    await db.insert(soccerTryoutEvents).values({ id, ...row });
  }
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

async function batchedAll<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...(await Promise.all(tasks.slice(i, i + size).map((fn) => fn()))));
  }
  return results;
}

// ─── Mark past events ─────────────────────────────────────────────────────────

async function markPastEvents(now: Date, regionSlug?: string): Promise<void> {
  try {
    const today = todayMidnight();
    const conditions = regionSlug
      ? and(like(soccerTryoutEvents.id, 'sc-%'), eq(soccerTryoutEvents.regionSlug, regionSlug))
      : like(soccerTryoutEvents.id, 'sc-%');

    const rows = await db
      .select({ id: soccerTryoutEvents.id, eventDate: soccerTryoutEvents.eventDate, isPast: soccerTryoutEvents.isPast })
      .from(soccerTryoutEvents)
      .where(conditions);

    for (const row of rows) {
      if (row.isPast) continue;
      if (!row.eventDate) continue;
      const parsed = parseDateWithYear(row.eventDate);
      if (parsed && parsed < today) {
        await db.update(soccerTryoutEvents).set({ isPast: true }).where(eq(soccerTryoutEvents.id, row.id));
      }
    }
  } catch (e) {
    console.error('[tryout-scraper] markPastEvents error:', e);
  }
}

// ─── Durable job state ────────────────────────────────────────────────────────

const CLAIM_TTL_MS = 90 * 60 * 1000; // 90 min safety valve

async function tryClaimJob(jobType: string): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
  try {
    // Atomic: only claim if no active claim or claim has expired
    await db.execute(sql`
      UPDATE sc_scraper_job_state
      SET claim_token = ${token}, claim_expires_at = ${expiresAt}
      WHERE job_type = ${jobType}
        AND (claim_token IS NULL OR claim_expires_at < NOW())
    `);
    // Verify we got the claim
    const rows = await db
      .select({ claimToken: scScraperJobState.claimToken })
      .from(scScraperJobState)
      .where(eq(scScraperJobState.jobType, jobType))
      .limit(1);
    return rows[0]?.claimToken === token ? token : null;
  } catch { return null; }
}

async function releaseJob(jobType: string, token: string, stats: {
  durationMs: number; found: number; errors: string[]; nextRunAt: Date;
}): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE sc_scraper_job_state
      SET claim_token = NULL,
          claim_expires_at = NULL,
          last_run_at = NOW(),
          last_run_duration_ms = ${stats.durationMs},
          last_run_found = ${stats.found},
          last_run_errors = ${JSON.stringify(stats.errors.slice(0, 20))},
          next_run_at = ${stats.nextRunAt}
      WHERE job_type = ${jobType} AND claim_token = ${token}
    `);
  } catch (e) {
    console.error('[tryout-scraper] releaseJob error:', e);
  }
}

async function readJobState(jobType: string): Promise<{ lastRunAt: Date | null; nextRunAt: Date | null }> {
  try {
    const rows = await db
      .select({ lastRunAt: scScraperJobState.lastRunAt, nextRunAt: scScraperJobState.nextRunAt })
      .from(scScraperJobState)
      .where(eq(scScraperJobState.jobType, jobType))
      .limit(1);
    return { lastRunAt: rows[0]?.lastRunAt ?? null, nextRunAt: rows[0]?.nextRunAt ?? null };
  } catch { return { lastRunAt: null, nextRunAt: null }; }
}

// ─── DAILY REFRESH JOB ───────────────────────────────────────────────────────

export async function runDailyRefresh(): Promise<void> {
  const token = await tryClaimJob('daily_refresh');
  if (!token) {
    console.log('[tryout-scraper] Daily refresh already claimed by another worker — skipping');
    return;
  }
  memStatus.isRunning = true;
  const startedAt = Date.now();
  const errors: string[] = [];
  let refreshed = 0;

  console.log('[tryout-scraper] Starting daily source refresh');

  try {
    const rows = await db
      .select({
        id: soccerTryoutEvents.id,
        clubName: soccerTryoutEvents.clubName,
        clubUrl: soccerTryoutEvents.clubUrl,
        city: soccerTryoutEvents.city,
        level: soccerTryoutEvents.level,
        sourceUrl: soccerTryoutEvents.sourceUrl,
        regionSlug: soccerTryoutEvents.regionSlug,
      })
      .from(soccerTryoutEvents)
      .where(and(
        like(soccerTryoutEvents.id, 'sc-%'),
        isNotNull(soccerTryoutEvents.sourceUrl),
      ));

    console.log(`[tryout-scraper] Daily refresh: ${rows.length} rows with source URLs`);
    const now = new Date();

    const tasks = rows
      .filter((r): r is typeof r & { sourceUrl: string } => !!r.sourceUrl)
      .map((row) => async () => {
        try {
          const outcome = await refreshSourceUrl(row, now);
          if (outcome === 'refreshed') refreshed++;
        } catch (e) {
          errors.push(`Refresh failed ${row.id}: ${String(e)}`);
        }
      });

    await batchedAll(tasks, 4);
    await markPastEvents(now);

  } catch (e) {
    errors.push(`Daily refresh error: ${String(e)}`);
    console.error('[tryout-scraper]', e);
  }

  const durationMs = Date.now() - startedAt;
  const nextRunAt = new Date(Date.now() + DAILY_INTERVAL_MS);

  memStatus.isRunning = false;
  memStatus.dailyLastRunAt = new Date().toISOString();
  memStatus.dailyLastDurationMs = durationMs;
  memStatus.dailyLastRefreshed = refreshed;
  memStatus.dailyLastErrors = errors;
  memStatus.dailyNextRunAt = nextRunAt.toISOString();
  memStatus.runCount += 1;

  await releaseJob('daily_refresh', token, { durationMs, found: refreshed, errors, nextRunAt });
  console.log(`[tryout-scraper] Daily refresh complete — ${refreshed} refreshed, ${errors.length} errors, ${(durationMs / 1000).toFixed(1)}s`);
}

// ─── WEEKLY DISCOVERY JOB ────────────────────────────────────────────────────

export async function runWeeklyDiscovery(regionFilter?: string): Promise<void> {
  const token = await tryClaimJob('weekly_discovery');
  if (!token) {
    console.log('[tryout-scraper] Weekly discovery already claimed by another worker — skipping');
    return;
  }
  memStatus.isRunning = true;
  const startedAt = Date.now();
  const errors: string[] = [];
  let found = 0;

  console.log('[tryout-scraper] Starting weekly discovery run' + (regionFilter ? ` (region: ${regionFilter})` : ''));

  try {
    const allRegions = loadRegions();
    const regions = regionFilter ? allRegions.filter((r) => canonicalRegionSlug(r.slug) === canonicalRegionSlug(regionFilter)) : allRegions;

    if (regions.length === 0) {
      errors.push(regionFilter
        ? `Region '${regionFilter}' not found in directory_regions.json`
        : 'No regions loaded — directory_regions.json not found');
      memStatus.isRunning = false;
      await releaseJob('weekly_discovery', token, { durationMs: 0, found: 0, errors, nextRunAt: new Date(Date.now() + DISCOVERY_INTERVAL_MS) });
      return;
    }

    const now = new Date();

    for (const region of regions) {
      const clubListings = region.listings.filter((l) => l.type === 'Club');
      const withUrl = clubListings.filter((l) => !!l.url);
      const noUrlListings = clubListings.filter((l) => !l.url);

      console.log(
        `[tryout-scraper] Discovery ${region.slug}: ${clubListings.length} clubs ` +
        `(${withUrl.length} with website, ${noUrlListings.length} no URL)`,
      );

      // Flag clubs with no URL
      for (const listing of noUrlListings) {
        const id = scrapedId(region.slug, listing.name, 'general', 0);
        try {
          const existing = await db.select({ id: soccerTryoutEvents.id }).from(soccerTryoutEvents).where(eq(soccerTryoutEvents.id, id)).limit(1);
          if (existing.length === 0) {
            await db.insert(soccerTryoutEvents).values({
              id, regionSlug: region.slug, clubName: listing.name,
              clubUrl: null, city: listing.city || null, level: listing.level || null,
              ageGroups: '[]', isPast: false, sortOrder: 200,
              reviewStatus: 'no_url',
              reviewNote: 'Club has no website URL in directory',
              lastCheckedAt: now,
            });
          }
        } catch { /* non-critical */ }
      }

      // Scrape clubs with URLs — per-region 5-min deadline
      const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5 * 60 * 1000));
      const scrapeAll = batchedAll(
        withUrl.map((listing) => () => scrapeClub(listing)),
        4,
      );
      const raceResult = await Promise.race([scrapeAll, deadline]);
      const outcomes = Array.isArray(raceResult)
        ? raceResult.filter((r): r is ScrapeOutcome => r !== null)
        : [];

      const okCount = outcomes.filter((o) => o.reviewStatus === 'ok').length;
      console.log(`[tryout-scraper] Discovery ${region.slug}: ${okCount} clubs with current tryout data`);

      for (const outcome of outcomes) {
        if (outcome.sessions.length === 0) {
          // No sessions — upsert a single placeholder row for tracking
          const id = scrapedId(region.slug, outcome.clubName, 'general', 0);
          try {
            const existing = await db.select({ id: soccerTryoutEvents.id }).from(soccerTryoutEvents).where(eq(soccerTryoutEvents.id, id)).limit(1);
            const row = {
              regionSlug: region.slug, clubName: outcome.clubName,
              clubUrl: outcome.clubUrl, city: outcome.city || null, level: outcome.level || null,
              ageGroups: '[]', isPast: false, sortOrder: 200,
              sourceUrl: outcome.sourceUrl || null,
              lastCheckedAt: now,
              reviewStatus: outcome.reviewStatus,
              reviewNote: outcome.reviewNote || null,
            };
            if (existing.length > 0) {
              await db.update(soccerTryoutEvents).set(row).where(eq(soccerTryoutEvents.id, id));
            } else {
              await db.insert(soccerTryoutEvents).values({ id, ...row });
            }
          } catch (e) { errors.push(`${region.slug}/${outcome.clubName}: ${String(e)}`); }
          continue;
        }

        // Upsert each session
        for (const session of outcome.sessions) {
          try {
            await upsertSession(region.slug, outcome, session, now);
            if (outcome.reviewStatus === 'ok' && session.isUpcoming) found++;
          } catch (e) {
            errors.push(`Upsert ${region.slug}/${outcome.clubName}/${session.ageKey}/${session.dateIndex}: ${String(e)}`);
          }
        }
      }

      await markPastEvents(now, region.slug);
    }
  } catch (e) {
    errors.push(`Discovery error: ${String(e)}`);
    console.error('[tryout-scraper]', e);
  }

  const durationMs = Date.now() - startedAt;
  const nextRunAt = new Date(Date.now() + DISCOVERY_INTERVAL_MS);

  memStatus.isRunning = false;
  memStatus.discoveryLastRunAt = new Date().toISOString();
  memStatus.discoveryLastDurationMs = durationMs;
  memStatus.discoveryLastFound = found;
  memStatus.discoveryLastErrors = errors;
  memStatus.discoveryNextRunAt = nextRunAt.toISOString();
  memStatus.runCount += 1;

  await releaseJob('weekly_discovery', token, { durationMs, found, errors, nextRunAt });
  console.log(`[tryout-scraper] Discovery complete — ${found} upcoming sessions found, ${errors.length} errors, ${(durationMs / 1000).toFixed(1)}s`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

const DAILY_INTERVAL_MS     = 24 * 60 * 60 * 1000;
const DISCOVERY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute delay until next run, based on last_run_at from DB.
 * If last run was > interval ago (or never), run after initialDelayMs.
 */
function computeDelay(lastRunAt: Date | null, intervalMs: number, initialDelayMs: number): number {
  if (!lastRunAt) return initialDelayMs;
  const elapsed = Date.now() - lastRunAt.getTime();
  const remaining = intervalMs - elapsed;
  return remaining > 0 ? remaining : initialDelayMs;
}

export async function startScraperScheduler(): Promise<void> {
  // Read durable state from DB
  const [dailyState, discoveryState] = await Promise.all([
    readJobState('daily_refresh'),
    readJobState('weekly_discovery'),
  ]);

  // Daily refresh
  const dailyDelay = computeDelay(dailyState.lastRunAt, DAILY_INTERVAL_MS, 3 * 60 * 1000);
  const dailyFirstAt = new Date(Date.now() + dailyDelay);
  memStatus.dailyNextRunAt = dailyFirstAt.toISOString();
  console.log(`[tryout-scraper] Daily refresh scheduled — first run at ${dailyFirstAt.toISOString()} (${Math.round(dailyDelay / 60000)} min)`);

  setTimeout(() => {
    void runDailyRefresh();
    setInterval(() => void runDailyRefresh(), DAILY_INTERVAL_MS).unref();
  }, dailyDelay);

  // Weekly discovery
  const discoveryDelay = computeDelay(discoveryState.lastRunAt, DISCOVERY_INTERVAL_MS, 5 * 60 * 1000);
  const discoveryFirstAt = new Date(Date.now() + discoveryDelay);
  memStatus.discoveryNextRunAt = discoveryFirstAt.toISOString();
  console.log(`[tryout-scraper] Weekly discovery scheduled — first run at ${discoveryFirstAt.toISOString()} (${Math.round(discoveryDelay / 60000)} min)`);

  setTimeout(() => {
    void runWeeklyDiscovery();
    setInterval(() => void runWeeklyDiscovery(), DISCOVERY_INTERVAL_MS).unref();
  }, discoveryDelay);
}

// ─── Legacy export ────────────────────────────────────────────────────────────
export async function runScraperJob() {
  await runWeeklyDiscovery();
  return getJobStatus();
}
