/**
 * GET /api/parent/onboarding-draft
 *
 * Returns the server-saved onboarding draft for the authenticated parent.
 * Returns { draft: null } if no draft exists yet.
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scOnboardingDrafts } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const [row] = await db
    .select()
    .from(scOnboardingDrafts)
    .where(eq(scOnboardingDrafts.userId, user.id))
    .limit(1);

  if (!row) return res.json({ draft: null });

  res.json({
    draft: {
      stage: row.stage ?? 'you',
      stepsCompleted: row.stepsCompleted ? (JSON.parse(row.stepsCompleted) as string[]) : [],
      draftData: row.draftData ? JSON.parse(row.draftData) : null,
      updatedAt: row.updatedAt,
    },
  });
}
