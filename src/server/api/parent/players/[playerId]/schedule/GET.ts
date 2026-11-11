/**
 * GET /api/parent/players/:playerId/schedule
 *
 * Returns a merged, chronologically-sorted list of schedule events for a
 * single player owned by the authenticated parent.
 *
 * Sources:
 *   1. sc_parent_manual_events WHERE player_id = :playerId OR player_id IS NULL
 *   2. sc_calendar_events (feed-synced iCal events) for all parent-context feeds
 *      belonging to this user — feed events are family-wide (not player-scoped)
 *      until player-to-feed association is implemented.
 *
 * Query params:
 *   type — 'game' | 'practice' | 'all' (default: 'all')
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;

  // Verify player ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles
          WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL
          LIMIT 1`
    );
    const arr = (rows as unknown as [Array<{ id: string }>])[0];
    if (!arr.length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch (e) {
    console.error('[GET /schedule] ownership check', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  const typeFilter = (req.query.type as string | undefined) ?? 'all';

  try {
    // ── Source 1: manual events ──────────────────────────────────────────────
    type RawManualEvent = {
      id: string; title: string; start_at: string; end_at: string | null;
      all_day: number | boolean; location: string | null; notes: string | null;
      event_type: string | null; player_id: string | null; created_at: string | null;
    };
    const evtRows = await db.execute(
      sql`SELECT id, title, start_at, end_at, all_day, location, notes, event_type, player_id, created_at
          FROM sc_parent_manual_events
          WHERE user_id = ${user.id}
            AND (player_id = ${playerId} OR player_id IS NULL)
          ORDER BY start_at ASC`
    );
    const manualEvents = (evtRows as unknown as [RawManualEvent[]])[0];

    // ── Source 2: feed-synced iCal events ────────────────────────────────────
    // Read from sc_calendar_events for parent-context feeds owned by this user
    // that are either:
    //   (a) not scoped to any player (player_ids IS NULL or '[]') — legacy/family feeds, or
    //   (b) explicitly scoped to this player (player_ids JSON array contains playerId).
    //
    // This prevents a feed added for one child from appearing on a sibling's profile.
    // Gracefully skip if the table doesn't exist yet (pre-migration).
    //
    // IMPORTANT: feed events use `uid` (the stable iCal UID) as their identity
    // rather than `id` (a fresh UUID generated on every sync). Stats and media
    // are keyed on event_ref / game_event_ref, so they must survive feed re-syncs.
    // The schedule endpoint therefore returns uid as the event id for feed events.
    // Manual events use their row id (stable — never regenerated).
    type RawFeedEvent = {
      id: string; uid: string; feed_id: string; title: string; start_at: string; end_at: string | null;
      all_day: number | boolean; location: string | null; description: string | null;
      event_type: string | null; team_name: string | null; status: string | null;
    };
    let feedEvents: RawFeedEvent[] = [];
    let feedCount = 0;

    try {
      // Load all parent-context feeds for this user, including their player_ids column.
      // The player_ids column may not exist yet (pre-v6 migration) — handle gracefully.
      type FeedMeta = { id: string; player_ids: string | null };
      let allFeeds: FeedMeta[] = [];
      try {
        const feedMetaResult = await db.execute(
          sql`SELECT id, player_ids FROM sc_calendar_feeds
              WHERE user_id = ${user.id}
                AND portal_context = 'parent'
                AND visible = 1`
        );
        allFeeds = (feedMetaResult as unknown as [FeedMeta[]])[0];
      } catch (colErr) {
        // player_ids column doesn't exist yet (pre-v6) — fall back to all feeds
        const msg = colErr instanceof Error ? colErr.message : String(colErr);
        if (msg.includes('player_ids') || msg.includes('Unknown column')) {
          const feedMetaResult = await db.execute(
            sql`SELECT id FROM sc_calendar_feeds
                WHERE user_id = ${user.id}
                  AND portal_context = 'parent'
                  AND visible = 1`
          );
          allFeeds = ((feedMetaResult as unknown as [{ id: string }[]])[0]).map(r => ({
            id: r.id,
            player_ids: null,
          }));
        } else {
          throw colErr;
        }
      }

      // Filter feeds to those that include this player (or are family-wide)
      const eligibleFeedIds = allFeeds
        .filter(f => {
          if (!f.player_ids) return true;  // NULL = family-wide (legacy)
          try {
            const ids = JSON.parse(f.player_ids) as unknown;
            if (!Array.isArray(ids) || ids.length === 0) return true;  // [] = family-wide
            return ids.includes(playerId);
          } catch {
            return true;  // malformed JSON — treat as family-wide
          }
        })
        .map(f => f.id);

      feedCount = eligibleFeedIds.length;

      if (feedCount > 0) {
        // Build a safe IN list of feed IDs
        const idList = eligibleFeedIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
        const feedEvtRows = await db.execute(sql.raw(`
          SELECT ce.id, ce.uid, ce.feed_id, ce.title, ce.start_at, ce.end_at, ce.all_day,
                 ce.location, ce.description, ce.event_type, ce.team_name, ce.status
          FROM sc_calendar_events ce
          WHERE ce.user_id = '${user.id.replace(/'/g, "''")}'
            AND ce.feed_id IN (${idList})
            AND (ce.status IS NULL OR ce.status != 'cancelled')
          ORDER BY ce.start_at ASC
        `));
        feedEvents = (feedEvtRows as unknown as [RawFeedEvent[]])[0];
      }
    } catch (feedErr) {
      // sc_calendar_events may not exist yet — degrade gracefully
      console.warn('[GET /schedule] feed events unavailable:', feedErr instanceof Error ? feedErr.message : feedErr);
    }

    // ── Merge + filter ───────────────────────────────────────────────────────
    type ScheduleEvent = {
      id: string; title: string; startAt: string; endAt: string | null;
      allDay: boolean; location: string | null; notes: string | null;
      eventType: string; playerId: string | null; source: 'manual' | 'feed';
      teamName?: string | null; createdAt: string | null;
      // feedId is included for feed events so callers can construct a stable
      // composite event_ref (feedId:uid) that survives feed re-syncs.
      feedId?: string | null;
    };

    const allEvents: ScheduleEvent[] = [
      ...manualEvents.map(e => ({
        id: e.id,
        title: e.title,
        startAt: e.start_at,
        endAt: e.end_at ?? null,
        allDay: Boolean(e.all_day),
        location: e.location ?? null,
        notes: e.notes ?? null,
        eventType: e.event_type ?? 'event',
        playerId: e.player_id ?? null,
        source: 'manual' as const,
        createdAt: e.created_at ?? null,
      })),
      ...feedEvents.map(e => ({
        // Use uid (stable iCal UID) as the event identity for feed events.
        // sc_calendar_events.id is a fresh UUID on every sync — using it as
        // event_ref would orphan all saved stats and media after each re-sync.
        // uid is stable across syncs for the same real-world event.
        // The composite event_ref used in match records is `${feedId}:${uid}` —
        // constructed by GameDetailsPanel using the feedId returned here.
        id: e.uid || e.id,  // uid is always set by the parser; fall back to row id if blank
        title: e.title,
        startAt: e.start_at,
        endAt: e.end_at ?? null,
        allDay: Boolean(e.all_day),
        location: e.location ?? null,
        notes: e.description ?? null,
        eventType: e.event_type ?? 'event',
        playerId: null,
        source: 'feed' as const,
        teamName: e.team_name ?? null,
        createdAt: null,
        feedId: e.feed_id ?? null,
      })),
    ];

    // Sort by startAt ascending
    allEvents.sort((a, b) => a.startAt.localeCompare(b.startAt));

    const filtered = typeFilter === 'all'
      ? allEvents
      : allEvents.filter(e => e.eventType === typeFilter);

    res.json({
      events: filtered,
      feedCount,
      feedEventCount: feedEvents.length,
      total: filtered.length,
    });
  } catch (e) {
    console.error('[GET /api/parent/players/:id/schedule]', e);
    res.status(500).json({ error: 'Failed to load schedule' });
  }
}
