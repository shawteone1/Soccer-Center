/**
 * GET /api/parent/calendar/feeds
 * Returns the authenticated parent's saved iCal subscription feeds.
 * Subscription URLs are NEVER returned — only metadata.
 * Protected by requireParentAccess().
 *
 * Resilient to missing optional columns:
 *   - player_ids  (added by run-schema-v6) — falls back to null (all players)
 *   - portal_context (added by run-schema-v4) — returns 409 schema_missing
 *
 * Uses raw SQL so a missing column in the Drizzle schema definition does not
 * crash the entire portal page load. The Drizzle select() call includes ALL
 * columns defined in the schema object, so if player_ids is in the schema but
 * absent from the DB, the prepared query throws "Failed query" before we can
 * catch it as a known-missing-column error.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scFeedPrefs } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/** Check whether a column exists on sc_calendar_feeds. */
async function colExists(col: string): Promise<boolean> {
  try {
    const r = await db.execute(sql.raw(`SHOW COLUMNS FROM \`sc_calendar_feeds\` LIKE '${col.replace(/'/g, "''")}'`)) as unknown;
    const [rows] = r as [unknown[], unknown];
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

interface RawFeedRow {
  id: string;
  provider: string;
  label: string;
  last_fetched_at: string | null;
  last_fetch_status: string | null;
  last_fetch_error: string | null;
  event_count: number | null;
  created_at: string | null;
  player_ids?: string | null;
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Check which optional columns are present so we can build a safe SELECT.
  // We check portal_context first — if it's absent the whole endpoint is in
  // a pre-v4 state and we return 409 as before.
  const [hasPortalContext, hasPlayerIds] = await Promise.all([
    colExists('portal_context'),
    colExists('player_ids'),
  ]);

  if (!hasPortalContext) {
    return res.status(409).json({
      error: 'schema_missing',
      detail: 'The portal_context column does not exist. Run the schema v4 migration from the admin panel.',
    });
  }

  // Build SELECT list — only include player_ids when the column exists.
  const playerIdsCol = hasPlayerIds ? ', player_ids' : '';
  const safeUserId = user.id.replace(/'/g, "''");

  try {
    const [feedResult, prefs] = await Promise.all([
      db.execute(sql.raw(`
        SELECT id, provider, label,
               last_fetched_at, last_fetch_status, last_fetch_error,
               event_count, created_at${playerIdsCol}
        FROM sc_calendar_feeds
        WHERE user_id = '${safeUserId}'
          AND portal_context = 'parent'
        ORDER BY created_at ASC
      `)) as unknown,
      db.select().from(scFeedPrefs).where(eq(scFeedPrefs.userId, user.id)),
    ]);

    const [feedRows] = feedResult as [RawFeedRow[], unknown];
    const feeds = Array.isArray(feedRows) ? feedRows : [];

    const prefMap = new Map(prefs.map(p => [p.feedId, p]));

    res.json({
      feeds: feeds.map(f => ({
        id: f.id,
        provider: f.provider,
        label: f.label,
        lastFetchedAt: f.last_fetched_at ?? null,
        lastFetchStatus: f.last_fetch_status ?? null,
        lastFetchError: f.last_fetch_error ?? null,
        eventCount: f.event_count ?? 0,
        color: prefMap.get(f.id)?.color ?? null,
        createdAt: f.created_at ?? null,
        // playerIds: null = legacy (show for all players); [] = explicitly unassigned
        // Returns null when player_ids column doesn't exist yet (pre-v6 schema).
        playerIds: (() => {
          if (!hasPlayerIds || !f.player_ids) return null;
          try { return JSON.parse(f.player_ids) as string[]; }
          catch { return null; }
        })(),
        // encryptedUrl is intentionally omitted
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[GET /api/parent/calendar/feeds]', msg);
    res.status(500).json({ error: 'Failed to load calendar feeds' });
  }
}
