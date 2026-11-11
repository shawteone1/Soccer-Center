/**
 * GET /api/parent/admin/session-debug
 *
 * Returns the authenticated user's session fields as the server sees them.
 * Used to verify that isAdmin and accessType are being read correctly from
 * the DB after a grant-self-admin call + re-login.
 *
 * Safe: requires authentication. Returns only non-sensitive identity fields.
 */
import type { Request, Response } from 'express';
import { requireFanAccess } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireFanAccess(req, res);
  if (!user) return; // 401 already sent

  const raw = String(getSecret('PARENT_PORTAL_TESTERS') ?? '');
  const allowed = raw
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  res.json({
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    accessType: user.accessType,
    inAllowlist: allowed.includes((user.email ?? '').toLowerCase()),
    allowlistEmails: allowed,
  });
}
