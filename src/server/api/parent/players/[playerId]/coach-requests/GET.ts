/**
 * GET /api/parent/players/:playerId/coach-requests
 *
 * Returns information requests submitted through coach profile links for this player.
 * Protected by requireParentAccess() + player ownership check.
 *
 * Returns requests in reverse-chronological order.
 * Includes: id, linkId, linkLabel, requesterName, requesterEmail, message, status, createdAt.
 * Does NOT include: raw token hashes or internal link details.
 *
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 * Returns 403 when disabled.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';



export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  if (!isCoachProfileEnabled()) {
    res.status(403).json({});
    return;
  }

  const playerId = String(req.params.playerId);

  // Verify player ownership
  try {
    const ownerRows = await db.execute(
      sql`SELECT id FROM sc_player_profiles
           WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL
           LIMIT 1`
    ) as unknown;
    if (!(ownerRows as [unknown[]])[0].length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch (e) {
    console.error('[GET coach-requests] ownership check:', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  // Fetch requests joined with their link label
  try {
    const rows = await db.execute(
      sql`SELECT
             r.id,
             r.link_id,
             l.label        AS link_label,
             r.requester_name,
             r.requester_email,
             r.message,
             r.status,
             r.created_at
           FROM sc_coach_profile_requests r
           INNER JOIN sc_coach_profile_links l ON l.id = r.link_id
           WHERE r.player_id = ${playerId}
             AND l.user_id   = ${user.id}
           ORDER BY r.created_at DESC
           LIMIT 100`
    ) as unknown;

    type Row = {
      id: string;
      link_id: string;
      link_label: string | null;
      requester_name: string | null;
      requester_email: string | null;
      message: string | null;
      status: string;
      created_at: string | null;
    };

    const items = (rows as [Row[]])[0];
    // unreadCount: requests with status='pending' that the parent has not yet
    // acknowledged. The parent portal uses this to show a badge on the Recruiting tab.
    const unreadCount = items.filter(r => r.status === 'pending').length;
    res.json({
      requests: items.map(r => ({
        id: r.id,
        linkId: r.link_id,
        linkLabel: r.link_label ?? null,
        requesterName: r.requester_name ?? null,
        requesterEmail: r.requester_email ?? null,
        message: r.message ?? null,
        status: r.status,
        createdAt: r.created_at ?? null,
      })),
      total: items.length,
      unreadCount,
    });
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (code === 'ER_NO_SUCH_TABLE') {
      // Table not yet created — return empty, not an error
      res.json({ requests: [], total: 0, tableAvailable: false });
      return;
    }
    console.error('[GET coach-requests]', e);
    res.status(500).json({ error: 'Database error' });
  }
}
