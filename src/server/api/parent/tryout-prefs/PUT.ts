/**
 * PUT /api/parent/tryout-prefs
 *
 * Updates the parent's tryout preferences.
 * Protected by requireParentAccess().
 *
 * Request body:
 * {
 *   tryoutsEnabled: boolean
 *   tryoutRegions?: string[]    Colorado region slugs
 *   tryoutAgeGroups?: string[]  e.g. ['U10','U12']
 * }
 */

import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const body = req.body ?? {};

  if (typeof body.tryoutsEnabled !== 'boolean') {
    return res.status(400).json({ error: 'tryoutsEnabled must be a boolean' });
  }

  const tryoutsEnabled  = body.tryoutsEnabled;
  const tryoutRegions   = Array.isArray(body.tryoutRegions)   ? JSON.stringify(body.tryoutRegions)   : null;
  const tryoutAgeGroups = Array.isArray(body.tryoutAgeGroups) ? JSON.stringify(body.tryoutAgeGroups) : null;

  await db
    .insert(scParentProfiles)
    .values({ userId: user.id, tryoutsEnabled, tryoutRegions, tryoutAgeGroups })
    .onDuplicateKeyUpdate({
      set: {
        tryoutsEnabled:  sql`VALUES(tryouts_enabled)`,
        tryoutRegions:   sql`VALUES(tryout_regions)`,
        tryoutAgeGroups: sql`VALUES(tryout_age_groups)`,
        updatedAt:       sql`VALUES(updated_at)`,
      },
    });

  res.json({ ok: true });
}
