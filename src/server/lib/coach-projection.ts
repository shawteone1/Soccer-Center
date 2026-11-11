/**
 * src/server/lib/coach-projection.ts
 *
 * Shared server-side coach projection builder.
 *
 * This is the single source of truth for what fields are included in any
 * coach-facing view of a player profile. Both the owner-preview endpoint
 * and any future coach-facing endpoint MUST use buildCoachProjection() —
 * never construct the projection inline.
 *
 * PRIVATE FIELDS — never included in any coach projection:
 *   - birthYear (year is private even though full DOB is not collected)
 *   - clubUrl, clubDirectoryId (internal directory references)
 *   - trainingPreferences, trainingMode, trainingInterests
 *   - tryoutInterest
 *   - goals (development goals — private)
 *   - deletedAt, sortOrder, userId
 *   - Any calendar, feed, or schedule data
 *   - Any match record notes
 *   - Any Locked In records
 *   - Contact information of any kind
 *   - Profile-level stat_* totals (stat_gp, stat_goals, etc.) — these are
 *     legacy fields on sc_player_profiles and are NEVER used as a fallback
 *     in the coach projection. Stats come exclusively from approved match
 *     record IDs selected by the parent.
 *
 * STATS POLICY:
 *   Stats are aggregated exclusively from the sc_player_match_records rows
 *   whose IDs appear in approvedMatchRecordIds. Records not in that list are
 *   never included, even if they belong to the same player and owner.
 *   When approvedMatchRecordIds is empty, or the table is unavailable, the
 *   stats field is { available: false } — never a fallback to profile totals.
 *
 * MEDIA SHARING (blocker E4):
 *   avatarUrl is set to null whenever mediaOriginProtected is false.
 *   The /airo-assets/uploads/ origin is not safe to share with external
 *   parties until a protected media proxy is implemented. The owner-preview
 *   endpoint passes mediaOriginProtected=false; any coach-facing endpoint
 *   must not pass true until E4 is resolved.
 */

import { aggregateMatchRecords, type RawMatchRecord, type AggregatedStats } from './player-stats-aggregation.js';

// ── Input types ───────────────────────────────────────────────────────────────

/**
 * Raw player row from sc_player_profiles.
 * Only the fields that belong in the coach projection are required here.
 * Private fields (birthYear, clubUrl, goals, trainingPreferences, stat_*,
 * etc.) must NOT be passed in — the caller's .select() should exclude them
 * at the query level.
 *
 * NOTE: stat_gp, stat_goals, etc. are intentionally absent. Profile-level
 * stat totals are never used in the coach projection — see STATS POLICY above.
 */
export interface PlayerProjectionRow {
  id:                  string | null;
  label:               string | null;
  ageBand:             string | null;
  graduationYear:      number | null;
  primaryPosition:     string | null;
  secondaryPosition:   string | null;
  foot:                string | null;
  /** JSON string[] — legacy positions array */
  positions:           string | null;
  skillLevel:          string | null;
  clubName:            string | null;
  profileIntroduction: string | null;
  /** JSON string[] */
  achievements:        string | null;
  playingLevel:        string | null;
  /** GPA value as string, e.g. "3.85" */
  ukEducation?: import('@/lib/portal/uk-education').UkEducation | null;
  gpa:                 string | null;
  /** GPA scale as string, e.g. "4.0" */
  gpaScale:            string | null;
  /** 'weighted' | 'unweighted' | null */
  gpaWeighted:         string | null;
  /** Intended college major */
  intendedMajor:       string | null;
  /** College goals text */
  collegeGoals:        string | null;
  /** Contact email destination for coach outreach */
  contactEmail:        string | null;
  /** High school name — null until parent sets it */
  highSchool:          string | null;
  /** High school city — null until parent sets it */
  schoolCity:          string | null;
  /** High school state — null until parent sets it */
  schoolState:         string | null;
  /** Raw URL — only forwarded when mediaOriginProtected=true */
  avatarUrl:           string | null;
  avatarInitials:      string | null;
}

export interface AffiliationProjectionRow {
  orgName:       string | null;
  season:        string | null;
  ageGroupLabel: string | null;
  // orgKey intentionally excluded — internal directory reference
}

/**
 * Stats result in the coach projection.
 *
 * When available=true, the aggregated stats from approved match records are
 * present. When available=false, no stats are shown — the parent has not
 * selected any match records, or the table is unavailable.
 *
 * There is no fallback to profile-level stat totals.
 */
export type CoachStatsResult =
  | ({ available: true; statsLabel: string } & AggregatedStats)
  | { available: false; statsLabel: string };

/**
 * A highlight reel item for the coach view.
 *
 * Highlights are uploaded video files (media_type='video') assigned to a player
 * with kind='highlight' via sc_player_media_assignments. There is no youtube_id
 * column on sc_parent_media — videos are stored as uploaded files with a publicUrl.
 *
 * mediaOriginProtected governs whether publicUrl is forwarded to coaches.
 * Until blocker E4 is resolved, publicUrl is always null in coach-facing views.
 */
export interface HighlightProjectionRow {
  id: string;
  title: string;
  /** Public URL of the uploaded video — null when mediaOriginProtected=false (blocker E4). */
  publicUrl: string | null;
  season: string;
  mediaType: string;
}

/** An upcoming appearance event for the coach view. */
export interface UpcomingEventProjectionRow {
  startAt?: string;
  allDay?: boolean;
  eventType?: string;
  id: string;
  date: string;       // ISO YYYY-MM-DD
  title: string;
  location: string;
  opponent: string | null;
  competition: string;
  isHome: boolean;
}

export interface CoachProjection {
  // Identity
  label:               string | null;
  ageBand:             string | null;
  graduationYear:      number | null;
  // Positions
  primaryPosition:     string | null;
  secondaryPosition:   string | null;
  foot:                string | null;
  positions:           string[];
  skillLevel:          string | null;
  // Club
  clubName:            string | null;
  // Coach profile fields
  profileIntroduction: string | null;
  achievements:        string[];
  playingLevel:        string | null;
  // Academics — flat fields (server-internal; filtered by applyFieldFilter via 'academics' key)
  gpa:           string | null;
  gpaScale:      string | null;
  gpaWeighted:   string | null;
  intendedMajor: string | null;
  // Academics — nested object assembled for the card renderer
  ukEducation?: Omit<import('@/lib/portal/uk-education').UkEducation, 'documents'> | null;
  academics: { gpa: number; scale: number; weighted: boolean; intendedMajor: string | null } | null;
  // School
  highSchool:    string | null;
  schoolCity:    string | null;
  schoolState:   string | null;
  // College goals
  collegeGoals:  string | null;
  // Contact
  contactEmail:  string | null;
  // Photo — null when mediaOriginProtected=false (blocker E4)
  avatarUrl:           string | null;
  avatarInitials:      string | null;
  // Affiliations (orgKey stripped)
  affiliations: Array<{ orgName: string | null; season: string | null; ageGroupLabel: string | null }>;
  // Stats — from approved match records only; never from profile stat_* totals
  stats: CoachStatsResult;
  /** Number of approved match record IDs that were passed in */
  approvedMatchRecordCount: number;
  /** Whether the match records table was reachable */
  statsTableAvailable: boolean;
  // Sharing metadata
  mediaOriginProtected: boolean;
  /**
   * YouTube highlight reels — only items with a youtubeId are included.
   * Empty array when no highlights are available or media tables are absent.
   */
  highlights: HighlightProjectionRow[];
  /**
   * Upcoming appearance events from sc_parent_manual_events.
   * Only events with eventType game/camp/tournament/showcase and startAt >= now are included.
   * Empty array when no upcoming appearances are recorded.
   */
  upcomingEvents: UpcomingEventProjectionRow[];
}

// ── Builder ───────────────────────────────────────────────────────────────────

export interface BuildCoachProjectionOptions {
  player:              PlayerProjectionRow;
  affiliations:        AffiliationProjectionRow[];
  /**
   * All match records fetched for this player+owner from the database.
   * Ownership (playerId + userId) must be verified by the caller before
   * passing records here — this function does not re-check ownership.
   */
  matchRecords:        RawMatchRecord[];
  /**
   * The explicit set of sc_player_match_records.id values the parent approved
   * for sharing. Only records whose id appears in this set are aggregated.
   * Records not in this set are silently excluded even if they belong to the
   * same player and owner.
   *
   * Pass [] when no records have been selected (owner preview default).
   * The stats result will be { available: false } in that case.
   */
  approvedMatchRecordIds: string[];
  statsTableAvailable: boolean;
  /**
   * Whether the media origin is protected by a token-gated proxy.
   * When true, avatarUrl from the player row is forwarded as-is (the caller
   * is responsible for passing a proxy URL, not the raw upload URL).
   * When false, avatarUrl is always returned as null.
   */
  mediaOriginProtected: boolean;
  /**
   * YouTube highlight reels — media assignments with kind='highlight' and a
   * youtubeId. Ownership must be verified by the caller.
   * Pass [] when the media table is unavailable or no highlights exist.
   */
  highlights?: HighlightProjectionRow[];
  /**
   * Upcoming appearance events from sc_parent_manual_events.
   * Only events with eventType game/camp/tournament/showcase and startAt >= now should be passed.
   * Pass [] when the table is unavailable or no upcoming appearances exist.
   */
  upcomingEvents?: UpcomingEventProjectionRow[];
}

export function buildCoachProjection(opts: BuildCoachProjectionOptions): CoachProjection {
  const {
    player: r,
    affiliations,
    matchRecords,
    approvedMatchRecordIds,
    statsTableAvailable,
    mediaOriginProtected,
    highlights = [],
    upcomingEvents = [],
  } = opts;

  // ── Stats: approved match records only ────────────────────────────────────
  // Filter to only the records whose IDs the parent explicitly approved.
  // Records not in approvedMatchRecordIds are excluded regardless of ownership.
  // Profile-level stat_* totals are never used as a fallback.
  const STATS_LABEL = 'Stats from approved matches';

  let stats: CoachStatsResult;
  if (!statsTableAvailable || approvedMatchRecordIds.length === 0) {
    stats = { available: false, statsLabel: STATS_LABEL };
  } else {
    const approvedSet = new Set(approvedMatchRecordIds);
    // matchRecords carry their id field so we can filter by it
    const approvedRecords = (matchRecords as Array<RawMatchRecord & { id?: string }>)
      .filter(rec => rec.id != null && approvedSet.has(rec.id as string));
    const aggregated = aggregateMatchRecords(approvedRecords, null);
    stats = { available: true, statsLabel: STATS_LABEL, ...aggregated };
  }

  // ── Affiliations (strip orgKey) ────────────────────────────────────────────
  const projectedAffiliations = affiliations.map(a => ({
    orgName:       a.orgName       ?? null,
    season:        a.season        ?? null,
    ageGroupLabel: a.ageGroupLabel ?? null,
    // orgKey intentionally excluded — internal directory reference
  }));

  // ── Photo — gated on mediaOriginProtected ────────────────────────────────
  // When mediaOriginProtected=true the caller has already substituted a
  // proxy URL for the raw upload path; pass it through unchanged.
  // When false, always return null — the raw /airo-assets/uploads/ URL
  // must not be forwarded to any external party.
  const avatarUrl = mediaOriginProtected ? (r.avatarUrl ?? null) : null;

  return {
    label:               r.label               ?? null,
    ageBand:             r.ageBand             ?? null,
    graduationYear:      r.graduationYear      ?? null,
    primaryPosition:     r.primaryPosition     ?? null,
    secondaryPosition:   r.secondaryPosition   ?? null,
    foot:                r.foot                ?? null,
    positions:           r.positions ? (JSON.parse(r.positions) as string[]) : [],
    skillLevel:          r.skillLevel          ?? null,
    clubName:            r.clubName            ?? null,
    profileIntroduction: r.profileIntroduction ?? null,
    achievements:        r.achievements ? (JSON.parse(r.achievements) as string[]) : [],
    playingLevel:        r.playingLevel        ?? null,
    gpa:           r.gpa           ?? null,
    gpaScale:      r.gpaScale      ?? null,
    gpaWeighted:   r.gpaWeighted   ?? null,
    intendedMajor: r.intendedMajor ?? null,
    // Assemble the nested academics object for the card renderer.
    // Only populated when at least gpa and gpaScale are present.
    ukEducation: r.ukEducation ? { system: r.ukEducation.system, completionYear: r.ukEducation.completionYear, entryYear: r.ukEducation.entryYear, exams: r.ukEducation.exams } : null,
    academics: (!r.ukEducation && r.gpa && r.gpaScale)
      ? {
          gpa:           parseFloat(r.gpa),
          scale:         parseFloat(r.gpaScale),
          weighted:      r.gpaWeighted === 'weighted',
          intendedMajor: r.intendedMajor ?? null,
        }
      : null,
    highSchool:    (r as { highSchool?: string | null }).highSchool    ?? null,
    schoolCity:    (r as { schoolCity?: string | null }).schoolCity    ?? null,
    schoolState:   (r as { schoolState?: string | null }).schoolState  ?? null,
    collegeGoals:  r.collegeGoals  ?? null,
    contactEmail:  r.contactEmail  ?? null,
    avatarUrl,
    avatarInitials:      r.avatarInitials      ?? null,
    affiliations:        projectedAffiliations,
    stats,
    approvedMatchRecordCount: approvedMatchRecordIds.length,
    statsTableAvailable,
    mediaOriginProtected,
    highlights,
    upcomingEvents,
  };
}
