/**
 * PUT /api/my-soccer/personal-events/:eventId
 * Update a personal calendar event (ownership enforced).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scPersonalEvents, scReminders } from '../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../../auth-guard.js';

const VALID_EVENT_TYPES = ['game', 'practice', 'event', 'other'] as const;

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const eventId = String(req.params.eventId);

  // Verify ownership
  const existing = await db
    .select()
    .from(scPersonalEvents)
    .where(and(eq(scPersonalEvents.id, eventId), eq(scPersonalEvents.userId, userId)))
    .limit(1);

  if (existing.length === 0) return res.status(404).json({ error: 'Event not found or not owned by you' });

  const { title, startAt, endAt, timezone, allDay, location, notes, eventType } = req.body as Record<string, unknown>;

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) return res.status(400).json({ error: 'title must be a non-empty string' });
  if (startAt !== undefined && (typeof startAt !== 'string' || !startAt.trim())) return res.status(400).json({ error: 'startAt must be a non-empty string' });
  if (eventType !== undefined && !VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
    return res.status(400).json({ error: `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}` });
  }

  const updates: Partial<typeof existing[0]> = {};
  if (typeof title === 'string') updates.title = title.trim();
  if (typeof startAt === 'string') updates.startAt = startAt.trim();
  if (endAt !== undefined) updates.endAt = typeof endAt === 'string' ? endAt.trim() || null : null;
  if (typeof timezone === 'string') updates.timezone = timezone.trim();
  if (allDay !== undefined) updates.allDay = allDay === true;
  if (location !== undefined) updates.location = typeof location === 'string' ? location.trim() || null : null;
  if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  if (typeof eventType === 'string') updates.eventType = eventType;

  await db.update(scPersonalEvents).set(updates).where(sql`${scPersonalEvents.id} = ${eventId}`);

  // If startAt changed, reschedule pending reminders for this event
  if (typeof startAt === 'string') {
    const pendingReminders = await db
      .select()
      .from(scReminders)
      .where(and(eq(scReminders.eventId, eventId), eq(scReminders.eventSource, 'personal'), eq(scReminders.status, 'pending')));

    for (const r of pendingReminders) {
      const newEventStart = new Date(startAt.trim());
      const newScheduledFor = new Date(newEventStart.getTime() - r.minutesBefore * 60_000);
      if (newScheduledFor > new Date()) {
        await db.update(scReminders).set({
          scheduledFor: newScheduledFor.toISOString(),
          eventStartAt: startAt.trim(),
          eventTitle: typeof title === 'string' ? title.trim() : r.eventTitle,
        }).where(sql`${scReminders.id} = ${r.id}`);
      } else {
        // Past — cancel it
        await db.update(scReminders).set({ status: 'cancelled' }).where(sql`${scReminders.id} = ${r.id}`);
      }
    }
  }

  return res.json({ ok: true });
}
