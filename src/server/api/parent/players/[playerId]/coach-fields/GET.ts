/**
 * GET /api/parent/players/:playerId/coach-fields
 *
 * Returns the list of selectable coach profile fields for the share UI.
 * This is the single source of truth for what the parent can approve.
 *
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { requireParentAccess } from '@/server/auth-policy.js';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { COACH_PROFILE_FIELDS } from '@/server/lib/coach-profile-fields.js';



export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');

  const user = await requireParentAccess(req, res);
  if (!user) return;

  if (!isCoachProfileEnabled()) {
    res.status(403).json({ error: 'FEATURE_DISABLED' });
    return;
  }

  res.json({ fields: COACH_PROFILE_FIELDS });
}
