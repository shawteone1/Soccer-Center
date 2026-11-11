/**
 * POST /api/my-soccer/feed-prefs
 * Upsert display preferences (visible, color) for a calendar feed.
 * Body: { feedId: string, visible?: boolean, color?: string | null }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scCalendarFeeds, scFeedPrefs } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { feedId, visible, color } = req.body as Record<string, unknown>;

  if (typeof feedId !== 'string' || !feedId) return res.status(400).json({ error: 'feedId required' });
  if (color !== undefined && color !== null && (typeof color !== 'string' || !HEX_RE.test(color))) {
    return res.status(400).json({ error: 'color must be a 6-digit hex string like #22c55e or null' });
  }

  // Verify ownership of the feed
  const feed = await db
    .select({ id: scCalendarFeeds.id })
    .from(scCalendarFeeds)
    .where(and(eq(scCalendarFeeds.id, feedId), eq(scCalendarFeeds.userId, userId)))
    .limit(1);

  if (feed.length === 0) return res.status(404).json({ error: 'Feed not found or not owned by you' });

  // Upsert
  const existing = await db
    .select()
    .from(scFeedPrefs)
    .where(eq(scFeedPrefs.feedId, feedId))
    .limit(1);

  if (existing.length > 0) {
    const updates: Partial<{ visible: boolean; color: string | null }> = {};
    if (visible !== undefined) updates.visible = visible === true;
    if (color !== undefined) updates.color = color as string | null;
    await db.update(scFeedPrefs).set(updates).where(eq(scFeedPrefs.feedId, feedId));
  } else {
    await db.insert(scFeedPrefs).values({
      feedId,
      userId,
      visible: visible !== false,
      color: typeof color === 'string' ? color : null,
    });
  }

  return res.json({ ok: true });
}
