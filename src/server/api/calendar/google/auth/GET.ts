import { createCalendarConsent } from '@/server/lib/calendar-oauth-state.js';
/**
 * GET /api/calendar/google/auth
 *
 * Redirects the signed-in user to Google's OAuth consent screen
 * requesting ONLY the calendar.readonly scope.
 *
 * Soccer Center's existing Google sign-in does NOT grant calendar access —
 * this is a separate, incremental consent flow.
 *
 * After approval Google redirects to /api/calendar/google/callback.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { requireAuth } from '../../../my-soccer/auth-guard.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const clientId = getSecret('GOOGLE_CLIENT_ID');
  if (typeof clientId !== 'string' || !clientId) {
    return res.status(503).json({ error: 'Google client ID not configured' });
  }

  const consent = await createCalendarConsent(userId, 'google');
  const redirectUri = consent.redirectUri;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    // Opaque, expiring state is bound to this authenticated user.
    state: consent.state,
    code_challenge: consent.challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
