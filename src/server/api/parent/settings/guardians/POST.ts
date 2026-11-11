/**
 * POST /api/parent/settings/guardians
 * Creates a new guardian sharing invitation.
 * Protected by requireParentAccess().
 *
 * Body: { recipientEmail: string, playerScope: string[], permissions: string[] }
 *
 * The recipient must have an existing Soccer Center account. The invitation
 * is created in 'pending' status; the grantee must accept before gaining access.
 * No email is sent in this implementation — the invitation record is created
 * and the grantee can accept via a future accept endpoint.
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { user as userTable, scFamilies, scFamilySharing } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const body = req.body ?? {};
  const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim().toLowerCase() : '';
  const playerScope = Array.isArray(body.playerScope) ? (body.playerScope as string[]) : [];
  const permissions = Array.isArray(body.permissions) ? (body.permissions as string[]) : ['view_profiles'];

  if (!recipientEmail || !recipientEmail.includes('@')) {
    return res.status(400).json({ error: 'recipientEmail must be a valid email address' });
  }
  if (playerScope.length === 0) {
    return res.status(400).json({ error: 'playerScope must include at least one player' });
  }

  // Verify recipient has a Soccer Center account
  const [recipient] = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.email, recipientEmail))
    .limit(1);

  if (!recipient) {
    return res.status(404).json({ error: 'No Soccer Center account found for that email address.' });
  }

  // Prevent self-invite
  if (recipient.id === user.id) {
    return res.status(400).json({ error: 'You cannot invite yourself as a guardian.' });
  }

  // Find or create the family
  let [family] = await db
    .select({ id: scFamilies.id })
    .from(scFamilies)
    .where(eq(scFamilies.ownerUserId, user.id))
    .limit(1);

  if (!family) {
    const familyId = randomUUID();
    await db.insert(scFamilies).values({
      id: familyId,
      ownerUserId: user.id,
      displayName: null,
    });
    family = { id: familyId };
  }

  // Check for existing active/pending grant
  const [existing] = await db
    .select({ id: scFamilySharing.id })
    .from(scFamilySharing)
    .where(eq(scFamilySharing.familyId, family.id))
    .limit(1);

  if (existing) {
    return res.status(409).json({ error: 'A sharing grant already exists for this family. Revoke it first.' });
  }

  const grantId = randomUUID();
  await db.insert(scFamilySharing).values({
    id: grantId,
    familyId: family.id,
    granteeUserId: recipient.id,
    permissions: permissions.join(','),
    status: 'pending',
    revokedAt: null,
    expiresAt: null,
  });

  res.status(201).json({ ok: true, grantId });
}
