/**
 * GET /api/my-soccer/me
 *
 * Returns the authenticated user's account type and onboarding state.
 * Used by the portal switcher and setup gate to decide which UI to show.
 *
 * Response shape:
 * {
 *   accessType: 'FAN' | 'PARENT',
 *   parentOnboardingDone: boolean,
 *   fanOnboardingDone: boolean,
 *   lastPortalPreference: 'fan' | 'parent' | null,
 *   setupAllowed: boolean   — true when this account may access parent setup/portal
 * }
 *
 * setupAllowed is true when EITHER:
 *   - PARENT_PORTAL_ENABLED=true (global), OR
 *   - The account's email is in PARENT_PORTAL_TESTERS (per-account allowlist)
 *
 * The front-end uses setupAllowed to decide whether to show the setup gate
 * or a "Coming soon" placeholder.  It is NOT a security control — the server
 * enforces the same check on every parent API call.
 *
 * Protected by requireFanAccess() — any authenticated account.
 * Cache-Control: private, no-store (contains account-type data).
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scMemberProfiles } from '@/server/db/schema.js';
import { requireFanAccess, setPrivateCacheHeaders, isParentPortalEnabled } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireFanAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  // Load onboarding flags from member profile (may not exist yet).
  // fanOnboardingDone, parentOnboardingDone, lastPortalPreference are added by
  // run-schema-fan-profile — fall back to safe defaults if that migration hasn't run.
  let fanOnboardingDone = false;
  let parentOnboardingDone = false;
  let lastPortalPreference: string | null = null;

  try {
    const [profile] = await db
      .select({
        fanOnboardingDone:    scMemberProfiles.fanOnboardingDone,
        parentOnboardingDone: scMemberProfiles.parentOnboardingDone,
        lastPortalPreference: scMemberProfiles.lastPortalPreference,
      })
      .from(scMemberProfiles)
      .where(eq(scMemberProfiles.userId, user.id))
      .limit(1);
    fanOnboardingDone    = profile?.fanOnboardingDone    ?? false;
    parentOnboardingDone = profile?.parentOnboardingDone ?? false;
    lastPortalPreference = profile?.lastPortalPreference ?? null;
  } catch {
    // Migration columns not yet on production — use safe defaults
    try {
      const [profile] = await db
        .select({ onboardingDone: scMemberProfiles.onboardingDone })
        .from(scMemberProfiles)
        .where(eq(scMemberProfiles.userId, user.id))
        .limit(1);
      // Treat legacy onboardingDone as fanOnboardingDone so existing users aren't re-prompted
      fanOnboardingDone = profile?.onboardingDone ?? false;
    } catch { /* profile table may not exist at all */ }
  }

  res.json({
    accessType: user.accessType,
    parentOnboardingDone,
    fanOnboardingDone,
    lastPortalPreference,
    // Tells the UI whether to show setup gate vs "Coming soon".
    // Not a security control — server enforces the same check on every parent API call.
    setupAllowed: isParentPortalEnabled(user.email),
  });
}
