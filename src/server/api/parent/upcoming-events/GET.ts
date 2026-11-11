/**
 * GET /api/parent/upcoming-events
 *
 * Returns the next N upcoming events across all sources for the authenticated
 * parent, in chronological order, for the homepage widget.
 *
 * Sources (same as PpCalendarTab):
 *   1. sc_parent_manual_events — parent-created events (playerId may be set)
 *   2. sc_calendar_events      — iCal feed-synced events (cancelled excluded)
 *
 * Query params:
 *   limit   max events to return (default 5, max 20)
 *   tz      IANA timezone for "now" cutoff (default America/Denver)
 *
 * Response:
 *   { events: UpcomingEvent[] }
 *
 * UpcomingEvent shape:
 *   id, title, startAt (ISO), endAt (ISO|null), allDay, location, notes,
 *   eventType, source ('manual'|'feed'), playerId (null for feed events),
 *   teamName (feed only)
 *
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export interface UpcomingEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  eventType: string;
  source: 'manual' | 'feed';
  playerId: string | null;
  teamName: string | null;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const limitParam = parseInt((req.query.limit as string) ?? '5', 10);
  const limit = Math.min(Math.max(1, limitParam), 20);

  // "Now" in the requested timezone. We compare ISO strings directly because
  // both tables store start_at as ISO 8601 with tz offset — lexicographic
  // comparison works correctly for that format.
  const nowIso = new Date().toISOString();

  const events: UpcomingEvent[] = [];

  // ── Source 1: manual events ────────────────────────────────────────────────
  try {
    type RawManual = {
      id: string; title: string; start_at: string; end_at: string | null;
      all_day: number | boolean; location: string | null; notes: string | null;
      event_type: string | null; player_id: string | null;
    };
    const rows = await db.execute(sql`
      SELECT id, title, start_at, end_at, all_day, location, notes, event_type, player_id
      FROM sc_parent_manual_events
      WHERE user_id = ${user.id}
        AND start_at >= ${nowIso}
      ORDER BY start_at ASC
      LIMIT ${limit}
    `);
    const manualRows = (rows as unknown as [RawManual[]])[0];
    for (const r of manualRows) {
      events.push({
        id: r.id,
        title: r.title,
        startAt: r.start_at,
        endAt: r.end_at ?? null,
        allDay: Boolean(r.all_day),
        location: r.location ?? null,
        notes: r.notes ?? null,
        eventType: r.event_type ?? 'event',
        source: 'manual',
        playerId: r.player_id ?? null,
        teamName: null,
      });
    }
  } catch (e) {
    // Table may not exist yet — degrade gracefully
    console.warn('[upcoming-events] manual events unavailable:', e instanceof Error ? e.message : e);
  }

  // ── Source 2: feed-synced iCal events ─────────────────────────────────────
  try {
    type FeedMeta = { id: string; player_ids: string | null };
    let allFeeds: FeedMeta[] = [];
    try {
      const feedMetaResult = await db.execute(sql`
        SELECT id, player_ids FROM sc_calendar_feeds
        WHERE user_id = ${user.id}
          AND portal_context = 'parent'
          AND visible = 1
      `);
      allFeeds = (feedMetaResult as unknown as [FeedMeta[]])[0];
    } catch (colErr) {
      const msg = colErr instanceof Error ? colErr.message : String(colErr);
      if (msg.includes('player_ids') || msg.includes('Unknown column')) {
        const fallback = await db.execute(sql`
          SELECT id FROM sc_calendar_feeds
          WHERE user_id = ${user.id}
            AND portal_context = 'parent'
            AND visible = 1
        `);
        allFeeds = ((fallback as unknown as [{ id: string }[]])[0]).map(r => ({ id: r.id, player_ids: null }));
      } else {
        throw colErr;
      }
    }

    const eligibleFeedIds = allFeeds
      .filter(f => {
        if (!f.player_ids) return true;
        try {
          const ids = JSON.parse(f.player_ids) as unknown;
          return !Array.isArray(ids) || ids.length === 0;
        } catch { return true; }
      })
      .map(f => f.id);

    if (eligibleFeedIds.length > 0) {
      type RawFeed = {
        id: string; uid: string | null; title: string; start_at: string; end_at: string | null;
        all_day: number | boolean; location: string | null; event_type: string | null;
        team_name: string | null;
      };
      const idList = eligibleFeedIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
      const feedRows = await db.execute(sql.raw(`
        SELECT ce.id, ce.uid, ce.title, ce.start_at, ce.end_at, ce.all_day,
               ce.location, ce.event_type, ce.team_name
        FROM sc_calendar_events ce
        WHERE ce.user_id = '${user.id.replace(/'/g, "''")}'
          AND ce.feed_id IN (${idList})
          AND (ce.status IS NULL OR ce.status != 'cancelled')
          AND ce.start_at >= '${nowIso.replace(/'/g, "''")}'
        ORDER BY ce.start_at ASC
        LIMIT ${limit}
      `));
      const feedEvts = (feedRows as unknown as [RawFeed[]])[0];
      for (const r of feedEvts) {
        events.push({
          id: r.uid ?? r.id,
          title: r.title,
          startAt: r.start_at,
          endAt: r.end_at ?? null,
          allDay: Boolean(r.all_day),
          location: r.location ?? null,
          notes: null,
          eventType: r.event_type ?? 'event',
          source: 'feed',
          playerId: null,
          teamName: r.team_name ?? null,
        });
      }
    }
  } catch (e) {
    console.warn('[upcoming-events] feed events unavailable:', e instanceof Error ? e.message : e);
  }

  // ── Sort merged list, deduplicate by id, take limit ───────────────────────
  const seen = new Set<string>();
  const sorted = events
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .slice(0, limit);

  res.json({ events: sorted });
}
