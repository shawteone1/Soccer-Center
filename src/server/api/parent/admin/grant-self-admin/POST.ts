/**
 * POST /api/parent/admin/grant-self-admin
 *
 * Bootstrap endpoint: grants isAdmin=true to the authenticated user IF their
 * email is listed in the PARENT_PORTAL_TESTERS secret.
 *
 * This is the only way to promote an account to admin without direct DB access.
 * Safe because:
 *   - Requires an active authenticated session
 *   - Only promotes accounts whose email is in the server-side secret
 *   - Idempotent (already-admin accounts get a 200 with already:true)
 *   - Does NOT accept any body — the email comes from the session, not the client
 *
 * After calling this endpoint the user must sign out and sign back in so
 * BetterAuth re-issues a session token that includes isAdmin:true.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { user as userTable } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireFanAccess } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response): Promise<void> {
  // Must be authenticated (any tier)
  const sessionUser = await requireFanAccess(req, res);
  if (!sessionUser) return; // 401 already sent

  // Already admin — nothing to do
  if (sessionUser.isAdmin) {
    res.json({ ok: true, already: true, email: sessionUser.email });
    return;
  }

  // Check email is in the allowlist
  const raw = String(getSecret('PARENT_PORTAL_TESTERS') ?? '');
  const allowed = raw
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (sessionUser.email ?? '').toLowerCase();

  if (!email || !allowed.includes(email)) {
    res.status(403).json({
      error: 'Your account is not in the admin allowlist.',
      hint: 'Add your email to the PARENT_PORTAL_TESTERS secret (comma-separated).',
    });
    return;
  }

  // Grant admin
  await db
    .update(userTable)
    .set({ isAdmin: true })
    .where(eq(userTable.id, sessionUser.id));

  res.json({
    ok: true,
    granted: true,
    email: sessionUser.email,
    next: 'Sign out and sign back in — your session will then include isAdmin:true.',
  });
}
