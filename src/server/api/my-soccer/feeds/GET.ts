/**
 * GET /api/my-soccer/feeds
 *
 * Returns the authenticated user's connected calendar feeds scoped to the
 * Fan portal. Raw encrypted URLs are NEVER included in the response.
 *
 * Portal isolation behavior:
 *   - When portal_context column EXISTS (post-v4 schema):
 *       Only feeds with portalContext = 'fan' are returned.
 *       NULL feeds (unassigned) are excluded from both calendars until
 *       the user assigns them via the AmbiguousFeedAssignment UI.
 *   - When portal_context column is MISSING (pre-v4 schema, migration not run):
 *       Returns 409 { error: 'schema_missing' } — an explicit setup error,
 *       not an empty list. The caller must show a migration-required state.
 *       This prevents silently returning no feeds when the column simply
 *       doesn't exist yet.
 *
 * The strict fan filter (NULL excluded) is intentional: showing NULL feeds
 * in the fan calendar would silently include feeds the user may intend for
 * the parent calendar, and vice versa.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scCalendarFeeds } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  let feeds: {
    id: string;
    provider: string;
    label: string | null;
    lastFetchedAt: Date | null;
    lastFetchStatus: string | null;
    lastFetchError: string | null;
    eventCount: number | null;
    color: string | null;
    visible: boolean | null;
    portalContext: string | null;
    createdAt: Date | null;
  }[];

  try {
    feeds = await db
      .select({
        id: scCalendarFeeds.id,
        provider: scCalendarFeeds.provider,
        label: scCalendarFeeds.label,
        lastFetchedAt: scCalendarFeeds.lastFetchedAt,
        lastFetchStatus: scCalendarFeeds.lastFetchStatus,
        lastFetchError: scCalendarFeeds.lastFetchError,
        eventCount: scCalendarFeeds.eventCount,
        color: scCalendarFeeds.color,
        visible: scCalendarFeeds.visible,
        portalContext: scCalendarFeeds.portalContext,
        createdAt: scCalendarFeeds.createdAt,
      })
      .from(scCalendarFeeds)
      .where(eq(scCalendarFeeds.userId, userId))
      .orderBy(scCalendarFeeds.createdAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // portal_context column does not exist — migration has not been run.
    // Return 409 so the caller shows a migration-required state, not an empty calendar.
    if (msg.includes('portal_context') || msg.includes('Unknown column')) {
      return res.status(409).json({
        error: 'schema_missing',
        detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel.',
      });
    }
    console.error('[GET /api/my-soccer/feeds]', err);
    return res.status(500).json({ error: 'Failed to load feeds' });
  }

  // Strict fan filter: only explicitly tagged 'fan' feeds are returned.
  // NULL = unassigned — excluded from both calendars until assigned.
  const fanFeeds = feeds
    .filter(f => f.portalContext === 'fan')
    .map(({ portalContext: _ctx, ...rest }) => rest);

  return res.json({ feeds: fanFeeds });
}
