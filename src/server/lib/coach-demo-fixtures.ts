/**
 * src/server/lib/coach-demo-fixtures.ts
 *
 * Synthetic player profile and match records for demo-mode coach profile links.
 *
 * ISOLATION GUARANTEE
 * ───────────────────
 * When a coach profile link is created in demo mode (COACH_PROFILE_DEMO_MODE=true),
 * the coach view GET serves these fixtures instead of querying the real database.
 * This ensures demo tokens cannot be used to probe or expose real player data,
 * even if a demo token is shared externally.
 *
 * These fixtures are entirely synthetic — no real player names, clubs, or stats.
 */

import type { CoachProjection } from './coach-projection.js';
import type { RawMatchRecord } from './player-stats-aggregation.js';

/**
 * Synthetic match records for the demo coach view.
 * Typed as RawMatchRecord[] so buildCoachProjection can consume them directly.
 * These mirror the DEMO_MATCH_RECORDS in CoachShareTab.tsx — keep in sync.
 * IDs must match the demo-mr-* IDs used by the parent-side demo workflow.
 */
export const DEMO_MATCH_RECORDS_FOR_COACH_VIEW: RawMatchRecord[] = [
  { id: 'demo-mr-1', statGp: 1, statGoals: 2, statAssists: 1, statShots: 6,  statGa: null, statSaves: null, statSo: null, participated: true, seasonTotalsOverride: false, season: 'Fall 2026', positionPlayed: 'Central Midfielder', matchDate: '2026-09-14', opponent: 'Colorado Rush'     },
  { id: 'demo-mr-2', statGp: 1, statGoals: 0, statAssists: 2, statShots: 2,  statGa: null, statSaves: null, statSo: null, participated: true, seasonTotalsOverride: false, season: 'Fall 2026', positionPlayed: 'Central Midfielder', matchDate: '2026-09-07', opponent: 'FC Boulder'        },
  { id: 'demo-mr-3', statGp: 1, statGoals: 1, statAssists: 0, statShots: 4,  statGa: null, statSaves: null, statSo: null, participated: true, seasonTotalsOverride: false, season: 'Fall 2026', positionPlayed: 'Central Midfielder', matchDate: '2026-08-31', opponent: 'Real Colorado'     },
  { id: 'demo-mr-4', statGp: 1, statGoals: 3, statAssists: 1, statShots: 9,  statGa: null, statSaves: null, statSo: null, participated: true, seasonTotalsOverride: false, season: 'Fall 2026', positionPlayed: 'Central Midfielder', matchDate: '2026-08-24', opponent: 'Colorado Springs'  },
  { id: 'demo-mr-5', statGp: 1, statGoals: 0, statAssists: 0, statShots: 2,  statGa: null, statSaves: null, statSo: null, participated: true, seasonTotalsOverride: false, season: 'Fall 2026', positionPlayed: 'Central Midfielder', matchDate: '2026-08-17', opponent: 'Sporting Colorado' },
];

/** Synthetic player profile for demo coach card previews */
export const DEMO_COACH_PROJECTION: CoachProjection = {
  label: 'Alex Demo',
  ageBand: 'U17',
  graduationYear: 2027,
  primaryPosition: 'Central Midfielder',
  secondaryPosition: 'Attacking Midfielder',
  foot: 'Right',
  positions: ['Central Midfielder', 'Attacking Midfielder'],
  skillLevel: 'Competitive',
  clubName: 'Colorado United FC (Demo)',
  playingLevel: 'ECNL',
  profileIntroduction: 'Technically strong central midfielder with high soccer IQ. Strong in transition and comfortable under pressure.',
  achievements: ['2025 ECNL Regional All-Star', '2024 State Cup Finalist'],
  gpa: '3.9',
  gpaScale: '4.0',
  gpaWeighted: 'unweighted',
  intendedMajor: 'Exercise Science',
  academics: { gpa: 3.9, scale: 4.0, weighted: false, intendedMajor: 'Exercise Science' },
  highSchool: null,
  schoolCity: null,
  schoolState: null,
  collegeGoals: 'Looking for a program where I can compete at the highest level while pursuing a degree in Exercise Science. Interested in schools with strong academic support and a culture of player development.',
  contactEmail: null,
  affiliations: [
    { orgName: 'Colorado United FC (Demo)', season: 'Fall 2026', ageGroupLabel: 'U17 ECNL' },
    { orgName: 'Colorado United FC (Demo)', season: 'Spring 2026', ageGroupLabel: 'U17 ECNL' },
  ],
  stats: {
    available: true,
    statsLabel: 'Fall 2026 — 5 matches',
    gamesPlayed: 5,
    goals: 6,
    assists: 4,
    shots: 18,
    goalsAgainst: null,
    saves: null,
    shutouts: null,
    season: 'Fall 2026',
    excludedCount: 0,
    coverage: 'full' as const,
  },
  avatarInitials: 'AD',
  avatarUrl: null,
  mediaOriginProtected: false,
  statsTableAvailable: true,
  approvedMatchRecordCount: 5,
  highlights: [],
  upcomingEvents: [],
};
