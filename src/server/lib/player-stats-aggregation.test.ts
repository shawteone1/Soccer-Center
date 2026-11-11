/**
 * src/server/lib/player-stats-aggregation.test.ts
 *
 * Unit tests for the shared server-side stats aggregation function.
 * Covers the acceptance matrix items from the spec:
 *   - Only participated=true records are counted
 *   - seasonTotalsOverride=true records are excluded
 *   - Season filter works correctly
 *   - Coverage label is accurate
 *   - Null stats are handled correctly (not counted as zero)
 */

import { describe, it, expect } from 'vitest';
import { aggregateMatchRecords, type RawMatchRecord } from './player-stats-aggregation';

function makeRecord(overrides: Partial<RawMatchRecord> = {}): RawMatchRecord {
  return {
    statGp:               null,
    statGoals:            null,
    statAssists:          null,
    statShots:            null,
    statGa:               null,
    statSaves:            null,
    statSo:               null,
    participated:         true,
    seasonTotalsOverride: false,
    season:               '2026-27',
    positionPlayed:       null,
    matchDate:            null,
    opponent:             null,
    ...overrides,
  };
}

describe('aggregateMatchRecords', () => {
  it('returns zero games and null stats for empty input', () => {
    const result = aggregateMatchRecords([], null);
    expect(result.gamesPlayed).toBe(0);
    expect(result.goals).toBeNull();
    expect(result.assists).toBeNull();
    expect(result.coverage).toBe('none');
    expect(result.excludedCount).toBe(0);
  });

  it('counts only participated=true records', () => {
    const records = [
      makeRecord({ participated: true,  statGoals: 2 }),
      makeRecord({ participated: false, statGoals: 5 }),
      makeRecord({ participated: true,  statGoals: 1 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.gamesPlayed).toBe(2);
    expect(result.goals).toBe(3);
    expect(result.excludedCount).toBe(1);
  });

  it('excludes seasonTotalsOverride=true records', () => {
    const records = [
      makeRecord({ seasonTotalsOverride: false, statGoals: 3 }),
      makeRecord({ seasonTotalsOverride: true,  statGoals: 10 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.gamesPlayed).toBe(1);
    expect(result.goals).toBe(3);
    expect(result.excludedCount).toBe(1);
  });

  it('excludes records that are both not-participated and override', () => {
    const records = [
      makeRecord({ participated: false, seasonTotalsOverride: true, statGoals: 99 }),
      makeRecord({ participated: true,  seasonTotalsOverride: false, statGoals: 2 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.gamesPlayed).toBe(1);
    expect(result.goals).toBe(2);
    expect(result.excludedCount).toBe(1);
  });

  it('filters by season when season is provided', () => {
    const records = [
      makeRecord({ season: '2026-27', statGoals: 4 }),
      makeRecord({ season: '2025-26', statGoals: 7 }),
      makeRecord({ season: '2026-27', statGoals: 2 }),
    ];
    const result = aggregateMatchRecords(records, '2026-27');
    expect(result.gamesPlayed).toBe(2);
    expect(result.goals).toBe(6);
    expect(result.season).toBe('2026-27');
  });

  it('returns all records when season is null', () => {
    const records = [
      makeRecord({ season: '2026-27', statGoals: 4 }),
      makeRecord({ season: '2025-26', statGoals: 7 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.gamesPlayed).toBe(2);
    expect(result.goals).toBe(11);
    expect(result.season).toBeNull();
  });

  it('keeps null for a stat that no included record has set', () => {
    const records = [
      makeRecord({ statGoals: 1, statAssists: null }),
      makeRecord({ statGoals: 2, statAssists: null }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.goals).toBe(3);
    expect(result.assists).toBeNull();
  });

  it('accumulates a stat that only some records have set', () => {
    const records = [
      makeRecord({ statGoals: 1, statAssists: 2 }),
      makeRecord({ statGoals: 1, statAssists: null }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.goals).toBe(2);
    expect(result.assists).toBe(2); // only one record contributed
  });

  it('reports coverage=full when no records are excluded', () => {
    const records = [
      makeRecord({ statGoals: 1 }),
      makeRecord({ statGoals: 2 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.coverage).toBe('full');
  });

  it('reports coverage=partial when some records are excluded', () => {
    const records = [
      makeRecord({ participated: true,  statGoals: 1 }),
      makeRecord({ participated: false, statGoals: 5 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.coverage).toBe('partial');
  });

  it('reports coverage=none when input is empty', () => {
    const result = aggregateMatchRecords([], null);
    expect(result.coverage).toBe('none');
  });

  it('goalkeeper stats accumulate correctly', () => {
    const records = [
      makeRecord({ statGa: 1, statSaves: 5, statSo: 1 }),
      makeRecord({ statGa: 2, statSaves: 3, statSo: 0 }),
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.goalsAgainst).toBe(3);
    expect(result.saves).toBe(8);
    expect(result.shutouts).toBe(1);
  });
});
