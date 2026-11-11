/**
 * PlayMetrics Integration Pilot — Demo data
 *
 * Fictional fixtures, teams, and seasons for the pilot demonstration.
 * NEVER connected to PlayMetrics or any live data source.
 *
 * Reference identifiers (for future authorized integration only):
 *   Governing body: 1017
 *   League: 1829
 *   Provider team: 39137
 */

import type { PilotFixture, PilotTeam, PilotSeason, PilotConnectorState } from './types.js';

export const DEMO_CONNECTOR_STATE: PilotConnectorState = {
  mode: 'demo',
  lastRefreshed: new Date().toISOString(),
  sourceLabel: 'Demo data — not connected to PlayMetrics.',
  sourceRef: {
    governingBody: '1017',
    league: '1829',
    providerTeamId: '39137',
  },
};

export const DEMO_SEASONS: PilotSeason[] = [
  {
    id: 'season-fall-2026',
    label: 'Fall 2026',
    startDate: '2026-08-01',
    endDate: '2026-11-30',
  },
  {
    id: 'season-spring-2026',
    label: 'Spring 2026',
    startDate: '2026-03-01',
    endDate: '2026-06-30',
  },
];

export const DEMO_TEAMS: PilotTeam[] = [
  {
    id: 'pilot-team-001',
    providerTeamId: '39137',
    name: 'Demo FC U14 Girls',
    clubName: 'Demo Club',
    clubId: 'demo-club-001',
    season: 'season-fall-2026',
    competition: 'Colorado Premier League',
    ageGroup: 'U14',
    region: 'colorado',
  },
  {
    id: 'pilot-team-002',
    providerTeamId: '39138',
    name: 'Demo FC U12 Boys',
    clubName: 'Demo Club',
    clubId: 'demo-club-001',
    season: 'season-fall-2026',
    competition: 'Colorado Premier League',
    ageGroup: 'U12',
    region: 'colorado',
  },
];

export const DEMO_FIXTURES: PilotFixture[] = [
  // ── Completed games (used for demo player stats) ──────────────────────────
  {
    id: 'fixture-demo-a',
    providerTeamId: '39137',
    date: '2026-09-07',
    time: '10:00',
    opponent: 'Rival United FC',
    venue: 'Infinity Park, Glendale CO',
    isHome: true,
    status: 'completed',
    teamScore: 3,
    opponentScore: 1,
    competition: 'Colorado Premier League',
    season: 'season-fall-2026',
  },
  {
    id: 'fixture-demo-b',
    providerTeamId: '39137',
    date: '2026-09-14',
    time: '14:00',
    opponent: 'Metro Soccer Academy',
    venue: 'Dick\'s Sporting Goods Park, Commerce City CO',
    isHome: false,
    status: 'completed',
    teamScore: 2,
    opponentScore: 2,
    competition: 'Colorado Premier League',
    season: 'season-fall-2026',
  },
  // ── Upcoming fixtures ─────────────────────────────────────────────────────
  {
    id: 'fixture-upcoming-1',
    providerTeamId: '39137',
    date: '2026-10-19',
    time: '11:00',
    opponent: 'Front Range FC',
    venue: 'Broomfield Soccer Complex, Broomfield CO',
    isHome: true,
    status: 'scheduled',
    competition: 'Colorado Premier League',
    season: 'season-fall-2026',
  },
  {
    id: 'fixture-upcoming-2',
    providerTeamId: '39137',
    date: '2026-10-26',
    time: '09:00',
    opponent: 'Colorado Rush',
    venue: 'Aurora Sports Park, Aurora CO',
    isHome: false,
    status: 'scheduled',
    competition: 'Colorado Premier League',
    season: 'season-fall-2026',
  },
  {
    id: 'fixture-upcoming-3',
    providerTeamId: '39137',
    date: '2026-11-02',
    time: '13:00',
    opponent: 'Real Colorado',
    venue: 'Infinity Park, Glendale CO',
    isHome: true,
    status: 'scheduled',
    competition: 'Colorado Premier League',
    season: 'season-fall-2026',
  },
];

/**
 * Pre-seeded demo game records for "Alex Demo" player.
 * These are stored in the in-memory demo store, not the production DB.
 *
 * Game A: participated, 1 goal, 1 assist
 * Game B: participated, 0 goals, 2 assists
 * Expected totals: 2 GP · 1 G · 3 A
 */
export const DEMO_SEED_RECORDS = [
  {
    fixtureId: 'fixture-demo-a',
    participated: true,
    goals: 1,
    assists: 1,
    ga: null,
    saves: null,
    shutouts: null,
    notes: 'Demo Game A — scored in the 34th minute, assisted in the 67th.',
  },
  {
    fixtureId: 'fixture-demo-b',
    participated: true,
    goals: 0,
    assists: 2,
    ga: null,
    saves: null,
    shutouts: null,
    notes: 'Demo Game B — two assists, strong defensive performance.',
  },
];
