/**
 * GET /api/parent/players/:playerId
 *
 * Returns a single player profile owned by the authenticated parent.
 * Includes affiliations. 404 if the player belongs to a different user.
 * Protected by requireParentAccess().
 *
 * Base columns (id, label, positions, stats, etc.) are always present.
 *
 * Coach profile columns are added by separate migration scripts:
 *   v1: graduation_year, profile_introduction, achievements, playing_level
 *       (run-schema-coach-profile-v1)
 *   v4: gpa, gpa_scale, gpa_weighted, intended_major, college_goals, contact_email
 *       (run-schema-coach-profile-v4)
 *
 * If those columns are absent the Drizzle query throws a DB error → 500.
 * We probe for them first and omit missing columns from the SELECT, returning
 * null in the response shape. This matches the PATCH handler's guard pattern.
 */

import { readUkEducation } from '@/server/lib/uk-education';
import type { Request, Response } from 'express';
import { and, eq, asc, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles, scPlayerAffiliations } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

/** Probe whether a column exists on sc_player_profiles. */
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

const V1_COLUMNS = ['graduation_year', 'profile_introduction', 'achievements', 'playing_level'] as const;
const V4_COLUMNS = ['gpa', 'gpa_scale', 'gpa_weighted', 'intended_major', 'college_goals', 'contact_email'] as const;
const V5_COLUMNS = ['high_school', 'school_city', 'school_state'] as const;

/** Returns which v1, v4, and v5 coach profile columns actually exist in the DB. */
async function probeCoachColumns(): Promise<{ v1Present: boolean; v4Present: boolean; v5Present: boolean }> {
  const [v1Results, v4Results, v5Results] = await Promise.all([
    Promise.all(V1_COLUMNS.map(c => columnExists(c))),
    Promise.all(V4_COLUMNS.map(c => columnExists(c))),
    Promise.all(V5_COLUMNS.map(c => columnExists(c))),
  ]);
  return {
    v1Present: v1Results.every(Boolean),
    v4Present: v4Results.every(Boolean),
    v5Present: v5Results.every(Boolean),
  };
}

const BASE_COLS = {
  id:                   scPlayerProfiles.id,
  label:                scPlayerProfiles.label,
  birthYear:            scPlayerProfiles.birthYear,
  jersey:               scPlayerProfiles.jersey,
  avatarInitials:       scPlayerProfiles.avatarInitials,
  avatarUrl:            scPlayerProfiles.avatarUrl,
  primaryPosition:      scPlayerProfiles.primaryPosition,
  secondaryPosition:    scPlayerProfiles.secondaryPosition,
  foot:                 scPlayerProfiles.foot,
  goals:                scPlayerProfiles.goals,
  ageBand:              scPlayerProfiles.ageBand,
  ageYears:             scPlayerProfiles.ageYears,
  positions:            scPlayerProfiles.positions,
  skillLevel:           scPlayerProfiles.skillLevel,
  developmentInterests: scPlayerProfiles.developmentInterests,
  trainingMode:         scPlayerProfiles.trainingMode,
  clubName:             scPlayerProfiles.clubName,
  clubUrl:              scPlayerProfiles.clubUrl,
  clubDirectoryId:      scPlayerProfiles.clubDirectoryId,
  trainingPreferences:  scPlayerProfiles.trainingPreferences,
  tryoutInterest:       scPlayerProfiles.tryoutInterest,
  sortOrder:            scPlayerProfiles.sortOrder,
  statGp:               scPlayerProfiles.statGp,
  statGoals:            scPlayerProfiles.statGoals,
  statAssists:          scPlayerProfiles.statAssists,
  statShots:            scPlayerProfiles.statShots,
  statGa:               scPlayerProfiles.statGa,
  statSaves:            scPlayerProfiles.statSaves,
  statSo:               scPlayerProfiles.statSo,
};

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);
  const where = and(
    eq(scPlayerProfiles.id, playerId),
    eq(scPlayerProfiles.userId, user.id),
    isNull(scPlayerProfiles.deletedAt),
  );

  // Probe for optional coach profile columns before building the SELECT.
  // These are added by separate migration scripts and may not exist yet.
  // Selecting a column that doesn't exist throws a DB error → 500.
  // We omit absent columns and return null in the response shape instead.
  const { v1Present, v4Present, v5Present } = await probeCoachColumns();

  const selectCols = {
    ...BASE_COLS,
    ...(v1Present ? {
      graduationYear:      scPlayerProfiles.graduationYear,
      profileIntroduction: scPlayerProfiles.profileIntroduction,
      achievements:        scPlayerProfiles.achievements,
      playingLevel:        scPlayerProfiles.playingLevel,
    } : {}),
    ...(v4Present ? {
      gpa:           scPlayerProfiles.gpa,
      gpaScale:      scPlayerProfiles.gpaScale,
      gpaWeighted:   scPlayerProfiles.gpaWeighted,
      intendedMajor: scPlayerProfiles.intendedMajor,
      collegeGoals:  scPlayerProfiles.collegeGoals,
      contactEmail:  scPlayerProfiles.contactEmail,
    } : {}),
    ...(v5Present ? {
      highSchool:  scPlayerProfiles.highSchool,
      schoolCity:  scPlayerProfiles.schoolCity,
      schoolState: scPlayerProfiles.schoolState,
    } : {}),
  };

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await db
      .select(selectCols)
      .from(scPlayerProfiles)
      .where(where)
      .limit(1) as Array<Record<string, unknown>>;
  } catch (e) {
    console.error('[GET /players/:id]', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (rows.length === 0) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const r = rows[0];

  const affiliationRows = await db
    .select()
    .from(scPlayerAffiliations)
    .where(eq(scPlayerAffiliations.playerId, playerId))
    .orderBy(asc(scPlayerAffiliations.createdAt));

  const affiliations = affiliationRows.map(a => ({
    id: a.id,
    orgName: a.orgName,
    orgKey: a.orgKey ?? null,
    season: a.season ?? null,
    ageGroupLabel: a.ageGroupLabel ?? null,
    parentEntered: a.parentEntered ?? true,
  }));

  const player = {
    ukEducation: await readUkEducation(playerId),
    id:                   r.id,
    label:                r.label,
    birthYear:            (r.birthYear as number | null) ?? null,
    jersey:               (r.jersey as string | null) ?? null,
    avatarInitials:       (r.avatarInitials as string | null) ?? null,
    avatarUrl:            (r.avatarUrl as string | null) ?? null,
    primaryPosition:      (r.primaryPosition as string | null) ?? null,
    secondaryPosition:    (r.secondaryPosition as string | null) ?? null,
    foot:                 (r.foot as string | null) ?? null,
    goals:                r.goals ? (JSON.parse(r.goals as string) as string[]) : [],
    ageBand:              r.ageBand,
    ageYears:             r.ageYears,
    positions:            r.positions ? (JSON.parse(r.positions as string) as string[]) : [],
    skillLevel:           r.skillLevel,
    developmentInterests: r.developmentInterests ? (JSON.parse(r.developmentInterests as string) as string[]) : [],
    trainingMode:         r.trainingMode,
    clubName:             r.clubName,
    clubUrl:              r.clubUrl,
    clubDirectoryId:      (r.clubDirectoryId as string | null) ?? null,
    trainingPreferences:  r.trainingPreferences ? JSON.parse(r.trainingPreferences as string) : null,
    tryoutInterest:       (r.tryoutInterest as boolean | null) ?? true,
    sortOrder:            r.sortOrder,
    statGp:      (r.statGp      as number | null) ?? null,
    statGoals:   (r.statGoals   as number | null) ?? null,
    statAssists: (r.statAssists as number | null) ?? null,
    statShots:   (r.statShots   as number | null) ?? null,
    statGa:      (r.statGa      as number | null) ?? null,
    statSaves:   (r.statSaves   as number | null) ?? null,
    statSo:      (r.statSo      as number | null) ?? null,
    statsAvailable: true,
    // Coach profile fields (v1) — null when migration has not run
    graduationYear:      v1Present ? (r.graduationYear      as number | null) ?? null : null,
    profileIntroduction: v1Present ? (r.profileIntroduction as string | null) ?? null : null,
    achievements:        v1Present && r.achievements ? (JSON.parse(r.achievements as string) as string[]) : [],
    playingLevel:        v1Present ? (r.playingLevel        as string | null) ?? null : null,
    // Coach profile fields (v4) — null when migration has not run
    gpa:           v4Present ? (r.gpa           as string | null) ?? null : null,
    gpaScale:      v4Present ? (r.gpaScale      as string | null) ?? null : null,
    gpaWeighted:   v4Present ? (r.gpaWeighted   as string | null) ?? null : null,
    intendedMajor: v4Present ? (r.intendedMajor as string | null) ?? null : null,
    collegeGoals:  v4Present ? (r.collegeGoals  as string | null) ?? null : null,
    contactEmail:  v4Present ? (r.contactEmail  as string | null) ?? null : null,
    // Coach profile fields (v5 — school info) — null when migration has not run
    highSchool:  v5Present ? (r.highSchool  as string | null) ?? null : null,
    schoolCity:  v5Present ? (r.schoolCity  as string | null) ?? null : null,
    schoolState: v5Present ? (r.schoolState as string | null) ?? null : null,
    affiliations,
  };

  res.json({ player });
}
