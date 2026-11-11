/**
 * PUT /api/parent/onboarding-draft
 *
 * Upserts the server-saved onboarding draft for the authenticated parent.
 * Called on every "Save for later" action in the wizard.
 *
 * Body: { stage: string, stepsCompleted: string[], draftData: object }
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scOnboardingDrafts } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const { stage, stepsCompleted, draftData } = req.body as {
    stage?: string;
    stepsCompleted?: string[];
    draftData?: unknown;
  };

  if (!stage) return res.status(400).json({ error: 'stage is required' });

  const stepsJson = JSON.stringify(Array.isArray(stepsCompleted) ? stepsCompleted : []);
  const dataJson  = draftData ? JSON.stringify(draftData) : null;

  // Upsert — MySQL INSERT ... ON DUPLICATE KEY UPDATE
  await db
    .insert(scOnboardingDrafts)
    .values({
      userId: user.id,
      stage,
      stepsCompleted: stepsJson,
      draftData: dataJson,
    })
    .onDuplicateKeyUpdate({
      set: {
        stage,
        stepsCompleted: stepsJson,
        draftData: dataJson,
      },
    });

  res.json({ ok: true });
}
