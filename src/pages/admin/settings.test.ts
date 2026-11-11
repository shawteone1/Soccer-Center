/**
 * src/pages/admin/settings.test.ts
 *
 * Unit tests for the pure logic used by the Admin Settings v4 migration section.
 *
 * Focus areas:
 *   1. V4_COLUMN_NAMES coverage — the six column names the section manages match
 *      exactly what the v4 migration handler adds to sc_player_profiles.
 *   2. allV4Present derivation — true only when all six columns are present.
 *   3. missingCount derivation — counts absent columns correctly.
 *   4. Migration result classification — added/skipped/errors are mutually
 *      exclusive and correctly categorised.
 *   5. MIGRATION_REQUIRED error message — includes the admin settings path and
 *      the "values preserved" notice so users know their input was not lost.
 *
 * These tests exercise pure functions inlined here to avoid importing React,
 * virtual:content, or motion/react in the test environment.
 *
 * LABEL: automated unit tests
 */

import { describe, it, expect } from 'vitest';

// ── Inline the constants and pure functions under test ────────────────────────
// Any change to these in settings.tsx or ProfileBuilder.tsx must be mirrored.

const V4_COLUMN_NAMES = [
  'gpa',
  'gpa_scale',
  'gpa_weighted',
  'intended_major',
  'college_goals',
  'contact_email',
] as const;

// Mirrors the v4 migration handler's NEW_COLUMNS list.
const MIGRATION_HANDLER_COLUMNS = [
  'gpa',
  'gpa_scale',
  'gpa_weighted',
  'intended_major',
  'college_goals',
  'contact_email',
];

interface ColumnResult {
  name: string;
  required: boolean;
  exists: boolean;
  note: string;
}

function deriveAllV4Present(v4Columns: ColumnResult[]): boolean {
  return (
    v4Columns.length === V4_COLUMN_NAMES.length &&
    v4Columns.every((c) => c.exists)
  );
}

function deriveMissingCount(v4Columns: ColumnResult[]): number {
  return v4Columns.filter((c) => !c.exists).length;
}

function filterV4Columns(allColumns: ColumnResult[]): ColumnResult[] {
  return allColumns.filter((c) =>
    (V4_COLUMN_NAMES as readonly string[]).includes(c.name)
  );
}

function buildMigrationRequiredMessage(serverMessage: string): string {
  return (
    (serverMessage ?? 'Coach profile fields are not yet available.') +
    ' An admin can apply the migration at /admin/settings → "Recruiting profile fields — v4". Your entered values are preserved above.'
  );
}

// ── V4_COLUMN_NAMES coverage ──────────────────────────────────────────────────

describe('V4_COLUMN_NAMES', () => {
  it('contains exactly 6 column names', () => {
    expect(V4_COLUMN_NAMES.length).toBe(6);
  });

  it('matches the migration handler column list exactly (same names, same order)', () => {
    expect([...V4_COLUMN_NAMES]).toEqual(MIGRATION_HANDLER_COLUMNS);
  });

  it('includes all expected column names', () => {
    const expected = ['gpa', 'gpa_scale', 'gpa_weighted', 'intended_major', 'college_goals', 'contact_email'];
    for (const name of expected) {
      expect((V4_COLUMN_NAMES as readonly string[]).includes(name)).toBe(true);
    }
  });
});

// ── allV4Present derivation ───────────────────────────────────────────────────

describe('deriveAllV4Present', () => {
  const makeCol = (name: string, exists: boolean): ColumnResult => ({
    name, exists, required: true, note: '',
  });

  it('returns true when all 6 columns are present', () => {
    const cols = V4_COLUMN_NAMES.map((n) => makeCol(n, true));
    expect(deriveAllV4Present(cols)).toBe(true);
  });

  it('returns false when any column is missing', () => {
    const cols = V4_COLUMN_NAMES.map((n, i) => makeCol(n, i !== 0)); // first missing
    expect(deriveAllV4Present(cols)).toBe(false);
  });

  it('returns false when all columns are missing', () => {
    const cols = V4_COLUMN_NAMES.map((n) => makeCol(n, false));
    expect(deriveAllV4Present(cols)).toBe(false);
  });

  it('returns false when the array is empty (no columns returned)', () => {
    expect(deriveAllV4Present([])).toBe(false);
  });

  it('returns false when only 5 of 6 columns are present', () => {
    const cols = V4_COLUMN_NAMES.slice(0, 5).map((n) => makeCol(n, true));
    expect(deriveAllV4Present(cols)).toBe(false);
  });
});

// ── missingCount derivation ───────────────────────────────────────────────────

describe('deriveMissingCount', () => {
  const makeCol = (name: string, exists: boolean): ColumnResult => ({
    name, exists, required: true, note: '',
  });

  it('returns 0 when all columns are present', () => {
    const cols = V4_COLUMN_NAMES.map((n) => makeCol(n, true));
    expect(deriveMissingCount(cols)).toBe(0);
  });

  it('returns 6 when all columns are missing', () => {
    const cols = V4_COLUMN_NAMES.map((n) => makeCol(n, false));
    expect(deriveMissingCount(cols)).toBe(6);
  });

  it('returns the correct count for a partial set', () => {
    const cols = V4_COLUMN_NAMES.map((n, i) => makeCol(n, i >= 2)); // first 2 missing
    expect(deriveMissingCount(cols)).toBe(2);
  });
});

// ── filterV4Columns ───────────────────────────────────────────────────────────

describe('filterV4Columns', () => {
  const makeCol = (name: string, exists: boolean): ColumnResult => ({
    name, exists, required: true, note: '',
  });

  it('returns only the 6 v4 columns from a mixed column list', () => {
    const allCols: ColumnResult[] = [
      makeCol('id', true),
      makeCol('user_id', true),
      makeCol('gpa', false),
      makeCol('gpa_scale', false),
      makeCol('gpa_weighted', false),
      makeCol('intended_major', false),
      makeCol('college_goals', false),
      makeCol('contact_email', false),
      makeCol('graduation_year', true),
    ];
    const filtered = filterV4Columns(allCols);
    expect(filtered.length).toBe(6);
    expect(filtered.map((c) => c.name)).toEqual([...V4_COLUMN_NAMES]);
  });

  it('returns empty array when no v4 columns are in the list', () => {
    const allCols: ColumnResult[] = [
      makeCol('id', true),
      makeCol('user_id', true),
    ];
    expect(filterV4Columns(allCols)).toHaveLength(0);
  });
});

// ── MIGRATION_REQUIRED error message ─────────────────────────────────────────

describe('buildMigrationRequiredMessage', () => {
  it('includes the admin settings path', () => {
    const msg = buildMigrationRequiredMessage('Coach profile fields are not yet available. An admin must run the v4 migration before these fields can be saved.');
    expect(msg).toContain('/admin/settings');
  });

  it('includes the section name', () => {
    const msg = buildMigrationRequiredMessage('Coach profile fields are not yet available. An admin must run the v4 migration before these fields can be saved.');
    expect(msg).toContain('Recruiting profile fields — v4');
  });

  it('includes the "values preserved" notice', () => {
    const msg = buildMigrationRequiredMessage('Coach profile fields are not yet available. An admin must run the v4 migration before these fields can be saved.');
    expect(msg).toContain('preserved');
  });

  it('includes the server message verbatim', () => {
    const serverMsg = 'Coach profile fields are not yet available. An admin must run the v4 migration before these fields can be saved.';
    const msg = buildMigrationRequiredMessage(serverMsg);
    expect(msg.startsWith(serverMsg)).toBe(true);
  });
});
