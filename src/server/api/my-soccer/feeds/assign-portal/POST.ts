/**
 * POST /api/my-soccer/feeds/assign-portal
 *
 * Assigns a portalContext ('fan' | 'parent') to one or more calendar feeds
 * that currently have portalContext = NULL (ambiguous / pre-v4 legacy feeds).
 *
 * Body: { assignments: { feedId: string; portal: 'fan' | 'parent' }[] }
 *
 * Authorization:
 *   - All feeds must belong to the authenticated user (verified before any write).
 *   - Assigning to 'parent' requires the caller to have PARENT accessType.
 *     A FAN account may only assign feeds to 'fan'.
 *
 * Atomicity:
 *   - All updates run inside a single MySQL transaction.
 *   - If any update fails, the entire batch is rolled back and a 500 is returned.
 *   - A partial batch is never committed.
 *
 * Idempotency:
 *   - Feeds that already have a non-NULL portalContext are skipped (not overwritten).
 *   - Skipped count is returned separately from assigned count.
 *
 * Error responses:
 *   400 — missing/invalid body or invalid portal value
 *   401 — unauthenticated
 *   403 — feedId belongs to another user, or caller lacks PARENT access
 *   409 — portal_context column does not exist yet (schema migration required)
 *   500 — database error (safe message, no raw DB detail)
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { getSessionUser } from '../../auth-guard.js';
import { isParentPortalEnabled } from '@/server/auth-policy.js';

interface Assignment {
  feedId: string;
  portal: 'fan' | 'parent';
}

export default async function handler(req: Request, res: Response) {
  // Resolve full session user so we can check accessType for parent assignments.
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { assignments } = req.body as { assignments?: Assignment[] };

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'assignments array is required' });
  }

  const VALID_PORTALS = new Set(['fan', 'parent']);
  for (const a of assignments) {
    if (typeof a.feedId !== 'string' || !VALID_PORTALS.has(a.portal)) {
      return res.status(400).json({
        error: 'Each assignment must have feedId (string) and portal ("fan"|"parent")',
      });
    }
  }

  // If any assignment targets 'parent', the caller must have PARENT accessType.
  // A FAN account cannot assign feeds to the parent calendar.
  const hasParentAssignment = assignments.some(a => a.portal === 'parent');
  if (hasParentAssignment) {
    const isParent =
      user.accessType === 'PARENT' && isParentPortalEnabled(user.email);
    if (!isParent) {
      return res.status(403).json({
        error: 'Assigning feeds to the Parent portal requires a Parent account',
      });
    }
  }

  // Verify ownership of all feedIds before making any writes.
  // Fetch only the caller's feeds — any feedId not in this set is unauthorized.
  let ownedFeeds: { id: string; portalContext: string | null }[];
  try {
    ownedFeeds = await db
      .select({ id: scCalendarFeeds.id, portalContext: scCalendarFeeds.portalContext })
      .from(scCalendarFeeds)
      .where(eq(scCalendarFeeds.userId, user.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // portal_context column missing — migration has not been run yet
    if (msg.includes('portal_context') || msg.includes('Unknown column')) {
      return res.status(409).json({
        error: 'Schema migration required',
        detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel before assigning feeds.',
      });
    }
    console.error('[POST /api/my-soccer/feeds/assign-portal] ownership check failed:', msg);
    return res.status(500).json({ error: 'Unable to verify feed ownership. Please try again.' });
  }

  const ownedIds = new Set(ownedFeeds.map(f => f.id));
  const feedIds = assignments.map(a => a.feedId);
  const unauthorized = feedIds.filter(id => !ownedIds.has(id));
  if (unauthorized.length > 0) {
    return res.status(403).json({
      error: 'One or more feeds do not belong to your account',
    });
  }

  // Run all updates inside a single transaction.
  // If any update throws, the transaction rolls back and we return 500.
  let assigned = 0;
  let skipped = 0;

  try {
    await db.transaction(async (tx) => {
      for (const { feedId, portal } of assignments) {
        // Only update feeds that currently have portalContext = NULL.
        // Never overwrite an existing explicit tag.
        const result = await tx
          .update(scCalendarFeeds)
          .set({ portalContext: portal })
          .where(
            and(
              eq(scCalendarFeeds.id, feedId),
              eq(scCalendarFeeds.userId, user.id),
              isNull(scCalendarFeeds.portalContext),
            )
          );

        // Drizzle MySQL2 returns [ResultSetHeader, ...] — affectedRows is on [0]
        const affectedRows =
          (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;

        if (affectedRows > 0) {
          assigned++;
        } else {
          // Feed already had an explicit tag — expected skip, not an error.
          skipped++;
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('portal_context') || msg.includes('Unknown column')) {
      return res.status(409).json({
        error: 'Schema migration required',
        detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel.',
      });
    }
    console.error('[POST /api/my-soccer/feeds/assign-portal] transaction failed:', msg);
    return res.status(500).json({ error: 'Failed to save assignments. No changes were made.' });
  }

  return res.json({ assigned, skipped });
}
