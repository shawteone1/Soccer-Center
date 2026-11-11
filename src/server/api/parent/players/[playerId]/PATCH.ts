/**
 * PATCH /api/parent/players/:playerId
 *
 * Partial update of a player profile owned by the authenticated parent (v2+).
 * Includes new identity, position, and coach profile fields.
 * Only fields present in the request body are updated.
 * Protected by requireParentAccess().
 *
 * club_directory_id is added by the v2 migration. If the column is absent we
 * silently drop it from the patch so clubName still saves correctly.
 *
 * v4 coach profile fields (gpa, gpa_scale, gpa_weighted, intended_major,
 * college_goals, contact_email) are added by run-schema-coach-profile-v4.
 * If ANY of those columns are absent and the request includes v4 fields,
 * the handler returns 503 MIGRATION_REQUIRED rather than silently discarding
 * the parent's entered values. The client must surface this error.
 */

import { ukEducationSchema } from '@/lib/portal/uk-education';
import type { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

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

/** Probe whether club_directory_id column exists (added by v2 migration). */
async function clubDirectoryIdExists(): Promise<boolean> {
  return columnExists('club_directory_id');
}

const V4_COLUMNS = ['gpa', 'gpa_scale', 'gpa_weighted', 'intended_major', 'college_goals', 'contact_email'] as const;
const V4_BODY_KEYS = ['gpa', 'gpaScale', 'gpaWeighted', 'intendedMajor', 'collegeGoals', 'contactEmail'] as const;

/**
 * Returns the names of any v4 columns that are missing from the DB.
 * Only called when the request body includes at least one v4 field.
 */
async function missingV4Columns(): Promise<string[]> {
  const checks = await Promise.all(V4_COLUMNS.map(async col => ({ col, exists: await columnExists(col) })));
  return checks.filter(c => !c.exists).map(c => c.col);
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);
  const body = req.body ?? {};

  // Verify ownership — scope to user.id so a parent can't patch another parent's player
  const [existing] = await db
    .select({ id: scPlayerProfiles.id })
    .from(scPlayerProfiles)
    .where(and(eq(scPlayerProfiles.id, playerId), eq(scPlayerProfiles.userId, user.id)))
    .limit(1);

  if (!existing) return res.status(404).json({});

  // Build partial update — only include fields that were sent
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };

  if ('ukEducation' in body) {
    const parsed = ukEducationSchema.nullable().safeParse(body.ukEducation);
    if (!parsed.success) return res.status(400).json({ message: 'Check UK exam fields.' });
    if (!await columnExists('uk_education')) return res.status(503).json({ error: 'UK_MIGRATION_REQUIRED', message: 'Apply migrations/uk-education.sql before saving UK education.' });
    patch.ukEducation = parsed.data ? JSON.stringify(parsed.data) : null;
  }
  // v2 identity fields
  if ('label'           in body) patch.label           = typeof body.label === 'string' ? body.label.trim() || null : null;
  if ('birthYear'       in body) patch.birthYear       = typeof body.birthYear === 'number' ? body.birthYear : null;
  if ('jersey'          in body) patch.jersey          = typeof body.jersey === 'string' ? body.jersey.trim() || null : null;
  if ('avatarInitials'  in body) patch.avatarInitials  = typeof body.avatarInitials === 'string' ? body.avatarInitials.trim().toUpperCase().slice(0, 4) || null : null;

  // v2 position fields
  if ('primaryPosition'   in body) patch.primaryPosition   = typeof body.primaryPosition === 'string' ? body.primaryPosition.trim() || null : null;
  if ('secondaryPosition' in body) patch.secondaryPosition = typeof body.secondaryPosition === 'string' ? body.secondaryPosition.trim() || null : null;
  if ('foot'              in body) patch.foot              = typeof body.foot === 'string' ? body.foot.trim() || null : null;
  if ('goals'             in body) patch.goals             = Array.isArray(body.goals) ? JSON.stringify(body.goals) : null;

  // Legacy fields (preserved)
  if ('ageBand'              in body) patch.ageBand              = typeof body.ageBand === 'string' ? body.ageBand : null;
  if ('ageYears'             in body) patch.ageYears             = typeof body.ageYears === 'number' ? body.ageYears : null;
  if ('positions'            in body) patch.positions            = Array.isArray(body.positions) ? JSON.stringify(body.positions) : '[]';
  if ('skillLevel'           in body) patch.skillLevel           = typeof body.skillLevel === 'string' ? body.skillLevel : null;
  if ('developmentInterests' in body) patch.developmentInterests = Array.isArray(body.developmentInterests) ? JSON.stringify(body.developmentInterests) : '[]';
  if ('trainingMode'         in body) patch.trainingMode         = typeof body.trainingMode === 'string' ? body.trainingMode : null;
  if ('clubName'             in body) patch.clubName             = typeof body.clubName === 'string' ? body.clubName.trim() || null : null;
  if ('clubUrl'              in body) patch.clubUrl              = typeof body.clubUrl  === 'string' ? body.clubUrl.trim()  || null : null;
  if ('clubDirectoryId'      in body) {
    // Only write this column if it exists in the DB (added by v2 migration)
    const colExists = await clubDirectoryIdExists();
    if (colExists) {
      patch.clubDirectoryId = typeof body.clubDirectoryId === 'string' ? body.clubDirectoryId.trim() || null : null;
    }
  }
  if ('trainingPreferences'  in body) patch.trainingPreferences  = body.trainingPreferences ? JSON.stringify(body.trainingPreferences) : null;
  if ('tryoutInterest'       in body) patch.tryoutInterest       = body.tryoutInterest !== false;
  if ('sortOrder'            in body) patch.sortOrder            = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

  // Coach profile fields (v3)
  if ('graduationYear'      in body) patch.graduationYear      = typeof body.graduationYear === 'number' && Number.isInteger(body.graduationYear) && body.graduationYear >= 2020 && body.graduationYear <= 2050 ? body.graduationYear : null;
  if ('profileIntroduction' in body) patch.profileIntroduction = typeof body.profileIntroduction === 'string' ? body.profileIntroduction.slice(0, 5000).trim() || null : null;
  if ('achievements'        in body) patch.achievements        = Array.isArray(body.achievements) ? JSON.stringify((body.achievements as unknown[]).map(String).filter(Boolean)) : null;
  if ('playingLevel'        in body) patch.playingLevel        = typeof body.playingLevel === 'string' ? body.playingLevel.trim().slice(0, 64) || null : null;

  // Coach profile fields (v4) — guard: if any v4 column is missing, reject the
  // entire request with a clear error rather than silently discarding fields.
  const bodyHasV4Fields = V4_BODY_KEYS.some(k => k in body);
  if (bodyHasV4Fields) {
    const missing = await missingV4Columns();
    if (missing.length > 0) {
      res.status(503).json({
        error: 'MIGRATION_REQUIRED',
        message: 'Coach profile fields (GPA, college goals, contact email) are not yet available. An admin must run the v4 migration before these fields can be saved.',
        missingColumns: missing,
        migrationEndpoint: '/api/parent/admin/run-schema-coach-profile-v4',
      });
      return;
    }
  }

  if ('gpa'          in body) patch.gpa          = typeof body.gpa === 'string' ? body.gpa.trim().slice(0, 8) || null : null;
  if ('gpaScale'     in body) patch.gpaScale     = typeof body.gpaScale === 'string' ? body.gpaScale.trim().slice(0, 8) || null : null;
  if ('gpaWeighted'  in body) patch.gpaWeighted  = body.gpaWeighted === 'weighted' || body.gpaWeighted === 'unweighted' ? body.gpaWeighted : null;
  if ('intendedMajor' in body) patch.intendedMajor = typeof body.intendedMajor === 'string' ? body.intendedMajor.trim().slice(0, 128) || null : null;
  if ('collegeGoals' in body) patch.collegeGoals = typeof body.collegeGoals === 'string' ? body.collegeGoals.slice(0, 5000).trim() || null : null;
  if ('contactEmail' in body) patch.contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().slice(0, 255) || null : null;

  // Coach profile fields (v5 — school info)
  // These columns are added by the startup migration; silently skip if absent.
  if ('highSchool'  in body) patch.highSchool  = typeof body.highSchool  === 'string' ? body.highSchool.trim().slice(0, 128)  || null : null;
  if ('schoolCity'  in body) patch.schoolCity  = typeof body.schoolCity  === 'string' ? body.schoolCity.trim().slice(0, 64)   || null : null;
  if ('schoolState' in body) patch.schoolState = typeof body.schoolState === 'string' ? body.schoolState.trim().slice(0, 32)  || null : null;

  // Season statistics — allow null (clear) or non-negative integer; reject negative
  const statInt = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  if ('statGp'      in body) patch.statGp      = statInt(body.statGp);
  if ('statGoals'   in body) patch.statGoals   = statInt(body.statGoals);
  if ('statAssists' in body) patch.statAssists = statInt(body.statAssists);
  if ('statShots'   in body) patch.statShots   = statInt(body.statShots);
  if ('statGa'      in body) patch.statGa      = statInt(body.statGa);
  if ('statSaves'   in body) patch.statSaves   = statInt(body.statSaves);
  if ('statSo'      in body) patch.statSo      = statInt(body.statSo);

  await db
    .update(scPlayerProfiles)
    .set(patch)
    .where(and(eq(scPlayerProfiles.id, playerId), eq(scPlayerProfiles.userId, user.id)));

  res.json({ ok: true });
}
