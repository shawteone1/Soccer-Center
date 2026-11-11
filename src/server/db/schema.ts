import { mysqlTable, varchar, boolean, text, timestamp, int, bigint } from 'drizzle-orm/mysql-core';

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  isAdmin: boolean('is_admin').default(false),
  /**
   * Server-managed account type. Never set from client input.
   * 'FAN'    — fan access only (default for all new accounts)
   * 'PARENT' — parent portal + fan access
   * null     — legacy/unresolved; treated as FAN until migrated
   *
   * MIGRATION NOTE: populated by scripts/migrate-account-types.ts.
   * Legacy memberType mapping: 'fan'→FAN, 'player'→FAN, 'both'→PARENT.
   * Accounts with no scMemberProfiles row default to FAN.
   * Ambiguous accounts (conflicting signals) are set to FAN and flagged
   * in sc_account_migration_log for manual review.
   */
  accessType: varchar('access_type', { length: 8 }),  // 'FAN' | 'PARENT' | null (legacy)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Tryouts ──────────────────────────────────────────────────────────────────

/** Verified tryout events entered/approved by admins or scraped automatically */
export const soccerTryoutEvents = mysqlTable('soccer_tryout_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  regionSlug: varchar('region_slug', { length: 64 }).notNull(),
  clubName: varchar('club_name', { length: 255 }).notNull(),
  clubUrl: varchar('club_url', { length: 512 }),
  city: varchar('city', { length: 128 }),
  level: varchar('level', { length: 64 }),
  ageGroups: text('age_groups'),
  eventDate: varchar('event_date', { length: 64 }),
  eventTime: varchar('event_time', { length: 64 }),
  location: varchar('location', { length: 255 }),
  registrationUrl: varchar('registration_url', { length: 512 }),
  notes: text('notes'),
  isPast: boolean('is_past').default(false),
  sortOrder: int('sort_order').default(0),
  sourceUrl: varchar('source_url', { length: 512 }),
  lastVerifiedAt: timestamp('last_verified_at'),
  lastCheckedAt: timestamp('last_checked_at'),
  reviewStatus: varchar('review_status', { length: 32 }),
  reviewNote: text('review_note'),
  scrapedSeason: varchar('scraped_season', { length: 16 }),
  /** 'ok' | 'broken' | 'inconclusive' | 'soft_404' — set by link-check script */
  linkCheckStatus: varchar('link_check_status', { length: 32 }),
  linkCheckedAt: timestamp('link_checked_at'),
  linkCheckNotes: text('link_check_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// NOTE: value is TEXT (not VARCHAR) — BetterAuth stores OAuth PKCE state here as a JSON
// blob that includes a 128-char codeVerifier + callbackURL + oauthState. A VARCHAR(255)
// overflows when callbackURL is longer than ~40 chars, causing ER_DATA_TOO_LONG and a
// silent 500 on the /api/auth/sign-in/social endpoint. TEXT supports up to 65,535 chars.
export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── My Soccer Calendar ───────────────────────────────────────────────────────

/**
 * One row per connected feed per user.
 * encryptedUrl: AES-256-GCM ciphertext (hex) of the raw iCal subscription URL.
 * iv + authTag stored alongside so decryption is self-contained per row.
 * The raw URL is NEVER returned to the browser.
 */
export const scCalendarFeeds = mysqlTable('sc_calendar_feeds', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(), // 'teamsnap' | 'playmetrics' | 'other'
  label: varchar('label', { length: 128 }),                // user-supplied friendly name
  encryptedUrl: text('encrypted_url').notNull(),           // JSON: { iv, authTag, ciphertext } all hex
  lastFetchedAt: timestamp('last_fetched_at'),
  lastFetchError: varchar('last_fetch_error', { length: 512 }),
  lastFetchStatus: varchar('last_fetch_status', { length: 16 }), // 'ok' | 'error'
  eventCount: int('event_count').default(0),
  /** 'fan' | 'parent' | null (null = legacy, treated as fan) */
  portalContext: varchar('portal_context', { length: 8 }),
  /** User-chosen hex color for the feed chip in the calendar UI */
  color: varchar('color', { length: 16 }),
  /** Whether the feed is visible in the calendar (default true) */
  visible: boolean('visible').default(true),
  /**
   * JSON array of sc_player_profiles.id values this feed is scoped to.
   * NULL or '[]' means the feed is shown for ALL of the parent's players
   * (legacy behaviour — preserved for existing feeds until the parent
   * explicitly assigns them via run-schema-v6 + UI).
   * Added by run-schema-v6 migration.
   */
  playerIds: varchar('player_ids', { length: 2048 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Cached parsed events from all feeds, keyed by (feedId, uid).
 * Rebuilt on each successful fetch — old events for the feed are deleted
 * and replaced atomically so stale data never lingers.
 */
// ─── YouTube Highlights Cache ─────────────────────────────────────────────────

/**
 * One row per enabled channel slug.
 * payload: JSON blob produced by publicSnapshot (videos array + channel metadata).
 * refresh_token: UUID claim used for atomic single-worker refresh.
 * Purged entries older than 7 days; public GET reads this table only.
 */
export const scYoutubeCache = mysqlTable('sc_youtube_cache', {
  slug: varchar('slug', { length: 64 }).primaryKey(),
  payload: text('payload').notNull(),
  fetchedAt: timestamp('fetched_at'),
  lastAttempt: timestamp('last_attempt'),
  refreshToken: varchar('refresh_token', { length: 36 }),
  syncError: varchar('sync_error', { length: 160 }),
});

/**
 * Durable job-run records for the tryout scraper.
 * One row per job type ('daily_refresh' | 'weekly_discovery').
 * Survives server restarts and prevents duplicate runs across containers.
 * claim_token: set to a UUID when a worker starts; cleared on finish.
 * claim_expires_at: safety valve — if a worker crashes, the claim expires
 *   and another worker can take over after this time.
 */
export const scScraperJobState = mysqlTable('sc_scraper_job_state', {
  jobType: varchar('job_type', { length: 32 }).primaryKey(),   // 'daily_refresh' | 'weekly_discovery'
  lastRunAt: timestamp('last_run_at'),
  lastRunDurationMs: int('last_run_duration_ms'),
  lastRunFound: int('last_run_found').default(0),
  lastRunErrors: text('last_run_errors'),                       // JSON array of error strings
  nextRunAt: timestamp('next_run_at'),
  claimToken: varchar('claim_token', { length: 36 }),           // UUID while running
  claimExpiresAt: timestamp('claim_expires_at'),                // safety expiry
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── My Soccer Member Profiles ────────────────────────────────────────────────

/** One row per user — fan/player/both preference + region/city */
export const scMemberProfiles = mysqlTable('sc_member_profiles', {
  userId: varchar('user_id', { length: 36 }).primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  memberType: varchar('member_type', { length: 16 }).notNull().default('fan'), // 'fan' | 'player' | 'both' — legacy; superseded by user.accessType
  region: varchar('region', { length: 64 }),
  city: varchar('city', { length: 128 }),
  interests: text('interests'),        // JSON string[]
  favLeagues: text('fav_leagues'),       // JSON string[]
  favTeams: text('fav_teams'),           // JSON string[]
  fanInterests: text('fan_interests'),   // JSON string[]
  favPublishers: text('fav_publishers'), // JSON string[] — publisher channel slugs (nbc-sports, cbs-sports-golazo, espn-fc)
  onboardingDone: boolean('onboarding_done').default(false),
  // ── Fan Profile Phase 2 ──────────────────────────────────────────────────────
  fanOnboardingDone: boolean('fan_onboarding_done').default(false),
  parentOnboardingDone: boolean('parent_onboarding_done').default(false),
  /**
   * Consent version accepted during parent setup (e.g. 'v1.0').
   * Null until parent setup is completed.
   */
  consentVersion: varchar('consent_version', { length: 16 }),
  /** ISO 8601 timestamp when consent was accepted. */
  consentAcceptedAt: timestamp('consent_accepted_at'),
  /**
   * Last portal the user chose: 'fan' | 'parent'.
   * Convenience preference only — never used for authorization.
   */
  lastPortalPreference: varchar('last_portal_preference', { length: 8 }),
  // ── Fan identity (Step 3d) ───────────────────────────────────────────────────
  /** Fan display name, e.g. "Alex Rivera" */
  displayName: varchar('display_name', { length: 128 }),
  /** Short bio / about text */
  bio: text('bio'),
  /** Public URL of uploaded avatar photo */
  avatarUrl: varchar('avatar_url', { length: 512 }),
  /** Public URL of uploaded cover/banner image */
  coverImageUrl: varchar('cover_image_url', { length: 512 }),
  /** General location, e.g. "Denver, CO" */
  location: varchar('location', { length: 128 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/** One row per player profile per user (parent can have multiple) */
export const scPlayerProfiles = mysqlTable('sc_player_profiles', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 64 }),          // e.g. "Avery" — preferred/display name
  ageBand: varchar('age_band', { length: 16 }),      // 'U6'–'U19'
  ageYears: int('age_years'),

  // ── v2 identity fields ───────────────────────────────────────────────────────
  /** Birth year, e.g. 2013 — no full DOB collected */
  birthYear: int('birth_year'),
  /** Optional jersey number */
  jersey: varchar('jersey', { length: 8 }),
  /** Two-letter initials for avatar, e.g. "AM" */
  avatarInitials: varchar('avatar_initials', { length: 4 }),
  /** Public URL of the uploaded player photo, e.g. /airo-assets/uploads/player-photos/... */
  avatarUrl: varchar('avatar_url', { length: 1024 }),

  // ── Positions (v2 structured) ────────────────────────────────────────────────
  /** Primary position, e.g. "Fullback/Wingback" */
  primaryPosition: varchar('primary_position', { length: 64 }),
  /** Secondary position, e.g. "Winger" */
  secondaryPosition: varchar('secondary_position', { length: 64 }),
  /** Preferred foot: 'left' | 'right' | 'both' */
  foot: varchar('foot', { length: 8 }),
  /** JSON string[] — development goals, e.g. ["Ball control","Defending"] */
  goals: text('goals'),

  // ── Legacy position/skill fields (preserved) ─────────────────────────────────
  positions: text('positions'),                      // JSON string[] — legacy multi-position list
  skillLevel: varchar('skill_level', { length: 32 }), // 'beginner' | 'intermediate' | 'advanced'
  developmentInterests: text('development_interests'), // JSON string[]
  trainingMode: varchar('training_mode', { length: 32 }), // 'solo' | 'partner' | 'team' | 'any'

  // ── Club / training ──────────────────────────────────────────────────────────
  clubName: varchar('club_name', { length: 255 }),   // current club name
  clubUrl: varchar('club_url', { length: 512 }),     // club website
  /** Stable directory entry ID from directory_regions.json, e.g. "colorado-c1d47e58-…" */
  clubDirectoryId: varchar('club_directory_id', { length: 128 }),
  /** JSON blob: { focusAreas: string[], sessionLength: string, frequency: string } */
  trainingPreferences: text('training_preferences'),
  /** Per-player tryout interest toggle — defaults on (1) */
  tryoutInterest: boolean('tryout_interest').default(true),
  sortOrder: int('sort_order').default(0),

  // ── Season statistics (parent-entered, not verified) ─────────────────────────
  /** Games played */
  statGp: int('stat_gp'),
  /** Goals scored (outfield) */
  statGoals: int('stat_goals'),
  /** Assists (outfield) */
  statAssists: int('stat_assists'),
  /** Shots (outfield) — abbreviated SH to distinguish from assists */
  statShots: int('stat_shots'),
  /** Goals against (goalkeeper) */
  statGa: int('stat_ga'),
  /** Saves (goalkeeper) */
  statSaves: int('stat_saves'),
  /** Shutouts (goalkeeper) */
  statSo: int('stat_so'),

  // ── Coach profile fields (v3 — additive) ─────────────────────────────────────
  /**
   * Canonical graduation year, e.g. 2028.
   * Stored explicitly — not derived at runtime from birth_year.
   * Null until the parent sets it.
   */
  graduationYear: int('graduation_year'),
  /**
   * Reusable introduction text for coach outreach.
   * Separate from the per-draft introduction in sc_outreach_drafts.
   * Null until the parent writes one.
   */
  profileIntroduction: text('profile_introduction'),
  /**
   * JSON string[] of achievement labels, e.g. ["State Cup finalist 2025","All-conference 2026"].
   * Parent-entered; not verified.
   */
  achievements: text('achievements'),
  /**
   * Current competitive playing level, e.g. "Club — State" | "Club — Regional" | "High school varsity".
   * Null until the parent sets it.
   */
  playingLevel: varchar('playing_level', { length: 64 }),

  // ── Coach profile fields (v4 — additive) ─────────────────────────────────────
  /**
   * GPA on the given scale, e.g. 3.85 on a 4.0 scale.
   * Stored as DECIMAL(4,2) — max 99.99. Null until parent sets it.
   */
  ukEducation: text('uk_education'),
  gpa: varchar('gpa', { length: 8 }),           // stored as string to avoid float rounding
  /** GPA scale, e.g. "4.0" | "5.0" | "100". Null until parent sets it. */
  gpaScale: varchar('gpa_scale', { length: 8 }),
  /** 'weighted' | 'unweighted' | null */
  gpaWeighted: varchar('gpa_weighted', { length: 12 }),
  /** Intended college major or academic interest area. Null until parent sets it. */
  intendedMajor: varchar('intended_major', { length: 128 }),
  /**
   * College goals — academic and soccer aspirations, written by the parent.
   * Null until the parent writes one.
   */
  collegeGoals: text('college_goals'),
  /**
   * Contact email destination for coach outreach.
   * Parent-controlled — not necessarily the account email.
   * Null until the parent sets it.
   */
  contactEmail: varchar('contact_email', { length: 255 }),

  // ── Coach profile fields (v5 — school info) ───────────────────────────────
  /** High school name, e.g. "Cherry Creek High School". Null until parent sets it. */
  highSchool: varchar('high_school', { length: 128 }),
  /** City where the high school is located, e.g. "Greenwood Village". Null until parent sets it. */
  schoolCity: varchar('school_city', { length: 64 }),
  /** State abbreviation, e.g. "CO". Null until parent sets it. */
  schoolState: varchar('school_state', { length: 32 }),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  /** Soft-delete timestamp. NULL = active. Set by DELETE endpoint; cleared by restore. */
  deletedAt: timestamp('deleted_at'),
});

/**
 * Parent-level profile: identity, club/team selections, tryout preferences.
 * One row per parent user. Created/updated during parent onboarding.
 *
 * Schema v2 additions (2026-10-08):
 *   displayName, bio, avatarInitials, coverStyle, city, timezone, privacyPrivate,
 *   marketingOptIn, onboardingStage, onboardingStepsCompleted
 */
export const scParentProfiles = mysqlTable('sc_parent_profiles', {
  userId: varchar('user_id', { length: 36 }).primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  familyId: varchar('family_id', { length: 36 }),   // sc_families.id (set after family created)

  // ── Identity (v2) ────────────────────────────────────────────────────────────
  /** Parent's display name, e.g. "Taylor Morgan" */
  displayName: varchar('display_name', { length: 255 }),
  /** Short bio / about text */
  bio: text('bio'),
  /** Two-letter initials for the avatar, e.g. "TM" */
  avatarInitials: varchar('avatar_initials', { length: 4 }),
  /** Public URL of the uploaded avatar photo, e.g. /airo-assets/uploads/parent-media/... */
  avatarUrl: varchar('avatar_url', { length: 1024 }),
  /** Cover banner style key, e.g. 'stadium-blue' | 'stadium-night' | 'plain' */
  coverStyle: varchar('cover_style', { length: 32 }),
  /** General city / location, e.g. "Denver, Colorado" — not a precise address */
  city: varchar('city', { length: 128 }),
  /** IANA timezone, e.g. "America/Denver" */
  timezone: varchar('timezone', { length: 64 }).default('America/Denver'),
  /** Profile is private by default (true = private) */
  privacyPrivate: boolean('privacy_private').default(true),
  /** Optional marketing/newsletter opt-in — separate from required acknowledgements */
  marketingOptIn: boolean('marketing_opt_in').default(false),

  // ── Onboarding progress ──────────────────────────────────────────────────────
  /** Current wizard stage slug, e.g. 'you' | 'players' | 'affiliations' | 'preferences' | 'calendar' | 'review' | 'complete' */
  onboardingStage: varchar('onboarding_stage', { length: 32 }),
  /** JSON string[] of completed step slugs */
  onboardingStepsCompleted: text('onboarding_steps_completed'),

  // ── Club/team follows ────────────────────────────────────────────────────────
  clubName: varchar('club_name', { length: 255 }),   // primary club affiliation
  clubUrl: varchar('club_url', { length: 512 }),
  /** JSON string[] — sc_teams.id values the parent follows */
  teamIds: text('team_ids'),
  /** JSON string[] — sc_competitions.id values the parent follows */
  competitionIds: text('competition_ids'),

  // ── Tryout preferences ───────────────────────────────────────────────────────
  /** Master tryout toggle — when false, tryout content is hidden site-wide for this parent */
  tryoutsEnabled: boolean('tryouts_enabled').default(true),
  /** JSON string[] — Colorado region slugs to show tryouts for */
  tryoutRegions: text('tryout_regions'),
  /** JSON string[] — age group filters e.g. ['U10','U12'] */
  tryoutAgeGroups: text('tryout_age_groups'),

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Player club/team affiliations — parent-entered, not verified roster membership.
 * One row per (player, season, org) combination.
 *
 * Evidence distinction:
 *   parentEntered = true  → parent typed this in; no verification
 *   parentEntered = false → matched to a directory record (sc_teams.id in orgKey)
 *
 * Team/roster verification is pending; calendar subscription does not prove membership.
 */
export const scPlayerAffiliations = mysqlTable('sc_player_affiliations', {
  id: varchar('id', { length: 36 }).primaryKey(),
  playerId: varchar('player_id', { length: 36 })
    .notNull()
    .references(() => scPlayerProfiles.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** sc_teams.id when matched to directory; null for manual entry */
  orgKey: varchar('org_key', { length: 64 }),
  /** Display name of the club/team, e.g. "Colorado United" */
  orgName: varchar('org_name', { length: 255 }).notNull(),
  /** Season label, e.g. "Fall 2026" */
  season: varchar('season', { length: 32 }),
  /** Optional age group / team label, e.g. "U13 Girls" */
  ageGroupLabel: varchar('age_group_label', { length: 64 }),
  /** true = parent typed this; false = matched to directory record */
  parentEntered: boolean('parent_entered').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Server-saved onboarding drafts — allows save/resume across sessions and devices.
 * One row per user; upserted on every save-for-later action.
 *
 * draftData is a JSON blob of the full WizardDraft shape.
 * stepsCompleted is a JSON string[] of completed step slugs.
 */
export const scOnboardingDrafts = mysqlTable('sc_onboarding_drafts', {
  userId: varchar('user_id', { length: 36 }).primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Current step slug: 'you'|'players'|'affiliations'|'preferences'|'calendar'|'review' */
  stage: varchar('stage', { length: 32 }).default('you'),
  /** JSON string[] of completed step slugs */
  stepsCompleted: text('steps_completed'),
  /** Full wizard draft as JSON blob */
  draftData: text('draft_data'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Development Content Catalog ──────────────────────────────────────────────

/**
 * Curated development content items (videos, articles, session plans, etc.)
 * Imported from CSV; idempotent by contentId.
 * adminStatus controls visibility: only 'approved' items are shown to members.
 */
export const scDevContent = mysqlTable('sc_dev_content', {
  contentId: varchar('content_id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  source: varchar('source', { length: 128 }),         // provider name e.g. "UEFA Coaching"
  url: varchar('url', { length: 1024 }).notNull(),
  sourceUrl: varchar('source_url', { length: 1024 }),
  contentType: varchar('content_type', { length: 64 }), // 'youtube_video' | 'article' | 'session_plan' | …
  ageMin: int('age_min'),
  ageMax: int('age_max'),
  ageBasis: varchar('age_basis', { length: 32 }),
  positions: text('positions'),                        // JSON string[]
  interests: text('interests'),                        // JSON string[]
  tags: text('tags'),                                  // JSON string[]
  audience: text('audience'),                          // JSON string[] e.g. ['player','coach','parent']
  trainingMode: varchar('training_mode', { length: 64 }),
  equipment: varchar('equipment', { length: 128 }),
  access: varchar('access', { length: 32 }),           // 'Free' | 'Paid' | 'Free trial'
  language: varchar('language', { length: 32 }),
  editorialPriority: int('editorial_priority').default(2), // 1=high 2=normal 3=low
  providerUrl: varchar('provider_url', { length: 512 }),
  providerBestFor: text('provider_best_for'),
  providerAccess: varchar('provider_access', { length: 64 }),
  devCategory: varchar('dev_category', { length: 32 }),  // 'defending'|'attacking'|'midfield'|'goalkeeping'
  youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
  embedVerified: boolean('embed_verified').default(false),
  linkBroken: boolean('link_broken').default(false),
  reviewStatus: text('review_status'),
  playbackStatus: text('playback_status'),
  deliveryMode: text('delivery_mode'),
  checkedDate: varchar('checked_date', { length: 16 }),
  reviewNotes: text('review_notes'),
  recommendationStatus: varchar('recommendation_status', { length: 64 }),
  adminStatus: varchar('admin_status', { length: 32 }).default('pending'), // 'pending'|'approved'|'unpublished'|'archived'
  adminReviewedAt: timestamp('admin_reviewed_at'),
  adminReviewedBy: varchar('admin_reviewed_by', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Tracked playlists for the Development section.
 * One row per playlist; the scheduler re-imports new videos periodically.
 */
export const scDevPlaylists = mysqlTable('sc_dev_playlists', {
  playlistId: varchar('playlist_id', { length: 64 }).primaryKey(), // YouTube playlist ID
  devCategory: varchar('dev_category', { length: 32 }).notNull(),  // e.g. 'fitness'
  label: varchar('label', { length: 128 }),                        // human-readable name
  lastImportedAt: timestamp('last_imported_at'),
  lastImportCount: int('last_import_count').default(0),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Saved content items per user */
export const scSavedItems = mysqlTable('sc_saved_items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  contentId: varchar('content_id', { length: 64 })
    .notNull()
    .references(() => scDevContent.contentId, { onDelete: 'cascade' }),
  savedAt: timestamp('saved_at').defaultNow(),
});

/** Saved tryout events — one row per (user, tryout event) */
export const scSavedTryouts = mysqlTable('sc_saved_tryouts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** References soccer_tryout_events.id — no FK constraint so saves survive event cleanup */
  tryoutId: varchar('tryout_id', { length: 64 }).notNull(),
  savedAt: timestamp('saved_at').defaultNow(),
});

export const scCalendarEvents = mysqlTable('sc_calendar_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  feedId: varchar('feed_id', { length: 36 })
    .notNull()
    .references(() => scCalendarFeeds.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  uid: varchar('uid', { length: 512 }),          // VEVENT UID from iCal
  title: varchar('title', { length: 512 }).notNull(),
  startAt: varchar('start_at', { length: 32 }).notNull(),  // ISO 8601
  endAt: varchar('end_at', { length: 32 }),
  allDay: boolean('all_day').default(false),
  location: varchar('location', { length: 512 }),
  description: text('description'),
  provider: varchar('provider', { length: 32 }),
  teamName: varchar('team_name', { length: 255 }),
  eventType: varchar('event_type', { length: 64 }),  // 'game' | 'practice' | 'event' | 'other'
  status: varchar('status', { length: 32 }),          // 'confirmed' | 'cancelled' | 'tentative'
  sequence: bigint('sequence', { mode: 'number' }).default(0), // for change detection
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Personal Events (user-created, My Soccer calendar) ───────────────────────

export const scPersonalEvents = mysqlTable('sc_personal_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 512 }).notNull(),
  startAt: varchar('start_at', { length: 32 }).notNull(),   // ISO 8601 with tz offset
  endAt: varchar('end_at', { length: 32 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('America/Denver'),
  allDay: boolean('all_day').default(false),
  location: varchar('location', { length: 512 }),
  notes: text('notes'),
  eventType: varchar('event_type', { length: 64 }).default('event'), // 'game'|'practice'|'event'|'other'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Per-user OAuth tokens for Google Calendar / Outlook ──────────────────────

export const scOauthTokens = mysqlTable('sc_oauth_tokens', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(), // 'google_calendar' | 'outlook'
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: bigint('expires_at', { mode: 'number' }),     // Unix ms
  scope: varchar('scope', { length: 512 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── In-app reminders ─────────────────────────────────────────────────────────

export const scReminders = mysqlTable('sc_reminders', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Source: either a feed event or a personal event
  eventSource: varchar('event_source', { length: 16 }).notNull(), // 'feed' | 'personal'
  eventId: varchar('event_id', { length: 36 }).notNull(),
  eventTitle: varchar('event_title', { length: 512 }).notNull(),
  eventStartAt: varchar('event_start_at', { length: 32 }).notNull(),
  minutesBefore: int('minutes_before').notNull().default(30), // 10 | 30 | 60 | 1440
  channel: varchar('channel', { length: 16 }).notNull().default('in_app'), // 'in_app' | 'email'
  scheduledFor: varchar('scheduled_for', { length: 32 }).notNull(), // ISO 8601 — when to fire
  status: varchar('status', { length: 16 }).notNull().default('pending'), // 'pending'|'delivered'|'cancelled'
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Per-feed display preferences (show/hide + color) ─────────────────────────

// ─── Fan Profile: Team / Competition / Source Directory ───────────────────────

/**
 * Competitions (leagues, cups) that teams belong to.
 * importKey is the stable external seed identifier from the JSON dataset.
 */
export const scCompetitions = mysqlTable('sc_competitions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  gender: varchar('gender', { length: 16 }),          // 'men' | 'women' | 'mixed'
  type: varchar('type', { length: 64 }),               // 'domestic_league' | 'continental_cup' | …
  season: varchar('season', { length: 32 }),
  directoryUrl: varchar('directory_url', { length: 512 }),
  verificationStatus: varchar('verification_status', { length: 64 }),
  membershipsImported: boolean('memberships_imported').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Club teams and national teams.
 * importKey is the stable external seed identifier.
 * organizationKey groups multiple team rows under one club (e.g. men + women).
 */
export const scTeams = mysqlTable('sc_teams', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  organizationKey: varchar('organization_key', { length: 128 }),
  entityType: varchar('entity_type', { length: 32 }).notNull(), // 'club_team' | 'national_team'
  displayName: varchar('display_name', { length: 255 }).notNull(),
  gender: varchar('gender', { length: 16 }),
  associationCode: varchar('association_code', { length: 16 }), // 'ENG' | 'USA' | …
  aliases: text('aliases'),                                      // JSON string[]
  officialProfileUrl: varchar('official_profile_url', { length: 512 }),
  officialWebsite: varchar('official_website', { length: 512 }),
  websiteVerificationStatus: varchar('website_verification_status', { length: 64 }),
  mediaCoverage: varchar('media_coverage', { length: 32 }),      // 'full' | 'partial' | 'none'
  socialDiscoveryStatus: varchar('social_discovery_status', { length: 32 }),
  podcastDiscoveryStatus: varchar('podcast_discovery_status', { length: 32 }),
  lastChecked: varchar('last_checked', { length: 16 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Team ↔ Competition membership rows.
 * One row per (team, competition, season) combination.
 */
export const scTeamCompetitions = mysqlTable('sc_team_competitions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  teamId: varchar('team_id', { length: 36 })
    .notNull()
    .references(() => scTeams.id, { onDelete: 'cascade' }),
  competitionId: varchar('competition_id', { length: 36 })
    .notNull()
    .references(() => scCompetitions.id, { onDelete: 'cascade' }),
  season: varchar('season', { length: 32 }),
  membershipStatus: varchar('membership_status', { length: 64 }), // 'official_directory_observed' | …
  evidenceUrl: varchar('evidence_url', { length: 512 }),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Content sources (websites, feeds, YouTube channels) associated with teams.
 * importKey is the stable external seed identifier.
 */
export const scSources = mysqlTable('sc_sources', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 256 }).notNull().unique(),
  label: varchar('label', { length: 255 }),
  url: varchar('url', { length: 1024 }),
  format: varchar('format', { length: 64 }),           // 'directory' | 'news' | 'video' | 'podcast' | …
  authority: varchar('authority', { length: 32 }),      // 'official' | 'fan' | 'media'
  scope: varchar('scope', { length: 32 }),              // 'team' | 'league' | 'general'
  integrationStatus: varchar('integration_status', { length: 32 }), // 'link_only' | 'rss' | 'api'
  feedEndpoint: varchar('feed_endpoint', { length: 1024 }),
  connectorEnabled: boolean('connector_enabled').default(false),
  rightsStatus: varchar('rights_status', { length: 32 }),
  verificationStatus: varchar('verification_status', { length: 64 }),
  evidenceUrl: varchar('evidence_url', { length: 512 }),
  notes: text('notes'),
  lastChecked: varchar('last_checked', { length: 16 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Join table: which sources belong to which teams.
 */
export const scTeamSources = mysqlTable('sc_team_sources', {
  id: varchar('id', { length: 36 }).primaryKey(),
  teamId: varchar('team_id', { length: 36 })
    .notNull()
    .references(() => scTeams.id, { onDelete: 'cascade' }),
  sourceId: varchar('source_id', { length: 36 })
    .notNull()
    .references(() => scSources.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Import log — records ambiguous matches, conflicts, and skipped rows
 * encountered during the team/source seed import.
 */
export const scImportLog = mysqlTable('sc_import_log', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 256 }).notNull(),
  entityType: varchar('entity_type', { length: 32 }).notNull(), // 'team' | 'competition' | 'source'
  action: varchar('action', { length: 32 }).notNull(),          // 'inserted' | 'updated' | 'skipped' | 'conflict'
  reason: text('reason'),
  payload: text('payload'),                                      // JSON snapshot of the row attempted
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: varchar('resolved_by', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Fan Profile: User Following + Saved (fan content) ────────────────────────

/**
 * Teams and competitions a user is following.
 * entityType + entityId point at sc_teams or sc_competitions.
 */
export const scUserFollowing = mysqlTable('sc_user_following', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 32 }).notNull(), // 'team' | 'competition'
  entityId: varchar('entity_id', { length: 36 }).notNull(),
  followedAt: timestamp('followed_at').defaultNow(),
});

/**
 * Fan-saved items (articles, videos, podcast episodes from the source directory).
 * Separate from scSavedItems which is scoped to scDevContent.
 */
export const scFanSavedItems = mysqlTable('sc_fan_saved_items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Polymorphic reference — no FK constraint so saves survive source cleanup
  contentType: varchar('content_type', { length: 32 }).notNull(), // 'article' | 'video' | 'podcast' | 'tryout'
  externalId: varchar('external_id', { length: 256 }).notNull(),  // URL or stable ID
  title: varchar('title', { length: 512 }),
  sourceId: varchar('source_id', { length: 36 }),                 // sc_sources.id if known
  teamId: varchar('team_id', { length: 36 }),                     // sc_teams.id if known
  savedAt: timestamp('saved_at').defaultNow(),
});

export const scFeedPrefs = mysqlTable('sc_feed_prefs', {
  feedId: varchar('feed_id', { length: 36 })
    .primaryKey()
    .references(() => scCalendarFeeds.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  visible: boolean('visible').notNull().default(true),
  color: varchar('color', { length: 7 }),  // hex e.g. '#22c55e', null = use provider default
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Fan & Parent Portal: Families, Sharing, Migration Audit ─────────────────

/**
 * A family unit owned by one parent account.
 * Created during parent setup; never inferred from email or legacy data.
 * ownerUserId must have accessType = 'PARENT' before any family data is returned.
 */
export const scFamilies = mysqlTable('sc_families', {
  id: varchar('id', { length: 36 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),  // restrict: don't silently orphan families
  displayName: varchar('display_name', { length: 128 }),   // e.g. "The Smith Family"
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Sharing grants: a parent can invite another account to access a scoped
 * subset of their family data (e.g. calendar-only for a co-parent).
 *
 * Security rules enforced at the API layer:
 * - A pending invite grants NO access.
 * - Invitations are single-use and addressed to the verified recipient account.
 * - Revoked grants stop access on the next request.
 * - A calendar-only guardian cannot edit players or manage invitations.
 * - Sharing is not automatically reciprocal.
 */
export const scFamilySharing = mysqlTable('sc_family_sharing', {
  id: varchar('id', { length: 36 }).primaryKey(),
  familyId: varchar('family_id', { length: 36 })
    .notNull()
    .references(() => scFamilies.id, { onDelete: 'cascade' }),
  /** The account being invited/granted access. */
  granteeUserId: varchar('grantee_user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Comma-separated permission set, e.g. 'calendar_read' | 'player_read' | 'player_write'.
   * Stored as a string so new permissions can be added without schema changes.
   * API layer validates against the known permission set.
   */
  permissions: varchar('permissions', { length: 256 }).notNull(),
  /**
   * Optional: restrict grant to a specific player within the family.
   * Null = all players in the family (within the permission set).
   */
  playerScope: varchar('player_scope', { length: 36 }),  // sc_player_profiles.id or null
  status: varchar('status', { length: 16 }).notNull().default('pending'), // 'pending' | 'active' | 'revoked' | 'expired'
  /** Token sent to the recipient; single-use, hashed before storage. */
  inviteTokenHash: varchar('invite_token_hash', { length: 64 }),
  inviteEmail: varchar('invite_email', { length: 255 }),  // email the invite was addressed to
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  revokedBy: varchar('revoked_by', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Audit log for the account-type migration.
 * Records every decision made by scripts/migrate-account-types.ts so the
 * migration is fully reversible and ambiguous accounts are traceable.
 *
 * action values:
 *   'set_fan'      — accessType set to FAN (from 'fan' or 'player' memberType, or no profile)
 *   'set_parent'   — accessType set to PARENT (from 'both' memberType)
 *   'flagged'      — ambiguous; set to FAN pending manual review
 *   'skipped'      — already had a non-null accessType; not overwritten
 */
export const scAccountMigrationLog = mysqlTable('sc_account_migration_log', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 16 }).notNull(), // 'set_fan' | 'set_parent' | 'flagged' | 'skipped'
  previousMemberType: varchar('previous_member_type', { length: 16 }), // legacy value before migration
  previousAccessType: varchar('previous_access_type', { length: 8 }),  // null if first migration
  newAccessType: varchar('new_access_type', { length: 8 }),             // value written (or would-be for dry-run)
  reason: text('reason'),          // human-readable explanation
  dryRun: boolean('dry_run').notNull().default(false),
  resolvedAt: timestamp('resolved_at'),   // set when a flagged account is manually reviewed
  resolvedBy: varchar('resolved_by', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Parent portal posts.
 * audience: 'only_me' | 'family' | 'connections'
 * mediaUrls: JSON array of { url, type: 'image'|'video', caption? }
 * Server enforces audience permissions on read.
 * Minor player profiles are never public.
 */
export const scParentPosts = mysqlTable('sc_parent_posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  authorUserId: varchar('author_user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  familyId: varchar('family_id', { length: 36 })
    .references(() => scFamilies.id, { onDelete: 'cascade' }),
  /** 'only_me' | 'family' | 'connections' */
  audience: varchar('audience', { length: 16 }).notNull().default('only_me'),
  body: text('body'),
  /** JSON: Array<{ url: string; type: 'image'|'video'; caption?: string }> */
  mediaUrls: text('media_urls'),
  sharedSourceUrl: varchar('shared_source_url', { length: 512 }),
  sharedSourceTitle: varchar('shared_source_title', { length: 256 }),
  sharedSourceAttribution: varchar('shared_source_attribution', { length: 128 }),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Parent portal source follows.
 * A parent follows a source (club, team, org, vendor, media) to see it in their feed.
 * sourceType: 'club' | 'team' | 'org' | 'vendor' | 'media'
 * sourceId: references the relevant directory record id (or a well-known slug for media)
 * Follows are separate from player affiliations.
 */
export const scParentFollows = mysqlTable('sc_parent_follows', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 16 }).notNull(), // 'club'|'team'|'org'|'vendor'|'media'
  sourceId: varchar('source_id', { length: 128 }).notNull(),    // directory record id or slug
  sourceName: varchar('source_name', { length: 256 }),          // denormalized for display
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Parent portal media uploads.
 * Files are stored at /shared-storage/public/assets/parent-media/{userId}/{filename}
 * and served at /airo-assets/uploads/parent-media/{userId}/{filename}.
 *
 * postId is set when the media is attached to a post; null for gallery-only uploads.
 * deletedAt is soft-delete; files are purged by a background job.
 */
export const scParentMedia = mysqlTable('sc_parent_media', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** sc_parent_posts.id — null until attached to a post */
  postId: varchar('post_id', { length: 36 }),
  /** Relative path under /airo-assets/uploads/ — e.g. parent-media/abc123/photo.jpg */
  storagePath: varchar('storage_path', { length: 512 }).notNull(),
  /** Public URL served by the asset proxy */
  publicUrl: varchar('public_url', { length: 512 }).notNull(),
  /** 'image' | 'video' */
  mediaType: varchar('media_type', { length: 8 }).notNull(),
  /** Original filename from the upload */
  originalName: varchar('original_name', { length: 255 }),
  /** MIME type, e.g. 'image/jpeg' */
  mimeType: varchar('mime_type', { length: 64 }),
  /** File size in bytes */
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  /** Optional user-supplied caption */
  caption: varchar('caption', { length: 512 }),
  /** Soft delete — file is purged by background job */
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Parent portal network connections.
 * A connection is a mutual relationship between two parent accounts.
 * Initiated by one parent (requesterId), accepted by the other (addresseeId).
 *
 * status: 'pending' | 'accepted' | 'rejected' | 'removed'
 * Permissions for sharing are enforced at the API layer based on status.
 */
export const scParentConnections = mysqlTable('sc_parent_connections', {
  id: varchar('id', { length: 36 }).primaryKey(),
  requesterId: varchar('requester_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  addresseeId: varchar('addressee_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** 'pending' | 'accepted' | 'rejected' | 'removed' */
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  /** Optional message from requester */
  message: varchar('message', { length: 256 }),
  acceptedAt: timestamp('accepted_at'),
  rejectedAt: timestamp('rejected_at'),
  removedAt: timestamp('removed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Parent portal manual calendar events.
 * Created by the parent directly (not imported from a feed).
 * Separate from sc_personal_events (fan portal) and sc_calendar_events (feed imports).
 */
export const scParentManualEvents = mysqlTable('sc_parent_manual_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 512 }).notNull(),
  /** ISO 8601 with tz offset, e.g. "2026-10-17T10:00:00-06:00" */
  startAt: varchar('start_at', { length: 32 }).notNull(),
  endAt: varchar('end_at', { length: 32 }),
  allDay: boolean('all_day').default(false),
  location: varchar('location', { length: 512 }),
  notes: text('notes'),
  /** 'game' | 'practice' | 'event' | 'other' */
  eventType: varchar('event_type', { length: 32 }).default('event'),
  /** Optional: link to a player profile */
  playerId: varchar('player_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * sc_player_match_records — calendar-linked match performance records.
 *
 * One row per player per game. Links a player profile to a calendar event
 * (manual event or imported feed event) and records their match stats.
 *
 * IMPORTANT: This table requires the run-schema-match-records migration to
 * exist in production. It is defined here for type safety but the table
 * does NOT exist until that migration is run.
 *
 * Rules:
 *   - Unique on (player_id, event_ref) — prevents duplicate records per game.
 *   - participated must be explicitly set to true; scheduled games are not
 *     counted automatically.
 *   - stat_* columns mirror sc_player_profiles but are per-match, not seasonal.
 *   - season_totals_override: if true, these match stats are excluded from
 *     automatic season aggregation (parent manages totals manually).
 */
export const scPlayerMatchRecords = mysqlTable('sc_player_match_records', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  playerId: varchar('player_id', { length: 36 }).notNull(),
  /** Opaque reference to the calendar event (manual event id or feed event uid) */
  eventRef: varchar('event_ref', { length: 256 }).notNull(),
  /** ISO date of the match, e.g. "2026-10-17" */
  matchDate: varchar('match_date', { length: 10 }),
  opponent: varchar('opponent', { length: 256 }),
  season: varchar('season', { length: 64 }),
  /** Position played in this specific match */
  positionPlayed: varchar('position_played', { length: 64 }),
  /** Must be explicitly confirmed — never auto-set from schedule */
  participated: boolean('participated').default(false),
  // Per-match stats (same set as seasonal stats)
  statGp:      int('stat_gp'),
  statGoals:   int('stat_goals'),
  statAssists: int('stat_assists'),
  statShots:   int('stat_shots'),
  statGa:      int('stat_ga'),
  statSaves:   int('stat_saves'),
  statSo:      int('stat_so'),
  /** Free-text notes about this match */
  notes: text('notes'),
  /** If true, exclude from automatic season aggregation */
  seasonTotalsOverride: boolean('season_totals_override').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Recruiting ───────────────────────────────────────────────────────────────
// All recruiting tables are private: never exposed through public APIs,
// public pages, or sitemaps. Access requires authentication + U16+ age gate.

/**
 * College soccer programs — one row per institution + gender combination.
 * Sourced from official athletics pages; never generated or guessed.
 *
 * regions: comma-separated slugs matching directory_regions.json
 *   e.g. "colorado", "arizona", "cal-south", "cal-north", "oregon", "washington", "nevada"
 * division: 'NCAA D1' | 'NCAA D2' | 'NCAA D3' | 'NAIA' | 'NJCAA' | null (unknown)
 * gender: 'mens' | 'womens'
 */
export const scCollegePrograms = mysqlTable('sc_college_programs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  /** Stable import key — institution slug + gender, e.g. "cu-boulder-womens" */
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  institution: varchar('institution', { length: 255 }).notNull(),
  /** Short name / abbreviation, e.g. "CU Boulder" */
  shortName: varchar('short_name', { length: 128 }),
  gender: varchar('gender', { length: 8 }).notNull(),           // 'mens' | 'womens'
  division: varchar('division', { length: 32 }),                // 'NCAA D1' | 'NCAA D2' | 'NCAA D3' | 'NAIA' | 'NJCAA' | null
  conference: varchar('conference', { length: 128 }),
  city: varchar('city', { length: 128 }),
  state: varchar('state', { length: 64 }),
  /** Comma-separated region slugs this program is relevant to */
  regions: varchar('regions', { length: 512 }).notNull(),
  /** Official athletics / soccer program page */
  programUrl: varchar('program_url', { length: 512 }),
  /** Official staff/roster page */
  staffUrl: varchar('staff_url', { length: 512 }),
  /** ISO date last checked, e.g. "2026-10-24" */
  checkedDate: varchar('checked_date', { length: 16 }),
  /** Source URL used to verify this record */
  sourceUrl: varchar('source_url', { length: 512 }),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * College soccer coaches — one row per coach.
 * Linked to a program. Contact info from official institutional sources only.
 * Missing fields are null — never guessed or generated.
 */
export const scCollegeCoaches = mysqlTable('sc_college_coaches', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  programId: varchar('program_id', { length: 36 })
    .notNull()
    .references(() => scCollegePrograms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 128 }),                       // e.g. "Head Coach", "Assistant Coach"
  /** Official email from institutional staff page — null if not published */
  email: varchar('email', { length: 255 }),
  /** True = individual coach address; false = program/department inbox */
  emailIsPersonal: boolean('email_is_personal'),
  /** Official phone from institutional staff page — null if not published */
  phone: varchar('phone', { length: 64 }),
  /** Direct link to this coach's staff profile page */
  staffPageUrl: varchar('staff_page_url', { length: 512 }),
  /** ISO date contact info was last verified */
  checkedDate: varchar('checked_date', { length: 16 }),
  sourceUrl: varchar('source_url', { length: 512 }),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * College ID camps — one row per camp event or recurring series entry.
 *
 * listingStatus:
 *   'confirmed_upcoming'  — confirmed dates, registration open or announced
 *   'historical'          — past event; dates are documented fact
 *   'estimated'           — planning window estimated from documented historical dates
 *   'directory_only'      — official camp directory exists but no current event dates
 *
 * Never present historical or estimated entries as confirmed upcoming.
 */
export const scIdCamps = mysqlTable('sc_id_camps', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  programId: varchar('program_id', { length: 36 })
    .references(() => scCollegePrograms.id, { onDelete: 'set null' }),
  /** Host institution name (denormalized for display without join) */
  institution: varchar('institution', { length: 255 }).notNull(),
  campName: varchar('camp_name', { length: 255 }).notNull(),
  region: varchar('region', { length: 64 }).notNull(),
  city: varchar('city', { length: 128 }),
  state: varchar('state', { length: 64 }),
  gender: varchar('gender', { length: 8 }),                     // 'mens' | 'womens' | 'coed'
  /** Published age/grade eligibility, e.g. "U14–U18" */
  ageEligibility: varchar('age_eligibility', { length: 128 }),
  /** Confirmed start date ISO, null if unknown */
  startDate: varchar('start_date', { length: 16 }),
  /** Confirmed end date ISO, null if unknown */
  endDate: varchar('end_date', { length: 16 }),
  /** Registration open date ISO, null if unknown */
  registrationOpens: varchar('registration_opens', { length: 16 }),
  /** Registration deadline ISO, null if unknown */
  registrationDeadline: varchar('registration_deadline', { length: 16 }),
  /** Published price, e.g. "$350" — null if not published */
  price: varchar('price', { length: 64 }),
  /** Official registration/details URL */
  registrationUrl: varchar('registration_url', { length: 512 }),
  listingStatus: varchar('listing_status', { length: 32 }).notNull(), // see above
  /** Evidence supporting an estimate — e.g. "Held June 2024 and June 2025" */
  estimateEvidence: text('estimate_evidence'),
  sourceUrl: varchar('source_url', { length: 512 }),
  checkedDate: varchar('checked_date', { length: 16 }),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Established showcases and tournaments with documented college-recruiting relevance.
 *
 * listingStatus: 'confirmed' | 'historical' | 'estimated' | 'tbd'
 * recruitingEvidence: documented basis for recruiting relevance claim
 *   (e.g. "Official college attendance list published 2024", "Showcase division listed on website")
 * Never promise exposure, attendance, or recruitment.
 */
export const scShowcases = mysqlTable('sc_showcases', {
  id: varchar('id', { length: 36 }).primaryKey(),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  organizer: varchar('organizer', { length: 255 }),
  region: varchar('region', { length: 64 }).notNull(),
  city: varchar('city', { length: 128 }),
  state: varchar('state', { length: 64 }),
  officialUrl: varchar('official_url', { length: 512 }),
  gender: varchar('gender', { length: 8 }),                     // 'mens' | 'womens' | 'coed'
  /** Published age groups, e.g. "U14–U19" */
  ageGroups: varchar('age_groups', { length: 128 }),
  /** Confirmed start date ISO */
  startDate: varchar('start_date', { length: 16 }),
  endDate: varchar('end_date', { length: 16 }),
  registrationDeadline: varchar('registration_deadline', { length: 16 }),
  /** Entry type: 'team' | 'individual' | 'both' */
  entryType: varchar('entry_type', { length: 16 }),
  listingStatus: varchar('listing_status', { length: 32 }).notNull(),
  /** Documented evidence of recruiting relevance */
  recruitingEvidence: text('recruiting_evidence'),
  /** Historical attendance note — never presented as confirmed future attendance */
  historicalAttendance: text('historical_attendance'),
  sourceUrl: varchar('source_url', { length: 512 }),
  checkedDate: varchar('checked_date', { length: 16 }),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Parent-saved recruiting opportunities (camps, showcases, coaches).
 * Scoped to a specific eligible player.
 *
 * itemType: 'camp' | 'showcase' | 'coach'
 * status: 'interested' | 'reminder_set' | 'registered'
 *   'registered' must be parent-confirmed — never auto-set.
 * calendarEventId: sc_personal_events.id if a calendar entry was added
 */
export const scRecruitingSaved = mysqlTable('sc_recruiting_saved', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  playerId: varchar('player_id', { length: 36 })
    .notNull()
    .references(() => scPlayerProfiles.id, { onDelete: 'cascade' }),
  itemType: varchar('item_type', { length: 16 }).notNull(),     // 'camp' | 'showcase' | 'coach'
  itemId: varchar('item_id', { length: 36 }).notNull(),         // sc_id_camps.id | sc_showcases.id | sc_college_coaches.id
  status: varchar('status', { length: 16 }).notNull().default('interested'), // 'interested' | 'reminder_set' | 'registered'
  /** sc_personal_events.id — set when parent adds to calendar */
  calendarEventId: varchar('calendar_event_id', { length: 36 }),
  notes: text('notes'),
  savedAt: timestamp('saved_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Coach outreach drafts — persisted per parent account.
 * No emails are sent; this is a draft/preview tool only.
 *
 * Approved fields stored as JSON string[] — only these are shown in coach preview.
 * selectedMedia: JSON array of sc_player_media_assignments.id values.
 * selectedCollection: sc_player_highlight_collections.id or null.
 * Excludes: identity documents, full DOB, medical info, payment details, Locked In records.
 */
export const scOutreachDrafts = mysqlTable('sc_outreach_drafts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  playerId: varchar('player_id', { length: 36 })
    .notNull()
    .references(() => scPlayerProfiles.id, { onDelete: 'cascade' }),
  coachId: varchar('coach_id', { length: 36 })
    .notNull()
    .references(() => scCollegeCoaches.id, { onDelete: 'cascade' }),
  /** JSON string[] — approved profile fields to share, e.g. ["name","ageBand","positions","stats"] */
  approvedFields: text('approved_fields'),
  /** sc_player_highlight_collections.id — null if no collection selected */
  selectedCollectionId: varchar('selected_collection_id', { length: 36 }),
  /** JSON string[] of sc_player_media_assignments.id — individual media items */
  selectedMedia: text('selected_media'),
  /** JSON string[] of sc_player_match_records.id — tournament/game records to include */
  selectedMatchRecords: text('selected_match_records'),
  /** Parent-written introduction text */
  introduction: text('introduction'),
  /**
   * Email subject line for the outreach draft.
   * Nullable — not required at draft creation time.
   * Max 500 chars (enforced at the application layer).
   *
   * Schema drift note: this column exists in the live database but was absent
   * from schema.ts. Reconciled 2026-10-27 — no DDL required (column already present).
   */
  subject: varchar('subject', { length: 500 }),
  /**
   * Recipient display name (coach name as the parent typed it).
   * Nullable — not required at draft creation time.
   * Max 255 chars (enforced at the application layer).
   *
   * Schema drift note: reconciled 2026-10-27 — column already present in DB.
   */
  recipientName: varchar('recipient_name', { length: 255 }),
  /**
   * Recipient email address.
   * Nullable — not required at draft creation time.
   * Max 255 chars (enforced at the application layer).
   *
   * Schema drift note: reconciled 2026-10-27 — column already present in DB.
   */
  recipientEmail: varchar('recipient_email', { length: 255 }),
  /**
   * Timestamp when the draft was sent (if sending is ever implemented).
   * Null = not yet sent. Currently always null — no sending is implemented.
   *
   * Schema drift note: reconciled 2026-10-27 — column already present in DB.
   */
  sentAt: timestamp('sent_at'),
  /** 'draft' only during this phase — no sending implemented */
  draftStatus: varchar('draft_status', { length: 16 }).notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ─── Coach Profile Links ──────────────────────────────────────────────────────
// Feature-gated: COACH_PROFILE_LINKS_ENABLED must be true before any endpoint
// that reads or writes this table is reachable. The table is created by the
// run-schema-coach-profile-v1 admin migration; do not assume it exists.

/**
 * Revocable bearer-link grants for coach access to a player profile.
 *
 * tokenHash: SHA-256 hex of the raw bearer token — the raw token is NEVER stored.
 * approvedFields: JSON string[] of field keys the parent explicitly selected.
 * selectedMedia: JSON string[] of sc_player_media_assignments.id values.
 * selectedMatchRecords: JSON string[] of sc_player_match_records.id values.
 * selectedCollectionId: sc_player_highlight_collections.id or null.
 *
 * Revocation: set revokedAt to a non-null timestamp. Expired or revoked links
 * return the same generic 404 as a link that was never issued.
 */
export const scCoachProfileLinks = mysqlTable('sc_coach_profile_links', {
  id: varchar('id', { length: 36 }).primaryKey(),
  playerId: varchar('player_id', { length: 36 })
    .notNull()
    .references(() => scPlayerProfiles.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** SHA-256 hex of the raw bearer token — raw token never stored */
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  /** Explicit field keys the parent approved, e.g. ["name","ageBand","positions","stats"] */
  approvedFields: text('approved_fields').notNull(),
  /** JSON string[] of sc_player_media_assignments.id — empty array = no media shared */
  selectedMedia: text('selected_media').notNull(),
  /** JSON string[] of sc_player_match_records.id — empty array = no records shared */
  selectedMatchRecords: text('selected_match_records').notNull(),
  /** JSON string[] of sc_parent_manual_events.id — empty array = no events shared (fail-closed) */
  selectedEvents: text('selected_events'),
  /** sc_player_highlight_collections.id or null */
  selectedCollectionId: varchar('selected_collection_id', { length: 36 }),
  /** Expiry timestamp — null means no expiry (owner must revoke manually) */
  expiresAt: timestamp('expires_at'),
  /** Set to revoke; null = active */
  revokedAt: timestamp('revoked_at'),
  /** Optional label the parent gave this link, e.g. "Colorado State — Coach Smith" */
  label: varchar('label', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

/**
 * Information requests submitted through a coach profile link.
 *
 * Requester identity is unverified — requesterName and requesterEmail are
 * self-reported. The owner sees them in a Requests section inside Recruiting.
 * No automatic email or document release occurs on submission.
 *
 * Rate-limiting and duplicate prevention are enforced server-side per linkId.
 */
export const scCoachProfileRequests = mysqlTable('sc_coach_profile_requests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  linkId: varchar('link_id', { length: 36 })
    .notNull()
    .references(() => scCoachProfileLinks.id, { onDelete: 'cascade' }),
  playerId: varchar('player_id', { length: 36 }).notNull(),
  /** Self-reported — unverified */
  requesterName: varchar('requester_name', { length: 255 }),
  /** Self-reported — unverified */
  requesterEmail: varchar('requester_email', { length: 255 }),
  /** Free-text message from the requester */
  message: text('message'),
  /** 'pending' | 'seen' | 'dismissed' */
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
