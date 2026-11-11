/**
 * DELETE /api/parent/players/:playerId/affiliations/:affiliationId
 *
 * Removes a club/team affiliation. Enforces ownership.
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerAffiliations } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const affiliationId = String(req.params.affiliationId);

  await db
    .delete(scPlayerAffiliations)
    .where(and(
      eq(scPlayerAffiliations.id, affiliationId),
      eq(scPlayerAffiliations.userId, user.id),  // ownership enforced
    ));

  res.json({ ok: true });
}
