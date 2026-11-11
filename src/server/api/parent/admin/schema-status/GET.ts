/**
 * GET /api/parent/admin/schema-status
 *
 * Read-only admin endpoint. Reports whether the columns required for
 * calendar portal isolation and fan profile identity exist in the
 * currently connected database.
 *
 * Identifies which environment/database is being checked by reading
 * the DB host from the connection string (masked to hostname only).
 *
 * Admin-only. Returns 403 if the caller is not an admin.
 *
 * Response shape:
 * {
 *   environment: string,          // 'preview' | 'production' | 'unknown'
 *   dbHost: string,               // masked hostname only (no credentials)
 *   checkedAt: string,            // ISO timestamp
 *   calendarFeeds: {
 *     table: 'sc_calendar_feeds',
 *     columns: { name, required, exists, note }[]
 *     allPresent: boolean
 *   },
 *   memberProfiles: {
 *     table: 'sc_member_profiles',
 *     columns: { name, required, exists, note }[]
 *     allPresent: boolean
 *   },
 *   playerProfiles: {
 *     table: 'sc_player_profiles',
 *     columns: { name, required, exists, note }[]
 *     allPresent: boolean
 *   },
 *   follows: {
 *     scUserFollowing: { exists: boolean },
 *     scParentFollows: { exists: boolean }
 *   },
 *   sources: {
 *     table: 'sc_sources',
 *     tableExists: boolean,
 *     rowCount: number | null     // null if table absent
 *   },
 *   readyToDeploy: boolean,       // true = all required columns present
 *   blockers: string[]            // human-readable list of missing required columns
 * }
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

interface ColumnSpec {
  name: string;
  required: boolean;
  note: string;
}

interface ColumnResult extends ColumnSpec {
  exists: boolean;
}

const CALENDAR_FEEDS_COLUMNS: ColumnSpec[] = [
  {
    name: 'portal_context',
    required: true,
    note: 'Added by run-schema-v4. NULL = unassigned legacy feed — excluded from both calendars until assigned. Required for portal isolation.',
  },
  {
    name: 'color',
    required: false,
    note: 'Added by run-schema-v4. Feed color preference.',
  },
  {
    name: 'visible',
    required: false,
    note: 'Added by run-schema-v4. Feed visibility toggle.',
  },
];

const MEMBER_PROFILES_COLUMNS: ColumnSpec[] = [
  {
    name: 'display_name',
    required: true,
    note: 'Added by run-schema-fan-profile. Fan identity display name.',
  },
  {
    name: 'bio',
    required: true,
    note: 'Added by run-schema-fan-profile. Fan profile bio.',
  },
  {
    name: 'avatar_url',
    required: true,
    note: 'Added by run-schema-fan-profile. Fan uploaded avatar URL.',
  },
  {
    name: 'cover_image_url',
    required: true,
    note: 'Added by run-schema-fan-profile. Fan uploaded cover image URL.',
  },
  {
    name: 'location',
    required: true,
    note: 'Added by run-schema-fan-profile. Fan profile location string.',
  },
  {
    name: 'fav_leagues',
    required: true,
    note: 'Base schema column. JSON string[] of league slugs. Required for scores ticker preference.',
  },
  {
    name: 'fav_teams',
    required: false,
    note: 'Base schema column. JSON string[] of team slugs.',
  },
];

// ── sc_player_profiles stat columns (added by run-schema-stats) ───────────────
const PLAYER_PROFILES_STAT_COLUMNS: ColumnSpec[] = [
  { name: 'stat_gp',      required: false, note: 'Added by run-schema-stats. Games played.' },
  { name: 'stat_goals',   required: false, note: 'Added by run-schema-stats. Goals scored (outfield).' },
  { name: 'stat_assists', required: false, note: 'Added by run-schema-stats. Assists (outfield).' },
  { name: 'stat_shots',   required: false, note: 'Added by run-schema-stats. Shots (outfield).' },
  { name: 'stat_ga',      required: false, note: 'Added by run-schema-stats. Goals against (goalkeeper).' },
  { name: 'stat_saves',   required: false, note: 'Added by run-schema-stats. Saves (goalkeeper).' },
  { name: 'stat_so',      required: false, note: 'Added by run-schema-stats. Shutouts (goalkeeper).' },
];

// ── sc_player_profiles v4 coach profile columns (added by run-schema-coach-profile-v4) ──
const PLAYER_PROFILES_V4_COLUMNS: ColumnSpec[] = [
  { name: 'gpa',            required: true,  note: 'Added by run-schema-coach-profile-v4. GPA value string.' },
  { name: 'gpa_scale',      required: true,  note: 'Added by run-schema-coach-profile-v4. GPA scale string.' },
  { name: 'gpa_weighted',   required: true,  note: 'Added by run-schema-coach-profile-v4. weighted/unweighted.' },
  { name: 'intended_major', required: true,  note: 'Added by run-schema-coach-profile-v4. Intended major.' },
  { name: 'college_goals',  required: true,  note: 'Added by run-schema-coach-profile-v4. College goals text.' },
  { name: 'contact_email',  required: true,  note: 'Added by run-schema-coach-profile-v4. Coach contact email.' },
];

// ── sc_player_profiles v1 coach profile columns (added by run-schema-coach-profile-v1) ──
const PLAYER_PROFILES_V1_COLUMNS: ColumnSpec[] = [
  { name: 'graduation_year',       required: true, note: 'Added by run-schema-coach-profile-v1. Graduation year.' },
  { name: 'profile_introduction',  required: true, note: 'Added by run-schema-coach-profile-v1. Profile intro text.' },
  { name: 'achievements',          required: true, note: 'Added by run-schema-coach-profile-v1. Achievements JSON.' },
  { name: 'playing_level',         required: true, note: 'Added by run-schema-coach-profile-v1. Playing level string.' },
];

// ── sc_player_profiles UK education column (added by run-schema-uk-education) ──
const PLAYER_PROFILES_UK_COLUMNS: ColumnSpec[] = [
  { name: 'uk_education', required: true, note: 'Added by run-schema-uk-education. UK exam pathway JSON (nullable).' },
];

// ── sc_coach_profile_links columns (created by run-schema-coach-profile-v1) ──
const COACH_LINKS_COLUMNS: ColumnSpec[] = [
  { name: 'id',                    required: true, note: 'Primary key.' },
  { name: 'player_id',             required: true, note: 'FK to sc_player_profiles.' },
  { name: 'user_id',               required: true, note: 'FK to user.' },
  { name: 'token_hash',            required: true, note: 'SHA-256 of the raw token.' },
  { name: 'approved_fields',       required: true, note: 'JSON array of approved field names.' },
  { name: 'selected_match_records',required: true, note: 'JSON array of match record IDs.' },
  { name: 'selected_media',        required: true, note: 'JSON array of media assignment IDs.' },
  { name: 'selected_events',       required: true, note: 'Added by run-schema-coach-profile-v1 rev2. JSON array of event IDs.' },
  { name: 'expires_at',            required: true, note: 'Expiry timestamp.' },
  { name: 'revoked_at',            required: false, note: 'Revocation timestamp (nullable).' },
  { name: 'label',                 required: false, note: 'Optional human-readable label.' },
  { name: 'created_at',            required: true, note: 'Creation timestamp.' },
];

// ── sc_coach_profile_requests columns (created by run-schema-coach-profile-v1) ──
const COACH_REQUESTS_COLUMNS: ColumnSpec[] = [
  { name: 'id',          required: true, note: 'Primary key.' },
  { name: 'link_id',     required: true, note: 'FK to sc_coach_profile_links.' },
  { name: 'player_id',   required: true, note: 'FK to sc_player_profiles.' },
  { name: 'user_id',     required: true, note: 'FK to user (player owner).' },
  { name: 'coach_name',  required: true, note: 'Coach name from request body.' },
  { name: 'coach_email', required: true, note: 'Coach email from request body.' },
  { name: 'message',     required: false, note: 'Optional message.' },
  { name: 'read_at',     required: false, note: 'Read timestamp (nullable).' },
  { name: 'created_at',  required: true, note: 'Creation timestamp.' },
];

async function checkColumn(table: string, column: string): Promise<boolean> {
  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for actual rows.
    // The raw result is always a 2-element tuple; using Array.isArray() on it gives length 2
    // which is always > 0 and cannot be used as a column-existence check.
    const result = await db.execute(sql.raw(
      `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`
    )) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length > 0;
  } catch {
    return false;
  }
}

async function checkTableExists(table: string): Promise<boolean> {
  try {
    const result = await db.execute(sql.raw(`SELECT 1 FROM \`${table}\` LIMIT 1`)) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length >= 0; // table exists if query didn't throw
  } catch {
    return false;
  }
}

async function countRows(table: string): Promise<number | null> {
  try {
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${table}\``)) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    const first = arr[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    const cnt = first['cnt'] ?? first['COUNT(*)'];
    return typeof cnt === 'number' ? cnt : parseInt(String(cnt), 10);
  } catch {
    return null;
  }
}

/**
 * Read the DB host from the platform config file at $NOMAD_TASK_DIR/config.json.
 * This is the same source used by getDatabaseCredentials() in db/config.ts.
 * Returns 'unknown' if the file is absent or the host field is missing.
 * Never returns credentials — hostname only.
 */
function getDbHostFromConfig(): string {
  try {
    const configPath = join(env.NOMAD_TASK_DIR || '/local', 'config.json');
    if (!existsSync(configPath)) return 'unknown';
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      DATABASE?: { VALUE?: { HOST?: string } };
    };
    return config?.DATABASE?.VALUE?.HOST ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Classify the environment from the DB hostname.
 *
 * This is a best-effort heuristic. The hostname itself is the authoritative
 * signal — the environment label is advisory only. Preview results do not
 * establish production readiness: the same code runs against a different
 * database when deployed to production.
 */
function detectEnvironment(host: string): 'preview' | 'production' | 'unknown' {
  if (!host || host === 'unknown') return 'unknown';
  const lower = host.toLowerCase();
  if (lower.includes('preview') || lower.includes('dev') || lower.includes('staging') || lower.includes('local')) {
    return 'preview';
  }
  if (lower.includes('prod') || lower.includes('rds') || lower.includes('mysql')) {
    return 'production';
  }
  return 'unknown';
}

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  // Read host from the platform config file — the same source used by the DB
  // connection pool. This is the only reliable way to identify which database
  // is being checked. The environment label is advisory; the hostname is authoritative.
  // Preview results do not establish production readiness.
  const dbHost = getDbHostFromConfig();
  const environment = detectEnvironment(dbHost);

  try {
    // Check sc_calendar_feeds columns
    const calendarResults: ColumnResult[] = await Promise.all(
      CALENDAR_FEEDS_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_calendar_feeds', spec.name),
      }))
    );

    // Check sc_member_profiles columns
    const profileResults: ColumnResult[] = await Promise.all(
      MEMBER_PROFILES_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_member_profiles', spec.name),
      }))
    );

    // Check sc_player_profiles stat columns (run-schema-stats)
    const playerStatResults: ColumnResult[] = await Promise.all(
      PLAYER_PROFILES_STAT_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_player_profiles', spec.name),
      }))
    );

    // Check sc_player_profiles v4 coach profile columns (run-schema-coach-profile-v4)
    const playerV4Results: ColumnResult[] = await Promise.all(
      PLAYER_PROFILES_V4_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_player_profiles', spec.name),
      }))
    );

    // Check sc_player_profiles v1 coach profile columns (run-schema-coach-profile-v1)
    const playerV1Results: ColumnResult[] = await Promise.all(
      PLAYER_PROFILES_V1_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_player_profiles', spec.name),
      }))
    );

    // Check sc_player_profiles UK education column (run-schema-uk-education)
    const playerUkResults: ColumnResult[] = await Promise.all(
      PLAYER_PROFILES_UK_COLUMNS.map(async (spec) => ({
        ...spec,
        exists: await checkColumn('sc_player_profiles', spec.name),
      }))
    );

    // Check sc_coach_profile_links table and columns
    const coachLinksTableExists = await checkTableExists('sc_coach_profile_links');
    const coachLinksColumnResults: ColumnResult[] = coachLinksTableExists
      ? await Promise.all(
          COACH_LINKS_COLUMNS.map(async (spec) => ({
            ...spec,
            exists: await checkColumn('sc_coach_profile_links', spec.name),
          }))
        )
      : COACH_LINKS_COLUMNS.map((spec) => ({ ...spec, exists: false }));

    // Check sc_coach_profile_requests table and columns
    const coachRequestsTableExists = await checkTableExists('sc_coach_profile_requests');
    const coachRequestsColumnResults: ColumnResult[] = coachRequestsTableExists
      ? await Promise.all(
          COACH_REQUESTS_COLUMNS.map(async (spec) => ({
            ...spec,
            exists: await checkColumn('sc_coach_profile_requests', spec.name),
          }))
        )
      : COACH_REQUESTS_COLUMNS.map((spec) => ({ ...spec, exists: false }));

    // Check follows tables exist
    const userFollowingExists  = await checkTableExists('sc_user_following');
    const parentFollowsExists  = await checkTableExists('sc_parent_follows');

    // Check sc_sources row count
    const sourcesTableExists = await checkTableExists('sc_sources');
    const sourcesRowCount    = sourcesTableExists ? await countRows('sc_sources') : null;

    const calendarAllPresent     = calendarResults.filter(c => c.required).every(c => c.exists);
    const profileAllPresent      = profileResults.filter(c => c.required).every(c => c.exists);
    const playerV4AllPresent     = playerV4Results.filter(c => c.required).every(c => c.exists);
    const playerV1AllPresent     = playerV1Results.filter(c => c.required).every(c => c.exists);
    const playerUkAllPresent     = playerUkResults.filter(c => c.required).every(c => c.exists);
    const coachLinksAllPresent   = coachLinksTableExists && coachLinksColumnResults.filter(c => c.required).every(c => c.exists);
    const coachRequestsAllPresent = coachRequestsTableExists && coachRequestsColumnResults.filter(c => c.required).every(c => c.exists);

    // readyToDeploy covers the original calendar/profile gates.
    // coachProfileReady is a separate gate for the coach profile feature.
    const readyToDeploy      = calendarAllPresent && profileAllPresent;
    const coachProfileReady  = playerV4AllPresent && playerV1AllPresent && coachLinksAllPresent && coachRequestsAllPresent;

    const blockers: string[] = [
      ...calendarResults.filter(c => c.required && !c.exists).map(c => `sc_calendar_feeds.${c.name} — ${c.note}`),
      ...profileResults.filter(c => c.required && !c.exists).map(c => `sc_member_profiles.${c.name} — ${c.note}`),
    ];

    const coachProfileBlockers: string[] = [
      ...playerV4Results.filter(c => c.required && !c.exists).map(c => `sc_player_profiles.${c.name} — ${c.note}`),
      ...playerV1Results.filter(c => c.required && !c.exists).map(c => `sc_player_profiles.${c.name} — ${c.note}`),
      ...(!coachLinksTableExists ? ['sc_coach_profile_links — table missing. Run run-schema-coach-profile-v1.'] : []),
      ...coachLinksColumnResults.filter(c => c.required && !c.exists).map(c => `sc_coach_profile_links.${c.name} — ${c.note}`),
      ...(!coachRequestsTableExists ? ['sc_coach_profile_requests — table missing. Run run-schema-coach-profile-v1.'] : []),
      ...coachRequestsColumnResults.filter(c => c.required && !c.exists).map(c => `sc_coach_profile_requests.${c.name} — ${c.note}`),
    ];

    res.json({
      environment,
      dbHost,
      checkedAt: new Date().toISOString(),
      calendarFeeds: {
        table: 'sc_calendar_feeds',
        columns: calendarResults,
        allPresent: calendarAllPresent,
      },
      memberProfiles: {
        table: 'sc_member_profiles',
        columns: profileResults,
        allPresent: profileAllPresent,
      },
      playerProfiles: {
        table: 'sc_player_profiles',
        statColumns: {
          columns: playerStatResults,
          allPresent: playerStatResults.filter(c => c.required).every(c => c.exists),
          note: 'Stat columns are optional — added by run-schema-stats.',
        },
        v4CoachProfileColumns: {
          columns: playerV4Results,
          allPresent: playerV4AllPresent,
          note: 'Required for Build Profile (GPA, college goals, contact email). Run run-schema-coach-profile-v4 if any are missing.',
        },
        v1CoachProfileColumns: {
          columns: playerV1Results,
          allPresent: playerV1AllPresent,
          note: 'Required for coach profile sharing. Run run-schema-coach-profile-v1 if any are missing.',
        },
        ukEducationColumns: {
          columns: playerUkResults,
          allPresent: playerUkAllPresent,
          note: 'Required for UK exam pathway. Run run-schema-uk-education if missing.',
        },
      },
      coachProfile: {
        ready: coachProfileReady,
        blockers: coachProfileBlockers,
        scCoachProfileLinks: {
          tableExists: coachLinksTableExists,
          columns: coachLinksColumnResults,
          allRequiredPresent: coachLinksAllPresent,
          note: 'Created by run-schema-coach-profile-v1.',
        },
        scCoachProfileRequests: {
          tableExists: coachRequestsTableExists,
          columns: coachRequestsColumnResults,
          allRequiredPresent: coachRequestsAllPresent,
          note: 'Created by run-schema-coach-profile-v1.',
        },
      },
      follows: {
        scUserFollowing: { exists: userFollowingExists, note: 'Fan-scoped follows (team|competition|source).' },
        scParentFollows: { exists: parentFollowsExists, note: 'Parent-scoped follows (club|team|org|vendor|media).' },
      },
      sources: {
        table: 'sc_sources',
        tableExists: sourcesTableExists,
        rowCount: sourcesRowCount,
        note: 'Expected 53 rows after seed-sources migration.',
      },
      readyToDeploy,
      blockers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: 'Database check failed', detail: message });
  }
}
