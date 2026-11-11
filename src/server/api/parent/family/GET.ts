/**
 * GET /api/parent/family
 *
 * Returns the authenticated parent's family record.
 * Stub — returns an empty family shape until parent setup UI is built (Step 4).
 *
 * Protected by requireParentAccess() — returns 403 when:
 *   - PARENT_PORTAL_ENABLED is false
 *   - The account's accessType is not 'PARENT'
 *   - No valid session exists (401)
 *
 * Cache-Control: private, no-store on all responses.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scFamilies } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const [family] = await db
    .select()
    .from(scFamilies)
    .where(eq(scFamilies.ownerUserId, user.id))
    .limit(1);

  // No family yet — parent account exists but setup not complete
  if (!family) {
    return res.json({ family: null, setupRequired: true });
  }

  res.json({
    family: {
      id: family.id,
      displayName: family.displayName,
      createdAt: family.createdAt,
    },
    setupRequired: false,
  });
}
