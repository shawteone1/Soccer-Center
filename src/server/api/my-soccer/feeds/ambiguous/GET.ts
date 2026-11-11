/**
 * GET /api/my-soccer/feeds/ambiguous
 *
 * Returns the authenticated user's calendar feeds that have
 * portalContext = NULL — i.e. feeds added before the portal-separation
 * migration that have not yet been assigned to Fan or Parent.
 *
 * Response shapes:
 *
 *   200 { feeds: [...] }
 *     — Normal. feeds may be empty (no unassigned feeds) or non-empty.
 *
 *   409 { error: 'schema_missing', detail: string }
 *     — The portal_context column does not exist in this database.
 *       The schema v4 migration has not been run. The caller must show
 *       an explicit setup/error state — not treat this as "no feeds".
 *
 *   401 — unauthenticated
 *   500 — unexpected database error
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq, isNull, and } from 'drizzle-orm';
import { requireAuth } from '../../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const feeds = await db
      .select({
        id: scCalendarFeeds.id,
        provider: scCalendarFeeds.provider,
        label: scCalendarFeeds.label,
        createdAt: scCalendarFeeds.createdAt,
      })
      .from(scCalendarFeeds)
      .where(
        and(
          eq(scCalendarFeeds.userId, userId),
          isNull(scCalendarFeeds.portalContext),
        )
      )
      .orderBy(scCalendarFeeds.createdAt);

    return res.json({ feeds });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // portal_context column does not exist — schema migration has not been run.
    // Return 409 (not 404, not 200 with empty feeds) so the caller can show
    // an explicit setup state rather than silently treating this as "no feeds".
    if (msg.includes('portal_context') || msg.includes('Unknown column')) {
      return res.status(409).json({
        error: 'schema_missing',
        detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel before using calendar portal isolation.',
      });
    }
    console.error('[GET /api/my-soccer/feeds/ambiguous]', err);
    return res.status(500).json({ error: 'Failed to load ambiguous feeds' });
  }
}
