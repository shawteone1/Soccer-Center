/** POST /api/my-soccer/player-profiles — create a new player profile */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { eq, count } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const {
    label, ageBand, ageYears, positions,
    skillLevel, developmentInterests, trainingMode,
  } = req.body as {
    label?: string;
    ageBand?: string;
    ageYears?: number;
    positions?: string[];
    skillLevel?: string;
    developmentInterests?: string[];
    trainingMode?: string;
  };

  // Limit to 10 player profiles per user
  const [{ value: existingCount }] = await db.select({ value: count() })
    .from(scPlayerProfiles).where(eq(scPlayerProfiles.userId, userId));
  if (existingCount >= 10) {
    return res.status(400).json({ error: 'Maximum 10 player profiles per account' });
  }

  const id = randomUUID();
  await db.insert(scPlayerProfiles).values({
    id,
    userId,
    label: label ?? null,
    ageBand: ageBand ?? null,
    ageYears: ageYears ?? null,
    positions: JSON.stringify(positions ?? []),
    skillLevel: skillLevel ?? null,
    developmentInterests: JSON.stringify(developmentInterests ?? []),
    trainingMode: trainingMode ?? null,
    sortOrder: existingCount,
  });

  res.status(201).json({ id });
}
