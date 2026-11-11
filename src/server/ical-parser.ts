import { fetchPublicText } from './lib/safe-outbound-text.js';
/**
 * ical-parser.ts
 *
 * Fetches a private iCal subscription URL (server-side only) and parses
 * VEVENT blocks into CalendarEvent objects using ical.js for full RFC 5545
 * compliance: RRULE recurrence, EXDATE exclusions, moved/cancelled occurrences,
 * all-day dates, DST-aware timezone handling.
 *
 * Security constraints (all preserved from original):
 *   - HTTPS-only (normalizes webcal:// and webcals://)
 *   - Provider-host allowlist (TeamSnap, PlayMetrics, Google, Apple, Outlook,
 *     Yahoo, iCloud, and common calendar hosts)
 *   - 30-second fetch timeout
 *   - 2 MB response size cap
 *   - No private/RFC-1918 IP addresses (DNS rebinding protection)
 *   - Raw URL never logged or returned to the browser
 *
 * Limits (matching reference spec):
 *   - 2,000 VEVENT components max
 *   - 50,000 recurrence expansion steps max
 *   - 5,000 output occurrences max
 *   - Window: 30 days past → 120 days future
 */

import ICAL from 'ical.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;           // deterministic: feedId::uid::occurrence-key
  feedId: string;
  uid: string;
  title: string;
  startAt: string;      // ISO 8601
  endAt: string;        // ISO 8601
  allDay: boolean;
  location?: string;
  description?: string;
  provider: string;
  teamName?: string;
  eventType: string;    // 'game' | 'practice' | 'event' | 'other'
  status: string;       // 'confirmed' | 'cancelled' | 'tentative'
  sequence: number;
}

// ─── Allowlist ────────────────────────────────────────────────────────────────
// Only these hostnames (and their subdomains) may be used as feed URLs.
// Add new providers here after a narrow review — never allow arbitrary hosts.

const ALLOWED_HOST_SUFFIXES: string[] = [
  // TeamSnap — official CDN host per reference spec
  'teamsnap.com',
  // PlayMetrics — official host per reference spec
  'playmetrics.com',
  // Google Calendar
  'calendar.google.com',
  'google.com',
  // Apple / iCloud
  'icloud.com',
  'apple.com',
  'caldav.icloud.com',
  // Microsoft / Outlook
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'office365.com',
  // Yahoo
  'calendar.yahoo.com',
  'yahoo.com',
  // Fastmail
  'fastmail.com',
  'fastmail.fm',
  // Proton
  'proton.me',
  'protonmail.com',
  // Zoho
  'zoho.com',
  // Generic CalDAV / webcal aggregators
  'caldav.calendar.yahoo.com',
];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}

// ─── URL validation ───────────────────────────────────────────────────────────

export function validateFeedUrl(raw: string): { ok: true; normalized: string } | { ok: false; error: string } {
  let urlStr = raw.trim();

  // Normalise webcal:// → https://
  if (urlStr.startsWith('webcal://')) {
    urlStr = 'https://' + urlStr.slice('webcal://'.length);
  }
  if (urlStr.startsWith('webcals://')) {
    urlStr = 'https://' + urlStr.slice('webcals://'.length);
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Feed URL must use HTTPS (or webcal://)' };
  }

  if (!isAllowedHost(parsed.hostname)) {
    return {
      ok: false,
      error:
        `Host "${parsed.hostname}" is not on the allowed provider list. ` +
        'Supported: TeamSnap, PlayMetrics, Google Calendar, Apple iCloud, Outlook, Yahoo, Fastmail, Proton, Zoho.',
    };
  }

  return { ok: true, normalized: urlStr };
}

// ─── iCal fetch ───────────────────────────────────────────────────────────────

export async function fetchIcalText(url: string): Promise<string> {
  const validated = validateFeedUrl(url);
  if (!validated.ok) throw new Error(validated.error);
  return fetchPublicText(validated.normalized);
}

// ─── iCal parser (ical.js-backed) ────────────────────────────────────────────

const MAX_COMPONENTS  = 2_000;
const MAX_STEPS       = 50_000;
const MAX_OCCURRENCES = 5_000;
const WINDOW_PAST_DAYS   = 30;
const WINDOW_FUTURE_DAYS = 120;

/** Infer event type from SUMMARY / CATEGORIES. */
function inferEventType(summary: string, categories: string): string {
  const s = (summary + ' ' + categories).toLowerCase();
  if (/\bgame\b|\bmatch\b|\bvs\.?\b/.test(s)) return 'game';
  if (/\bpractice\b|\btraining\b|\bworkout\b|\bdrills?\b/.test(s)) return 'practice';
  if (/\btournament\b|\bcup\b|\bfestival\b/.test(s)) return 'event';
  return 'other';
}

/** Infer provider label from the calendar URL hostname. */
function inferProvider(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('teamsnap')) return 'teamsnap';
    if (h.includes('playmetrics')) return 'playmetrics';
    if (h.includes('google')) return 'google';
    if (h.includes('icloud') || h.includes('apple')) return 'icloud';
    if (h.includes('outlook') || h.includes('office365')) return 'outlook';
    if (h.includes('yahoo')) return 'yahoo';
  } catch { /* ignore */ }
  return 'other';
}

/**
 * Parse an iCal text string into CalendarEvent objects.
 * Uses ical.js for full RFC 5545 compliance:
 *   - RRULE recurrence expansion
 *   - EXDATE exclusions
 *   - RECURRENCE-ID overrides (moved/cancelled occurrences)
 *   - All-day DATE values
 *   - VTIMEZONE-aware DST handling
 */
export function parseIcal(icalText: string, feedId: string, feedUrl: string): CalendarEvent[] {
  // Basic sanity check
  if (!/BEGIN:VCALENDAR/i.test(icalText)) {
    throw new Error('The URL did not return an iCalendar feed.');
  }

  const provider = inferProvider(feedUrl);
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_PAST_DAYS * 86400_000);
  const windowEnd   = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400_000);

  // Reset timezone registry so feeds don't bleed into each other
  ICAL.TimezoneService.reset();

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(icalText));
  } catch (err) {
    throw new Error(`Failed to parse iCalendar feed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Register all VTIMEZONE components
  for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
    const tzid = vtimezone.getFirstPropertyValue('tzid') as string | null;
    if (tzid) {
      ICAL.TimezoneService.register(new ICAL.Timezone({ component: vtimezone, tzid }), tzid);
    }
  }

  const vevents = root.getAllSubcomponents('vevent');
  if (vevents.length > MAX_COMPONENTS) {
    throw new Error(`Feed has too many event components (${vevents.length} > ${MAX_COMPONENTS}).`);
  }

  const output: CalendarEvent[] = [];
  let steps = 0;

  for (const vevent of vevents) {
    // Skip RECURRENCE-ID overrides — ical.js Event.getOccurrenceDetails() handles them
    if (vevent.hasProperty('recurrence-id')) continue;

    const event = new ICAL.Event(vevent);
    if (!event.uid || !event.startDate) continue;

    const uid = event.uid;
    const summary = event.summary ?? 'Soccer Event';
    const categories = (vevent.getFirstPropertyValue('categories') as string | null) ?? '';
    const location = (vevent.getFirstPropertyValue('location') as string | null) ?? undefined;
    const description = (vevent.getFirstPropertyValue('description') as string | null) ?? undefined;
    const eventType = inferEventType(summary, categories);

    const iter = event.iterator();
    let next: ICAL.Time | null;

    while ((next = iter.next())) {
      if (++steps > MAX_STEPS) {
        throw new Error('Recurrence expansion limit exceeded.');
      }

      const details = event.getOccurrenceDetails(next);
      const item = details.item;

      // Occurrence-level status (CANCELLED overrides)
      const statusRaw = ((item.component.getFirstPropertyValue('status') as string | null) ?? '').toUpperCase();
      if (statusRaw === 'CANCELLED') continue;

      const startDate = details.startDate;
      const endDate   = details.endDate;

      // Convert to JS Date for window comparison
      const startMs = startDate.toJSDate().getTime();
      const endMs   = endDate.toJSDate().getTime();

      // Stop iterating once we're past the window (and the nominal occurrence is also past)
      const nominalMs = next.toJSDate().getTime();
      if (nominalMs > windowEnd.getTime() && startMs > windowEnd.getTime()) break;

      // Skip occurrences outside the window
      if (endMs < windowStart.getTime() || startMs > windowEnd.getTime()) continue;

      const allDay = startDate.isDate;
      const startAt = allDay
        ? startDate.toString().slice(0, 10)
        : startDate.toJSDate().toISOString();
      const endAt = allDay
        ? endDate.toString().slice(0, 10)
        : endDate.toJSDate().toISOString();

      const sequenceRaw = (item.component.getFirstPropertyValue('sequence') as number | null) ?? 0;
      const sequence = typeof sequenceRaw === 'number' ? sequenceRaw : 0;

      const statusOut = (['confirmed', 'tentative'].includes(statusRaw.toLowerCase()))
        ? statusRaw.toLowerCase()
        : 'confirmed';

      // Deterministic ID: feedId + uid + occurrence start
      const occKey = next.toString();
      const id = `${feedId}::${uid}::${occKey}`;

      output.push({
        id,
        feedId,
        uid,
        title: String(summary).slice(0, 300),
        startAt,
        endAt,
        allDay,
        location: location ? String(location).slice(0, 500) : undefined,
        description: description ? String(description).slice(0, 2000) : undefined,
        provider,
        eventType,
        status: statusOut,
        sequence,
      });

      if (output.length > MAX_OCCURRENCES) {
        throw new Error(`Feed has too many event occurrences (> ${MAX_OCCURRENCES}).`);
      }
    }
  }

  return output.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ─── Combined fetch + parse ───────────────────────────────────────────────────

export async function fetchAndParseIcal(
  url: string,
  feedId: string,
): Promise<CalendarEvent[]> {
  const text = await fetchIcalText(url);
  return parseIcal(text, feedId, url);
}
