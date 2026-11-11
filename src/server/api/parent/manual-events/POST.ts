import { sql } from 'drizzle-orm';
/**
 * POST /api/parent/manual-events
 * Create a new manual calendar event for the authenticated parent.
 *
 * Body: { title, startAt, endAt?, allDay?, location?, notes?, eventType?, playerId? }
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentManualEvents } from '@/server/db/schema.js';
import { randomUUID } from 'crypto';

const VALID_EVENT_TYPES = ['game', 'practice', 'event', 'other', 'camp', 'tournament', 'showcase'] as const;

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { title, startAt, endAt, allDay, location, notes, eventType, playerId } = req.body as {
    title?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    location?: string;
    notes?: string;
    eventType?: string;
    playerId?: string;
  };

  if (!title?.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!startAt?.trim()) {
    return res.status(400).json({ error: 'startAt is required (ISO 8601)' });
  }

  if (playerId) {
    if (typeof playerId !== 'string') return res.status(400).json({ error: 'Invalid player' });
    try {
      const rows = await db.execute(sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`);
      if (!(rows as unknown as [Array<{id:string}>])[0].length) return res.status(404).json({ error: 'Player not found' });
    } catch { return res.status(503).json({ error: 'Player could not be verified. Please retry.' }); }
  }

  const safeEventType = VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])
    ? (eventType as string)
    : 'event';

  const id = randomUUID();

  try {
    await db.insert(scParentManualEvents).values({
      id,
      userId: user.id,
      title: title.trim().slice(0, 512),
      startAt: startAt.trim(),
      endAt: endAt?.trim() ?? null,
      allDay: allDay ?? false,
      location: location?.trim().slice(0, 512) ?? null,
      notes: notes?.trim() ?? null,
      eventType: safeEventType,
      playerId: playerId ?? null,
    });

    res.status(201).json({ id, ok: true });
  } catch (e) {
    console.error('[POST /api/parent/manual-events]', e);
    res.status(500).json({ error: 'Failed to create event' });
  }
}
