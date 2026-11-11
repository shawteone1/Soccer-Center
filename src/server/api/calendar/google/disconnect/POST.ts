/**
 * POST /api/calendar/google/disconnect
 * Revokes and removes the Google Calendar OAuth token for the signed-in user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scOauthTokens, scCalendarEvents } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../../../my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const token = await db
    .select()
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')))
    .limit(1);

  if (token.length === 0) return res.status(404).json({ error: 'Google Calendar not connected' });

  // Attempt to revoke the token at Google (best-effort)
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token[0].accessToken)}`, { method: 'POST' });
  } catch { /* ignore */ }

  // Delete the token record
  await db.delete(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')));

  // Delete synced events for this user+provider
  await db.delete(scCalendarEvents)
    .where(and(eq(scCalendarEvents.userId, userId), eq(scCalendarEvents.provider, 'google_calendar')));

  return res.json({ ok: true });
}
