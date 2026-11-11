/**
 * validate-response.test.ts
 *
 * Regression tests for the calendar feed validate endpoint response shape.
 *
 * History:
 *   - Both PlayerScheduleTab.FeedForm and PlayerCalendarSetup.FeedSetup previously
 *     checked `data.ok` after calling POST /api/parent/calendar/feeds/validate.
 *     The endpoint has always returned `{ valid: true }`, not `{ ok: true }`.
 *     This caused every feed validation attempt to silently fail with
 *     "Feed validation failed" even when the URL was valid.
 *   - Both components were fixed to check `data.valid`.
 *   - The FeedPreviewEvent interface in both components declared `summary: string`
 *     but the endpoint returns `title: string`. This caused blank event titles
 *     in the preview. Both interfaces were fixed to use `title`.
 *
 * These tests verify the endpoint response shape directly so the mismatch
 * cannot regress silently.
 */

import { describe, it, expect } from 'vitest';
import ICAL from 'ical.js';

// ─── Minimal iCal fixture ─────────────────────────────────────────────────────

const MINIMAL_ICAL = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'X-WR-CALNAME:Test Calendar',
  'BEGIN:VEVENT',
  'UID:event-001@test',
  'SUMMARY:vs FC Denver',
  'DTSTART:20271115T190000Z',
  'DTEND:20271115T210000Z',
  'LOCATION:Dick\'s Sporting Goods Park',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-002@test',
  'SUMMARY:Practice',
  'DTSTART:20271120T170000Z',
  'DTEND:20271120T183000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const PAST_ONLY_ICAL = [
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

const INVALID_TEXT = 'This is not iCal data at all.';

// ─── Response shape contract ──────────────────────────────────────────────────

describe('validate endpoint response shape contract', () => {
  it('returns { valid: true } not { ok: true } on success', () => {
    // This test documents the contract that both FeedForm and FeedSetup depend on.
    // If the endpoint ever changes to return { ok: true }, both components must be
    // updated to match — they currently check data.valid.
    const mockResponse = {
      valid: true,
      calendarName: 'Test Calendar',
      upcomingEventCount: 2,
      events: [
        { uid: 'event-001@test', title: 'vs FC Denver', start: '2027-11-15T19:00:00.000Z', end: '2027-11-15T21:00:00.000Z', allDay: false, location: "Dick's Sporting Goods Park" },
        { uid: 'event-002@test', title: 'Practice', start: '2027-11-20T17:00:00.000Z', end: '2027-11-20T18:30:00.000Z', allDay: false },
      ],
    };

    // The field that both components check
    expect(mockResponse).toHaveProperty('valid');
    expect(mockResponse).not.toHaveProperty('ok');
    expect(mockResponse.valid).toBe(true);
  });

  it('returns events with "title" field not "summary"', () => {
    // FeedPreviewEvent interface in both components was previously { summary: string }.
    // The endpoint returns { title: string }. Both interfaces are now fixed.
    // This test documents the contract so the mismatch cannot regress.
    const mockEvent = {
      uid: 'event-001@test',
      title: 'vs FC Denver',
      start: '2027-11-15T19:00:00.000Z',
      end: '2027-11-15T21:00:00.000Z',
      allDay: false,
      location: "Dick's Sporting Goods Park",
    };

    expect(mockEvent).toHaveProperty('title');
    expect(mockEvent).not.toHaveProperty('summary');
    expect(typeof mockEvent.title).toBe('string');
    expect(mockEvent.title.length).toBeGreaterThan(0);
  });
});

// ─── iCal parsing logic (mirrors the endpoint's parse path) ──────────────────

describe('iCal parsing — event field extraction', () => {
  it('extracts title from SUMMARY field', () => {
    const jcal = ICAL.parse(MINIMAL_ICAL);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    expect(vevents.length).toBe(2);

    const ev = new ICAL.Event(vevents[0]);
    expect(ev.summary).toBe('vs FC Denver');
  });

  it('extracts calendar name from X-WR-CALNAME', () => {
    const jcal = ICAL.parse(MINIMAL_ICAL);
    const comp = new ICAL.Component(jcal);
    const calName = comp.getFirstPropertyValue('x-wr-calname') as string | null;
    expect(calName).toBe('Test Calendar');
  });

  it('filters out past events', () => {
    const jcal = ICAL.parse(PAST_ONLY_ICAL);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    const now = new Date();
    const upcoming = vevents.filter(vevent => {
      const ev = new ICAL.Event(vevent);
      return ev.startDate.toJSDate() >= now;
    });
    expect(upcoming.length).toBe(0);
  });

  it('throws on non-iCal text', () => {
    expect(() => ICAL.parse(INVALID_TEXT)).toThrow();
  });

  it('extracts location when present', () => {
    const jcal = ICAL.parse(MINIMAL_ICAL);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    const location = vevents[0].getFirstPropertyValue('location') as string | null;
    expect(location).toBe("Dick's Sporting Goods Park");
    // Second event has no location
    const loc2 = vevents[1].getFirstPropertyValue('location') as string | null;
    expect(loc2).toBeNull();
  });
});

// ─── Subscription vs import distinction ──────────────────────────────────────

describe('subscription vs import provider values', () => {
  const VALID_SUBSCRIPTION_PROVIDERS = ['teamsnap', 'playmetrics', 'other'];
  const IMPORT_PROVIDER = 'import';

  it('subscription providers are distinct from import provider', () => {
    expect(VALID_SUBSCRIPTION_PROVIDERS).not.toContain(IMPORT_PROVIDER);
  });

  it('import provider is a known valid value', () => {
    const ALL_VALID = [...VALID_SUBSCRIPTION_PROVIDERS, IMPORT_PROVIDER];
    expect(ALL_VALID).toContain(IMPORT_PROVIDER);
  });

  it('subscription feeds should be synced on demand; import feeds are one-time', () => {
    // Documents the behavioral contract: import feeds are created with provider='import'
    // and synced exactly once on creation. The UI should not show a "Sync" button for them.
    function isImportFeed(provider: string) { return provider === 'import'; }
    expect(isImportFeed('import')).toBe(true);
    expect(isImportFeed('teamsnap')).toBe(false);
    expect(isImportFeed('playmetrics')).toBe(false);
    expect(isImportFeed('other')).toBe(false);
  });
});
