/**
 * DELETE /api/parent/connections/:connectionId
 * Remove an accepted connection or cancel a pending request.
 *
 * Either party may remove an accepted connection.
 * Only the requester may cancel a pending request.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentConnections } from '@/server/db/schema.js';
import { eq, or, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const me = await requireParentAccess(req, res);
  if (!me) return;
  setPrivateCacheHeaders(res);

  const { connectionId: connectionIdParam } = req.params;
  const connectionId = Array.isArray(connectionIdParam) ? connectionIdParam[0] : connectionIdParam;
  if (!connectionId?.trim()) {
    return res.status(400).json({ error: 'connectionId is required' });
  }

  const [conn] = await db
    .select()
    .from(scParentConnections)
    .where(
      and(
        eq(scParentConnections.id, connectionId),
        or(
          eq(scParentConnections.requesterId, me.id),
          eq(scParentConnections.addresseeId, me.id),
        ),
      ),
    )
    .limit(1);

  if (!conn) {
    return res.status(404).json({ error: 'Connection not found.' });
  }

  // Pending: only requester can cancel
  if (conn.status === 'pending' && conn.requesterId !== me.id) {
    return res.status(403).json({ error: 'Only the requester can cancel a pending request.' });
  }

  await db
    .update(scParentConnections)
    .set({ status: 'removed', removedAt: new Date() })
    .where(eq(scParentConnections.id, connectionId));

  res.json({ ok: true });
}
