/**
 * POST /api/parent/setup
 *
 * Upgrades an authenticated FAN account to PARENT after the user completes
 * the setup gate (acknowledgements + email verification check).
 *
 * SECURITY RULES
 * ──────────────
 * 1. accessType is set server-side only — never from a client-supplied value.
 * 2. Email must be verified before upgrade is allowed.
 * 3. The user must explicitly acknowledge the data-sharing notice (ack: true).
 * 4. Consent version and timestamp are recorded in sc_member_profiles.
 * 5. Already-PARENT accounts receive 200 with { alreadyParent: true } — idempotent.
 * 6. Cache-Control: private, no-store on all responses.
 *
 * Request body:
 * {
 *   ack: true,          // must be exactly true — user confirmed the notice
 *   consentVersion: string  // e.g. 'v1.0' — version of the notice shown
 * }
 *
 * Response:
 * { ok: true }  — upgrade complete
 * { alreadyParent: true }  — account already PARENT (idempotent)
 * 400  — missing/invalid ack or consentVersion
 * 401  — not authenticated
 * 403  — email not verified
 */

import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { user as userTable, scMemberProfiles } from '@/server/db/schema.js';
import { requireFanAccess, setPrivateCacheHeaders, isParentPortalEnabled } from '@/server/auth-policy.js';

const CURRENT_CONSENT_VERSION = 'v1.0';

export default async function handler(req: Request, res: Response) {
  const user = await requireFanAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  // Portal must be enabled globally OR this account must be in the tester allowlist.
  // Same check as requireParentAccess — enforced here because setup is the
  // entry point that grants PARENT access.
  if (!isParentPortalEnabled(user.email)) {
    return res.status(403).json({});
  }

  // Idempotent — already a parent
  if (user.accessType === 'PARENT') {
    return res.json({ alreadyParent: true });
  }

  // Validate request body
  const { ack, consentVersion } = req.body ?? {};

  if (ack !== true) {
    return res.status(400).json({ error: 'ack must be true' });
  }

  if (typeof consentVersion !== 'string' || !consentVersion.trim()) {
    return res.status(400).json({ error: 'consentVersion is required' });
  }

  if (consentVersion !== CURRENT_CONSENT_VERSION) {
    return res.status(400).json({
      error: `Unrecognised consent version. Expected ${CURRENT_CONSENT_VERSION}.`,
    });
  }

  // Verify email is confirmed before granting parent access
  const [userRow] = await db
    .select({ emailVerified: userTable.emailVerified })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);

  if (!userRow?.emailVerified) {
    return res.status(403).json({ error: 'email_not_verified' });
  }

  const now = new Date();

  // Upgrade accessType to PARENT — server-controlled, never from client input
  await db
    .update(userTable)
    .set({ accessType: 'PARENT', updatedAt: now })
    .where(eq(userTable.id, user.id));

  // Record consent + mark parent onboarding done in member profile
  // Upsert: create the profile row if it doesn't exist yet
  await db
    .insert(scMemberProfiles)
    .values({
      userId: user.id,
      memberType: 'fan',   // legacy field — kept for schema compat
      parentOnboardingDone: true,
      consentVersion,
      consentAcceptedAt: now,
      lastPortalPreference: 'parent',
    })
    .onDuplicateKeyUpdate({
      set: {
        parentOnboardingDone: true,
        consentVersion: sql`VALUES(consent_version)`,
        consentAcceptedAt: sql`VALUES(consent_accepted_at)`,
        lastPortalPreference: sql`VALUES(last_portal_preference)`,
        updatedAt: sql`VALUES(updated_at)`,
      },
    });

  res.json({ ok: true });
}
