/** PATCH /api/my-soccer/player-profiles/:profileId — update a player profile */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { profileId } = req.params;
  const {
    label, ageBand, ageYears, positions,
    skillLevel, developmentInterests, trainingMode,
  } = req.body as {
    label?: string | null;
    ageBand?: string;
    ageYears?: number;
    positions?: string[];
    skillLevel?: string;
    developmentInterests?: string[];
    trainingMode?: string;
  };

  type PlayerUpdate = {
    label?: string | null;
    ageBand?: string | null;
    ageYears?: number | null;
    positions?: string;
    skillLevel?: string | null;
    developmentInterests?: string;
    trainingMode?: string | null;
  };
  const updates: PlayerUpdate = {};
  if (label !== undefined) updates.label = label;
  if (ageBand !== undefined) updates.ageBand = ageBand;
  if (ageYears !== undefined) updates.ageYears = ageYears;
  if (positions !== undefined) updates.positions = JSON.stringify(positions);
  if (skillLevel !== undefined) updates.skillLevel = skillLevel;
  if (developmentInterests !== undefined) updates.developmentInterests = JSON.stringify(developmentInterests);
  if (trainingMode !== undefined) updates.trainingMode = trainingMode;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  await db.update(scPlayerProfiles).set(updates)
    .where(sql`${scPlayerProfiles.id} = ${profileId} AND ${scPlayerProfiles.userId} = ${userId}`);

  res.json({ ok: true });
}
