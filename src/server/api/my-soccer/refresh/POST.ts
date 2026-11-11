/**
 * POST /api/my-soccer/refresh
 * Manually trigger a refresh of all the authenticated user's feeds.
 * Body: { feedId?: string }  — if omitted, refreshes all user feeds.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scCalendarFeeds } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';
import { refreshFeedNow } from '../../../calendar-refresh-job.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { feedId } = (req.body ?? {}) as { feedId?: unknown };

  if (feedId !== undefined && typeof feedId !== 'string') {
    return res.status(400).json({ error: 'feedId must be a string' });
  }

  // Determine which feeds to refresh
  let feedIds: string[];
  if (typeof feedId === 'string') {
    const rows = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, feedId), eq(scCalendarFeeds.userId, userId)))
      .limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feed not found or not owned by you' });
    }
    feedIds = [feedId];
  } else {
    const rows = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(eq(scCalendarFeeds.userId, userId));
    feedIds = rows.map((r) => r.id);
  }

  if (feedIds.length === 0) {
    return res.json({ ok: true, refreshed: 0, message: 'No feeds to refresh' });
  }

  // Fire-and-forget — respond immediately; client polls /api/my-soccer/feeds for status
  void Promise.all(feedIds.map((id) => refreshFeedNow(id))).catch((err) =>
    console.error('[my-soccer/refresh] Error:', err),
  );

  return res.json({
    ok: true,
    refreshed: feedIds.length,
    message: `Refreshing ${feedIds.length} feed(s) in the background`,
  });
}
