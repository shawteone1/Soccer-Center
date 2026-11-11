/**
 * GET /api/parent/tryout-prefs
 *
 * Returns the parent's tryout preferences (enabled toggle + region/age filters).
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const [profile] = await db
    .select({
      tryoutsEnabled:   scParentProfiles.tryoutsEnabled,
      tryoutRegions:    scParentProfiles.tryoutRegions,
      tryoutAgeGroups:  scParentProfiles.tryoutAgeGroups,
    })
    .from(scParentProfiles)
    .where(eq(scParentProfiles.userId, user.id))
    .limit(1);

  res.json({
    tryoutsEnabled:  profile?.tryoutsEnabled ?? true,
    tryoutRegions:   profile?.tryoutRegions   ? (JSON.parse(profile.tryoutRegions)   as string[]) : [],
    tryoutAgeGroups: profile?.tryoutAgeGroups ? (JSON.parse(profile.tryoutAgeGroups) as string[]) : [],
  });
}
