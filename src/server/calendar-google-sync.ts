/**
 * calendar-google-sync.ts
 *
 * Fetches events from Google Calendar API for a user and upserts them
 * into sc_calendar_events with provider='google_calendar'.
 *
 * Uses the per-user access token stored in sc_oauth_tokens.
 * Refreshes the token automatically when expired.
 */

import { db } from './db/client.js';
import { scOauthTokens, scCalendarEvents } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Virtual feed ID for Google Calendar events (not a real sc_calendar_feeds row)
// We use a deterministic prefix so events can be scoped per user
function googleFeedId(userId: string): string {
  return `google_cal_${userId.slice(0, 8)}`;
}

async function refreshGoogleToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = getSecret('GOOGLE_CLIENT_ID');
  const clientSecret = getSecret('GOOGLE_CLIENT_SECRET');
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;
    await db.update(scOauthTokens).set({
      accessToken: data.access_token,
      expiresAt,
    }).where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')));

    return data.access_token;
  } catch {
    return null;
  }
}

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  status?: string;
}

export async function syncGoogleCalendarEvents(userId: string): Promise<{ count: number; error?: string }> {
  const tokenRows = await db
    .select()
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')))
    .limit(1);

  if (tokenRows.length === 0) return { count: 0, error: 'Not connected' };

  let { accessToken, refreshToken, expiresAt } = tokenRows[0];

  // Refresh if expired or close to expiry
  if (expiresAt && Date.now() > expiresAt - 60_000) {
    if (!refreshToken) return { count: 0, error: 'Token expired and no refresh token' };
    const newToken = await refreshGoogleToken(userId, refreshToken);
    if (!newToken) return { count: 0, error: 'Token refresh failed' };
    accessToken = newToken;
  }

  // Fetch events from primary calendar, next 3 months
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  let events: GoogleEvent[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 401) {
        // Try refresh once
        if (!refreshToken) return { count: 0, error: 'Unauthorized' };
        const newToken = await refreshGoogleToken(userId, refreshToken);
        if (!newToken) return { count: 0, error: 'Unauthorized — token refresh failed' };
        accessToken = newToken;
        continue;
      }

      if (!res.ok) return { count: 0, error: `Google API error: ${res.status}` };

      const data = await res.json() as { items?: GoogleEvent[]; nextPageToken?: string };
      events = events.concat(data.items ?? []);
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (e) {
    return { count: 0, error: String(e) };
  }

  const feedId = googleFeedId(userId);

  // Delete existing Google Calendar events for this user
  await db.delete(scCalendarEvents)
    .where(and(eq(scCalendarEvents.userId, userId), eq(scCalendarEvents.provider, 'google_calendar')));

  // Insert fresh events
  for (const ev of events) {
    const allDay = !ev.start?.dateTime;
    const startAt = ev.start?.dateTime ?? ev.start?.date ?? '';
    const endAt = ev.end?.dateTime ?? ev.end?.date ?? null;
    if (!startAt) continue;

    await db.insert(scCalendarEvents).values({
      id: randomUUID(),
      feedId,
      userId,
      uid: ev.id,
      title: ev.summary ?? '(No title)',
      startAt,
      endAt,
      allDay,
      location: ev.location ?? null,
      description: ev.description ?? null,
      provider: 'google_calendar',
      teamName: null,
      eventType: 'event',
      status: ev.status === 'cancelled' ? 'cancelled' : 'confirmed',
      sequence: 0,
    });
  }

  return { count: events.length };
}
