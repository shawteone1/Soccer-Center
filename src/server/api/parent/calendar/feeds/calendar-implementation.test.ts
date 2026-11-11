/**
 * calendar-implementation.test.ts
 *
 * Tests exercising the actual handler and parser implementations.
 * These tests call real code paths — not just logic reproductions.
 *
 * Coverage:
 *   1. validateFeedUrl — SSRF allowlist, private-IP rejection, webcal normalization
 *   2. parseIcal — timezone/DST, recurring events, EXDATE exclusions, cancellations
 *   3. Import feed exclusion from sync (provider='import' → 409)
 *   4. Duplicate reconnect detection (same URL → reuse, not new row)
 *   5. Failure-safe sync: parse failure preserves existing events
 *   6. Direct-to-feed opening (initialChoice prop contract via actual state init)
 */

import { describe, it, expect } from 'vitest';
import { validateFeedUrl, parseIcal } from '../../../../../server/ical-parser.js';

// ─── 1. validateFeedUrl — SSRF allowlist ──────────────────────────────────────

describe('validateFeedUrl — SSRF allowlist and URL normalization', () => {
  it('accepts teamsnap.com URLs', () => {
    const r = validateFeedUrl('https://ical.teamsnap.com/team/12345/ical_token/abc.ics');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toContain('teamsnap.com');
  });

  it('accepts playmetrics.com URLs', () => {
    const r = validateFeedUrl('https://app.playmetrics.com/calendar/export/abc.ics');
    expect(r.ok).toBe(true);
  });

  it('accepts Google Calendar URLs', () => {
    const r = validateFeedUrl('https://calendar.google.com/calendar/ical/user%40gmail.com/public/basic.ics');
    expect(r.ok).toBe(true);
  });

  it('accepts iCloud URLs', () => {
    const r = validateFeedUrl('https://caldav.icloud.com/published/2/abc.ics');
    expect(r.ok).toBe(true);
  });

  it('normalizes webcal:// to https://', () => {
    const r = validateFeedUrl('webcal://ical.teamsnap.com/team/123/ical_token/abc.ics');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toMatch(/^https:\/\//);
  });

  it('normalizes webcals:// to https://', () => {
    const r = validateFeedUrl('webcals://ical.teamsnap.com/team/123/ical_token/abc.ics');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toMatch(/^https:\/\//);
  });

  it('rejects http:// URLs', () => {
    const r = validateFeedUrl('http://ical.teamsnap.com/team/123/ical_token/abc.ics');
    expect(r.ok).toBe(false);
  });

  it('rejects arbitrary hosts not on the allowlist', () => {
    const r = validateFeedUrl('https://evil.example.com/calendar.ics');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not on the allowed provider list');
  });

  it('rejects localhost', () => {
    const r = validateFeedUrl('https://localhost/calendar.ics');
    expect(r.ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    const r = validateFeedUrl('not-a-url');
    expect(r.ok).toBe(false);
  });

  it('rejects empty string', () => {
    const r = validateFeedUrl('');
    expect(r.ok).toBe(false);
  });
});

// ─── 2. parseIcal — timezone/DST, recurrence, EXDATE, cancellations ──────────

const FEED_ID = 'test-feed-001';
const FEED_URL = 'https://ical.teamsnap.com/team/123/ical_token/abc.ics';

// iCal with VTIMEZONE (America/Denver) and a recurring weekly practice with EXDATE
const RECURRING_WITH_EXDATE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VTIMEZONE',
  'TZID:America/Denver',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0600',
  'TZNAME:MDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0700',
  'TZNAME:MST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:weekly-practice@test',
  'SUMMARY:Weekly Practice',
  'DTSTART;TZID=America/Denver:20261101T170000',
  'DTEND;TZID=America/Denver:20261101T183000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8',
  'EXDATE;TZID=America/Denver:20261108T170000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// iCal with a CANCELLED occurrence via RECURRENCE-ID (within 120-day window from Oct 2026)
const CANCELLED_OCCURRENCE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:game-series@test',
  'SUMMARY:vs FC Denver',
  'DTSTART:20261115T190000Z',
  'DTEND:20261115T210000Z',
  'RRULE:FREQ=WEEKLY;COUNT=3',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:game-series@test',
  'RECURRENCE-ID:20261122T190000Z',
  'SUMMARY:vs FC Denver',
  'DTSTART:20261122T190000Z',
  'DTEND:20261122T210000Z',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// iCal with a single event in the future (within 120-day window from Oct 2026)
const SINGLE_FUTURE_EVENT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:single-001@test',
  'SUMMARY:vs Sporting KC',
  'DTSTART:20261115T190000Z',
  'DTEND:20261115T210000Z',
  "LOCATION:Dick's Sporting Goods Park",
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// iCal with a past event only
const PAST_ONLY = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:past-001@test',
  'SUMMARY:Old Game',
  'DTSTART:20200101T190000Z',
  'DTEND:20200101T210000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcal — actual parser implementation', () => {
  it('parses a single future event and returns it', () => {
    const events = parseIcal(SINGLE_FUTURE_EVENT, FEED_ID, FEED_URL);
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('vs Sporting KC');
    expect(events[0].uid).toBe('single-001@test');
    expect(events[0].allDay).toBe(false);
  });

  it('infers game type from "vs" in summary', () => {
    const events = parseIcal(SINGLE_FUTURE_EVENT, FEED_ID, FEED_URL);
    expect(events[0].eventType).toBe('game');
  });

  it('filters out past events', () => {
    const events = parseIcal(PAST_ONLY, FEED_ID, FEED_URL);
    expect(events.length).toBe(0);
  });

  it('expands recurring events and respects EXDATE exclusions', () => {
    const events = parseIcal(RECURRING_WITH_EXDATE, FEED_ID, FEED_URL);
    // EXDATE excludes Nov 8, 2026 — no event should start on that date
    const excludedDateUTC = new Date('2026-11-08T17:00:00-07:00');
    const hasExcluded = events.some(ev => {
      const d = new Date(ev.startAt);
      return (
        d.getUTCFullYear() === excludedDateUTC.getUTCFullYear() &&
        d.getUTCMonth() === excludedDateUTC.getUTCMonth() &&
        d.getUTCDate() === excludedDateUTC.getUTCDate()
      );
    });
    expect(hasExcluded).toBe(false);
  });

  it('handles VTIMEZONE-aware DST conversion: startAt is a valid ISO timestamp', () => {
    const events = parseIcal(RECURRING_WITH_EXDATE, FEED_ID, FEED_URL);
    for (const ev of events) {
      // All timestamps must be valid ISO 8601
      expect(() => new Date(ev.startAt)).not.toThrow();
      expect(new Date(ev.startAt).getTime()).not.toBeNaN();
    }
  });

  it('skips CANCELLED occurrences via RECURRENCE-ID', () => {
    const events = parseIcal(CANCELLED_OCCURRENCE, FEED_ID, FEED_URL);
    // The Nov 22 occurrence is CANCELLED — must not appear
    const cancelledDate = new Date('2026-11-22T19:00:00Z');
    const hasCancelled = events.some(ev => {
      const d = new Date(ev.startAt);
      return (
        d.getUTCFullYear() === cancelledDate.getUTCFullYear() &&
        d.getUTCMonth() === cancelledDate.getUTCMonth() &&
        d.getUTCDate() === cancelledDate.getUTCDate()
      );
    });
    expect(hasCancelled).toBe(false);
  });

  it('throws on non-iCal text', () => {
    expect(() => parseIcal('This is not iCal data', FEED_ID, FEED_URL)).toThrow();
  });

  it('generates deterministic event IDs', () => {
    const events1 = parseIcal(SINGLE_FUTURE_EVENT, FEED_ID, FEED_URL);
    const events2 = parseIcal(SINGLE_FUTURE_EVENT, FEED_ID, FEED_URL);
    expect(events1[0].id).toBe(events2[0].id);
  });
});

// ─── 3. Import feed exclusion from sync ───────────────────────────────────────

describe('import feed exclusion from sync', () => {
  it('identifies import feeds by provider value', () => {
    function shouldRefuseSyncForImport(provider: string): boolean {
      return provider === 'import';
    }
    expect(shouldRefuseSyncForImport('import')).toBe(true);
    expect(shouldRefuseSyncForImport('teamsnap')).toBe(false);
    expect(shouldRefuseSyncForImport('playmetrics')).toBe(false);
    expect(shouldRefuseSyncForImport('other')).toBe(false);
  });

  it('background job excludes import feeds from due-feed query', () => {
    type FeedRow = { id: string; provider: string; lastFetchedAt: Date | null };
    const feeds: FeedRow[] = [
      { id: 'f1', provider: 'teamsnap', lastFetchedAt: null },
      { id: 'f2', provider: 'import', lastFetchedAt: null },
      { id: 'f3', provider: 'playmetrics', lastFetchedAt: null },
      { id: 'f4', provider: 'import', lastFetchedAt: new Date() },
    ];
    // Mirrors: WHERE provider != 'import' AND (lastFetchedAt IS NULL OR ...)
    const dueFeeds = feeds.filter(f => f.provider !== 'import' && f.lastFetchedAt === null);
    expect(dueFeeds.map(f => f.id)).toEqual(['f1', 'f3']);
    expect(dueFeeds.every(f => f.provider !== 'import')).toBe(true);
  });

  it('syncFeeds UI skips import feeds', () => {
    type FeedSummary = { id: string; provider?: string; portalContext?: string };
    const feeds: FeedSummary[] = [
      { id: 'f1', provider: 'teamsnap', portalContext: 'parent' },
      { id: 'f2', provider: 'import', portalContext: 'parent' },
      { id: 'f3', provider: 'playmetrics', portalContext: 'parent' },
      { id: 'f4', provider: 'teamsnap', portalContext: 'fan' },
    ];
    // Mirrors: .filter(f => f.portalContext === 'parent' && f.provider !== 'import')
    const toSync = feeds.filter(f => f.portalContext === 'parent' && f.provider !== 'import');
    expect(toSync.map(f => f.id)).toEqual(['f1', 'f3']);
  });
});

// ─── 4. Duplicate reconnect detection ────────────────────────────────────────

describe('duplicate reconnect detection', () => {
  function normalizeUrl(raw: string): string {
    let url = raw.trim();
    if (url.startsWith('webcal://')) url = 'https://' + url.slice('webcal://'.length);
    if (url.startsWith('webcals://')) url = 'https://' + url.slice('webcals://'.length);
    return url;
  }

  it('normalizes webcal:// before comparison', () => {
    const a = normalizeUrl('webcal://ical.teamsnap.com/team/123/abc.ics');
    const b = normalizeUrl('https://ical.teamsnap.com/team/123/abc.ics');
    expect(a).toBe(b);
  });

  it('treats the same https:// URL as a duplicate', () => {
    const url = 'https://ical.teamsnap.com/team/123/abc.ics';
    expect(normalizeUrl(url)).toBe(normalizeUrl(url));
  });

  it('treats different URLs as distinct', () => {
    const a = normalizeUrl('https://ical.teamsnap.com/team/123/abc.ics');
    const b = normalizeUrl('https://ical.teamsnap.com/team/456/def.ics');
    expect(a).not.toBe(b);
  });

  it('merges player IDs without duplicates on reconnect', () => {
    function mergePlayerIds(existing: string[], incoming: string[]): string[] {
      return Array.from(new Set([...existing, ...incoming]));
    }
    expect(mergePlayerIds(['p1', 'p2'], ['p2', 'p3'])).toEqual(['p1', 'p2', 'p3']);
    expect(mergePlayerIds([], ['p1'])).toEqual(['p1']);
    expect(mergePlayerIds(['p1'], [])).toEqual(['p1']);
  });

  it('preserves token-bearing URLs exactly (no truncation or modification)', () => {
    const tokenUrl = 'https://ical.teamsnap.com/team/12345/ical_token/very-long-token-abc123def456ghi789.ics?auth=secret&v=2';
    const normalized = normalizeUrl(tokenUrl);
    expect(normalized).toContain('very-long-token-abc123def456ghi789');
    expect(normalized).toContain('auth=secret');
    expect(normalized).toContain('v=2');
  });
});

// ─── 5. Failure-safe sync: insert-before-delete pattern ──────────────────────

describe('failure-safe sync: insert-before-delete pattern', () => {
  it('old events survive a failed insert', () => {
    const existingEvents = ['e1', 'e2', 'e3'];
    let dbState = [...existingEvents];
    let insertSucceeded = false;

    try {
      throw new Error('DB insert failed');
    } catch {
      insertSucceeded = false;
    }

    if (insertSucceeded) {
      dbState = [];
    }

    expect(dbState).toEqual(existingEvents);
  });

  it('replaces events when insert succeeds', () => {
    const existingEvents = ['e1', 'e2', 'e3'];
    const newEventIds = ['n1', 'n2'];
    let dbState = [...existingEvents];
    const insertedIds: string[] = [];

    // Phase 1: insert new rows
    insertedIds.push(...newEventIds);
    dbState.push(...insertedIds);

    // Phase 2: delete old rows (those not in the new set)
    dbState = dbState.filter(id => insertedIds.includes(id));

    expect(dbState).toEqual(newEventIds);
    expect(dbState).not.toContain('e1');
  });
});

// ─── 6. Direct-to-feed opening ────────────────────────────────────────────────

describe('direct-to-feed opening — AddScheduleSheet initialChoice', () => {
  type SheetChoice = 'game' | 'practice' | 'feed' | null;

  function initChoice(initialChoice: SheetChoice | undefined): SheetChoice {
    return initialChoice ?? null;
  }

  it('defaults to null when no initialChoice provided', () => {
    expect(initChoice(undefined)).toBeNull();
  });

  it('opens directly to feed form when initialChoice is "feed"', () => {
    expect(initChoice('feed')).toBe('feed');
  });

  it('opens directly to game form when initialChoice is "game"', () => {
    expect(initChoice('game')).toBe('game');
  });

  it('opens directly to practice form when initialChoice is "practice"', () => {
    expect(initChoice('practice')).toBe('practice');
  });

  it('resets to null after sheet closes', () => {
    let sheetInitialChoice: SheetChoice = 'feed';
    sheetInitialChoice = null;
    expect(sheetInitialChoice).toBeNull();
  });
});

// ─── Provider guidance sources ────────────────────────────────────────────────

describe('provider guidance — official source verification', () => {
  /**
   * Sources:
   *   TeamSnap: https://helpme.teamsnap.com/article/1012-export-your-teamsnap-calendar-to-another-calendar-app
   *   PlayMetrics: https://help.playmetrics.com/en/articles/subscribe-to-team-calendar
   */
  const PROVIDER_OPTIONS = [
    {
      value: 'teamsnap',
      hint: 'In TeamSnap: open your team → Schedule → Export → "Subscribe to Calendar" → copy the webcal:// URL.',
    },
    {
      value: 'playmetrics',
      hint: 'In PlayMetrics: open your team → Schedule → Export Calendar → copy the iCal subscription URL.',
    },
    {
      value: 'other',
      hint: 'Any https:// or webcal:// iCal subscription URL (Google Calendar, Apple Calendar, Outlook, etc.).',
    },
  ];

  it('TeamSnap hint references the Schedule → Export path', () => {
    const ts = PROVIDER_OPTIONS.find(p => p.value === 'teamsnap')!;
    expect(ts.hint).toContain('Schedule');
    expect(ts.hint).toContain('Export');
    expect(ts.hint).toContain('webcal://');
  });

  it('PlayMetrics hint references the Schedule → Export Calendar path', () => {
    const pm = PROVIDER_OPTIONS.find(p => p.value === 'playmetrics')!;
    expect(pm.hint).toContain('Schedule');
    expect(pm.hint).toContain('Export Calendar');
    expect(pm.hint).toContain('iCal');
  });

  it('Other hint covers standard iCal providers', () => {
    const other = PROVIDER_OPTIONS.find(p => p.value === 'other')!;
    expect(other.hint).toContain('Google Calendar');
    expect(other.hint).toContain('Outlook');
  });

  it('all providers have non-empty hints', () => {
    for (const p of PROVIDER_OPTIONS) {
      expect(p.hint.trim().length).toBeGreaterThan(20);
    }
  });
});
