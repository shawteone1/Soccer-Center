/**
 * POST /api/my-soccer/personal-events
 * Create a personal calendar event.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client.js';
import { scPersonalEvents } from '../../../db/schema.js';
import { requireAuth } from '../auth-guard.js';

const VALID_EVENT_TYPES = ['game', 'practice', 'event', 'other'] as const;

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { title, startAt, endAt, timezone, allDay, location, notes, eventType } = req.body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (typeof startAt !== 'string' || !startAt.trim()) return res.status(400).json({ error: 'startAt is required' });
  if (typeof timezone !== 'string' || !timezone.trim()) return res.status(400).json({ error: 'timezone is required' });
  if (endAt !== undefined && endAt !== null && typeof endAt !== 'string') return res.status(400).json({ error: 'endAt must be a string' });
  if (eventType !== undefined && !VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
    return res.status(400).json({ error: `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}` });
  }

  const id = randomUUID();
  await db.insert(scPersonalEvents).values({
    id,
    userId,
    title: title.trim(),
    startAt: startAt.trim(),
    endAt: typeof endAt === 'string' ? endAt.trim() || null : null,
    timezone: timezone.trim(),
    allDay: allDay === true,
    location: typeof location === 'string' ? location.trim() || null : null,
    notes: typeof notes === 'string' ? notes.trim() || null : null,
    eventType: typeof eventType === 'string' ? eventType : 'event',
  });

  return res.status(201).json({
    event: {
      id,
      userId,
      title: title.trim(),
      startAt: startAt.trim(),
      endAt: typeof endAt === 'string' ? endAt.trim() || null : null,
      timezone: timezone.trim(),
      allDay: allDay === true,
      location: typeof location === 'string' ? location.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      eventType: typeof eventType === 'string' ? eventType : 'event',
    },
  });
}
