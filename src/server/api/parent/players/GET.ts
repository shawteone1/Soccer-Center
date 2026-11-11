/**
 * GET /api/parent/players
 *
 * Returns all active (non-deleted) player profiles owned by the authenticated parent.
 * All columns (stat_*, deleted_at, avatar_url, club_directory_id, etc.) are part of
 * the base Drizzle schema and always present.
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq, asc, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

const CORE_COLS = {
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
  trainingPreferences:  scPlayerProfiles.trainingPreferences,
  tryoutInterest:       scPlayerProfiles.tryoutInterest,
  sortOrder:            scPlayerProfiles.sortOrder,
  createdAt:            scPlayerProfiles.createdAt,
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

  const where = and(eq(scPlayerProfiles.userId, user.id), isNull(scPlayerProfiles.deletedAt));

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await db
      .select(CORE_COLS)
      .from(scPlayerProfiles)
      .where(where)
      .orderBy(asc(scPlayerProfiles.sortOrder), asc(scPlayerProfiles.createdAt)) as Array<Record<string, unknown>>;
  } catch (e) {
    console.error('[GET /players]', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  const players = rows.map(r => ({
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
  }));

  res.json({ players });
}
