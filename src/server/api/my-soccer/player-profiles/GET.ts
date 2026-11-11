/** GET /api/my-soccer/player-profiles — list player profiles for signed-in user
 *
 * Uses an explicit column select that excludes stat columns so the query
 * succeeds even before run-schema-stats has been applied on production.
 * Stat fields are fetched in a second attempt; on failure they return null.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

const CORE_COLS = {
  id:                   scPlayerProfiles.id,
  label:                scPlayerProfiles.label,
  ageBand:              scPlayerProfiles.ageBand,
  ageYears:             scPlayerProfiles.ageYears,
  positions:            scPlayerProfiles.positions,
  skillLevel:           scPlayerProfiles.skillLevel,
  developmentInterests: scPlayerProfiles.developmentInterests,
  trainingMode:         scPlayerProfiles.trainingMode,
  sortOrder:            scPlayerProfiles.sortOrder,
  createdAt:            scPlayerProfiles.createdAt,
};

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  let rows: Array<Record<string, unknown>>;
  let statsAvailable = true;

  try {
    rows = await db
      .select({
        ...CORE_COLS,
        statGp:      scPlayerProfiles.statGp,
        statGoals:   scPlayerProfiles.statGoals,
        statAssists: scPlayerProfiles.statAssists,
        statShots:   scPlayerProfiles.statShots,
        statGa:      scPlayerProfiles.statGa,
        statSaves:   scPlayerProfiles.statSaves,
        statSo:      scPlayerProfiles.statSo,
      })
      .from(scPlayerProfiles)
      .where(eq(scPlayerProfiles.userId, userId))
      .orderBy(asc(scPlayerProfiles.sortOrder), asc(scPlayerProfiles.createdAt)) as Array<Record<string, unknown>>;
  } catch {
    statsAvailable = false;
    rows = await db
      .select(CORE_COLS)
      .from(scPlayerProfiles)
      .where(eq(scPlayerProfiles.userId, userId))
      .orderBy(asc(scPlayerProfiles.sortOrder), asc(scPlayerProfiles.createdAt)) as Array<Record<string, unknown>>;
  }

  res.json({
    playerProfiles: rows.map((r) => ({
      id:                   r.id,
      label:                r.label,
      ageBand:              r.ageBand,
      ageYears:             r.ageYears,
      positions:            parseJson(r.positions as string | null),
      skillLevel:           r.skillLevel,
      developmentInterests: parseJson(r.developmentInterests as string | null),
      trainingMode:         r.trainingMode,
      sortOrder:            r.sortOrder,
      statGp:      statsAvailable ? ((r.statGp      as number | null) ?? null) : null,
      statGoals:   statsAvailable ? ((r.statGoals   as number | null) ?? null) : null,
      statAssists: statsAvailable ? ((r.statAssists as number | null) ?? null) : null,
      statShots:   statsAvailable ? ((r.statShots   as number | null) ?? null) : null,
      statGa:      statsAvailable ? ((r.statGa      as number | null) ?? null) : null,
      statSaves:   statsAvailable ? ((r.statSaves   as number | null) ?? null) : null,
      statSo:      statsAvailable ? ((r.statSo      as number | null) ?? null) : null,
    })),
  });
}
