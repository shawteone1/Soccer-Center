/**
 * Portal Demo — static sample data.
 *
 * All data is fictional. IDs are stable strings so switching players or
 * reloading never creates duplicates. Real club names provide presentation context; all player and event records are fictional.
 * Legacy rush IDs intentionally remain stable to preserve saved demo selections and media.
 *
 * Structure:
 *   DEMO_CLUBS   — 3 clubs, each with multiple programs
 *   DEMO_TEAMS   — 5 teams across clubs/programs/age-groups
 *   DEMO_PLAYERS — 15 players per team (keyed by teamId)
 *   DEMO_EVENTS  — 8 Saturday games + M/W/F practices per team (keyed by teamId)
 *
 * Season: Fall 2026 (Sep 6 – Nov 22, 2026)
 * Practice time: 4:30–6:00 PM America/Denver
 * Game time: 10:00 AM America/Denver (Saturday)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoClub {
  id: string;
  name: string;
  shortName: string;
  programs: DemoProgram[];
}

export interface DemoProgram {
  id: string;
  label: string;          // e.g. "Select", "ECNL", "MLS NEXT"
  ageGroups: string[];    // e.g. ["U13", "U14", "U15"]
}

export interface DemoTeam {
  id: string;
  clubId: string;
  programId: string;
  season: string;
  ageGroup: string;
  name: string;           // e.g. "Colorado Storm Competitive U14"
  competition: string;    // e.g. "ECNL Girls"
}

export interface DemoPlayer {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  jersey: string;
  position: 'Forward' | 'Midfielder' | 'Defender' | 'Goalkeeper';
  foot: 'Right' | 'Left' | 'Both';
  birthYear: number;
  ageGroup: string;
}

export type DemoEventType = 'game' | 'practice';

export interface DemoEvent {
  id: string;
  teamId: string;
  type: DemoEventType;
  title: string;
  date: string;           // ISO date YYYY-MM-DD
  startTime: string;      // HH:MM (local America/Denver)
  endTime: string;
  opponent?: string;      // games only
  location: string;
  isHome?: boolean;       // games only
}

// ─── Clubs ────────────────────────────────────────────────────────────────────

export const DEMO_CLUBS: DemoClub[] = [
  {
    id: 'club-rush',
    name: 'Colorado Storm',
    shortName: 'Storm',
    programs: [
      { id: 'prog-rush-select', label: 'Select (sample)',   ageGroups: ['U13', 'U14', 'U15'] },
      { id: 'prog-rush-ecnl',   label: 'Competitive (sample)',     ageGroups: ['U14', 'U15', 'U16'] },
    ],
  },
  {
    id: 'club-rapids',
    name: 'Colorado Rapids Youth',
    shortName: 'Rapids',
    programs: [
      { id: 'prog-rapids-select',  label: 'Select (sample)',   ageGroups: ['U13', 'U14'] },
      { id: 'prog-rapids-mlsnext', label: 'MLS NEXT', ageGroups: ['U14', 'U15', 'U16'] },
    ],
  },
  {
    id: 'club-fc',
    name: 'FC Denver',
    shortName: 'FC Denver',
    programs: [
      { id: 'prog-fc-select', label: 'Select', ageGroups: ['U13', 'U14', 'U15'] },
    ],
  },
];

// ─── Teams ────────────────────────────────────────────────────────────────────

export const DEMO_TEAMS: DemoTeam[] = [
  {
    id: 'team-rush-ecnl-u14',
    clubId: 'club-rush',
    programId: 'prog-rush-ecnl',
    season: 'Fall 2026',
    ageGroup: 'U14',
    name: 'Colorado Storm Competitive U14',
    competition: 'Sample competitive league',
  },
  {
    id: 'team-rush-select-u13',
    clubId: 'club-rush',
    programId: 'prog-rush-select',
    season: 'Fall 2026',
    ageGroup: 'U13',
    name: 'Colorado Storm Select U13',
    competition: 'Colorado Premier League',
  },
  {
    id: 'team-rapids-mlsnext-u15',
    clubId: 'club-rapids',
    programId: 'prog-rapids-mlsnext',
    season: 'Fall 2026',
    ageGroup: 'U15',
    name: 'Colorado Rapids MLS NEXT U15',
    competition: 'MLS NEXT',
  },
  {
    id: 'team-rapids-select-u14',
    clubId: 'club-rapids',
    programId: 'prog-rapids-select',
    season: 'Fall 2026',
    ageGroup: 'U14',
    name: 'Colorado Rapids Select U14',
    competition: 'Colorado Premier League',
  },
  {
    id: 'team-fc-select-u14',
    clubId: 'club-fc',
    programId: 'prog-fc-select',
    season: 'Fall 2026',
    ageGroup: 'U14',
    name: 'FC Denver Select U14',
    competition: 'Colorado Premier League',
  },
  // ── U16 team — unlocks Recruiting tab ──────────────────────────────────────
  {
    id: 'team-rush-ecnl-u16',
    clubId: 'club-rush',
    programId: 'prog-rush-ecnl',
    season: 'Fall 2026',
    ageGroup: 'U16',
    name: 'Colorado Storm Competitive U16',
    competition: 'Sample competitive league',
  },
];

// ─── Players ──────────────────────────────────────────────────────────────────

// 15 fictional players per team. IDs are stable: team-id + slot index.
const POSITIONS: DemoPlayer['position'][] = [
  'Forward', 'Forward', 'Midfielder', 'Midfielder', 'Midfielder',
  'Defender', 'Defender', 'Defender', 'Defender', 'Goalkeeper',
  'Forward', 'Midfielder', 'Defender', 'Midfielder', 'Forward',
];

const FIRST_NAMES = [
  'Avery', 'Blake', 'Cameron', 'Dakota', 'Emery',
  'Finley', 'Harper', 'Jordan', 'Kennedy', 'Logan',
  'Morgan', 'Parker', 'Quinn', 'Riley', 'Skyler',
];

const LAST_NAMES_BY_TEAM: Record<string, string[]> = {
  'team-rush-ecnl-u14':       ['Anderson','Brooks','Carter','Davis','Evans','Foster','Garcia','Harris','Ingram','Jensen','Klein','Lewis','Moore','Nelson','Ortega'],
  'team-rush-select-u13':     ['Abbott','Bell','Chen','Diaz','Ellis','Flynn','Grant','Hall','Irwin','James','Knox','Lane','Marsh','Nash','Owen'],
  'team-rapids-mlsnext-u15':  ['Adams','Boyd','Cole','Dean','Eaton','Ford','Green','Hunt','Irby','Jones','King','Long','Mills','Norris','Page'],
  'team-rapids-select-u14':   ['Allen','Burke','Cruz','Drake','Estes','Fry','Gomez','Holt','Ivy','Judd','Kerr','Lowe','Moss','Noel','Odom'],
  'team-fc-select-u14':       ['Arnold','Bass','Carr','Dunn','Earl','Fox','Gray','Hess','Ide','Jett','Kaye','Lyons','Mack','Nix','Otto'],
  'team-rush-ecnl-u16':       ['Barker','Castillo','Delgado','Espinoza','Flores','Guerrero','Herrera','Ibarra','Jimenez','Keller','Lara','Medina','Navarro','Ochoa','Pena'],
};

const BIRTH_YEARS_BY_AGE: Record<string, number> = {
  'U13': 2013, 'U14': 2012, 'U15': 2011, 'U16': 2010,
};

function buildPlayers(team: DemoTeam): DemoPlayer[] {
  const lastNames = LAST_NAMES_BY_TEAM[team.id] ?? LAST_NAMES_BY_TEAM['team-rush-ecnl-u14'];
  const birthYear = BIRTH_YEARS_BY_AGE[team.ageGroup] ?? 2012;
  return FIRST_NAMES.map((firstName, i) => ({
    id: `${team.id}-p${i + 1}`,
    teamId: team.id,
    firstName,
    lastName: lastNames[i] ?? `Player${i + 1}`,
    jersey: String(i + 1),
    position: POSITIONS[i],
    foot: i % 3 === 0 ? 'Left' : i % 7 === 0 ? 'Both' : 'Right',
    birthYear,
    ageGroup: team.ageGroup,
  }));
}

export const DEMO_PLAYERS: Record<string, DemoPlayer[]> = Object.fromEntries(
  DEMO_TEAMS.map(t => [t.id, buildPlayers(t)])
);

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Fall 2026 schedule:
 *   8 Saturday games: Sep 6, 13, 20, 27 | Oct 4, 18 | Nov 1, 15
 *   M/W/F practices: Sep 8–Nov 21 (skipping Oct 11 week for fall break)
 *
 * Practice weeks (Mon/Wed/Fri):
 *   Sep 8,10,12 | Sep 15,17,19 | Sep 22,24,26 | Sep 29, Oct 1,3
 *   Oct 6,8,10  | Oct 20,22,24 | Oct 27,29,31 | Nov 3,5,7
 *   Nov 10,12,14| Nov 17,19,21
 */

const GAME_DATES: { date: string; opponent: string; isHome: boolean }[] = [
  { date: '2026-09-06', opponent: 'FC Boulder',          isHome: true  },
  { date: '2026-09-13', opponent: 'Denver United',       isHome: false },
  { date: '2026-09-20', opponent: 'Pikes Peak FC',       isHome: true  },
  { date: '2026-09-27', opponent: 'Northern Colorado SC', isHome: false },
  { date: '2026-10-04', opponent: 'Aurora FC',           isHome: true  },
  { date: '2026-10-18', opponent: 'Lakewood SC',         isHome: false },
  { date: '2026-11-01', opponent: 'Highlands Ranch FC',  isHome: true  },
  { date: '2026-11-15', opponent: 'Centennial United',   isHome: false },
];

const PRACTICE_DATES: string[] = [
  '2026-09-08','2026-09-10','2026-09-12',
  '2026-09-15','2026-09-17','2026-09-19',
  '2026-09-22','2026-09-24','2026-09-26',
  '2026-09-29','2026-10-01','2026-10-03',
  '2026-10-06','2026-10-08','2026-10-10',
  '2026-10-20','2026-10-22','2026-10-24',
  '2026-10-27','2026-10-29','2026-10-31',
  '2026-11-03','2026-11-05','2026-11-07',
  '2026-11-10','2026-11-12','2026-11-14',
  '2026-11-17','2026-11-19','2026-11-21',
];

const HOME_VENUES: Record<string, string> = {
  'team-rush-ecnl-u14':      'Infinity Park, Glendale',
  'team-rush-select-u13':    "Dick's Sporting Goods Park, Commerce City",
  'team-rapids-mlsnext-u15': "Dick's Sporting Goods Park, Commerce City",
  'team-rapids-select-u14':  'Aurora Sports Park, Aurora',
  'team-fc-select-u14':      'Denver City Park Fields, Denver',
  'team-rush-ecnl-u16':      'Infinity Park, Glendale',
};

const AWAY_VENUES: Record<string, string> = {
  'team-rush-ecnl-u14':      'Various — see team app',
  'team-rush-select-u13':    'Various — see team app',
  'team-rapids-mlsnext-u15': 'Various — see team app',
  'team-rapids-select-u14':  'Various — see team app',
  'team-fc-select-u14':      'Various — see team app',
  'team-rush-ecnl-u16':      'Various — see team app',
};

const PRACTICE_VENUES: Record<string, string> = {
  'team-rush-ecnl-u14':      'Sample training venue — demonstration only',
  'team-rush-select-u13':    'Sample training venue — demonstration only',
  'team-rapids-mlsnext-u15': 'Rapids Academy, Commerce City',
  'team-rapids-select-u14':  'Rapids Academy, Commerce City',
  'team-fc-select-u14':      'FC Denver Training Ground, Denver',
  'team-rush-ecnl-u16':      'Sample training venue — demonstration only',
};

function buildEvents(team: DemoTeam): DemoEvent[] {
  const events: DemoEvent[] = [];

  // Games
  GAME_DATES.forEach((g, i) => {
    events.push({
      id: `${team.id}-game-${i + 1}`,
      teamId: team.id,
      type: 'game',
      title: g.isHome
        ? `vs ${g.opponent}`
        : `@ ${g.opponent}`,
      date: g.date,
      startTime: '10:00',
      endTime: '11:30',
      opponent: g.opponent,
      location: g.isHome
        ? (HOME_VENUES[team.id] ?? 'Home Field')
        : (AWAY_VENUES[team.id] ?? 'Away'),
      isHome: g.isHome,
    });
  });

  // Practices
  PRACTICE_DATES.forEach((date, i) => {
    events.push({
      id: `${team.id}-practice-${i + 1}`,
      teamId: team.id,
      type: 'practice',
      title: 'Team Practice',
      date,
      startTime: '16:30',
      endTime: '18:00',
      location: PRACTICE_VENUES[team.id] ?? 'Training Field',
    });
  });

  return events;
}

export const DEMO_EVENTS: Record<string, DemoEvent[]> = Object.fromEntries(
  DEMO_TEAMS.map(t => [t.id, buildEvents(t)])
);

// ─── Media ────────────────────────────────────────────────────────────────────

export type DemoMediaKind = 'photo' | 'video' | 'highlight';

export interface DemoMediaItem {
  id: string;
  playerId: string;
  teamId: string;
  season: string;          // e.g. "Fall 2026"
  kind: DemoMediaKind;
  title: string;
  /** Optional game event id this item is tagged to */
  gameEventId?: string;
  /** Simulated thumbnail label (no real image) */
  thumbLabel: string;
  addedAt: string;         // ISO date
  /** IDB blob id — present when a real file was selected */
  blobId?: string;
  /** MIME type of the stored blob */
  mimeType?: string;
}

/** Age groups that support the Recruiting tab */
export const RECRUITING_AGE_GROUPS = new Set(['U16', 'U17', 'U18', 'U19']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTeamsByClubAndProgram(clubId: string, programId: string, ageGroup: string): DemoTeam[] {
  return DEMO_TEAMS.filter(
    t => t.clubId === clubId && t.programId === programId && t.ageGroup === ageGroup
  );
}

export function getTeamById(teamId: string): DemoTeam | undefined {
  return DEMO_TEAMS.find(t => t.id === teamId);
}

export function getClubById(clubId: string): DemoClub | undefined {
  return DEMO_CLUBS.find(c => c.id === clubId);
}

export function getProgramById(clubId: string, programId: string): DemoProgram | undefined {
  return DEMO_CLUBS.find(c => c.id === clubId)?.programs.find(p => p.id === programId);
}

export function playerDisplayName(p: DemoPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

export function playerInitials(p: DemoPlayer): string {
  return (p.firstName[0] + p.lastName[0]).toUpperCase();
}
