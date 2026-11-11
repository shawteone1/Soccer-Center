/**
 * POST /api/parent/connections
 * Send a connection request to another parent account.
 *
 * Body: { email: string; message?: string }
 *
 * Rules:
 *   - Cannot connect to yourself
 *   - Addressee must have accessType = 'PARENT'
 *   - No duplicate pending/accepted connections
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentConnections, user as userTable } from '@/server/db/schema.js';
import { eq, or, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response) {
  const me = await requireParentAccess(req, res);
  if (!me) return;
  setPrivateCacheHeaders(res);

  const { email, message } = req.body as { email?: string; message?: string };

  if (!email?.trim()) {
    return res.status(400).json({ error: 'email is required' });
  }
  if (email.toLowerCase() === me.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot send a connection request to yourself.' });
  }

  // Look up addressee
  const [addressee] = await db
    .select({ id: userTable.id, email: userTable.email, accessType: userTable.accessType })
    .from(userTable)
    .where(eq(userTable.email, email.trim().toLowerCase()))
    .limit(1);

  if (!addressee) {
    return res.status(404).json({ error: 'No account found with that email address.' });
  }
  if (addressee.accessType !== 'PARENT') {
    return res.status(400).json({ error: 'That account does not have a parent portal.' });
  }

  // Check for existing connection
  const [existing] = await db
    .select({ id: scParentConnections.id, status: scParentConnections.status })
    .from(scParentConnections)
    .where(
      or(
        and(eq(scParentConnections.requesterId, me.id), eq(scParentConnections.addresseeId, addressee.id)),
        and(eq(scParentConnections.requesterId, addressee.id), eq(scParentConnections.addresseeId, me.id)),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(400).json({ error: 'You are already connected with this account.' });
    }
    if (existing.status === 'pending') {
      return res.status(400).json({ error: 'A connection request is already pending with this account.' });
    }
    // rejected or removed — allow re-request by updating
    await db
      .update(scParentConnections)
      .set({ status: 'pending', message: message?.slice(0, 256) ?? null, requesterId: me.id, addresseeId: addressee.id })
      .where(eq(scParentConnections.id, existing.id));
    return res.status(200).json({ id: existing.id, status: 'pending' });
  }

  const id = randomUUID();
  await db.insert(scParentConnections).values({
    id,
    requesterId: me.id,
    addresseeId: addressee.id,
    status: 'pending',
    message: message?.slice(0, 256) ?? null,
  });

  res.status(201).json({ id, status: 'pending' });
}
