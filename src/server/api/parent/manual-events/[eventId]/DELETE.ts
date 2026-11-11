/**
 * DELETE /api/parent/manual-events/:eventId
 * Delete a manual calendar event owned by the authenticated parent.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentManualEvents } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { eventId: eventIdParam } = req.params;
  const eventId = Array.isArray(eventIdParam) ? eventIdParam[0] : eventIdParam;
  if (!eventId?.trim()) return res.status(400).json({ error: 'eventId is required' });

  const [existing] = await db
    .select({ id: scParentManualEvents.id })
    .from(scParentManualEvents)
    .where(and(eq(scParentManualEvents.id, eventId), eq(scParentManualEvents.userId, user.id)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: 'Event not found' });

  try {
    await db
      .delete(scParentManualEvents)
      .where(and(eq(scParentManualEvents.id, eventId), eq(scParentManualEvents.userId, user.id)));

    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/parent/manual-events/:eventId]', e);
    res.status(500).json({ error: 'Failed to delete event' });
  }
}
