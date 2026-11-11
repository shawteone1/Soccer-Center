/** Shared types for the Scores feature */

export interface ScoresLeague {
  slug: string;
  code: string;
  name: string;
  country: string;
}

export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'HALF_TIME'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED';

export interface ScoresGoal {
  minute: number | null;
  type: 'REGULAR' | 'OWN_GOAL' | 'PENALTY' | null;
  scorer: { name: string } | null;
  team: { id: number } | null;
}

export interface ScoresTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface ScoresMatch {
  id: number;
  utcDate: string;
  status: MatchStatus;
  matchday: number | null;
  homeTeam: ScoresTeam;
  awayTeam: ScoresTeam;
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  goals: ScoresGoal[];
}

export interface ScoresMatchesResponse {
  matches: ScoresMatch[];
  competition: { id: number; name: string; code: string; emblem: string };
  date: string;
  cachedAt: string;
  live: boolean;
  stale?: boolean;
}

export function isLive(status: MatchStatus): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED' || status === 'HALF_TIME';
}

export function statusLabel(status: MatchStatus, utcDate: string): string {
  switch (status) {
    case 'IN_PLAY':   return 'LIVE';
    case 'PAUSED':    return 'LIVE';
    case 'HALF_TIME': return 'HT';
    case 'FINISHED':  return 'FT';
    case 'POSTPONED': return 'PPD';
    case 'CANCELLED': return 'CANC';
    case 'SUSPENDED': return 'SUSP';
    default: {
      // SCHEDULED / TIMED — show kickoff time in Denver
      try {
        return new Date(utcDate).toLocaleTimeString('en-US', {
          timeZone: 'America/Denver',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return '—';
      }
    }
  }
}

/** Format score as "H – A" or "– –" if not yet started */
export function scoreDisplay(match: ScoresMatch): string {
  const h = match.score.fullTime.home;
  const a = match.score.fullTime.away;
  if (h === null || a === null) return '– –';
  return `${h} – ${a}`;
}
