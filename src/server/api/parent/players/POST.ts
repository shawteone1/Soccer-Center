/**
 * POST /api/parent/players
 *
 * Creates a new player profile for the authenticated parent.
 * Protected by requireParentAccess().
 *
 * Request body:
 * {
 *   label?: string              e.g. "Alex (U12)"
 *   ageBand?: string            'U6'–'U19'
 *   ageYears?: number
 *   positions?: string[]
 *   skillLevel?: string         'beginner' | 'intermediate' | 'advanced'
 *   developmentInterests?: string[]
 *   trainingMode?: string       'solo' | 'partner' | 'team' | 'any'
 *   clubName?: string
 *   clubUrl?: string
 *   trainingPreferences?: object
 *   tryoutInterest?: boolean    default true
 * }
 *
 * ── Why raw SQL INSERT ────────────────────────────────────────────────────────
 * Drizzle's db.insert().values(obj) ALWAYS generates the full column list from
 * the schema definition, emitting DEFAULT for any column absent from the values
 * object. Confirmed via MySqlInsertBuilder.toSQL() probe against the real schema:
 *
 *   db.insert(scPlayerProfiles).values({ id, userId, label, positions,
 *     tryoutInterest, sortOrder })
 *   → INSERT INTO `sc_player_profiles` (`id`, `user_id`, `label`, ...,
 *       `gpa`, `gpa_scale`, `gpa_weighted`, `intended_major`, `college_goals`,
 *       `contact_email`, `created_at`, `updated_at`)
 *     VALUES (?, ?, ?, ..., default, default, default, default, default,
 *       default, default, default)
 *
 * Omitting a key from the values object does NOT remove it from the generated
 * SQL. When v4 migration columns are absent from the production DB, MySQL
 * returns ER_BAD_FIELD_ERROR (Unknown column 'gpa' in 'field list').
 *
 * Fix: use db.execute(sql`INSERT ...`) with sql.join() to build a raw
 * parameterized INSERT that explicitly enumerates only the columns confirmed
 * to exist at request time. Column names are hardcoded strings (no user input);
 * values are bound parameters via sql`${p}`.
 *
 * Partial migration (some v4 cols present, some absent) is handled
 * conservatively: all six v4 cols are skipped unless every one exists.
 *
 * Defaults and JSON serialization previously handled by Drizzle are preserved
 * explicitly in the params array:
 *   - positions / developmentInterests: JSON.stringify([]) when absent
 *   - tryoutInterest: boolean (mysql2 sends 1/0 natively)
 *   - sortOrder: Number(existing) — same as before
 *   - createdAt / updatedAt: omitted from INSERT; MySQL DEFAULT NOW() applies
 *   - deletedAt: omitted; MySQL DEFAULT NULL applies
 */

import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { eq, count, isNull, and, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

const MAX_PLAYERS = 10;

/** Probe whether a single column exists on sc_player_profiles. */
async function columnExists(column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`sc_player_profiles\` LIKE '${column}'`)
    ) as unknown;
    const [rows] = result as [unknown[], unknown];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Probe all optional column groups in parallel.
 *
 * v2 representative:              avatar_initials
 * clubDirectoryId representative: club_directory_id
 * v4: ALL SIX columns probed individually — partial migration is treated as
 *     absent (conservative) so we never reference a column that doesn't exist.
 *
 * Partial v4 example: if only 'gpa' exists but 'gpa_scale' does not, v4 is
 * false and none of the six are included in the INSERT. This is safe because
 * the migration endpoint adds all six atomically; a partial state means the
 * migration is still in progress or failed partway through.
 */
async function probeOptionalColumns(): Promise<{
  v2: boolean;
  clubDirectoryId: boolean;
  v4: boolean;
}> {
  const V4_COLS = [
    'gpa', 'gpa_scale', 'gpa_weighted',
    'intended_major', 'college_goals', 'contact_email',
  ] as const;

  const [v2, clubDir, ...v4Results] = await Promise.all([
    columnExists('avatar_initials'),
    columnExists('club_directory_id'),
    ...V4_COLS.map(c => columnExists(c)),
  ]);

  return {
    v2: Boolean(v2),
    clubDirectoryId: Boolean(clubDir),
    // v4 only true when ALL six exist — partial migration treated as absent
    v4: v4Results.every(Boolean),
  };
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  // Enforce per-parent player limit — count only active (non-deleted) players
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(scPlayerProfiles)
    .where(and(
      eq(scPlayerProfiles.userId, user.id),
      isNull(scPlayerProfiles.deletedAt),
    ));

  if (Number(existing) >= MAX_PLAYERS) {
    return res.status(400).json({ error: `Maximum of ${MAX_PLAYERS} player profiles allowed.` });
  }

  const body = req.body ?? {};
  const id = randomUUID();

  // Probe all optional column groups in parallel before building the INSERT.
  const cols = await probeOptionalColumns();

  // Derive avatarInitials from label if not supplied
  const rawLabel = typeof body.label === 'string' ? body.label.trim() : '';
  const derivedInitials = (() => {
    const src = typeof body.avatarInitials === 'string' ? body.avatarInitials.trim() : rawLabel;
    if (!src) return null;
    const parts = src.split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : src.slice(0, 2).toUpperCase();
  })();

  // ── Raw parameterized INSERT ──────────────────────────────────────────────
  //
  // columnNames: hardcoded strings only — no user input ever enters this list.
  // params: one entry per column, in the same order.
  //
  // Defaults preserved explicitly:
  //   positions / developmentInterests → JSON.stringify([]) matches Drizzle's
  //     text column behavior (no JSON type coercion in mysql2 raw mode).
  //   tryoutInterest → boolean; mysql2 sends true/false as 1/0 natively.
  //   sortOrder → Number(existing) — same value as before.
  //   createdAt, updatedAt, deletedAt → omitted; MySQL column DEFAULTs apply.
  //
  // sql.join() assembles the INSERT so each value is a bound parameter:
  //   sql.raw(`\`col\``) — static column name fragment, no user input
  //   sql`${p}`          — bound parameter via mysql2 parameterized query path

  const columnNames: string[] = [
    'id', 'user_id', 'label', 'age_band', 'age_years',
    'positions', 'skill_level', 'development_interests', 'training_mode',
    'club_name', 'club_url', 'training_preferences', 'tryout_interest',
    'sort_order',
  ];

  const params: unknown[] = [
    id,
    user.id,
    rawLabel || null,
    typeof body.ageBand === 'string' ? body.ageBand : null,
    typeof body.ageYears === 'number' ? body.ageYears : null,
    // JSON serialization: explicit stringify preserves the [] default that
    // Drizzle's text column previously handled via the schema default.
    Array.isArray(body.positions) ? JSON.stringify(body.positions) : '[]',
    typeof body.skillLevel === 'string' ? body.skillLevel : null,
    Array.isArray(body.developmentInterests) ? JSON.stringify(body.developmentInterests) : '[]',
    typeof body.trainingMode === 'string' ? body.trainingMode : null,
    typeof body.clubName === 'string' ? body.clubName.trim() || null : null,
    typeof body.clubUrl  === 'string' ? body.clubUrl.trim()  || null : null,
    body.trainingPreferences ? JSON.stringify(body.trainingPreferences) : null,
    // boolean: mysql2 native parameterized path sends true/false as 1/0
    body.tryoutInterest !== false,
    // sort_order: place new player after existing active ones
    Number(existing),
  ];

  // v2 identity + position columns (added by v2 migration)
  if (cols.v2) {
    columnNames.push('avatar_initials', 'primary_position', 'secondary_position', 'foot');
    params.push(
      derivedInitials,
      typeof body.primaryPosition   === 'string' ? body.primaryPosition.trim()   || null : null,
      typeof body.secondaryPosition === 'string' ? body.secondaryPosition.trim() || null : null,
      typeof body.foot              === 'string' ? body.foot.trim()              || null : null,
    );
  }

  // club_directory_id (added by v2 migration, tracked separately)
  if (cols.clubDirectoryId) {
    columnNames.push('club_directory_id');
    params.push(
      typeof body.clubDirectoryId === 'string' ? body.clubDirectoryId.trim() || null : null
    );
  }

  // v4 coach profile columns — only when ALL six exist.
  // Partial migration (some present, some absent) is treated as absent so we
  // never reference a column that doesn't exist yet. Values are null at
  // creation time; the parent fills them in via PATCH after migration runs.
  if (cols.v4) {
    columnNames.push(
      'gpa', 'gpa_scale', 'gpa_weighted',
      'intended_major', 'college_goals', 'contact_email',
    );
    params.push(null, null, null, null, null, null);
  }

  // Assemble the INSERT using sql.join() so each value is a bound parameter.
  // sql.raw() is safe here: columnNames contains only hardcoded strings.
  const colFragments = columnNames.map(c => sql.raw(`\`${c}\``));
  const valFragments = params.map(p => sql`${p}`);
  const insertQuery = sql`INSERT INTO \`sc_player_profiles\` (${sql.join(colFragments, sql`, `)}) VALUES (${sql.join(valFragments, sql`, `)})`;

  await db.execute(insertQuery);

  res.status(201).json({ id });
}
