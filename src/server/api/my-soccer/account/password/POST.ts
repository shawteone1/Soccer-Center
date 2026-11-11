/**
 * POST /api/my-soccer/account/password
 * Change the authenticated user's password.
 * Body: { currentPassword: string, newPassword: string }
 *
 * Delegates to BetterAuth's changePassword API so the hash is managed
 * by the auth library — we never touch raw passwords ourselves.
 */
import type { Request, Response } from 'express';
import { requireAuth } from '../../../my-soccer/auth-guard.js';
import { getAuth } from '@/lib/auth/auth';
import { toWebRequest } from '@/lib/auth/express-adapter';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ error: 'currentPassword is required' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
  }

  try {
    const auth = getAuth();
    // BetterAuth changePassword — verifies current password internally
    await auth.api.changePassword({
      headers: toWebRequest(req).headers,
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      },
    });
    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('incorrect')) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    console.error('[my-soccer/account/password] Error:', msg);
    return res.status(500).json({ error: 'Password change failed' });
  }
}
