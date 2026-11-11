/**
 * POST /api/parent/calendar/feeds/validate
 * Validates an iCal URL without saving it.
 * Fetches the URL server-side, parses it, and returns a preview of upcoming events.
 * The URL is NOT stored.
 *
 * Body: { url: string }
 *
 * Protected by requireParentAccess().
 *
 * Security: all fetching goes through fetchIcalText() from ical-parser.ts which
 * enforces HTTPS-only, provider allowlist, DNS rebinding protection (private IP
 * rejection), 30-second timeout, 2 MB response-size cap, and redirect following
 * with destination checks.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { validateFeedUrl, fetchIcalText } from '@/server/ical-parser.js';
import ICAL from 'ical.js';

interface PreviewEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { url } = req.body as { url?: string };

  if (!url?.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  // Validate URL: HTTPS-only, provider allowlist, format check
  const validated = validateFeedUrl(url.trim());
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }

  const normalizedUrl = validated.normalized;

  // Fetch via shared SSRF-safe fetcher: DNS check, size cap, timeout, redirect check
  let icalText: string;
  try {
    icalText = await fetchIcalText(normalizedUrl);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return res.status(422).json({ error: `Could not reach the calendar URL: ${msg}` });
  }

  let events: PreviewEvent[] = [];
  let calendarName: string | null = null;

  try {
    const jcal = ICAL.parse(icalText);
    const comp = new ICAL.Component(jcal);
    calendarName = comp.getFirstPropertyValue('x-wr-calname') as string | null;
    const vevents = comp.getAllSubcomponents('vevent');
    const now = new Date();

    for (const vevent of vevents) {
      const ev = new ICAL.Event(vevent);
      const dtstart = ev.startDate;
      const dtend = ev.endDate ?? ev.startDate;
      if (!dtstart) continue;

      const startDate = dtstart.toJSDate();
      if (startDate < now) continue;

      events.push({
        uid: ev.uid ?? String(Math.random()),
        title: ev.summary ?? 'Untitled event',
        start: startDate.toISOString(),
        end: dtend.toJSDate().toISOString(),
        allDay: dtstart.isDate,
        location: ev.location ?? undefined,
      });
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    events = events.slice(0, 10);
  } catch {
    return res.status(422).json({
      error: 'The URL does not appear to be a valid iCal (.ics) calendar feed.',
    });
  }

  res.json({
    valid: true,
    calendarName,
    upcomingEventCount: events.length,
    events,
  });
}
