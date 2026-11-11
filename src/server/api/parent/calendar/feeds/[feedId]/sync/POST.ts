/**
 * POST /api/parent/calendar/feeds/:feedId/sync
 *
 * Fetches the iCal URL for a connected feed, parses it with ical.js,
 * and replaces events in sc_calendar_events.
 *
 * Security: all fetching goes through fetchAndParseIcal() from ical-parser.ts
 * which enforces HTTPS-only, provider allowlist, DNS rebinding protection
 * (private IP rejection), 30-second timeout, 2 MB response-size cap, and
 * redirect following with destination checks.
 *
 * Failure-safe: fetch and parse complete before any events are deleted.
 * If fetch or parse fails, the existing events are preserved unchanged.
 * Delete and insert run sequentially in the same DB connection; MySQL 5.7
 * does not support multi-statement transactions via Drizzle execute(), so
 * we achieve safety by completing the new set before removing the old one.
 *
 * Import feeds (provider='import') are one-time snapshots. This endpoint
 * returns 409 for import feeds — they must not be re-synced after creation.
 *
 * Protected by requireParentAccess(). The feed must belong to the authenticated user.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarEvents } from '@/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { deserializePayload, decryptUrl } from '@/server/calendar-crypto.js';
import { fetchAndParseIcal } from '@/server/ical-parser.js';

async function updateFeedStatus(feedId: string, status: 'ok' | 'error', opts: {
  error?: string | null;
  eventCount?: number;
  label?: string | null;
}) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const errVal = opts.error != null ? `'${opts.error.replace(/'/g, "''").slice(0, 512)}'` : 'NULL';
  const countVal = opts.eventCount != null ? String(opts.eventCount) : 'event_count';
  const labelSet = opts.label ? `, label = '${opts.label.replace(/'/g, "''").slice(0, 128)}'` : '';
  await db.execute(sql.raw(
    `UPDATE sc_calendar_feeds
     SET last_fetch_status = '${status}',
         last_fetch_error = ${errVal},
         last_fetched_at = '${now}',
         event_count = ${countVal}
         ${labelSet}
     WHERE id = '${feedId}'`
  ));
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const feedId = Array.isArray(req.params.feedId) ? req.params.feedId[0] : req.params.feedId;

  // Load feed — must belong to this user
  type FeedRow = { id: string; encrypted_url: string; provider: string };
  const feedRows = await db.execute(
    sql.raw(`SELECT id, encrypted_url, provider FROM sc_calendar_feeds WHERE id = '${feedId.replace(/'/g, "''")}' AND user_id = '${user.id.replace(/'/g, "''")}' LIMIT 1`)
  );
  const feedArr = (feedRows as unknown as [FeedRow[]])[0];

  if (!feedArr.length) {
    res.status(404).json({ error: 'Feed not found' });
    return;
  }

  const feed = feedArr[0];

  // Import feeds are one-time snapshots — refuse re-sync
  if (feed.provider === 'import') {
    res.status(409).json({
      error: 'This feed was imported once and cannot be re-synced. Delete it and re-import to refresh.',
      code: 'IMPORT_FEED_NO_SYNC',
    });
    return;
  }

  // Decrypt URL — plaintext lives only in this function scope
  let rawUrl: string;
  try {
    const payload = deserializePayload(feed.encrypted_url);
    rawUrl = decryptUrl(payload);
  } catch (e) {
    await updateFeedStatus(feedId, 'error', { error: 'Decryption failed' });
    res.status(500).json({ error: 'Could not decrypt feed URL' });
    return;
  }

  // Fetch + parse via shared SSRF-safe library.
  // This completes BEFORE we touch the existing events — failure-safe.
  let parsedEvents: Awaited<ReturnType<typeof fetchAndParseIcal>>;
  let calendarName: string | null = null;
  try {
    parsedEvents = await fetchAndParseIcal(rawUrl, feedId);
    // Best-effort: extract calendar name from the raw text for label update
    // (fetchAndParseIcal doesn't return it, so we skip the label update here)
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    await updateFeedStatus(feedId, 'error', { error: msg });
    // Existing events are untouched — preserved for the user
    res.status(422).json({ error: `Could not refresh calendar: ${msg}` });
    return;
  } finally {
    // Overwrite plaintext reference
    rawUrl = '';
  }

  // Replace events atomically inside a transaction.
  // If the insert or delete fails, the transaction rolls back and the
  // existing events are preserved unchanged.
  try {
    const newRows = parsedEvents.map(ev => ({
      id: randomUUID(),
      feedId,
      userId: user.id,
      uid: ev.uid.slice(0, 512),
      title: ev.title.slice(0, 512),
      startAt: ev.startAt,
      endAt: ev.endAt ?? ev.startAt,
      allDay: ev.allDay,
      location: ev.location?.slice(0, 512) ?? undefined,
      description: ev.description?.slice(0, 4000) ?? undefined,
      provider: feed.provider,
      teamName: (calendarName ?? ev.teamName ?? '').slice(0, 255) || undefined,
      eventType: ev.eventType.slice(0, 64),
      status: ev.status.slice(0, 32),
      sequence: ev.sequence,
    }));

    await db.transaction(async (tx) => {
      // Delete old events first inside the transaction
      await tx.delete(scCalendarEvents).where(
        sql.raw(`feed_id = '${feedId.replace(/'/g, "''")}'`)
      );
      // Insert new events — if this fails, the transaction rolls back
      // and the delete above is also rolled back, restoring old events
      if (newRows.length > 0) {
        await tx.insert(scCalendarEvents).values(newRows);
      }
    });

    await updateFeedStatus(feedId, 'ok', {
      error: null,
      eventCount: parsedEvents.length,
      label: calendarName,
    });

    res.json({
      ok: true,
      feedId,
      synced: parsedEvents.length,
      calendarName,
    });
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    await updateFeedStatus(feedId, 'error', { error: `DB error: ${msg.slice(0, 200)}` });
    res.status(500).json({ error: `Database error during sync: ${msg}` });
  }
}
