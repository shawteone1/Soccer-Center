/**
 * PATCH /api/parent/connections/:connectionId
 * Accept or reject a pending connection request.
 *
 * Body: { action: 'accept' | 'reject' }
 *
 * Only the addressee of the pending request may accept or reject it.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentConnections } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const me = await requireParentAccess(req, res);
  if (!me) return;
  setPrivateCacheHeaders(res);

  const { connectionId: connectionIdParam } = req.params;
  const connectionId = Array.isArray(connectionIdParam) ? connectionIdParam[0] : connectionIdParam;
  const { action } = req.body as { action?: string };

  if (!connectionId?.trim()) {
    return res.status(400).json({ error: 'connectionId is required' });
  }
  if (action !== 'accept' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be "accept" or "reject"' });
  }

  const [conn] = await db
    .select()
    .from(scParentConnections)
    .where(and(eq(scParentConnections.id, connectionId), eq(scParentConnections.addresseeId, me.id)))
    .limit(1);

  if (!conn) {
    return res.status(404).json({ error: 'Connection request not found or you are not the addressee.' });
  }
  if (conn.status !== 'pending') {
    return res.status(400).json({ error: `Cannot ${action} a connection with status "${conn.status}".` });
  }

  const now = new Date();
  await db
    .update(scParentConnections)
    .set(
      action === 'accept'
        ? { status: 'accepted', acceptedAt: now }
        : { status: 'rejected', rejectedAt: now },
    )
    .where(eq(scParentConnections.id, connectionId));

  res.json({ ok: true, status: action === 'accept' ? 'accepted' : 'rejected' });
}
