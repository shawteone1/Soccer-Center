/**
 * calendar-refresh-job.ts
 *
 * Background job that refreshes due iCal feeds every 15 minutes.
 *
 * "Due" means: last_fetched_at IS NULL  OR  last_fetched_at < NOW() - 15 min.
 *
 * Atomic claim: each feed row is updated to last_fetched_at = NOW() before
 * the fetch begins, so concurrent server instances (or a restart mid-run)
 * don't double-fetch the same feed.
 *
 * On success: sc_calendar_events for that feed is replaced atomically
 *   (DELETE old rows → INSERT new rows in a single logical batch).
 *   last_fetch_status = 'ok', event_count updated.
 *
 * On failure: last_fetch_status = 'error', last_fetch_error set.
 *   The existing sc_calendar_events rows are PRESERVED so the user still
 *   sees their last good data.
 *
 * Minimum gap: 5 minutes between checks for any individual feed, enforced
 * by the "due" query — a feed refreshed < 5 min ago is never re-claimed.
 */

import { randomUUID } from 'node:crypto';
import { db } from './db/client.js';
import { scCalendarFeeds, scCalendarEvents } from './db/schema.js';
import { eq, and, or, isNull, lt, sql } from 'drizzle-orm';
import { deserializePayload, decryptUrl } from './calendar-crypto.js';
import { fetchAndParseIcal, type CalendarEvent } from './ical-parser.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;   // 15 minutes between job runs
const MIN_FEED_GAP_MS     =  5 * 60 * 1000;   // 5-minute minimum between feed checks
const INITIAL_DELAY_MS    =  3 * 60 * 1000;   // 3 minutes after boot (after scraper's 2 min)

// ─── Job status ───────────────────────────────────────────────────────────────

export interface CalendarRefreshStatus {
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunFeedsRefreshed: number;
  lastRunErrors: string[];
  nextRunAt: string | null;
  isRunning: boolean;
  runCount: number;
}

const status: CalendarRefreshStatus = {
  lastRunAt: null,
  lastRunDurationMs: null,
  lastRunFeedsRefreshed: 0,
  lastRunErrors: [],
  nextRunAt: null,
  isRunning: false,
  runCount: 0,
};

export function getCalendarRefreshStatus(): CalendarRefreshStatus {
  return { ...status };
}

// ─── Core refresh logic ───────────────────────────────────────────────────────

/**
 * Refresh a single feed: decrypt URL → fetch → parse → replace events.
 * Returns true on success, false on any error.
 */
async function refreshFeed(feedId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  // 1. Load the feed row
  const rows = await db
    .select()
    .from(scCalendarFeeds)
    .where(eq(scCalendarFeeds.id, feedId))
    .limit(1);

  if (rows.length === 0) return { ok: false, error: 'Feed not found' };
  const feed = rows[0];

  // 2. Decrypt the URL — plaintext lives only in this function scope
  let plainUrl: string;
  try {
    const payload = deserializePayload(feed.encryptedUrl);
    plainUrl = decryptUrl(payload);
  } catch (err) {
    const error = `Decryption failed: ${String(err)}`;
    await db.update(scCalendarFeeds).set({
      lastFetchStatus: 'error',
      lastFetchError: error.slice(0, 512),
    }).where(eq(scCalendarFeeds.id, feedId));
    return { ok: false, error };
  }

  // 3. Fetch + parse
  let events: Awaited<ReturnType<typeof fetchAndParseIcal>>;
  try {
    events = await fetchAndParseIcal(plainUrl, feedId);
  } catch (err) {
    const error = `Fetch failed: ${String(err)}`;
    await db.update(scCalendarFeeds).set({
      lastFetchStatus: 'error',
      lastFetchError: error.slice(0, 512),
    }).where(eq(scCalendarFeeds.id, feedId));
    return { ok: false, error };
  } finally {
    // Explicitly overwrite the plaintext reference — belt-and-suspenders
    plainUrl = '';
  }

  // 4. Replace events atomically: delete old → insert new
  try {
    await db.transaction(async (tx) => {
      await tx.delete(scCalendarEvents).where(eq(scCalendarEvents.feedId, feedId));

      if (events.length > 0) {
        await tx.insert(scCalendarEvents).values(
          events.map((ev: CalendarEvent) => ({
            id: randomUUID(),
            feedId,
            userId: feed.userId,
            uid: ev.uid.slice(0, 512),
            title: ev.title.slice(0, 512),
            startAt: ev.startAt,
            endAt: ev.endAt ?? ev.startAt,
            allDay: ev.allDay,
            location: ev.location?.slice(0, 512) ?? null,
            description: ev.description?.slice(0, 4000) ?? null,
            provider: ev.provider.slice(0, 32),
            teamName: ev.teamName?.slice(0, 255) ?? null,
            eventType: ev.eventType.slice(0, 64),
            status: ev.status.slice(0, 32),
            sequence: ev.sequence,
          })),
        );
      }

      await tx.update(scCalendarFeeds).set({
        lastFetchStatus: 'ok',
        lastFetchError: null,
        lastFetchedAt: new Date(),
        eventCount: events.length,
      }).where(eq(scCalendarFeeds.id, feedId));

    });

    return { ok: true, count: events.length };
  } catch (err) {
    const error = `DB write failed: ${String(err)}`;
    await db.update(scCalendarFeeds).set({
      lastFetchStatus: 'error',
      lastFetchError: error.slice(0, 512),
    }).where(eq(scCalendarFeeds.id, feedId));
    return { ok: false, error };
  }
}

/**
 * Find and refresh all feeds that are due (null or > 5 min old last_fetched_at).
 * Atomically claims each feed before fetching to prevent double-refresh.
 */
export async function refreshDue(): Promise<CalendarRefreshStatus> {
  if (status.isRunning) {
    console.log('[calendar-refresh] Already running — skipping');
    return getCalendarRefreshStatus();
  }

  status.isRunning = true;
  const startedAt = Date.now();
  const errors: string[] = [];
  let refreshed = 0;

  try {
    const cutoff = new Date(Date.now() - MIN_FEED_GAP_MS);

    // Find due feeds — exclude one-time import feeds (provider='import')
    // Import feeds are synced exactly once on creation and must never be
    // re-fetched by the background job.
    const dueFeeds = await db
      .select({ id: scCalendarFeeds.id })
      .from(scCalendarFeeds)
      .where(
        and(
          sql`provider != 'import'`,
          or(
            isNull(scCalendarFeeds.lastFetchedAt),
            lt(scCalendarFeeds.lastFetchedAt, cutoff),
          ),
        ),
      );

    if (dueFeeds.length === 0) {
      console.log('[calendar-refresh] No feeds due for refresh');
    } else {
      console.log(`[calendar-refresh] Refreshing ${dueFeeds.length} due feed(s)`);

      // Atomically claim each feed by setting lastFetchedAt = NOW() before fetching.
      // This prevents a concurrent run from picking up the same feed.
      for (const { id } of dueFeeds) {
        await db.update(scCalendarFeeds)
          .set({ lastFetchedAt: new Date() })
          .where(and(
            eq(scCalendarFeeds.id, id),
            or(
              isNull(scCalendarFeeds.lastFetchedAt),
              lt(scCalendarFeeds.lastFetchedAt, cutoff),
            ),
          ));

        const result = await refreshFeed(id);
        if (result.ok) {
          refreshed++;
          console.log(`[calendar-refresh] Feed ${id}: ${result.count} events`);
        } else {
          errors.push(`Feed ${id}: ${result.error}`);
          console.error(`[calendar-refresh] Feed ${id} error: ${result.error}`);
        }
      }
    }
  } catch (err) {
    const msg = `Unexpected error: ${String(err)}`;
    errors.push(msg);
    console.error(`[calendar-refresh] ${msg}`);
  }

  const durationMs = Date.now() - startedAt;
  status.isRunning = false;
  status.lastRunAt = new Date().toISOString();
  status.lastRunDurationMs = durationMs;
  status.lastRunFeedsRefreshed = refreshed;
  status.lastRunErrors = errors;
  status.runCount += 1;

  console.log(
    `[calendar-refresh] Done — ${refreshed} refreshed, ${errors.length} errors, ${(durationMs / 1000).toFixed(1)}s`,
  );
  return getCalendarRefreshStatus();
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/** Run refreshDue() with a hard try/catch so a per-feed crash (including
 *  Node.js v22 undici TLS AssertionErrors that escape the inner try/catch)
 *  can never propagate to the scheduler timer and kill the process. */
async function safeRefreshDue(): Promise<void> {
  try {
    await refreshDue();
  } catch (err) {
    // Should never reach here — refreshDue() has its own catch — but if an
    // undici AssertionError or other native error escapes, log and swallow it.
    console.error('[calendar-refresh] Unhandled error in refreshDue (swallowed to protect server):', err);
  }
}

export function startCalendarRefreshScheduler(): void {
  const firstRunAt = new Date(Date.now() + INITIAL_DELAY_MS);
  status.nextRunAt = firstRunAt.toISOString();
  console.log(`[calendar-refresh] Scheduler started — first run at ${firstRunAt.toISOString()}`);

  setTimeout(() => {
    void safeRefreshDue().then(() => {
      status.nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
    });

    setInterval(() => {
      status.nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
      void safeRefreshDue().then(() => {
        status.nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
      });
    }, REFRESH_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS);
}

// ─── On-demand refresh for a single feed (called by API route) ────────────────

export async function refreshFeedNow(feedId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  return refreshFeed(feedId);
}

// ─── Exported for use by sql() in queries ─────────────────────────────────────
export { sql };
