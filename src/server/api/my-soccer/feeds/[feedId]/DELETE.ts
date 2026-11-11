/**
 * DELETE /api/my-soccer/feeds/:feedId
 * Remove a feed (and all its cached events via CASCADE) for the authenticated user.
 * Ownership is verified before deletion.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scCalendarFeeds } from '../../../../db/schema.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { feedId } = req.params;
  if (!feedId) return res.status(400).json({ error: 'feedId is required' });

  // Verify the feed exists and belongs to this user
  const existing = await db
    .select({ id: scCalendarFeeds.id, userId: scCalendarFeeds.userId })
    .from(scCalendarFeeds)
    .where(sql`${scCalendarFeeds.id} = ${feedId}`)
    .limit(1);

  if (existing.length === 0 || existing[0].userId !== userId) {
    return res.status(404).json({ error: 'Feed not found or not owned by you' });
  }

  // CASCADE deletes sc_calendar_events rows automatically
  await db.delete(scCalendarFeeds).where(sql`${scCalendarFeeds.id} = ${feedId}`);

  return res.json({ ok: true });
}
