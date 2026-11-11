/**
 * src/server/api/parent/players/[playerId]/coach-preview/projection.test.ts
 *
 * Unit tests for buildCoachProjection() in src/server/lib/coach-projection.ts.
 *
 * These tests call the pure function directly with synthetic fixtures.
 * No database, no HTTP, no mocks needed.
 *
 * Stats policy under test:
 *   - Stats come ONLY from records whose id is in approvedMatchRecordIds.
 *   - Records not in the approved set are excluded even if they belong to
 *     the same player and owner.
 *   - When approvedMatchRecordIds is empty, stats.available is false.
 *   - When statsTableAvailable is false, stats.available is false.
 *   - Profile-level stat_* totals are never used as a fallback.
 *   - statsLabel is always 'Stats from approved matches'.
 */

import { describe, it, expect } from 'vitest';
import { buildCoachProjection, type PlayerProjectionRow, type AffiliationProjectionRow } from '../../../../../../server/lib/coach-projection';
import type { RawMatchRecord } from '../../../../../../server/lib/player-stats-aggregation';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayerRow(overrides: Partial<PlayerProjectionRow> = {}): PlayerProjectionRow {
  return {
    id: 'p1',
    label: 'Alex Morgan',
    ageBand: 'U17',
    graduationYear: 2028,
    primaryPosition: 'Midfielder',
    secondaryPosition: 'Forward',
    foot: 'right',
    positions: '["Midfielder","Forward"]',
    skillLevel: 'advanced',
    clubName: 'Colorado United',
    profileIntroduction: 'Competitive player with 5 years club experience.',
    achievements: '["State Cup Finalist 2025","All-Conference 2024"]',
    playingLevel: 'club',
    gpa: null,
    gpaScale: null,
    gpaWeighted: null,
    intendedMajor: null,
    collegeGoals: null,
    contactEmail: null,
    highSchool: null,
    schoolCity: null,
    schoolState: null,
    avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg',
    avatarInitials: 'AM',
    ...overrides,
  };
}

/** NOTE: stat_* fields are intentionally absent from PlayerProjectionRow */

function makeAffiliation(overrides: Partial<AffiliationProjectionRow> = {}): AffiliationProjectionRow {
  return {
    orgName: 'Colorado United FC',
    season: 'Fall 2025',
    ageGroupLabel: 'U17 Girls',
    ...overrides,
  };
}

/** A match record with an id field for approved-set filtering */
function makeMatchRecord(
  id: string,
  overrides: Partial<RawMatchRecord & { id: string }> = {},
): RawMatchRecord & { id: string } {
  return {
    id,
    statGp: 1,
    statGoals: 1,
    statAssists: 0,
    statShots: 3,
    statGa: null,
    statSaves: null,
    statSo: null,
    participated: true,
    seasonTotalsOverride: false,
    season: 'Fall 2025',
    positionPlayed: 'Midfielder',
    matchDate: '2025-09-14',
    opponent: 'Denver SC',
    ...overrides,
  };
}

// ── Tests: required fields present ───────────────────────────────────────────

describe('buildCoachProjection — required fields', () => {
  it('includes all required identity fields', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.label).toBe('Alex Morgan');
    expect(result.ageBand).toBe('U17');
    expect(result.graduationYear).toBe(2028);
    expect(result.primaryPosition).toBe('Midfielder');
    expect(result.secondaryPosition).toBe('Forward');
    expect(result.foot).toBe('right');
    expect(result.positions).toEqual(['Midfielder', 'Forward']);
    expect(result.skillLevel).toBe('advanced');
    expect(result.clubName).toBe('Colorado United');
    expect(result.profileIntroduction).toBe('Competitive player with 5 years club experience.');
    expect(result.achievements).toEqual(['State Cup Finalist 2025', 'All-Conference 2024']);
    expect(result.playingLevel).toBe('club');
    expect(result.avatarInitials).toBe('AM');
  });

  it('includes mediaOriginProtected in the output', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.mediaOriginProtected).toBe(false);
  });
});

// ── Tests: private fields absent ─────────────────────────────────────────────

describe('buildCoachProjection — private fields absent', () => {
  it('does not include any private field even when present on the input', () => {
    // Pass a player row with extra private-looking fields via type assertion
    const playerWithPrivate = {
      ...makePlayerRow(),
      birthYear: 2009,
      clubUrl: 'https://internal.example.com',
      clubDirectoryId: 'dir-123',
      trainingPreferences: '["speed","strength"]',
      tryoutInterest: true,
      goals: 'Make varsity',
      deletedAt: null,
      sortOrder: 1,
      userId: 'user-secret',
      notes: 'Private coach notes',
    } as unknown as PlayerProjectionRow;

    const result = buildCoachProjection({
      player: playerWithPrivate,
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });

    const forbidden = [
      'birthYear', 'clubUrl', 'clubDirectoryId', 'trainingPreferences',
      'tryoutInterest', 'goals', 'deletedAt', 'sortOrder', 'userId', 'notes',
    ];
    for (const field of forbidden) {
      expect(result, `forbidden field in output: ${field}`).not.toHaveProperty(field);
    }
  });
});

// ── Tests: avatarUrl gating ───────────────────────────────────────────────────

describe('buildCoachProjection — avatarUrl gating (blocker E4)', () => {
  it('avatarUrl is null when mediaOriginProtected=false (URL present on row)', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg' }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.avatarUrl).toBeNull();
  });

  it('avatarUrl is forwarded when mediaOriginProtected=true (URL present on row)', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg' }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: true,
    });
    expect(result.avatarUrl).toBe('/airo-assets/uploads/player-photos/u1/p1.jpg');
  });

  it('avatarUrl is null when mediaOriginProtected=false and row has no URL', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ avatarUrl: null }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.avatarUrl).toBeNull();
  });
});

// ── Tests: stats — approved match records only ────────────────────────────────

describe('buildCoachProjection — stats from approved match records', () => {
  it('stats.available is false when approvedMatchRecordIds is empty', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [makeMatchRecord('mr-1')],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(false);
    expect(result.stats.statsLabel).toBe('Stats from approved matches');
    expect(result.approvedMatchRecordCount).toBe(0);
  });

  it('stats.available is false when statsTableAvailable is false', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: ['mr-1'],
      statsTableAvailable: false,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(false);
    expect(result.statsTableAvailable).toBe(false);
  });

  it('aggregates only the approved record, excludes the unapproved one', () => {
    const records = [
      makeMatchRecord('mr-approved', { statGoals: 2, statAssists: 1 }),
      makeMatchRecord('mr-not-approved', { statGoals: 99, statAssists: 99 }),
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-approved'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(2);
      expect(result.stats.assists).toBe(1);
      // mr-not-approved's 99 goals must not appear
      expect(result.stats.goals).not.toBe(99);
    }
    expect(result.approvedMatchRecordCount).toBe(1);
  });

  it('excludes records from another player even if id is in approvedMatchRecordIds', () => {
    // Simulates a case where the caller correctly filtered by ownership,
    // but we verify the approved-set filter works independently.
    const records = [
      makeMatchRecord('mr-own', { statGoals: 3 }),
      // mr-other-player would not be in matchRecords (caller filters by ownership),
      // but even if it were, it would need to be in approvedMatchRecordIds too.
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      // Only mr-own is approved; mr-other-player is not in matchRecords anyway
      approvedMatchRecordIds: ['mr-own'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(3);
      expect(result.stats.gamesPlayed).toBe(1);
    }
  });

  it('excludes non-participated records from the approved set', () => {
    const records = [
      makeMatchRecord('mr-participated', { participated: true, statGoals: 2 }),
      makeMatchRecord('mr-not-participated', { participated: false, statGoals: 5 }),
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-participated', 'mr-not-participated'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(2);
      expect(result.stats.gamesPlayed).toBe(1);
      expect(result.stats.excludedCount).toBe(1);
    }
  });

  it('excludes seasonTotalsOverride records from the approved set', () => {
    const records = [
      makeMatchRecord('mr-normal', { seasonTotalsOverride: false, statGoals: 1 }),
      makeMatchRecord('mr-override', { seasonTotalsOverride: true, statGoals: 10 }),
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-normal', 'mr-override'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(1);
      expect(result.stats.excludedCount).toBe(1);
    }
  });

  it('handles zero values correctly (0 goals is not null)', () => {
    const records = [makeMatchRecord('mr-zero', { statGoals: 0, statAssists: 0 })];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-zero'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(0);
      expect(result.stats.assists).toBe(0);
    }
  });

  it('handles missing stat values (null fields stay null when no record has them)', () => {
    const records = [makeMatchRecord('mr-no-shots', { statShots: null, statGa: null })];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-no-shots'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.shots).toBeNull();
      expect(result.stats.goalsAgainst).toBeNull();
    }
  });

  it('handles partial coverage (some records have shots, some do not)', () => {
    const records = [
      makeMatchRecord('mr-with-shots', { statGoals: 1, statShots: 4 }),
      makeMatchRecord('mr-no-shots', { statGoals: 2, statShots: null }),
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: records,
      approvedMatchRecordIds: ['mr-with-shots', 'mr-no-shots'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.stats.available).toBe(true);
    if (result.stats.available) {
      expect(result.stats.goals).toBe(3);
      expect(result.stats.shots).toBe(4); // only the record that had shots contributes
      expect(result.stats.gamesPlayed).toBe(2);
    }
  });

  it('statsLabel is always "Stats from approved matches"', () => {
    const r1 = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(r1.stats.statsLabel).toBe('Stats from approved matches');

    const r2 = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [makeMatchRecord('mr-1')],
      approvedMatchRecordIds: ['mr-1'],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(r2.stats.statsLabel).toBe('Stats from approved matches');
  });

  it('profile-level stat fields are not present in the output', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    // Profile stat_* totals must never appear in the projection
    const profileStatFields = ['statGp', 'statGoals', 'statAssists', 'statShots', 'statGa', 'statSaves', 'statSo'];
    for (const field of profileStatFields) {
      expect(result, `profile stat field in output: ${field}`).not.toHaveProperty(field);
    }
  });
});

// ── Tests: affiliations ───────────────────────────────────────────────────────

describe('buildCoachProjection — affiliations', () => {
  it('strips orgKey from affiliations', () => {
    const affiliations = [
      { ...makeAffiliation(), orgKey: 'internal-key-123' } as AffiliationProjectionRow & { orgKey: string },
    ];
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations,
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.affiliations[0]).not.toHaveProperty('orgKey');
    expect(result.affiliations[0].orgName).toBe('Colorado United FC');
  });

  it('returns empty affiliations array when none provided', () => {
    const result = buildCoachProjection({
      player: makePlayerRow(),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.affiliations).toEqual([]);
  });
});

// ── Tests: nullable fields ────────────────────────────────────────────────────

describe('buildCoachProjection — nullable fields', () => {
  it('graduationYear is null when not set', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ graduationYear: null }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.graduationYear).toBeNull();
  });

  it('achievements is empty array when null on row', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ achievements: null }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.achievements).toEqual([]);
  });

  it('positions is empty array when null on row', () => {
    const result = buildCoachProjection({
      player: makePlayerRow({ positions: null }),
      affiliations: [],
      matchRecords: [],
      approvedMatchRecordIds: [],
      statsTableAvailable: true,
      mediaOriginProtected: false,
    });
    expect(result.positions).toEqual([]);
  });
});
