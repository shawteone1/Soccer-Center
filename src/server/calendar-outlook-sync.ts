/**
 * calendar-outlook-sync.ts
 * Fetches events from Microsoft Graph Calendar API and upserts into sc_calendar_events.
 */
import { db } from './db/client.js';
import { scOauthTokens, scCalendarEvents } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

function outlookFeedId(userId: string): string {
  return `outlook_cal_${userId.slice(0, 8)}`;
}

async function refreshOutlookToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = getSecret('OUTLOOK_CLIENT_ID');
  const clientSecret = getSecret('OUTLOOK_CLIENT_SECRET');
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return null;

  try {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Calendars.Read offline_access',
      }).toString(),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;
    await db.update(scOauthTokens).set({ accessToken: data.access_token, expiresAt })
      .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')));

    return data.access_token;
  } catch {
    return null;
  }
}

interface OutlookEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  body?: { content?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
}

export async function syncOutlookCalendarEvents(userId: string): Promise<{ count: number; error?: string }> {
  const tokenRows = await db
    .select()
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')))
    .limit(1);

  if (tokenRows.length === 0) return { count: 0, error: 'Not connected' };

  let { accessToken, refreshToken, expiresAt } = tokenRows[0];

  if (expiresAt && Date.now() > expiresAt - 60_000) {
    if (!refreshToken) return { count: 0, error: 'Token expired and no refresh token' };
    const newToken = await refreshOutlookToken(userId, refreshToken);
    if (!newToken) return { count: 0, error: 'Token refresh failed' };
    accessToken = newToken;
  }

  const now = new Date();
  const startDateTime = now.toISOString();
  const endDateTime = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  let events: OutlookEvent[] = [];
  let nextLink: string | undefined = `${GRAPH_API}/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=250&$select=id,subject,start,end,location,body,isAllDay,isCancelled`;

  try {
    while (nextLink) {
      const res = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });

      if (res.status === 401) {
        if (!refreshToken) return { count: 0, error: 'Unauthorized' };
        const newToken = await refreshOutlookToken(userId, refreshToken);
        if (!newToken) return { count: 0, error: 'Unauthorized — token refresh failed' };
        accessToken = newToken;
        continue;
      }

      if (!res.ok) return { count: 0, error: `Graph API error: ${res.status}` };

      const data = await res.json() as { value?: OutlookEvent[]; '@odata.nextLink'?: string };
      events = events.concat(data.value ?? []);
      nextLink = data['@odata.nextLink'];
    }
  } catch (e) {
    return { count: 0, error: String(e) };
  }

  const feedId = outlookFeedId(userId);

  await db.delete(scCalendarEvents)
    .where(and(eq(scCalendarEvents.userId, userId), eq(scCalendarEvents.provider, 'outlook')));

  for (const ev of events) {
    const allDay = ev.isAllDay ?? false;
    const startAt = ev.start?.dateTime ?? '';
    const endAt = ev.end?.dateTime ?? null;
    if (!startAt) continue;

    await db.insert(scCalendarEvents).values({
      id: randomUUID(),
      feedId,
      userId,
      uid: ev.id,
      title: ev.subject ?? '(No title)',
      startAt,
      endAt,
      allDay,
      location: ev.location?.displayName ?? null,
      description: null,
      provider: 'outlook',
      teamName: null,
      eventType: 'event',
      status: ev.isCancelled ? 'cancelled' : 'confirmed',
      sequence: 0,
    });
  }

  return { count: events.length };
}
