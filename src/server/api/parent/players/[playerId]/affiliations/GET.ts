/**
 * GET /api/parent/players/:playerId/affiliations
 *
 * Returns all club/team affiliations for a specific player.
 * Enforces family ownership — only the owning parent can read.
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerAffiliations, scPlayerProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);

  // Verify ownership — player must belong to this user
  const [player] = await db
    .select({ id: scPlayerProfiles.id })
    .from(scPlayerProfiles)
    .where(and(
      eq(scPlayerProfiles.id, playerId),
      eq(scPlayerProfiles.userId, user.id),
    ))
    .limit(1);

  if (!player) return res.status(404).json({ error: 'Player not found' });

  const rows = await db
    .select()
    .from(scPlayerAffiliations)
    .where(and(
      eq(scPlayerAffiliations.playerId, playerId),
      eq(scPlayerAffiliations.userId, user.id),
    ));

  res.json({
    affiliations: rows.map(r => ({
      id: r.id,
      orgKey: r.orgKey,
      orgName: r.orgName,
      season: r.season,
      ageGroupLabel: r.ageGroupLabel,
      parentEntered: r.parentEntered ?? true,
    })),
  });
}
