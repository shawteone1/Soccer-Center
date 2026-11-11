/**
 * POST /api/parent/admin/youtube-cache/force-fetch
 *
 * Forces an immediate YouTube fetch for one or more channel slugs by clearing
 * their last_attempt timestamp, then triggering a scheduler run.
 *
 * Body: { slugs: string[] }   — max 10 slugs per call
 *
 * The scheduler's 4-hour atomic claim uses:
 *   last_attempt IS NULL OR last_attempt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 HOUR)
 * Clearing last_attempt makes the row immediately eligible.
 *
 * Returns: { ok, cleared: string[], schedulerTriggered: boolean, note: string }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scYoutubeCache } from '@/server/db/schema.js';
import { inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { getHighlightsFeedService } from '@/server/highlights-cache.js';
import channelsData from '../../../../../../data/channels.json';

interface ChannelEntry { slug: string; enabled?: boolean }

const VALID_SLUGS = new Set(
  (channelsData as ChannelEntry[])
    .filter((c) => c.enabled !== false)
    .map((c) => c.slug),
);

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const body = req.body as { slugs?: unknown };
  const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
  const slugs = rawSlugs
    .filter((s): s is string => typeof s === 'string' && VALID_SLUGS.has(s))
    .slice(0, 10);

  if (slugs.length === 0) {
    res.status(400).json({ error: 'No valid slugs provided. Pass { slugs: ["champion-league", "nwsl"] }.' });
    return;
  }

  // Ensure rows exist for all requested slugs (INSERT IGNORE)
  for (const slug of slugs) {
    await db
      .insert(scYoutubeCache)
      .values({ slug, payload: JSON.stringify({ videos: [] }) })
      .onDuplicateKeyUpdate({ set: { slug } });
  }

  // Clear last_attempt so the scheduler's atomic claim picks them up immediately
  await db
    .update(scYoutubeCache)
    .set({ lastAttempt: sql`NULL` })
    .where(inArray(scYoutubeCache.slug, slugs));

  // Trigger a scheduler run immediately (runs in background, does not block response)
  let schedulerTriggered = false;
  try {
    const service = getHighlightsFeedService();
    void service.refreshDue(); // intentionally not awaited — may take 10–30s
    schedulerTriggered = true;
  } catch { /* non-fatal */ }

  res.json({
    ok: true,
    cleared: slugs,
    schedulerTriggered,
    note: schedulerTriggered
      ? `Fetch triggered for ${slugs.join(', ')}. Poll GET /api/parent/admin/youtube-cache in ~30s to see results.`
      : `last_attempt cleared for ${slugs.join(', ')} but scheduler trigger failed. The background scheduler will pick them up within 60s.`,
  });
}
