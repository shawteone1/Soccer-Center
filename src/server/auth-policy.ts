/**
 * src/server/auth-policy.ts
 *
 * Central authorization policy for Soccer Center.
 *
 * ALL access decisions for protected resources go through this module.
 * No handler may implement its own role check inline — use these functions.
 *
 * RULES
 * ─────
 * 1. accessType is read from the database on every request — never from a
 *    client-supplied header, query param, cookie value, or session field.
 * 2. null accessType (legacy/unmigrated) is treated as FAN (least privilege).
 * 3. PARENT includes FAN access — a PARENT account passes requireFanAccess().
 * 4. Choosing "Parent" at sign-in is a destination hint only; it never
 *    elevates permissions. The DB value is the only source of truth.
 * 5. When PARENT_PORTAL_ENABLED is false, all parent-gated routes return 403
 *    with an empty body — no data, no error detail, no portal label.
 * 6. Family ownership is verified per-request against sc_families.owner_user_id.
 * 7. Sharing grants are verified per-request: status must be 'active',
 *    expiresAt must be null or in the future, revokedAt must be null.
 *
 * RESPONSE CONVENTIONS
 * ────────────────────
 * 401 — not authenticated (no valid session)
 * 403 — authenticated but insufficient access type, or feature disabled
 *        Body is always {} — never leak which check failed to the client.
 * 404 — resource not found (used instead of 403 when existence itself is private)
 *
 * ADDING NEW PARENT ROUTES
 * ────────────────────────
 * 1. Call requireParentAccess(req, res) at the top of the handler.
 *    It returns the SessionUser or null (and has already sent 401/403).
 * 2. Scope every DB query to user.id — never trust a userId from the request body.
 * 3. Add `Cache-Control: private, no-store` to all parent responses.
 */

import type { Request, Response } from 'express';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import {
  user as userTable,
  scFamilies,
  scFamilySharing,
} from '@/server/db/schema.js';
import { getAuth } from '@/lib/auth/auth.js';
import { toWebRequest } from '@/lib/auth/express-adapter.js';

// ─── Feature flag ─────────────────────────────────────────────────────────────

/**
 * Master gate for the Parent portal.
 *
 * Returns true when EITHER:
 *   a) PARENT_PORTAL_ENABLED=true  (global — enables for all accounts), OR
 *   b) The caller's email is in PARENT_PORTAL_TESTERS  (per-account allowlist
 *      for restricted testing while the global flag stays off).
 *
 * PARENT_PORTAL_TESTERS is a comma-separated list of email addresses, read
 * server-side only.  Example:
 *   PARENT_PORTAL_TESTERS=alice@example.com,bob@example.com
 *
 * When both the global flag is off and no email is provided (or the email is
 * not in the list), all requireParentAccess() calls return 403 with no payload.
 *
 * Rollback: delete PARENT_PORTAL_ENABLED (or set it to anything other than
 * "true") and clear PARENT_PORTAL_TESTERS.  No data is modified.
 */
export function isParentPortalEnabled(email?: string | null): boolean {
  // Global flag — enables for everyone
  if (process.env.PARENT_PORTAL_ENABLED === 'true') return true;

  // Per-account allowlist — enables only for listed emails
  if (email) {
    const raw = process.env.PARENT_PORTAL_TESTERS ?? '';
    if (raw.trim()) {
      const allowed = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (allowed.includes(email.toLowerCase())) return true;
    }
  }

  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessType = 'FAN' | 'PARENT';

export interface PolicyUser {
  id: string;
  email: string;
  name: string | null | undefined;
  isAdmin: boolean;
  /** Resolved access type — null treated as FAN everywhere in this module. */
  accessType: AccessType;
}

// ─── Internal: resolve session → DB user ─────────────────────────────────────

/**
 * Resolves the BetterAuth session to a full DB user row.
 * Returns null (and sends 401) if no valid session exists.
 * Never trusts any client-supplied identity claim.
 */
async function resolveSessionUser(
  req: Request,
  res: Response,
): Promise<PolicyUser | null> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: toWebRequest(req).headers });
    if (!session?.user?.id) {
      res.status(401).json({});
      return null;
    }

    const [row] = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        isAdmin: userTable.isAdmin,
        accessType: userTable.accessType,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (!row) {
      res.status(401).json({});
      return null;
    }

    // Treat null (legacy/unmigrated) as FAN — least privilege
    const resolvedType: AccessType =
      row.accessType === 'PARENT' ? 'PARENT' : 'FAN';

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      isAdmin: row.isAdmin ?? false,
      accessType: resolvedType,
    };
  } catch {
    res.status(401).json({});
    return null;
  }
}

// ─── Public guard functions ───────────────────────────────────────────────────

/**
 * Require any authenticated account (FAN or PARENT).
 * Returns the PolicyUser or null (401 already sent).
 *
 * Use for all /api/my-soccer/* fan routes.
 */
export async function requireFanAccess(
  req: Request,
  res: Response,
): Promise<PolicyUser | null> {
  const user = await resolveSessionUser(req, res);
  if (!user) return null; // 401 already sent
  // Both FAN and PARENT pass — PARENT includes fan access
  return user;
}

/**
 * Require a PARENT account AND the parent portal feature flag.
 * Returns the PolicyUser or null (401/403 already sent).
 *
 * Use for all /api/parent/* routes.
 * When the portal is disabled (global flag off AND email not in the tester
 * allowlist), returns 403 with an empty body regardless of accessType.
 *
 * Order of checks:
 *   1. Resolve session → get email (needed for per-account allowlist)
 *   2. Check flag (global OR per-email allowlist)
 *   3. Check accessType === PARENT
 */
export async function requireParentAccess(
  req: Request,
  res: Response,
): Promise<PolicyUser | null> {
  const user = await resolveSessionUser(req, res);
  if (!user) return null; // 401 already sent

  // Feature flag: global enable OR per-email tester allowlist
  if (!isParentPortalEnabled(user.email)) {
    res.status(403).json({});
    return null;
  }

  if (user.accessType !== 'PARENT') {
    res.status(403).json({});
    return null;
  }

  return user;
}

/**
 * Require that the authenticated user owns the given family.
 * Calls requireParentAccess() first, so the feature flag and PARENT check
 * are always enforced.
 *
 * Returns { user, family } or null (401/403/404 already sent).
 * Uses 404 (not 403) when the family doesn't exist — existence is private.
 */
export async function requireFamilyOwner(
  req: Request,
  res: Response,
  familyId: string,
): Promise<{ user: PolicyUser; familyId: string } | null> {
  const user = await requireParentAccess(req, res);
  if (!user) return null;

  const [family] = await db
    .select({ id: scFamilies.id, ownerUserId: scFamilies.ownerUserId })
    .from(scFamilies)
    .where(
      and(
        eq(scFamilies.id, familyId),
        eq(scFamilies.ownerUserId, user.id),
      ),
    )
    .limit(1);

  if (!family) {
    // 404 — don't reveal whether the family exists at all
    res.status(404).json({});
    return null;
  }

  return { user, familyId: family.id };
}

/**
 * Require an active, non-expired, non-revoked sharing grant for the grantee.
 *
 * Does NOT call requireParentAccess — a grantee may be a FAN account that
 * was invited to view a specific family's calendar. Calls requireFanAccess
 * instead (any authenticated account can hold a grant).
 *
 * Returns { user, grant } or null (401/403/404 already sent).
 *
 * @param familyId  The family whose data is being accessed
 * @param permission  The specific permission required, e.g. 'calendar_read'
 */
export async function requireActiveSharingGrant(
  req: Request,
  res: Response,
  familyId: string,
  permission: string,
): Promise<{ user: PolicyUser; grantId: string } | null> {
  // Resolve session first so we have the email for the allowlist check
  const user = await requireFanAccess(req, res);
  if (!user) return null; // 401 already sent

  if (!isParentPortalEnabled(user.email)) {
    res.status(403).json({});
    return null;
  }

  const now = new Date();

  const [grant] = await db
    .select({ id: scFamilySharing.id, permissions: scFamilySharing.permissions })
    .from(scFamilySharing)
    .where(
      and(
        eq(scFamilySharing.familyId, familyId),
        eq(scFamilySharing.granteeUserId, user.id),
        eq(scFamilySharing.status, 'active'),
        isNull(scFamilySharing.revokedAt),
        // expiresAt IS NULL (no expiry) OR expiresAt > now
        gt(scFamilySharing.expiresAt, now),
      ),
    )
    .limit(1);

  // Also accept grants with no expiry (expiresAt IS NULL)
  // The gt() above excludes null — run a second query for null-expiry grants
  const [grantNoExpiry] = grant
    ? [grant]
    : await db
        .select({ id: scFamilySharing.id, permissions: scFamilySharing.permissions })
        .from(scFamilySharing)
        .where(
          and(
            eq(scFamilySharing.familyId, familyId),
            eq(scFamilySharing.granteeUserId, user.id),
            eq(scFamilySharing.status, 'active'),
            isNull(scFamilySharing.revokedAt),
            isNull(scFamilySharing.expiresAt),
          ),
        )
        .limit(1);

  if (!grantNoExpiry) {
    res.status(403).json({});
    return null;
  }

  // Verify the specific permission is included in the grant's permission set
  const grantedPermissions = grantNoExpiry.permissions
    .split(',')
    .map(p => p.trim());

  if (!grantedPermissions.includes(permission)) {
    res.status(403).json({});
    return null;
  }

  return { user, grantId: grantNoExpiry.id };
}

/**
 * Require admin access (isAdmin = true on the user row).
 * Returns the PolicyUser or null (401/403 already sent).
 */
export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<PolicyUser | null> {
  const user = await resolveSessionUser(req, res);
  if (!user) return null;

  if (!user.isAdmin) {
    res.status(403).json({});
    return null;
  }

  return user;
}

// ─── Response helper ──────────────────────────────────────────────────────────

/**
 * Apply private/no-store cache headers to a response.
 * Call on every parent portal response before sending data.
 */
export function setPrivateCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
}
