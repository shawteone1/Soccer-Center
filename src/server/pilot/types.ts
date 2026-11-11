/**
 * PlayMetrics Integration Pilot — shared types
 *
 * All types are scoped to the pilot. Real player profiles use existing
 * sc_player_profiles / sc_player_match_records tables.
 */

export type ConnectorMode = 'demo' | 'authorized_import' | 'partner_api';

export interface PilotFixture {
  /** Stable provider-scoped ID — not globally unique; scoped to (provider, teamId) */
  id: string;
  providerTeamId: string;
  date: string;           // ISO 8601 date
  time?: string;          // HH:MM local
  opponent: string;
  venue?: string;
  isHome: boolean;
  status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
  /** Team-level result — separate from individual player stats */
  teamScore?: number | null;
  opponentScore?: number | null;
  competition?: string;
  season: string;
}

export interface PilotTeam {
  id: string;
  providerTeamId: string;
  name: string;
  clubName: string;
  clubId?: string;
  season: string;
  competition?: string;
  ageGroup?: string;
  region?: string;
}

export interface PilotSeason {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface PilotConnectorState {
  mode: ConnectorMode;
  lastRefreshed?: string;   // ISO timestamp of last successful data load
  lastRefreshError?: string;
  sourceLabel: string;      // Human-readable source description
  /** Reference identifiers retained from source */
  sourceRef?: {
    governingBody?: string;
    league?: string;
    providerTeamId?: string;
  };
}

/** Per-player team assignment inside the pilot */
export interface PilotPlayerAssignment {
  playerId: string;
  pilotTeamId: string;
  assignedAt: string;
  calendarSynced: boolean;
}

/** Pilot-specific game record (mirrors sc_player_match_records shape) */
export interface PilotGameRecord {
  id: string;
  playerId: string;
  fixtureId: string;
  participated: boolean;
  goals: number | null;
  assists: number | null;
  ga: number | null;       // goalkeeper: goals allowed
  saves: number | null;    // goalkeeper: saves
  shutouts: number | null; // goalkeeper: shutouts
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
