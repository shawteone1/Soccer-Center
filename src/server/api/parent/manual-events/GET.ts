/**
 * GET /api/parent/manual-events
 * Returns the authenticated parent's manual calendar events, ordered by start_at.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentManualEvents } from '@/server/db/schema.js';
import { eq, asc, and, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  try {
    const events = await db
      .select()
      .from(scParentManualEvents)
      .where(and(eq(scParentManualEvents.userId, user.id), sql`(
        ${scParentManualEvents.playerId} IS NULL OR EXISTS (
          SELECT 1 FROM sc_player_profiles p
          WHERE p.id = ${scParentManualEvents.playerId}
            AND p.user_id = ${user.id} AND p.deleted_at IS NULL
        )
      )`))
      .orderBy(asc(scParentManualEvents.startAt));

    res.json({
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        allDay: e.allDay,
        location: e.location,
        notes: e.notes,
        eventType: e.eventType,
        playerId: e.playerId,
        createdAt: e.createdAt?.toISOString() ?? null,
        updatedAt: e.updatedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    console.error('[GET /api/parent/manual-events]', e);
    res.status(500).json({ error: 'Failed to load events' });
  }
}
