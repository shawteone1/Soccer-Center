/**
 * GET /api/parent/connections
 * Returns the authenticated parent's connections.
 *
 * Returns:
 *   sent     — pending requests sent by this user
 *   received — pending requests received by this user
 *   accepted — accepted connections (both directions)
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentConnections, user as userTable } from '@/server/db/schema.js';
import { eq, or } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const me = await requireParentAccess(req, res);
  if (!me) return;
  setPrivateCacheHeaders(res);

  try {
    const rows = await db
      .select({
        id: scParentConnections.id,
        requesterId: scParentConnections.requesterId,
        addresseeId: scParentConnections.addresseeId,
        status: scParentConnections.status,
        message: scParentConnections.message,
        acceptedAt: scParentConnections.acceptedAt,
        createdAt: scParentConnections.createdAt,
      })
      .from(scParentConnections)
      .where(
        or(
          eq(scParentConnections.requesterId, me.id),
          eq(scParentConnections.addresseeId, me.id),
        ),
      );

    // Collect all peer user IDs to look up emails
    const peerIds = new Set<string>();
    for (const r of rows) {
      if (r.requesterId !== me.id) peerIds.add(r.requesterId);
      if (r.addresseeId !== me.id) peerIds.add(r.addresseeId);
    }

    const peerMap = new Map<string, { email: string; name: string | null }>();
    if (peerIds.size > 0) {
      const peers = await db
        .select({ id: userTable.id, email: userTable.email, name: userTable.name })
        .from(userTable)
        .where(or(...[...peerIds].map(id => eq(userTable.id, id))));
      for (const p of peers) peerMap.set(p.id, { email: p.email, name: p.name ?? null });
    }

    function shape(r: typeof rows[0]) {
      const meId = me!.id;
      const peerId = r.requesterId === meId ? r.addresseeId : r.requesterId;
      const peer = peerMap.get(peerId);
      return {
        id: r.id,
        peerId,
        peerEmail: peer?.email ?? null,
        peerName: peer?.name ?? null,
        direction: r.requesterId === meId ? 'sent' : 'received',
        status: r.status,
        message: r.message,
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        createdAt: r.createdAt?.toISOString() ?? null,
      };
    }

    const sent     = rows.filter(r => r.requesterId === me.id && r.status === 'pending').map(shape);
    const received = rows.filter(r => r.addresseeId === me.id && r.status === 'pending').map(shape);
    const accepted = rows.filter(r => r.status === 'accepted').map(shape);

    res.json({ sent, received, accepted });
  } catch (e) {
    console.error('[GET /api/parent/connections]', e);
    res.status(500).json({ error: 'Failed to load connections' });
  }
}
