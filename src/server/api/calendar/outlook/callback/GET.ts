import { consumeCalendarConsent } from '@/server/lib/calendar-oauth-state.js';
import { requireAuth } from '../../../my-soccer/auth-guard.js';
/**
 * GET /api/calendar/outlook/callback
 * Exchanges the authorization code for tokens and stores them per-user.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { scOauthTokens } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { syncOutlookCalendarEvents } from '../../../../calendar-outlook-sync.js';

export default async function handler(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) return res.redirect(`/my-soccer?tab=calendar&error=outlook_denied`);
  if (!code) return res.redirect(`/my-soccer?tab=calendar&error=outlook_no_code`);

  const userId = await requireAuth(req, res);
  if (!userId) return;
  const consent = await consumeCalendarConsent(state, userId, 'outlook');
  if (!consent) return res.redirect('/my-soccer?tab=calendar&error=outlook_bad_state');

  const clientId = getSecret('OUTLOOK_CLIENT_ID');
  const clientSecret = getSecret('OUTLOOK_CLIENT_SECRET');
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
    return res.redirect(`/my-soccer?tab=calendar&error=outlook_not_configured`);
  }

  const redirectUri = consent.redirectUri;

  let tokenData: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
        scope: 'Calendars.Read offline_access',
      }).toString(),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    return res.redirect(`/my-soccer?tab=calendar&error=outlook_token_failed`);
  }

  if (!tokenData.access_token) {
    return res.redirect(`/my-soccer?tab=calendar&error=outlook_token_failed`);
  }

  const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined;

  const existing = await db
    .select({ id: scOauthTokens.id })
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')))
    .limit(1);

  if (existing.length > 0) {
    await db.update(scOauthTokens).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? undefined,
      expiresAt: expiresAt ?? null,
      scope: 'Calendars.Read',
    }).where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')));
  } else {
    await db.insert(scOauthTokens).values({
      id: randomUUID(),
      userId,
      provider: 'outlook',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: expiresAt ?? null,
      scope: 'Calendars.Read',
    });
  }

  void syncOutlookCalendarEvents(userId).catch((e) =>
    console.error('[outlook-cal] Initial sync error:', e),
  );

  return res.redirect(`/my-soccer?tab=calendar&connected=outlook`);
}
