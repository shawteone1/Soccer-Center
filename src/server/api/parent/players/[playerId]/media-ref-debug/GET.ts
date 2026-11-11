/**
 * GET /api/parent/players/:playerId/media-ref-debug
 *
 * Diagnostic endpoint: returns stored game_event_ref values from
 * sc_player_media_assignments alongside the schedule events for this player,
 * so the caller can verify whether the refs match.
 *
 * Protected by requireParentAccess(). Player must belong to the caller.
 * Admin-only in production — returns 403 for non-admin users.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Only admin users can use this diagnostic
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const { playerId } = req.params;

  // Verify ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles
          WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    const arr = (rows as unknown as [Array<{ id: string }>])[0];
    if (!arr.length) { res.status(404).json({ error: 'Player not found' }); return; }
  } catch (e) {
    res.status(500).json({ error: 'DB error', detail: String(e) }); return;
  }

  // Fetch stored assignments
  let assignments: Array<{ id: string; game_event_ref: string | null; kind: string }> = [];
  try {
    const rows = await db.execute(
      sql`SELECT id, game_event_ref, kind FROM sc_player_media_assignments
          WHERE player_id = ${playerId} AND user_id = ${user.id}
          ORDER BY created_at DESC LIMIT 50`
    );
    assignments = (rows as unknown as [typeof assignments])[0];
  } catch (e) {
    assignments = [];
  }

  // Fetch schedule events (all types)
  let scheduleEvents: Array<{
    id: string; title: string; source: string; feed_id: string | null; event_type: string | null;
  }> = [];
  try {
    const rows = await db.execute(
      sql`SELECT id, title, 'manual' AS source, NULL AS feed_id, event_type
          FROM sc_player_schedule_events
          WHERE player_id = ${playerId} AND user_id = ${user.id}
          UNION ALL
          SELECT
            ce.uid AS id,
            ce.title,
            'feed' AS source,
            ce.feed_id,
            ce.event_type
          FROM sc_calendar_events ce
          INNER JOIN sc_calendar_feeds cf ON cf.id = ce.feed_id
          WHERE cf.user_id = ${user.id}
          ORDER BY id
          LIMIT 100`
    );
    scheduleEvents = (rows as unknown as [typeof scheduleEvents])[0];
  } catch (e) {
    scheduleEvents = [];
  }

  // Compute what buildEventRef would produce for each schedule event
  const computedRefs = scheduleEvents.map(e => ({
    eventId: e.id,
    title: e.title,
    source: e.source,
    feedId: e.feed_id,
    eventType: e.event_type,
    computedRef: e.source === 'feed' && e.feed_id
      ? `${e.feed_id}:${e.id}`
      : e.id,
  }));

  // Cross-reference: which stored refs match a computed ref?
  const computedRefSet = new Set(computedRefs.map(r => r.computedRef));
  const storedRefs = assignments.map(a => ({
    assignmentId: a.id,
    storedRef: a.game_event_ref,
    kind: a.kind,
    matchesSchedule: a.game_event_ref ? computedRefSet.has(a.game_event_ref) : false,
  }));

  res.json({
    playerId,
    storedAssignments: storedRefs,
    scheduleEvents: computedRefs,
    summary: {
      totalAssignments: assignments.length,
      assignmentsWithRef: assignments.filter(a => a.game_event_ref).length,
      matchingRefs: storedRefs.filter(r => r.matchesSchedule).length,
      unmatchedRefs: storedRefs.filter(r => r.storedRef && !r.matchesSchedule).length,
    },
  });
}
