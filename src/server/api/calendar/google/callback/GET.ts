import { consumeCalendarConsent } from '@/server/lib/calendar-oauth-state.js';
import { requireAuth } from '../../../my-soccer/auth-guard.js';
/**
 * GET /api/calendar/google/callback
 * Exchanges the authorization code for tokens and stores them per-user in DB.
 * Then kicks off an initial event sync.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { scOauthTokens } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { syncGoogleCalendarEvents } from '../../../../calendar-google-sync.js';

export default async function handler(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) return res.redirect(`/my-soccer?tab=calendar&error=google_denied`);
  if (!code) return res.redirect(`/my-soccer?tab=calendar&error=google_no_code`);

  const userId = await requireAuth(req, res);
  if (!userId) return;
  const consent = await consumeCalendarConsent(state, userId, 'google');
  if (!consent) return res.redirect('/my-soccer?tab=calendar&error=google_bad_state');

  const clientId = getSecret('GOOGLE_CLIENT_ID');
  const clientSecret = getSecret('GOOGLE_CLIENT_SECRET');
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
    return res.redirect(`/my-soccer?tab=calendar&error=google_not_configured`);
  }

  const redirectUri = consent.redirectUri;

  // Exchange code for tokens
  let tokenData: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: consent.verifier,
      }).toString(),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    return res.redirect(`/my-soccer?tab=calendar&error=google_token_failed`);
  }

  if (!tokenData.access_token) {
    return res.redirect(`/my-soccer?tab=calendar&error=google_token_failed`);
  }

  const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined;

  // Upsert token for this user+provider
  const existing = await db
    .select({ id: scOauthTokens.id })
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')))
    .limit(1);

  if (existing.length > 0) {
    await db.update(scOauthTokens).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? undefined,
      expiresAt: expiresAt ?? null,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    }).where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'google_calendar')));
  } else {
    await db.insert(scOauthTokens).values({
      id: randomUUID(),
      userId,
      provider: 'google_calendar',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: expiresAt ?? null,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    });
  }

  // Kick off background sync (fire-and-forget)
  void syncGoogleCalendarEvents(userId).catch((e) =>
    console.error('[google-cal] Initial sync error:', e),
  );

  return res.redirect(`/my-soccer?tab=calendar&connected=google_calendar`);
}
