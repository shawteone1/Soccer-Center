/**
 * GET /api/parent/settings/guardians
 * Returns all sharing grants the authenticated parent has issued.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scFamilies, scFamilySharing } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Find the family owned by this user
  const [family] = await db
    .select({ id: scFamilies.id })
    .from(scFamilies)
    .where(eq(scFamilies.ownerUserId, user.id))
    .limit(1);

  if (!family) {
    return res.json({ guardians: [] });
  }

  const rows = await db
    .select({
      id: scFamilySharing.id,
      granteeUserId: scFamilySharing.granteeUserId,
      permissions: scFamilySharing.permissions,
      status: scFamilySharing.status,
      createdAt: scFamilySharing.createdAt,
      revokedAt: scFamilySharing.revokedAt,
    })
    .from(scFamilySharing)
    .where(eq(scFamilySharing.familyId, family.id));

  // Map to the shape the UI expects
  const guardians = rows
    .filter(r => r.revokedAt === null)
    .map(r => ({
      id: r.id,
      recipientEmail: r.granteeUserId, // userId stored; email lookup deferred
      playerScope: [] as string[],
      permissions: r.permissions.split(',').map(p => p.trim()),
      status: r.status as 'pending' | 'active',
      invitedAt: r.createdAt?.toISOString().slice(0, 10) ?? '',
    }));

  res.json({ guardians });
}
