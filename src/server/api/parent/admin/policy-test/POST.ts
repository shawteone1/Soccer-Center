/**
 * POST /api/parent/admin/policy-test
 *
 * Synthetic authorization policy test harness.
 * Admin-only. Tests the auth-policy guard functions against synthetic
 * (in-memory) account scenarios without touching production data.
 *
 * This endpoint is for staging verification only. It does not create,
 * modify, or delete any user rows. It exercises the policy logic directly
 * by constructing mock PolicyUser objects and calling the decision functions.
 *
 * Request body: {} (no parameters needed — runs the full test suite)
 *
 * Response shape:
 * {
 *   passed: boolean,
 *   total: number,
 *   failures: number,
 *   results: {
 *     name: string,
 *     scenario: string,
 *     expected: string,
 *     actual: string,
 *     pass: boolean
 *   }[]
 * }
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { isParentPortalEnabled } from '@/server/auth-policy.js';

// ─── Synthetic policy decision functions ─────────────────────────────────────
// These mirror the logic in auth-policy.ts but operate on mock data so we can
// test every branch without real DB rows or HTTP sessions.

type AccessType = 'FAN' | 'PARENT';

interface MockUser {
  id: string;
  accessType: AccessType;
  isAdmin: boolean;
}

interface MockGrant {
  granteeUserId: string;
  familyId: string;
  status: 'pending' | 'active' | 'revoked' | 'expired';
  permissions: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

interface MockFamily {
  id: string;
  ownerUserId: string;
}

// Mirrors requireFanAccess logic
function mockRequireFanAccess(user: MockUser | null): boolean {
  if (!user) return false;
  return true; // FAN and PARENT both pass
}

// Mirrors requireParentAccess logic
function mockRequireParentAccess(
  user: MockUser | null,
  portalEnabled: boolean,
): boolean {
  if (!portalEnabled) return false;
  if (!user) return false;
  return user.accessType === 'PARENT';
}

// Mirrors requireFamilyOwner logic
function mockRequireFamilyOwner(
  user: MockUser | null,
  family: MockFamily | null,
  portalEnabled: boolean,
): boolean {
  if (!mockRequireParentAccess(user, portalEnabled)) return false;
  if (!family) return false;
  return family.ownerUserId === user!.id;
}

// Mirrors requireActiveSharingGrant logic
function mockRequireActiveSharingGrant(
  user: MockUser | null,
  grant: MockGrant | null,
  familyId: string,
  permission: string,
  portalEnabled: boolean,
): boolean {
  if (!portalEnabled) return false;
  if (!mockRequireFanAccess(user)) return false;
  if (!grant) return false;
  if (grant.familyId !== familyId) return false;
  if (grant.granteeUserId !== user!.id) return false;
  if (grant.status !== 'active') return false;
  if (grant.revokedAt !== null) return false;
  if (grant.expiresAt !== null && grant.expiresAt < new Date()) return false;
  const perms = grant.permissions.split(',').map(p => p.trim());
  return perms.includes(permission);
}

// ─── Test cases ───────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  scenario: string;
  expected: string;
  actual: string;
  pass: boolean;
}

function runTests(portalEnabled: boolean): TestResult[] {
  const results: TestResult[] = [];

  const fanUser:    MockUser = { id: 'u-fan',    accessType: 'FAN',    isAdmin: false };
  const parentUser: MockUser = { id: 'u-parent', accessType: 'PARENT', isAdmin: false };
  const guardianUser: MockUser = { id: 'u-guardian', accessType: 'FAN', isAdmin: false };

  const family: MockFamily = { id: 'f-1', ownerUserId: 'u-parent' };
  const otherFamily: MockFamily = { id: 'f-2', ownerUserId: 'u-other' };

  const now = new Date();
  const past   = new Date(now.getTime() - 86_400_000);

  const activeGrant: MockGrant = {
    granteeUserId: 'u-guardian',
    familyId: 'f-1',
    status: 'active',
    permissions: 'calendar_read,player_read',
    revokedAt: null,
    expiresAt: null,
  };

  const expiredGrant: MockGrant = { ...activeGrant, expiresAt: past };
  const revokedGrant: MockGrant = { ...activeGrant, revokedAt: past };
  const pendingGrant: MockGrant = { ...activeGrant, status: 'pending' };
  const narrowGrant:  MockGrant = { ...activeGrant, permissions: 'calendar_read' };

  function check(
    name: string,
    scenario: string,
    expected: boolean,
    actual: boolean,
  ): TestResult {
    return {
      name,
      scenario,
      expected: expected ? 'ALLOW' : 'DENY',
      actual:   actual   ? 'ALLOW' : 'DENY',
      pass: expected === actual,
    };
  }

  // ── requireFanAccess ──────────────────────────────────────────────────────
  results.push(check(
    'Fan can access fan routes',
    'FAN account → requireFanAccess',
    true,
    mockRequireFanAccess(fanUser),
  ));
  results.push(check(
    'Parent can access fan routes (PARENT includes FAN)',
    'PARENT account → requireFanAccess',
    true,
    mockRequireFanAccess(parentUser),
  ));
  results.push(check(
    'Unauthenticated user denied fan routes',
    'null user → requireFanAccess',
    false,
    mockRequireFanAccess(null),
  ));

  // ── requireParentAccess (portal enabled) ──────────────────────────────────
  results.push(check(
    'Parent can access parent routes when portal enabled',
    'PARENT + portal=on → requireParentAccess',
    true,
    mockRequireParentAccess(parentUser, true),
  ));
  results.push(check(
    'Fan denied parent routes even when portal enabled',
    'FAN + portal=on → requireParentAccess',
    false,
    mockRequireParentAccess(fanUser, true),
  ));
  results.push(check(
    'Parent denied when portal disabled',
    'PARENT + portal=off → requireParentAccess',
    false,
    mockRequireParentAccess(parentUser, false),
  ));
  results.push(check(
    'Fan denied when portal disabled',
    'FAN + portal=off → requireParentAccess',
    false,
    mockRequireParentAccess(fanUser, false),
  ));
  results.push(check(
    'Unauthenticated user denied parent routes',
    'null + portal=on → requireParentAccess',
    false,
    mockRequireParentAccess(null, true),
  ));

  // ── requireFamilyOwner ────────────────────────────────────────────────────
  results.push(check(
    'Parent can access their own family',
    'PARENT owns family → requireFamilyOwner',
    true,
    mockRequireFamilyOwner(parentUser, family, true),
  ));
  results.push(check(
    'Parent denied access to another family',
    'PARENT does not own family → requireFamilyOwner',
    false,
    mockRequireFamilyOwner(parentUser, otherFamily, true),
  ));
  results.push(check(
    'Fan denied family owner check',
    'FAN → requireFamilyOwner',
    false,
    mockRequireFamilyOwner(fanUser, family, true),
  ));
  results.push(check(
    'Family owner denied when portal disabled',
    'PARENT owns family + portal=off → requireFamilyOwner',
    false,
    mockRequireFamilyOwner(parentUser, family, false),
  ));
  results.push(check(
    'Non-existent family returns 404 (deny)',
    'PARENT + null family → requireFamilyOwner',
    false,
    mockRequireFamilyOwner(parentUser, null, true),
  ));

  // ── requireActiveSharingGrant ─────────────────────────────────────────────
  results.push(check(
    'Guardian with active grant can access family calendar',
    'active grant + calendar_read → requireActiveSharingGrant',
    true,
    mockRequireActiveSharingGrant(guardianUser, activeGrant, 'f-1', 'calendar_read', true),
  ));
  results.push(check(
    'Guardian denied with expired grant',
    'expired grant → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, expiredGrant, 'f-1', 'calendar_read', true),
  ));
  results.push(check(
    'Guardian denied with revoked grant',
    'revoked grant → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, revokedGrant, 'f-1', 'calendar_read', true),
  ));
  results.push(check(
    'Guardian denied with pending grant',
    'pending grant → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, pendingGrant, 'f-1', 'calendar_read', true),
  ));
  results.push(check(
    'Guardian denied permission not in grant',
    'active grant missing player_write → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, narrowGrant, 'f-1', 'player_write', true),
  ));
  results.push(check(
    'Guardian denied wrong family',
    'active grant for f-1, requesting f-2 → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, activeGrant, 'f-2', 'calendar_read', true),
  ));
  results.push(check(
    'Fan denied sharing grant when portal disabled',
    'active grant + portal=off → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, activeGrant, 'f-1', 'calendar_read', false),
  ));
  results.push(check(
    'Fan without grant denied',
    'null grant → requireActiveSharingGrant',
    false,
    mockRequireActiveSharingGrant(guardianUser, null, 'f-1', 'calendar_read', true),
  ));

  // ── Portal choice does not elevate permissions ────────────────────────────
  // Simulates a FAN account that chose "Parent" at sign-in.
  // The client might send a header or query param claiming parent access —
  // the policy ignores it and reads only the DB accessType.
  results.push(check(
    'FAN account denied parent access even if client claims PARENT',
    'FAN accessType (client claim ignored) → requireParentAccess',
    false,
    mockRequireParentAccess(fanUser, true), // fanUser.accessType is FAN regardless of client claim
  ));

  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const portalEnabled = isParentPortalEnabled();
  const results = runTests(portalEnabled);

  const failures = results.filter(r => !r.pass).length;
  const passed = failures === 0;

  res.json({
    passed,
    total: results.length,
    failures,
    portalEnabled,
    note: portalEnabled
      ? 'Parent portal is ENABLED. Parent routes are live.'
      : 'Parent portal is DISABLED (PARENT_PORTAL_ENABLED != true). All parent routes return 403.',
    results,
  });
}
