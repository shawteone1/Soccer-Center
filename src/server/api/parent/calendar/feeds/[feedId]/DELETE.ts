/**
 * DELETE /api/parent/calendar/feeds/:feedId
 * Disconnect (delete) a saved iCal subscription feed.
 * Only the owning user may delete their own feeds.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { feedId } = req.params;
  const feedIdStr = Array.isArray(feedId) ? feedId[0] : feedId;
  if (!feedIdStr?.trim()) {
    return res.status(400).json({ error: 'feedId is required' });
  }

  try {
    const [existing] = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, feedIdStr), eq(scCalendarFeeds.userId, user.id)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    await db
      .delete(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, feedIdStr), eq(scCalendarFeeds.userId, user.id)));

    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/parent/calendar/feeds/:feedId]', e);
    res.status(500).json({ error: 'Failed to disconnect feed' });
  }
}
