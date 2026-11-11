/**
 * coach-demo-store.ts
 *
 * localStorage-backed store for demo coach profile links.
 *
 * WHY localStorage INSTEAD OF sessionStorage
 * ──────────────────────────────────────────
 * sessionStorage is tab-local: a new tab opened with window.open() gets a
 * fresh, empty sessionStorage even from the same origin. localStorage is
 * shared across all same-origin tabs in the same browser, so a demo link
 * created in the parent tab is immediately resolvable in the coach tab.
 *
 * DEMO LABEL
 * ──────────
 * These links are same-browser demonstrations only. They are not externally
 * shareable coach links — the token is stored in the browser's localStorage
 * and cannot be resolved by a different browser or device.
 *
 * ISOLATION
 * ─────────
 * Key: sc_demo_coach_links
 * Scope: same origin, all tabs in the same browser
 * No server writes — all operations are client-side only.
 * No real player information or production bearer tokens are stored here.
 *
 * DEMO MATCH RECORDS
 * ──────────────────
 * Exported here so both CoachShareTab and coach/profile.tsx use the same
 * fixture data without importing from server-only modules.
 */

export interface DemoMatchRecord {
  id: string;
  match_date: string | null;
  opponent: string | null;
  goals: number | null;
  assists: number | null;
  season: string | null;
}

export interface DemoAcademics {
  gpa: number;
  scale: number;
  weighted: boolean;
  intendedMajor: string | null;
}

export interface DemoHighlight {
  id: string;
  title: string;
  /** YouTube video ID — used to build embed URL */
  youtubeId: string;
  season: string;
}

export interface DemoUpcomingEvent {
  id: string;
  date: string;          // ISO YYYY-MM-DD
  title: string;
  location: string;
  opponent: string | null;
  competition: string;
  isHome: boolean;
}

export interface DemoBaseProfile {
  demoPlayerId?: string;
  label: string;
  ageBand: string;
  graduationYear: number;
  primaryPosition: string;
  secondaryPosition: string;
  foot: string;
  positions: string[];
  skillLevel: string;
  clubName: string;
  playingLevel: string;
  profileIntroduction: string;
  collegeGoals: string;
  achievements: string[];
  affiliations: Array<{ orgName: string; season: string; ageGroupLabel: string }>;
  avatarInitials: string;
  ukEducation?: Omit<import('@/lib/portal/uk-education').UkEducation, 'documents'> | null;
  academics: DemoAcademics;
  highlights: DemoHighlight[];
  upcomingEvents: DemoUpcomingEvent[];
  /** Parent-controlled contact destination shown on the coach card */
  contactEmail: string;
}

export interface DemoCoachLink {
  id: string;
  token: string;
  playerId?: string;
  label: string | null;
  approvedFields: string[];
  selectedMatchRecordIds: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'revoked' | 'expired';
  /** Snapshot of the base profile at link creation time */
  baseProfile: DemoBaseProfile;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const DEMO_MATCH_RECORDS: DemoMatchRecord[] = [
  { id: 'demo-mr-1', match_date: '2026-09-14', opponent: 'Colorado Rush',     goals: 2,    assists: 1,    season: 'Fall 2026' },
  { id: 'demo-mr-2', match_date: '2026-09-07', opponent: 'FC Boulder',        goals: 0,    assists: 2,    season: 'Fall 2026' },
  { id: 'demo-mr-3', match_date: '2026-08-31', opponent: 'Real Colorado',     goals: 1,    assists: 0,    season: 'Fall 2026' },
  { id: 'demo-mr-4', match_date: '2026-08-24', opponent: 'Colorado Springs',  goals: 3,    assists: 1,    season: 'Fall 2026' },
  { id: 'demo-mr-5', match_date: '2026-08-17', opponent: 'Sporting Colorado', goals: 0,    assists: 0,    season: 'Fall 2026' },
  // demo-mr-6: goals=null, assists=1 — used by Playwright partial-coverage test.
  // Selecting demo-mr-1 (goals=2) + demo-mr-6 (goals=null) gives coverage='partial'
  // for goals (1 of 2 recorded) while assists remain full (both recorded).
  { id: 'demo-mr-6', match_date: '2026-08-10', opponent: 'Aurora FC',         goals: null, assists: 1,    season: 'Fall 2026' },
];

export const DEMO_BASE_PROFILE: DemoBaseProfile = {
  label:               'Alex Demo',
  ageBand:             'U17',
  graduationYear:      2027,
  primaryPosition:     'Central Midfielder',
  secondaryPosition:   'Attacking Midfielder',
  foot:                'Right',
  positions:           ['Central Midfielder', 'Attacking Midfielder'],
  skillLevel:          'Competitive',
  clubName:            'Colorado United FC (Demo)',
  playingLevel:        'ECNL',

  profileIntroduction:
    'I am a technically strong central midfielder with a high soccer IQ. ' +
    'I thrive in transition, am comfortable under pressure, and take pride in ' +
    'my ability to connect play between the lines. Off the field I am a strong ' +
    'student who enjoys leadership roles and community service.',

  collegeGoals:
    'I am looking for a Division I or Division II program where I can compete ' +
    'at a high level while pursuing a degree in Sports Science or Kinesiology. ' +
    'I value a coaching staff that develops players individually and a campus ' +
    'community where academics are taken seriously. Ideally I would stay in the ' +
    'Mountain West or Pacific regions, but I am open to the right fit anywhere.',

  achievements: [
    '2025 ECNL Regional All-Star',
    '2024 State Cup Finalist',
    '3.9 GPA — Honor Roll (2024–2026)',
    'Team captain — Fall 2026',
  ],

  affiliations: [
    { orgName: 'Colorado United FC (Demo)', season: 'Fall 2026',   ageGroupLabel: 'U17 ECNL' },
    { orgName: 'Colorado United FC (Demo)', season: 'Spring 2026', ageGroupLabel: 'U17 ECNL' },
  ],

  avatarInitials: 'AD',

  academics: {
    gpa:           3.9,
    scale:         4.0,
    weighted:      false,
    intendedMajor: 'Sports Science / Kinesiology',
  },

  highlights: [
    {
      id:        'hl-1',
      title:     'Fall 2026 Season Highlights',
      youtubeId: 'dQw4w9WgXcQ',   // synthetic placeholder — not a real clip
      season:    'Fall 2026',
    },
    {
      id:        'hl-2',
      title:     '2025 ECNL Regional — Best Moments',
      youtubeId: 'dQw4w9WgXcQ',   // synthetic placeholder
      season:    'Spring 2026',
    },
  ],

  upcomingEvents: [
    {
      id:          'ev-1',
      date:        '2026-11-01',
      title:       'ECNL Girls — Colorado United vs. Real Colorado',
      location:    'Infinity Park, Glendale CO',
      opponent:    'Real Colorado',
      competition: 'ECNL Girls',
      isHome:      true,
    },
    {
      id:          'ev-2',
      date:        '2026-11-08',
      title:       'ECNL Girls — Colorado United vs. FC Boulder',
      location:    'Boulder Soccer Complex, Boulder CO',
      opponent:    'FC Boulder',
      competition: 'ECNL Girls',
      isHome:      false,
    },
    {
      id:          'ev-3',
      date:        '2026-11-15',
      title:       'ECNL Girls — Colorado United vs. Sporting Colorado',
      location:    'Infinity Park, Glendale CO',
      opponent:    'Sporting Colorado',
      competition: 'ECNL Girls',
      isHome:      true,
    },
  ],

  contactEmail: 'alex.demo.parent@example.com',
};

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sc_demo_coach_links';

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readLinks(): DemoCoachLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DemoCoachLink[];
  } catch {
    return [];
  }
}

/**
 * Persist links to localStorage.
 * Returns true on success, false when storage is unavailable (quota exceeded,
 * private-mode restriction, or SSR). Callers that need to report persistence
 * failure should check the return value.
 */
function writeLinks(links: DemoCoachLink[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    return true;
  } catch {
    return false;
  }
}

// ─── Shared demo projection builder ──────────────────────────────────────────

/**
 * Build a CoachProfile-shaped object from a set of approved fields and
 * selected match records. Used by both:
 *   - CoachShareTab.loadPreview (parent-side preview)
 *   - coach/profile.tsx resolveDemoToken (coach-tab view)
 *
 * This is the single source of truth for demo projection logic so both
 * views are guaranteed to show identical content for the same inputs.
 *
 * STATS RULES (same as real aggregateMatchRecords):
 *   - null means "not recorded" — rendered as "—", never as 0
 *   - 0 is a real zero — rendered as "0"
 *   - coverage='partial' when any included record has a null for a metric
 *     that at least one other included record has recorded
 */
export function buildDemoProjection(
  approvedFields: Set<string>,
  selectedMatchIds: Set<string>,
  profile: DemoBaseProfile = DEMO_BASE_PROFILE,
): Record<string, unknown> {
  const approvedRecords = DEMO_MATCH_RECORDS.filter(r => selectedMatchIds.has(r.id));

  // Per-metric null-preserving accumulation
  let goals:   number | null = null;
  let assists: number | null = null;
  let goalsRecorded   = 0;
  let assistsRecorded = 0;

  for (const r of approvedRecords) {
    if (r.goals != null)   { goals   = (goals   ?? 0) + r.goals;   goalsRecorded++;   }
    if (r.assists != null) { assists = (assists ?? 0) + r.assists; assistsRecorded++; }
  }

  // coverage: 'partial' when some records have a metric and others don't
  const n = approvedRecords.length;
  const hasPartialGoals   = n > 0 && goalsRecorded   > 0 && goalsRecorded   < n;
  const hasPartialAssists = n > 0 && assistsRecorded > 0 && assistsRecorded < n;
  const coverage: 'full' | 'partial' | 'none' =
    n === 0 ? 'none'
    : (hasPartialGoals || hasPartialAssists) ? 'partial'
    : 'full';

  // Only emit recordedCounts when coverage is partial — full coverage needs no annotation
  const recordedCounts = coverage === 'partial'
    ? {
        goals:   goalsRecorded   < n ? goalsRecorded   : undefined,
        assists: assistsRecorded < n ? assistsRecorded : undefined,
      }
    : undefined;

  const demoStats = n > 0
    ? {
        available:    true as const,
        statsLabel:   `${n} match${n !== 1 ? 'es' : ''} selected`,
        gamesPlayed:  n,
        goals,
        assists,
        shots:        null,
        goalsAgainst: null,
        saves:        null,
        shutouts:     null,
        coverage,
        excludedCount: 0,
        season:       null,
        ...(recordedCounts ? { recordedCounts } : {}),
      }
    : { available: false as const, statsLabel: 'No match records selected' };

  const base = profile;
  return {
    demoPlayerId: base.demoPlayerId,
    label:               approvedFields.has('label')               ? base.label               : undefined,
    ageBand:             approvedFields.has('ageBand')             ? base.ageBand             : undefined,
    graduationYear:      approvedFields.has('graduationYear')      ? base.graduationYear      : undefined,
    primaryPosition:     approvedFields.has('primaryPosition')     ? base.primaryPosition     : undefined,
    secondaryPosition:   approvedFields.has('secondaryPosition')   ? base.secondaryPosition   : undefined,
    foot:                approvedFields.has('foot')                ? base.foot                : undefined,
    skillLevel:          approvedFields.has('skillLevel')          ? base.skillLevel          : undefined,
    clubName:            approvedFields.has('clubName')            ? base.clubName            : undefined,
    playingLevel:        approvedFields.has('playingLevel')        ? base.playingLevel        : undefined,
    profileIntroduction: approvedFields.has('profileIntroduction') ? base.profileIntroduction : undefined,
    collegeGoals:        approvedFields.has('collegeGoals')        ? base.collegeGoals        : undefined,
    achievements:        approvedFields.has('achievements')        ? base.achievements        : undefined,
    affiliations:        approvedFields.has('affiliations')        ? base.affiliations        : undefined,
    academics:           approvedFields.has('academics')           ? base.academics           : undefined,
    highlights:          approvedFields.has('highlights')          ? base.highlights          : undefined,
    upcomingEvents:      approvedFields.has('upcomingEvents')      ? base.upcomingEvents      : undefined,
    contactEmail:        approvedFields.has('contactEmail')        ? base.contactEmail        : undefined,
    avatarInitials:      base.avatarInitials,
    avatarUrl:           null,
    mediaOriginProtected: false,
    statsTableAvailable: true,
    stats:               approvedFields.has('stats') ? demoStats : undefined,
    approvedMatchRecordCount: n,
  };
}

// ─── Store API ────────────────────────────────────────────────────────────────

export const demoLinkStore = {
  list(): DemoCoachLink[] {
    return readLinks();
  },

  /**
   * Create a demo link and persist it to localStorage.
   * Returns { link, token, shareUrl, persisted } where persisted=false means
   * localStorage was unavailable — the link exists in memory only and will
   * not be resolvable in a new tab.
   */
  create(opts: {
    label: string | null;
    approvedFields: string[];
    selectedMatchRecordIds: string[];
    expiresInDays: number;
    baseProfile?: DemoBaseProfile;
    playerId?: string;
  }): { link: DemoCoachLink; token: string; shareUrl: string; persisted: boolean } {
    const now = new Date();
    const id    = 'demo-link-'  + Math.random().toString(36).slice(2, 10);
    const token = 'demo-token-' + Math.random().toString(36).slice(2, 18);
    const expiresAt = new Date(now.getTime() + opts.expiresInDays * 86_400_000).toISOString();
    const link: DemoCoachLink = {
      id,
      token,
      label: opts.label,
      approvedFields: opts.approvedFields,
      selectedMatchRecordIds: opts.selectedMatchRecordIds,
      expiresAt,
      revokedAt: null,
      createdAt: now.toISOString(),
      status: 'active',
      baseProfile: structuredClone(opts.baseProfile ?? DEMO_BASE_PROFILE),
      playerId: opts.playerId,
    };
    const links = readLinks();
    const persisted = writeLinks([link, ...links]);
    const shareUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/coach/profile/' + token;
    return { link, token, shareUrl, persisted };
  },

  /**
   * Revoke a demo link by id.
   *
   * Returns { revoked: boolean; persisted: boolean }:
   *   revoked=false  — id not found, or already revoked (no-op)
   *   persisted=false — localStorage write failed; the in-memory mutation
   *                     was NOT applied so the caller must not update UI state.
   *                     The link remains active in storage.
   */
  revoke(id: string): { revoked: boolean; persisted: boolean } {
    const links = readLinks();
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return { revoked: false, persisted: true };
    if (links[idx].revokedAt) return { revoked: false, persisted: true };
    const updated = [...links];
    updated[idx] = { ...updated[idx], status: 'revoked', revokedAt: new Date().toISOString() };
    const persisted = writeLinks(updated);
    if (!persisted) {
      // Do NOT mutate the in-memory array — the link is still active in storage.
      return { revoked: false, persisted: false };
    }
    return { revoked: true, persisted: true };
  },

  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  },
};

// ─── resolveDemoToken ─────────────────────────────────────────────────────────

/**
 * Resolve a demo token from localStorage (cross-tab, same origin).
 * Returns null if the token is not found, revoked, or expired.
 *
 * Exported here so both coach/profile.tsx and unit tests use the same
 * implementation — no duplicated resolver logic.
 *
 * Uses buildDemoProjection — the same function CoachShareTab uses for preview —
 * so the coach view and the parent's preview are guaranteed to be identical.
 */
export function resolveDemoToken(
  token: string,
): { profile: Record<string, unknown>; expiresAt: string | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const links = JSON.parse(raw) as DemoCoachLink[];
    const link = links.find(l => l.token === token);
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return null;

    const approvedSet = new Set(link.approvedFields);
    const selectedMatchIds = new Set(link.selectedMatchRecordIds);
    const profile = buildDemoProjection(approvedSet, selectedMatchIds, link.baseProfile ?? DEMO_BASE_PROFILE);
    return { profile, expiresAt: link.expiresAt };
  } catch {
    return null;
  }
}
