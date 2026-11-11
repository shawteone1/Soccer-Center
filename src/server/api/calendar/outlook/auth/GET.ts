import { createCalendarConsent } from '@/server/lib/calendar-oauth-state.js';
/**
 * GET /api/calendar/outlook/auth
 * Redirects to Microsoft identity platform OAuth2 consent screen.
 * Requests Calendars.Read scope only.
 * Requires OUTLOOK_CLIENT_ID secret.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { requireAuth } from '../../../my-soccer/auth-guard.js';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const clientId = getSecret('OUTLOOK_CLIENT_ID');
  if (typeof clientId !== 'string' || !clientId) {
    return res.status(503).json({
      error: 'Outlook client ID not configured',
      hint: 'Add OUTLOOK_CLIENT_ID via the Secrets panel',
    });
  }

  const consent = await createCalendarConsent(userId, 'outlook');
  const redirectUri = consent.redirectUri;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'Calendars.Read offline_access',
    response_mode: 'query',
    state: consent.state,
    code_challenge: consent.challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(`${MS_AUTH_URL}?${params.toString()}`);
}
