/**
 * POST /api/my-soccer/feeds
 * Add or replace a calendar feed for the authenticated user.
 *
 * Body: { url: string, label?: string, replaceId?: string }
 *   url       — raw iCal subscription URL (webcal:// or https://)
 *   label     — optional friendly name
 *   replaceId — if provided, the existing feed with this ID is deleted first
 *               (ownership verified before deletion)
 *
 * The raw URL is validated, encrypted, and stored. It is NEVER logged or
 * returned to the browser.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client.js';
import { scCalendarFeeds } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';
import { validateFeedUrl } from '../../../ical-parser.js';
import { encryptUrl, serializePayload } from '../../../calendar-crypto.js';
import { refreshFeedNow } from '../../../calendar-refresh-job.js';

const MAX_FEEDS_PER_USER = 20;

function inferProvider(url: string): string {
  const h = new URL(url).hostname.toLowerCase();
  if (h.includes('teamsnap')) return 'teamsnap';
  if (h.includes('playmetrics')) return 'playmetrics';
  if (h.includes('google')) return 'google';
  if (h.includes('icloud') || h.includes('apple')) return 'icloud';
  if (h.includes('outlook') || h.includes('office365')) return 'outlook';
  if (h.includes('yahoo')) return 'yahoo';
  return 'other';
}

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { url, label, replaceId } = req.body as {
    url?: unknown;
    label?: unknown;
    replaceId?: unknown;
  };

  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  if (label !== undefined && (typeof label !== 'string' || label.length > 128)) {
    return res.status(400).json({ error: 'label must be a string ≤ 128 characters' });
  }
  if (replaceId !== undefined && typeof replaceId !== 'string') {
    return res.status(400).json({ error: 'replaceId must be a string' });
  }

  // Validate URL (allowlist + HTTPS check)
  const validation = validateFeedUrl(url.trim());
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }
  const normalizedUrl = validation.normalized;

  // Check feed count limit (unless replacing)
  if (!replaceId) {
    const existing = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(eq(scCalendarFeeds.userId, userId));
    if (existing.length >= MAX_FEEDS_PER_USER) {
      return res.status(400).json({
        error: `You can connect at most ${MAX_FEEDS_PER_USER} feeds. Remove one before adding another.`,
      });
    }
  }

  // If replacing, verify ownership and delete old feed
  if (replaceId) {
    const old = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, replaceId), eq(scCalendarFeeds.userId, userId)))
      .limit(1);
    if (old.length === 0) {
      return res.status(404).json({ error: 'Feed not found or not owned by you' });
    }
    await db.delete(scCalendarFeeds).where(eq(scCalendarFeeds.id, replaceId));
  }

  // Encrypt the URL — plaintext discarded after this call
  const payload = encryptUrl(normalizedUrl);
  const encryptedUrl = serializePayload(payload);
  const provider = inferProvider(normalizedUrl);
  const feedId = randomUUID();

  await db.insert(scCalendarFeeds).values({
    id: feedId,
    userId,
    provider,
    label: (typeof label === 'string' ? label.trim() : null) || null,
    encryptedUrl,
    lastFetchStatus: null,
    portalContext: 'fan',  // explicitly tag as fan-portal feed
  });

  // Kick off an immediate background refresh (fire-and-forget)
  void refreshFeedNow(feedId).catch((err) =>
    console.error(`[my-soccer] Initial feed refresh failed for ${feedId}:`, err),
  );

  return res.status(201).json({
    feed: {
      id: feedId,
      provider,
      label: typeof label === 'string' ? label.trim() || null : null,
      lastFetchedAt: null,
      lastFetchStatus: null,
      eventCount: 0,
    },
    message: 'Feed connected. Events will appear within a minute.',
  });
}
