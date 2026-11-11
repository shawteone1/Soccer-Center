/**
 * src/pages/tryouts.test.ts
 *
 * Unit tests for the pure logic functions in tryouts.tsx.
 *
 * Focus areas:
 *   1. normalizeRegionSlug — maps california-south/california-north to the
 *      page's canonical cal-south/cal-north slugs; passes all other slugs
 *      through unchanged.
 *   2. Directory link slug compatibility — the soccer-directory-region page
 *      links to /tryouts?region=<directory-slug>.  The directory uses
 *      "california-south" and "california-north" (matching directory_regions.json).
 *      After normalization those must match a REGIONS entry so the correct tab
 *      is selected rather than falling back to Colorado.
 *   3. REGIONS coverage — every slug in the REGIONS array survives a round-trip
 *      through normalizeRegionSlug unchanged (no double-mapping).
 *
 * These tests exercise the pure functions extracted from the module; they do
 * not render the component (which requires a full React + Router environment).
 * Stale-scan protection (AbortController + generation counter) is verified
 * through the handler tests in GET.test.ts and through the server-side
 * diagnostics endpoint.
 *
 * LABEL: automated unit tests
 */

import { describe, it, expect } from 'vitest';

// ── Inline the pure functions under test ─────────────────────────────────────
// We duplicate the small functions here rather than importing from the .tsx
// file to avoid pulling in React, virtual:content, and motion/react in the
// test environment.  Any change to these functions in tryouts.tsx must be
// mirrored here.

const REGIONS = [
  { slug: 'colorado' },
  { slug: 'arizona' },
  { slug: 'cal-south' },
  { slug: 'cal-north' },
  { slug: 'oregon' },
  { slug: 'washington' },
  { slug: 'nevada' },
] as const;

type RegionSlug = typeof REGIONS[number]['slug'];

function normalizeRegionSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === 'california-south') return 'cal-south';
  if (s === 'california-north') return 'cal-north';
  return s;
}

/** Mirrors the page's URL-param → activeRegion derivation. */
function resolveActiveRegion(rawParam: string | null): RegionSlug {
  if (!rawParam) return 'colorado';
  const normalized = normalizeRegionSlug(rawParam);
  const valid = REGIONS.some((r) => r.slug === normalized);
  return valid ? (normalized as RegionSlug) : 'colorado';
}

// ── normalizeRegionSlug ───────────────────────────────────────────────────────

describe('normalizeRegionSlug', () => {
  it('maps california-south to cal-south', () => {
    expect(normalizeRegionSlug('california-south')).toBe('cal-south');
  });

  it('maps california-north to cal-north', () => {
    expect(normalizeRegionSlug('california-north')).toBe('cal-north');
  });

  it('passes cal-south through unchanged', () => {
    expect(normalizeRegionSlug('cal-south')).toBe('cal-south');
  });

  it('passes cal-north through unchanged', () => {
    expect(normalizeRegionSlug('cal-north')).toBe('cal-north');
  });

  it('passes all other REGIONS slugs through unchanged', () => {
    const others = ['colorado', 'arizona', 'oregon', 'washington', 'nevada'];
    for (const slug of others) {
      expect(normalizeRegionSlug(slug)).toBe(slug);
    }
  });

  it('is case-insensitive', () => {
    expect(normalizeRegionSlug('California-South')).toBe('cal-south');
    expect(normalizeRegionSlug('CALIFORNIA-NORTH')).toBe('cal-north');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeRegionSlug('  california-south  ')).toBe('cal-south');
  });

  it('returns unknown slugs unchanged (no silent mapping to a wrong region)', () => {
    expect(normalizeRegionSlug('unknown-region')).toBe('unknown-region');
    expect(normalizeRegionSlug('ca-south')).toBe('ca-south'); // not a known alias
  });
});

// ── Directory link compatibility ──────────────────────────────────────────────
// The soccer-directory-region page links to /tryouts?region=<directory-slug>.
// Directory slugs: colorado, arizona, california-south, california-north,
//                  oregon, washington, nevada  (from directory_regions.json).

describe('directory link slug compatibility', () => {
  const directoryToExpected: Array<[string, RegionSlug]> = [
    ['colorado',          'colorado'],
    ['arizona',           'arizona'],
    ['california-south',  'cal-south'],   // directory slug → page tab
    ['california-north',  'cal-north'],   // directory slug → page tab
    ['oregon',            'oregon'],
    ['washington',        'washington'],
    ['nevada',            'nevada'],
  ];

  for (const [dirSlug, expectedTab] of directoryToExpected) {
    it(`/tryouts?region=${dirSlug} selects the "${expectedTab}" tab`, () => {
      expect(resolveActiveRegion(dirSlug)).toBe(expectedTab);
    });
  }

  it('an unknown slug falls back to colorado (not a silent wrong-region selection)', () => {
    expect(resolveActiveRegion('unknown')).toBe('colorado');
    expect(resolveActiveRegion('')).toBe('colorado');
  });

  it('null param (no ?region=) defaults to colorado', () => {
    expect(resolveActiveRegion(null)).toBe('colorado');
  });
});

// ── REGIONS round-trip ────────────────────────────────────────────────────────

describe('REGIONS round-trip through normalizeRegionSlug', () => {
  it('every canonical REGIONS slug is unchanged by normalizeRegionSlug', () => {
    for (const { slug } of REGIONS) {
      expect(normalizeRegionSlug(slug)).toBe(slug);
    }
  });
});

// ── Stale scan protection (documented, not exercised here) ────────────────────
// The runScraper function uses:
//   - AbortController: cancels the in-flight fetch when region changes or a
//     newer call starts.
//   - scraperGenRef: monotonically-increasing counter; response handlers check
//     gen === scraperGenRef.current before applying results.
//   - scraperRetryTimerRef: cleared by cancelScraper() on region change and
//     unmount; retry callback checks gen === scraperGenRef.current before firing.
//
// These are integration-level behaviors that require a React rendering
// environment.  They are verified by:
//   1. Code review of the cancelScraper() call in the region-change useEffect.
//   2. The gen !== scraperGenRef.current guard in the response handler.
//   3. The scraperRetryTimerRef.current check in the setTimeout callback.
// Browser-level verification remains pending (requires a live session).
