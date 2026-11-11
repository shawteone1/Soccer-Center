/**
 * GET /api/parent/calendar
 *
 * Returns the parent's family calendar summary.
 * Counts sc_parent_manual_events (Parent-owned events) and connected
 * calendar feeds. Does NOT read sc_personal_events — that table belongs
 * to the Fan portal only.
 *
 * Calendar connections (Google, Outlook, TeamSnap, PlayMetrics) are the
 * same OAuth flows used by the Fan calendar. This endpoint will aggregate
 * events from all connected feeds for the family once sharing is live.
 *
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { eq, count, and, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentManualEvents, scCalendarFeeds } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  // Count Parent-owned manual events — sc_parent_manual_events only.
  // sc_personal_events belongs to the Fan portal and is never read here.
  const [{ value: manualEventCount }] = await db
    .select({ value: count() })
    .from(scParentManualEvents)
    .where(and(eq(scParentManualEvents.userId, user.id), sql`(
      ${scParentManualEvents.playerId} IS NULL OR EXISTS (
        SELECT 1 FROM sc_player_profiles p WHERE p.id = ${scParentManualEvents.playerId}
        AND p.user_id = ${user.id} AND p.deleted_at IS NULL
      )
    )`));

  const [{ value: connectedFeedCount }] = await db
    .select({ value: count() })
    .from(scCalendarFeeds)
    .where(eq(scCalendarFeeds.userId, user.id));

  res.json({
    manualEventCount: Number(manualEventCount),
    connectedFeedCount: Number(connectedFeedCount),
    // Family calendar sharing is not yet live.
    // Connected feeds (Google, Outlook, TeamSnap, PlayMetrics) are managed
    // via the existing /api/calendar/* endpoints — same OAuth flows as Fan.
    familySharingStatus: 'not_yet_available',
    note: 'Family calendar sharing will be available in a future update. Your manual events and connected feeds are already working.',
  });
}
