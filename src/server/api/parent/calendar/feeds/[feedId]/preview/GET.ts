import { fetchIcalText } from '@/server/ical-parser.js';
/**
 * GET /api/parent/calendar/feeds/:feedId/preview
 * Fetches and parses the iCal feed for a saved subscription, returning
 * the next N events as a preview. The raw URL is decrypted server-side
 * and NEVER returned to the browser.
 *
 * Query params:
 *   limit — max events to return (default: 10, max: 25)
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createDecipheriv } from 'crypto';
import { getSecret } from '#airo/secrets';
import ICAL from 'ical.js';

function decryptUrl(encryptedJson: string): string {
  const keyHex = getSecret('FEED_ENCRYPTION_KEY') as string | undefined;
  if (!keyHex || keyHex.length < 64) {
    throw new Error('FEED_ENCRYPTION_KEY not configured');
  }
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const { iv, authTag, ciphertext } = JSON.parse(encryptedJson) as {
    iv: string; authTag: string; ciphertext: string;
  };
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return decipher.update(Buffer.from(ciphertext, 'hex')) + decipher.final('utf8');
}

interface PreviewEvent {
  uid: string;
  title: string;
  start: string;   // ISO 8601
  end: string;     // ISO 8601
  allDay: boolean;
  location?: string;
  description?: string;
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { feedId: feedIdParam } = req.params;
  const feedId = Array.isArray(feedIdParam) ? feedIdParam[0] : feedIdParam;
  const limitRaw = parseInt((req.query.limit as string | undefined) ?? '10', 10);
  const limit = Math.min(isNaN(limitRaw) ? 10 : limitRaw, 25);

  try {
    const [feed] = await db
      .select()
      .from(scCalendarFeeds)
      .where(and(eq(scCalendarFeeds.id, feedId), eq(scCalendarFeeds.userId, user.id)))
      .limit(1);

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    let rawUrl: string;
    try {
      rawUrl = decryptUrl(feed.encryptedUrl);
    } catch {
      return res.status(500).json({ error: 'Failed to decrypt feed URL — re-add the subscription' });
    }

    // Fetch the iCal data
    let icalText: string;
    try {
      icalText = await fetchIcalText(rawUrl);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return res.status(422).json({
        error: `Could not reach the calendar URL: ${msg}`,
      });
    }

    // Parse iCal
    let events: PreviewEvent[] = [];
    try {
      const jcal = ICAL.parse(icalText);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents('vevent');
      const now = new Date();

      for (const vevent of vevents) {
        const ev = new ICAL.Event(vevent);
        const dtstart = ev.startDate;
        const dtend = ev.endDate ?? ev.startDate;
        if (!dtstart) continue;

        const startDate = dtstart.toJSDate();
        if (startDate < now) continue; // skip past events

        events.push({
          uid: ev.uid ?? `${feedId}-${Math.random()}`,
          title: ev.summary ?? 'Untitled event',
          start: startDate.toISOString(),
          end: dtend.toJSDate().toISOString(),
          allDay: dtstart.isDate,
          location: ev.location ?? undefined,
          description: ev.description ?? undefined,
        });
      }

      // Sort ascending and take limit
      events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      events = events.slice(0, limit);
    } catch (parseErr) {
      return res.status(422).json({
        error: 'The URL does not appear to be a valid iCal (.ics) calendar feed.',
      });
    }

    // Update last fetched metadata
    await db
      .update(scCalendarFeeds)
      .set({
        lastFetchedAt: new Date(),
        lastFetchStatus: 'ok',
        lastFetchError: null,
        eventCount: events.length,
      })
      .where(eq(scCalendarFeeds.id, feedId));

    res.json({ events, total: events.length, feedId });
  } catch (e) {
    console.error('[GET /api/parent/calendar/feeds/:feedId/preview]', e);
    res.status(500).json({ error: 'Preview failed' });
  }
}
