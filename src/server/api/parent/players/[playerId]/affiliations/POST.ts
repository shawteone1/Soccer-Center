/**
 * POST /api/parent/players/:playerId/affiliations
 *
 * Adds a club/team affiliation for a specific player.
 * All affiliations are parent-entered by default.
 * Protected by requireParentAccess().
 *
 * Body: { orgKey?: string, orgName: string, season?: string, ageGroupLabel?: string }
 */

import type { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db/client.js';
import { scPlayerAffiliations, scPlayerProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);

  // Verify ownership
  const [player] = await db
    .select({ id: scPlayerProfiles.id })
    .from(scPlayerProfiles)
    .where(and(
      eq(scPlayerProfiles.id, playerId),
      eq(scPlayerProfiles.userId, user.id),
    ))
    .limit(1);

  if (!player) return res.status(404).json({ error: 'Player not found' });

  const { orgKey, orgName, season, ageGroupLabel } = req.body as {
    orgKey?: string;
    orgName?: string;
    season?: string;
    ageGroupLabel?: string;
  };

  if (!orgName?.trim()) return res.status(400).json({ error: 'orgName is required' });

  const id = randomUUID();
  await db.insert(scPlayerAffiliations).values({
    id,
    playerId,
    userId: user.id,
    orgKey: orgKey?.trim() || null,
    orgName: orgName.trim(),
    season: season?.trim() || null,
    ageGroupLabel: ageGroupLabel?.trim() || null,
    parentEntered: true,
  });

  res.status(201).json({ id, ok: true });
}
