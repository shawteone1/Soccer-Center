/**
 * DELETE /api/my-soccer/personal-events/:eventId
 * Delete a personal calendar event (ownership enforced).
 * Also cancels any pending reminders for this event.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scPersonalEvents, scReminders } from '../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const eventId = String(req.params.eventId);

  const existing = await db
    .select({ id: scPersonalEvents.id })
    .from(scPersonalEvents)
    .where(and(eq(scPersonalEvents.id, eventId), eq(scPersonalEvents.userId, userId)))
    .limit(1);

  if (existing.length === 0) return res.status(404).json({ error: 'Event not found or not owned by you' });

  // Cancel pending reminders first
  await db.update(scReminders)
    .set({ status: 'cancelled' })
    .where(sql`${scReminders.eventId} = ${eventId} and ${scReminders.eventSource} = 'personal' and ${scReminders.status} = 'pending'`);

  await db.delete(scPersonalEvents).where(sql`${scPersonalEvents.id} = ${eventId}`);

  return res.json({ ok: true });
}
