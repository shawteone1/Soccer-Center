/**
 * DELETE /api/parent/settings/guardians/:grantId
 * Revokes a guardian sharing grant.
 * Protected by requireParentAccess().
 * Only the family owner can revoke grants.
 */
import type { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scFamilies, scFamilySharing } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const grantId = String(req.params.grantId ?? '');
  if (!grantId) return res.status(400).json({ error: 'grantId required' });

  // Verify the grant belongs to a family owned by this user
  const [family] = await db
    .select({ id: scFamilies.id })
    .from(scFamilies)
    .where(eq(scFamilies.ownerUserId, user.id))
    .limit(1);

  if (!family) return res.status(404).json({});

  const [grant] = await db
    .select({ id: scFamilySharing.id })
    .from(scFamilySharing)
    .where(
      and(
        eq(scFamilySharing.id, grantId),
        eq(scFamilySharing.familyId, family.id),
      ),
    )
    .limit(1);

  if (!grant) return res.status(404).json({});

  await db
    .update(scFamilySharing)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(scFamilySharing.id, grantId));

  res.json({ ok: true });
}
