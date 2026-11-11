/**
 * GET /api/my-soccer/events
 * Returns cached calendar events for the authenticated user.
 *
 * Query params:
 *   start    — ISO date string (default: start of current month)
 *   end      — ISO date string (default: end of current month + 2 months)
 *   provider — filter by provider slug (optional)
 *   feedId   — filter by specific feed ID (optional, ownership verified)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scCalendarEvents, scCalendarFeeds } from '../../../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().split('T')[0];

  const startParam    = (req.query.start    as string | undefined) ?? defaultStart;
  const endParam      = (req.query.end      as string | undefined) ?? defaultEnd;
  const providerParam = (req.query.provider as string | undefined);
  const feedIdParam   = (req.query.feedId   as string | undefined);

  // Build WHERE conditions — always scope to userId
  const conditions = [eq(scCalendarEvents.userId, userId)];

  if (startParam) conditions.push(gte(scCalendarEvents.startAt, startParam));
  if (endParam)   conditions.push(lte(scCalendarEvents.startAt, endParam + 'T23:59:59'));
  if (providerParam) conditions.push(eq(scCalendarEvents.provider, providerParam));
  if (feedIdParam) {
    // Verify ownership of the requested feed AND that it is a fan feed
    const feedRows = await db
      .select({ id: scCalendarFeeds.id, portalContext: scCalendarFeeds.portalContext })
      .from(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, feedIdParam), eq(scCalendarFeeds.userId, userId)))
      .limit(1);
    if (feedRows.length === 0) {
      return res.status(404).json({ error: 'Feed not found or not owned by you' });
    }
    if (feedRows[0].portalContext === 'parent') {
      return res.status(403).json({ error: 'This feed belongs to the Parent portal' });
    }
    conditions.push(eq(scCalendarEvents.feedId, feedIdParam));
  }

  // Strict fan filter: only events from feeds explicitly tagged portalContext='fan'.
  // NULL = unassigned legacy feed — excluded from BOTH calendars until assigned.
  // This matches the fan feeds GET filter exactly.
  //
  // Compatibility: if the portal_context column is missing (pre-v4 schema),
  // the INNER JOIN will throw. Catch it and return 409 so the caller shows
  // a migration-required state rather than an empty calendar.
  let rows: {
    id: string;
    feedId: string;
    uid: string | null;
    title: string | null;
    startAt: string;
    endAt: string | null;
    allDay: boolean | null;
    location: string | null;
    description: string | null;
    provider: string | null;
    teamName: string | null;
    eventType: string | null;
    status: string | null;
    sequence: number | null;
  }[];

  try {
    rows = await db
      .select({
        id: scCalendarEvents.id,
        feedId: scCalendarEvents.feedId,
        uid: scCalendarEvents.uid,
        title: scCalendarEvents.title,
        startAt: scCalendarEvents.startAt,
        endAt: scCalendarEvents.endAt,
        allDay: scCalendarEvents.allDay,
        location: scCalendarEvents.location,
        description: scCalendarEvents.description,
        provider: scCalendarEvents.provider,
        teamName: scCalendarEvents.teamName,
        eventType: scCalendarEvents.eventType,
        status: scCalendarEvents.status,
        sequence: scCalendarEvents.sequence,
      })
      .from(scCalendarEvents)
      .innerJoin(
        scCalendarFeeds,
        and(
          eq(scCalendarEvents.feedId, scCalendarFeeds.id),
          // Strict: only explicitly fan-tagged feeds. NULL feeds are unassigned and excluded.
          eq(scCalendarFeeds.portalContext, 'fan'),
        )
      )
      .where(and(...conditions))
      .orderBy(scCalendarEvents.startAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('portal_context') || msg.includes('Unknown column')) {
      return res.status(409).json({
        error: 'schema_missing',
        detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel.',
      });
    }
    console.error('[GET /api/my-soccer/events]', err);
    return res.status(500).json({ error: 'Failed to load events' });
  }

  // Detect overlaps: events that share the same userId and have overlapping time ranges
  const overlaps = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!a.endAt || !b.endAt) continue;
      const aStart = new Date(a.startAt).getTime();
      const aEnd   = new Date(a.endAt).getTime();
      const bStart = new Date(b.startAt).getTime();
      const bEnd   = new Date(b.endAt).getTime();
      if (aStart < bEnd && aEnd > bStart) {
        overlaps.add(a.id);
        overlaps.add(b.id);
      }
    }
  }

  const events = rows.map((r) => ({ ...r, hasOverlap: overlaps.has(r.id) }));

  return res.json({
    events,
    range: { start: startParam, end: endParam },
    fetchedAt: new Date().toISOString(),
  });
}
