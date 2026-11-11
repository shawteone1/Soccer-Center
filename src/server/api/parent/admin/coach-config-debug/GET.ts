/**
 * GET /api/parent/admin/coach-config-debug
 *
 * Reports exactly what the running production server sees for the coach
 * sharing feature secrets. Returns presence, typeof, length, and equality
 * result — never the raw value.
 *
 * Protected: requires admin user.
 */
import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  function inspect(key: string) {
    const raw = getSecret(key);
    const type = typeof raw;
    const present = raw !== undefined && raw !== null;
    const length = present ? String(raw).length : null;
    // Trim check: does trimming change the value?
    const trimmedLength = present ? String(raw).trim().length : null;
    const hasLeadingTrailingSpace = present && trimmedLength !== length;
    return {
      present,
      type,
      length,
      hasLeadingTrailingSpace,
      equalsTrue: raw === 'true',
      equalsTrueTrimmed: present ? String(raw).trim() === 'true' : false,
    };
  }

  const linksEnabled = inspect('COACH_PROFILE_LINKS_ENABLED');
  const testers = inspect('COACH_PROFILE_TESTERS');

  // Also report whether DrizzleCoachLinkStore was registered at startup
  // by checking the store via a dynamic import (safe — no side effects)
  let storeRegistered: boolean | null = null;
  try {
    const { getCoachLinkStore } = await import('@/server/lib/coach-link-store.js');
    const secretFn = (k: string): string | undefined => {
      const v = getSecret(k);
      return typeof v === 'string' ? v : undefined;
    };
    const store = getCoachLinkStore(secretFn);
    storeRegistered = store !== null && store !== undefined;
  } catch {
    storeRegistered = null;
  }

  // Build identifier: npm_package_version from package.json + process uptime
  // (commit hash is not injected at runtime; check startup logs for "Version: <hash>")
  const pkgVersion = process.env['npm_package_version'] ?? 'unknown';
  const uptimeSec = Math.round(process.uptime());
  const buildHash = `v${pkgVersion} (uptime ${uptimeSec}s)`;

  res.json({
    COACH_PROFILE_LINKS_ENABLED: linksEnabled,
    COACH_PROFILE_TESTERS: testers,
    drizzleStoreRegistered: storeRegistered,
    buildHash,
    userId: user.id,
    userEmail: user.email,
    isAdmin: user.isAdmin,
  });
}
