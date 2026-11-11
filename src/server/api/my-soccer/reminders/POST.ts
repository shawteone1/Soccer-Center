/**
 * POST /api/my-soccer/reminders
 * Create a reminder for a calendar event.
 *
 * Body: {
 *   eventId: string,
 *   eventSource: 'feed' | 'personal',
 *   eventTitle: string,
 *   eventStartAt: string,   // ISO 8601
 *   minutesBefore: 10 | 30 | 60 | 1440,
 *   channel: 'in_app' | 'email',
 * }
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client.js';
import { scReminders } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

const VALID_MINUTES = [10, 30, 60, 1440] as const;
const VALID_CHANNELS = ['in_app', 'email'] as const;
const VALID_SOURCES = ['feed', 'personal'] as const;

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { eventId, eventSource, eventTitle, eventStartAt, minutesBefore, channel } = req.body as Record<string, unknown>;

  if (typeof eventId !== 'string' || !eventId) return res.status(400).json({ error: 'eventId required' });
  if (!VALID_SOURCES.includes(eventSource as typeof VALID_SOURCES[number])) return res.status(400).json({ error: 'eventSource must be feed or personal' });
  if (typeof eventTitle !== 'string' || !eventTitle) return res.status(400).json({ error: 'eventTitle required' });
  if (typeof eventStartAt !== 'string' || !eventStartAt) return res.status(400).json({ error: 'eventStartAt required' });
  if (!VALID_MINUTES.includes(minutesBefore as typeof VALID_MINUTES[number])) return res.status(400).json({ error: `minutesBefore must be one of: ${VALID_MINUTES.join(', ')}` });
  if (!VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) return res.status(400).json({ error: 'channel must be in_app or email' });

  const eventStart = new Date(eventStartAt as string);
  if (isNaN(eventStart.getTime())) return res.status(400).json({ error: 'eventStartAt is not a valid date' });

  const scheduledFor = new Date(eventStart.getTime() - (minutesBefore as number) * 60_000);
  if (scheduledFor <= new Date()) return res.status(400).json({ error: 'Reminder time is already in the past' });

  // Prevent duplicates: one reminder per (userId, eventId, eventSource, minutesBefore, channel)
  const existing = await db
    .select({ id: scReminders.id })
    .from(scReminders)
    .where(
      and(
        eq(scReminders.userId, userId),
        eq(scReminders.eventId, eventId as string),
        eq(scReminders.eventSource, eventSource as string),
        eq(scReminders.minutesBefore, minutesBefore as number),
        eq(scReminders.channel, channel as string),
        eq(scReminders.status, 'pending'),
      ),
    )
    .limit(1);

  if (existing.length > 0) return res.status(409).json({ error: 'Reminder already set', reminderId: existing[0].id });

  const id = randomUUID();
  await db.insert(scReminders).values({
    id,
    userId,
    eventSource: eventSource as string,
    eventId: eventId as string,
    eventTitle: (eventTitle as string).slice(0, 512),
    eventStartAt: eventStartAt as string,
    minutesBefore: minutesBefore as number,
    channel: channel as string,
    scheduledFor: scheduledFor.toISOString(),
    status: 'pending',
  });

  return res.status(201).json({ reminderId: id, scheduledFor: scheduledFor.toISOString() });
}
