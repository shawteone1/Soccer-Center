/**
 * DELETE /api/my-soccer/account
 * Permanently delete the authenticated user's account.
 * Body: { password: string }  — required to confirm intent.
 *
 * Cascade deletes: sc_calendar_feeds → sc_calendar_events (via FK CASCADE).
 * BetterAuth user deletion also cascades session + account rows.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../my-soccer/auth-guard.js';
import { getAuth } from '@/lib/auth/auth';
import { toWebRequest } from '@/lib/auth/express-adapter';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { password } = req.body as { password?: unknown };
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'password is required to confirm account deletion' });
  }

  try {
    const auth = getAuth();
    await auth.api.deleteUser({
      headers: toWebRequest(req).headers,
      body: { password },
    });
    // Clear the session cookie
    res.clearCookie('better-auth.session_token');
    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('incorrect')) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }
    console.error('[my-soccer/account] Delete error:', msg);
    return res.status(500).json({ error: 'Account deletion failed' });
  }
}
