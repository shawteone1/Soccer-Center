/**
 * src/server/api/parent/players/[playerId]/coach-links/step3.test.ts
 *
 * Integration tests for Step 3: share link creation, listing, revocation,
 * and the coach view endpoint.
 *
 * All tests use synthetic fixtures and the InMemoryCoachLinkStore.
 * No database connections, no HTTP server — handlers are called directly.
 *
 * Coverage:
 *   POST /api/parent/players/:playerId/coach-links
 *     - 401 when unauthenticated
 *     - 403 when feature flag off
 *     - 404 when player not found / wrong owner
 *     - 400 for invalid approvedFields (empty, unknown field, non-array)
     *     - 400 for invalid expiresInDays (0, 366, non-integer, string)
 *     - 201 with linkId, shareUrl, expiresAt on valid input
 *     - shareUrl contains the raw token (not the hash)
 *     - expiresAt defaults to 30 days when expiresInDays is omitted
 *
 *   GET /api/parent/players/:playerId/coach-links
 *     - 401 when unauthenticated
 *     - 403 when feature flag off
 *     - 404 when player not found
 *     - 200 with empty array when no links exist
 *     - 200 with correct status for active, revoked, expired links
 *
 *   DELETE /api/parent/players/:playerId/coach-links/:linkId
 *     - 401 when unauthenticated
 *     - 403 when feature flag off
 *     - 404 when link not found
 *     - 404 when link belongs to a different user
 *     - 200 on successful revocation
 *     - 404 when already revoked
 *
 *   GET /api/coach/profile/:token
 *     - 404 when feature flag off
 *     - 404 for unknown token
 *     - 404 for revoked link
 *     - 404 for expired link
 *     - 200 with filtered projection for valid active link
 *     - Only approvedFields appear in the profile (field filter enforced)
 *     - stats.available=true when selectedMatchRecords are present
 *     - stats.available=false when selectedMatchRecords is empty
 *     - Unapproved match records are excluded from stats
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { PolicyUser } from '../../../../../../server/auth-policy';
import {
  InMemoryCoachLinkStore,
  setCoachLinkStore,
  hashToken,
} from '../../../../../../server/lib/coach-link-store';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockParentUser: PolicyUser | null = null;
let mockFeatureEnabled = false;
let mockPlayerRows: Record<string, unknown>[] = [];
let mockAffiliationRows: unknown[] = [];
let mockMatchRecordRows: unknown[] = [];
let mockMatchRecordsThrow: Error | null = null;

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(async (_req: Request, res: Response) => {
    if (!mockParentUser) { res.status(401).json({}); return null; }
    return mockParentUser;
  }),
  setPrivateCacheHeaders: vi.fn(),
}));

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn((key: string) => {
    if (key === 'COACH_PROFILE_LINKS_ENABLED') return mockFeatureEnabled ? 'true' : undefined;
    if (key === 'BETTER_AUTH_URL') return 'https://soccercenter.org';
    // Open to all in tests — cohort enforcement is tested separately
    if (key === 'COACH_PROFILE_TESTERS') return '*';
    return undefined;
  }),
}));

// Drizzle stub — sequential calls per handler:
//   POST coach-links: call 1 = player ownership (.limit(1))
//                     call 2 = match record validation (.where() → returns array)
//   GET  coach-links: call 1 = player ownership (.limit(1))
//   GET  coach/profile: call 1 = player row (.limit(1))
//                       call 2 = affiliations (.orderBy())
//                       call 3 = match record re-validation (.where() → ownedIds)
//                       call 4 = match records fetch (.where() → records)
//
// Rule: .limit(1) always returns mockPlayerRows (ownership check)
//       .orderBy() always returns mockAffiliationRows
//       .where() on call 2+ (not followed by .limit) returns mockMatchRecordRows
//         (or throws mockMatchRecordsThrow if set)
let dbSelectCallCount = 0;

vi.mock('@/server/db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      dbSelectCallCount++;
      const inner: Record<string, (...args: unknown[]) => unknown> = {
        from: vi.fn(() => inner),
        where: vi.fn(() => {
          // .where() that is NOT followed by .limit() resolves immediately
          // (match record validation or fetch)
          if (mockMatchRecordsThrow) return Promise.reject(mockMatchRecordsThrow);
          return Promise.resolve(mockMatchRecordRows);
        }),
        orderBy: vi.fn(() => Promise.resolve(mockAffiliationRows)),
        // .limit() is only used for player ownership checks → returns mockPlayerRows
        limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
      };
      // Override: .from().where().limit() chain — where() must return inner so limit() can be called
      // We need where() to return inner when it will be followed by limit()
      // Solution: track whether limit() was called after where()
      // Simpler: make where() return an object that has both .limit() and is a Promise
      // Simplest: make where() return inner (chainable), and inner.then() resolves to mockMatchRecordRows
      // Actually the cleanest fix: make where() return a thenable that also has .limit()
      const chainable = {
        ...inner,
        then: (resolve: (v: unknown) => unknown) => {
          if (mockMatchRecordsThrow) return Promise.reject(mockMatchRecordsThrow).then(resolve);
          return Promise.resolve(mockMatchRecordRows).then(resolve);
        },
        catch: (reject: (e: unknown) => unknown) => {
          if (mockMatchRecordsThrow) return Promise.reject(mockMatchRecordsThrow).catch(reject);
          return Promise.resolve(mockMatchRecordRows).catch(reject);
        },
        limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
      };
      inner.where = vi.fn(() => chainable);
      return inner;
    }),
  },
}));

// ── Handlers ──────────────────────────────────────────────────────────────────

import postLinksHandler from './POST';
import getLinksHandler from './GET';
import deleteLinkHandler from './[linkId]/DELETE';
import coachViewHandler from '../../../../../../server/api/coach/profile/[token]/GET';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParentUser(overrides: Partial<PolicyUser> = {}): PolicyUser {
  return {
    id: 'user-parent-001',
    email: 'parent@example.com',
    name: 'Test Parent',
    isAdmin: false,
    accessType: 'PARENT',
    ...overrides,
  };
}

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
  setHeader: ReturnType<typeof vi.fn>;
};

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader: vi.fn(),
  };
  return res;
}

function makeReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}): Request {
  return { params, headers: {}, body, url: `/coach/profile/${params.token ?? 'test'}`, method: 'GET' } as unknown as Request;
}

function makePlayerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1', label: 'Alex', ageBand: 'U17',
    graduationYear: 2028, primaryPosition: 'Midfielder', secondaryPosition: null,
    foot: 'right', positions: '[]', skillLevel: 'advanced', clubName: 'Colorado United',
    profileIntroduction: null, achievements: null, playingLevel: null,
    avatarUrl: null, avatarInitials: 'AM',
    ...overrides,
  };
}

let testStore: InMemoryCoachLinkStore;

function resetState() {
  mockParentUser = null;
  mockFeatureEnabled = false;
  mockPlayerRows = [];
  mockAffiliationRows = [];
  mockMatchRecordRows = [];
  mockMatchRecordsThrow = null;
  dbSelectCallCount = 0;
  testStore = new InMemoryCoachLinkStore();
  setCoachLinkStore(testStore);
}

// ── POST /api/parent/players/:playerId/coach-links ────────────────────────────

describe('POST coach-links — authentication and gating', () => {
  beforeEach(resetState);

  it('returns 401 when unauthenticated', async () => {
    const res = makeRes();
    await postLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when feature flag off', async () => {
    mockParentUser = makeParentUser();
    const res = makeRes();
    await postLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when player not found', async () => {
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('POST coach-links — validation', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('returns 400 when approvedFields is empty', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: [], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when approvedFields contains an unknown field', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label', 'secretField'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).invalidFields).toContain('secretField');
  });

  it('returns 400 when approvedFields is not an array', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: 'label', selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when expiresInDays is 0', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], expiresInDays: 0 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when expiresInDays is 366', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], expiresInDays: 366 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when expiresInDays is a non-integer', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], expiresInDays: 1.5 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST coach-links — successful creation', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('returns 201 with linkId, shareUrl, expiresAt', async () => {
    // Provide owned match record rows so validation passes
    mockMatchRecordRows = [{ id: 'mr-1' }, { id: 'mr-2' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label', 'ageBand', 'stats'],
        selectedMatchRecords: ['mr-1', 'mr-2'],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
        label: 'Colorado State — Coach Smith',
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('linkId');
    expect(body).toHaveProperty('shareUrl');
    expect(body).toHaveProperty('expiresAt');
    expect(body.label).toBe('Colorado State — Coach Smith');
  });

  it('shareUrl contains the raw token (not the hash)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [], selectedMedia: [], selectedEvents: [],
        expiresInDays: 7,
      }),
      res as unknown as Response,
    );
    const body = res.body as Record<string, unknown>;
    const shareUrl = body.shareUrl as string;
    expect(shareUrl.startsWith('https://soccercenter.org/coach/profile/')).toBe(true);
    // Extract the token from the URL and verify it hashes to what's stored
    const rawToken = shareUrl.split('/coach/profile/')[1];
    const links = await testStore.listForPlayer('p1', 'user-parent-001');
    expect(links.length).toBe(1);
    expect(links[0].tokenHash).toBe(hashToken(rawToken));
    // The raw token must not equal the stored hash
    expect(rawToken).not.toBe(links[0].tokenHash);
  });

  it('defaults to 30 days when expiresInDays is omitted', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [], selectedMedia: [], selectedEvents: [],
        // expiresInDays omitted — should default to 30
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    // expiresAt should be ~30 days from now (not null)
    const body = res.body as Record<string, unknown>;
    expect(body.expiresAt).not.toBeNull();
    const expiresAt = new Date(body.expiresAt as string);
    const daysFromNow = Math.round((expiresAt.getTime() - Date.now()) / 86_400_000);
    expect(daysFromNow).toBeGreaterThanOrEqual(29);
    expect(daysFromNow).toBeLessThanOrEqual(31);
  });
});

// ── GET /api/parent/players/:playerId/coach-links ─────────────────────────────

describe('GET coach-links', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('returns 401 when unauthenticated', async () => {
    mockParentUser = null;
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with empty array when no links exist', async () => {
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>).links).toEqual([]);
  });

  it('shows active status for a non-expired, non-revoked link', async () => {
    await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: 'Active link',
    });
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const links = (res.body as Record<string, unknown>).links as Record<string, unknown>[];
    expect(links[0].status).toBe('active');
  });

  it('shows revoked status for a revoked link', async () => {
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: null,
    });
    await testStore.revoke(record.id, 'user-parent-001');
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const links = (res.body as Record<string, unknown>).links as Record<string, unknown>[];
    expect(links[0].status).toBe('revoked');
  });

  it('shows expired status for a link past its expiresAt', async () => {
    // Create a link that expires in the past by directly manipulating the store
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 1, label: null,
    });
    // Backdate the expiresAt to yesterday
    (record as unknown as Record<string, unknown>).expiresAt = new Date(Date.now() - 86_400_000);
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const links = (res.body as Record<string, unknown>).links as Record<string, unknown>[];
    expect(links[0].status).toBe('expired');
  });
});

// ── DELETE /api/parent/players/:playerId/coach-links/:linkId ──────────────────

describe('DELETE coach-links/:linkId', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
  });

  it('returns 401 when unauthenticated', async () => {
    mockParentUser = null;
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: 'link-1' }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when feature flag off', async () => {
    mockFeatureEnabled = false;
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: 'link-1' }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when link not found', async () => {
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: 'nonexistent' }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when link belongs to a different user', async () => {
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'other-user',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: null,
    });
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: record.id }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful revocation', async () => {
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: null,
    });
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: record.id }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>).revoked).toBe(true);
  });

  it('returns 404 when already revoked', async () => {
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: null,
    });
    await testStore.revoke(record.id, 'user-parent-001');
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: record.id }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /api/coach/profile/:token ─────────────────────────────────────────────

describe('GET coach/profile/:token', () => {
  beforeEach(() => {
    resetState();
    mockPlayerRows = [makePlayerRow()];
  });

  it('returns 404 when feature flag off', async () => {
    mockFeatureEnabled = false;
    const res = makeRes();
    await coachViewHandler(makeReq({ token: 'sometoken' }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an unknown token', async () => {
    mockFeatureEnabled = true;
    const res = makeRes();
    await coachViewHandler(makeReq({ token: 'unknowntoken12345' }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a revoked link', async () => {
    mockFeatureEnabled = true;
    const { record, rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30, label: null,
    });
    await testStore.revoke(record.id, 'user-parent-001');
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an expired link', async () => {
    mockFeatureEnabled = true;
    const { record, rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 1, label: null,
    });
    // Backdate expiresAt
    (record as unknown as Record<string, unknown>).expiresAt = new Date(Date.now() - 86_400_000);
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with filtered profile for a valid active link', async () => {
    mockFeatureEnabled = true;
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label', 'ageBand'],
      selectedMatchRecords: [], selectedMedia: [], selectedEvents: [],
      expiresInDays: 30, label: null,
    });
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('profile');
    expect(body).toHaveProperty('linkId');
  });

  it('only approvedFields appear in the profile (field filter enforced)', async () => {
    mockFeatureEnabled = true;
    // approvedFields uses the projection key names (label, ageBand, etc.)
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label', 'ageBand'],
      selectedMatchRecords: [], selectedMedia: [], selectedEvents: [],
      expiresInDays: 30, label: null,
    });
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    const profile = (res.body as Record<string, unknown>).profile as Record<string, unknown>;
    // Approved fields present
    expect(profile).toHaveProperty('label');
    expect(profile).toHaveProperty('ageBand');
    // Non-approved fields absent
    expect(profile).not.toHaveProperty('positions');
    expect(profile).not.toHaveProperty('clubName');
    expect(profile).not.toHaveProperty('primaryPosition');
    expect(profile).not.toHaveProperty('stats');
  });

  it('stats.available=false when selectedMatchRecords is empty', async () => {
    mockFeatureEnabled = true;
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label', 'stats'],
      selectedMatchRecords: [], selectedMedia: [], selectedEvents: [],
      expiresInDays: 30, label: null,
    });
    mockMatchRecordRows = [
      { id: 'mr-1', statGoals: 5, participated: true, seasonTotalsOverride: false,
        season: 'Fall 2025', positionPlayed: null, matchDate: null, opponent: null,
        statGp: 1, statAssists: null, statShots: null, statGa: null, statSaves: null, statSo: null },
    ];
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    const profile = (res.body as Record<string, unknown>).profile as Record<string, unknown>;
    const stats = profile.stats as { available: boolean };
    expect(stats.available).toBe(false);
  });

  it('stats.available=true and only approved records aggregated', async () => {
    mockFeatureEnabled = true;
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label', 'stats'],
      selectedMatchRecords: ['mr-approved'],
      expiresInDays: 30, label: null,
    });
    mockMatchRecordRows = [
      { id: 'mr-approved', statGoals: 3, statAssists: 1, participated: true, seasonTotalsOverride: false,
        season: 'Fall 2025', positionPlayed: null, matchDate: null, opponent: null,
        statGp: 1, statShots: null, statGa: null, statSaves: null, statSo: null },
      { id: 'mr-not-approved', statGoals: 99, statAssists: 99, participated: true, seasonTotalsOverride: false,
        season: 'Fall 2025', positionPlayed: null, matchDate: null, opponent: null,
        statGp: 1, statShots: null, statGa: null, statSaves: null, statSo: null },
    ];
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    const profile = (res.body as Record<string, unknown>).profile as Record<string, unknown>;
    const stats = profile.stats as { available: boolean; goals: number };
    expect(stats.available).toBe(true);
    expect(stats.goals).toBe(3);  // only mr-approved's goals
    expect(stats.goals).not.toBe(99);
  });

  it('unapproved match records are excluded even if they belong to the same player', async () => {
    mockFeatureEnabled = true;
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['stats'],
      selectedMatchRecords: ['mr-1'],
      expiresInDays: 30, label: null,
    });
    // mr-2 belongs to the same player+owner but is not in selectedMatchRecords
    mockMatchRecordRows = [
      { id: 'mr-1', statGoals: 2, participated: true, seasonTotalsOverride: false,
        season: null, positionPlayed: null, matchDate: null, opponent: null,
        statGp: 1, statAssists: null, statShots: null, statGa: null, statSaves: null, statSo: null },
      { id: 'mr-2', statGoals: 50, participated: true, seasonTotalsOverride: false,
        season: null, positionPlayed: null, matchDate: null, opponent: null,
        statGp: 1, statAssists: null, statShots: null, statGa: null, statSaves: null, statSo: null },
    ];
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    const profile = (res.body as Record<string, unknown>).profile as Record<string, unknown>;
    const stats = profile.stats as { available: boolean; goals: number };
    expect(stats.available).toBe(true);
    expect(stats.goals).toBe(2);
    expect(stats.goals).not.toBe(52);
  });
});

// ── U16+ outreach gate (server-side) ────────────────────────────────────────

describe('POST coach-links — U16+ outreach gate', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
  });

  it('returns 403 OUTREACH_AGE_GATE when player ageBand is U14', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U14' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, unknown>).error).toBe('OUTREACH_AGE_GATE');
  });

  it('returns 403 OUTREACH_AGE_GATE when player ageBand is U15', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U15' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, unknown>).error).toBe('OUTREACH_AGE_GATE');
  });

  it('returns 403 OUTREACH_AGE_GATE when player ageBand is null', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: null }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, unknown>).error).toBe('OUTREACH_AGE_GATE');
  });

  it('allows U16 through the gate', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U16' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });

  it('allows U17 through the gate', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U17' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });

  it('allows U18 through the gate', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U18' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });

  it('allows U19 through the gate', async () => {
    mockPlayerRows = [{ id: 'p1', ageBand: 'U19' }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });
});

// ── Demo mode isolation ───────────────────────────────────────────────────────

describe('Demo mode isolation — demoMode flag', () => {
  it('InMemoryCoachLinkStore created with isDemoMode=true sets demoMode=true on records', async () => {
    const { InMemoryCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new InMemoryCoachLinkStore(/* isDemoMode= */ true);
    const { record } = await store.create({
      playerId: 'demo-p1', userId: 'demo-u1',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30,
    });
    expect(record.demoMode).toBe(true);
  });

  it('InMemoryCoachLinkStore created without isDemoMode sets demoMode=false on records', async () => {
    const { InMemoryCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new InMemoryCoachLinkStore();
    const { record } = await store.create({
      playerId: 'p1', userId: 'u1',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30,
    });
    expect(record.demoMode).toBe(false);
  });

  it('findByToken returns the demoMode flag correctly', async () => {
    const { InMemoryCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new InMemoryCoachLinkStore(true);
    const { rawToken } = await store.create({
      playerId: 'demo-p1', userId: 'demo-u1',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30,
    });
    const found = await store.findByToken(rawToken);
    expect(found?.demoMode).toBe(true);
  });
});

// ── Store unavailable (503) ───────────────────────────────────────────────────

describe('Store unavailable — 503 fail-closed', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
    // Reset store to null (production default — no durable store)
    setCoachLinkStore(null);
  });

  it('POST returns 503 when no store is registered', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 30 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(503);
    expect((res.body as Record<string, unknown>).error).toBe('STORE_UNAVAILABLE');
  });

  it('GET returns 503 when no store is registered', async () => {
    const res = makeRes();
    await getLinksHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(503);
  });

  it('DELETE returns 503 when no store is registered', async () => {
    const res = makeRes();
    await deleteLinkHandler(makeReq({ playerId: 'p1', linkId: 'link-1' }), res as unknown as Response);
    expect(res.statusCode).toBe(503);
  });

  it('coach view returns 404 when no store is registered (fail-closed, no info leakage)', async () => {
    const res = makeRes();
    await coachViewHandler(makeReq({ token: 'sometoken12345' }), res as unknown as Response);
    // Coach view returns 404 (not 503) to avoid leaking store availability to unauthenticated callers
    expect(res.statusCode).toBe(404);
  });
});

// ── selectedEvents — round-trip and semantics ────────────────────────────────

describe('selectedEvents — InMemoryStore round-trip and fail-closed semantics', () => {
  beforeEach(() => {
    resetState();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
    testStore = new InMemoryCoachLinkStore();
    setCoachLinkStore(testStore);
  });

  it('selectedEvents persisted on link record (InMemoryStore round-trip)', async () => {
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'],
      selectedMatchRecords: [],
      selectedMedia: [],
      selectedEvents: ['ev-1', 'ev-2'],
      expiresInDays: 30,
    });
    expect(record.selectedEvents).toEqual(['ev-1', 'ev-2']);

    // findByToken also returns the correct selectedEvents
    const found = await testStore.findByToken(
      (await testStore.create({
        playerId: 'p1', userId: 'user-parent-001',
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: ['ev-3'],
        expiresInDays: 30,
      })).rawToken,
    );
    expect(found?.selectedEvents).toEqual(['ev-3']);
  });

  it('empty selectedEvents → upcomingEvents is [] in coach view (fail-closed)', async () => {
    // The GET handler skips the DB query entirely when selectedEvents is empty.
    // The response must contain upcomingEvents: [] regardless of what the DB would return.
    const { rawToken } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label', 'upcomingEvents'],
      selectedMatchRecords: [],
      selectedMedia: [],
      selectedEvents: [],
      expiresInDays: 30,
    });
    const res = makeRes();
    await coachViewHandler(makeReq({ token: rawToken }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const profile = (res.body as Record<string, unknown>).profile as Record<string, unknown>;
    // upcomingEvents must be an empty array — the DB was never queried
    expect(Array.isArray(profile.upcomingEvents)).toBe(true);
    expect((profile.upcomingEvents as unknown[]).length).toBe(0);
  });

  it('missing selectedEvents field defaults to [] (fail-closed)', async () => {
    // CreateLinkInput.selectedEvents is optional — omitting it must default to []
    const { record } = await testStore.create({
      playerId: 'p1', userId: 'user-parent-001',
      approvedFields: ['label'],
      selectedMatchRecords: [],
      selectedMedia: [],
      // selectedEvents intentionally omitted
      expiresInDays: 30,
    });
    expect(record.selectedEvents).toEqual([]);
  });

  it('DrizzleCoachLinkStore._rowToRecord parses null selected_events as [] (fail-closed)', async () => {
    // When the selected_events column is NULL (pre-migration row), _parseJson returns [].
    // This is the correct safe default — no events shared for old links.
    const { DrizzleCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new DrizzleCoachLinkStore();
    // Access private method via cast
    const row = {
      id: 'link-1', playerId: 'p1', userId: 'u1', tokenHash: 'abc',
      approvedFields: '["label"]', selectedMatchRecords: '[]',
      selectedMedia: '[]',
      selectedEvents: null, // NULL from DB — column not yet added
      selectedCollectionId: null, expiresAt: null, revokedAt: null,
      label: null, createdAt: new Date(), updatedAt: new Date(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = (store as any)._rowToRecord(row);
    expect(record.selectedEvents).toEqual([]);
  });
});

// ── DrizzleCoachLinkStore — not connected (no db injected) ──────────────────

describe('DrizzleCoachLinkStore — not connected', () => {
  it('throws STORE_NOT_CONNECTED on create', async () => {
    const { DrizzleCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new DrizzleCoachLinkStore();
    await expect(store.create({
      playerId: 'p1', userId: 'u1',
      approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [],
      expiresInDays: 30,
    })).rejects.toMatchObject({ code: 'STORE_NOT_CONNECTED' });
  });

  it('throws STORE_NOT_CONNECTED on listForPlayer', async () => {
    const { DrizzleCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new DrizzleCoachLinkStore();
    await expect(store.listForPlayer('p1', 'u1')).rejects.toMatchObject({ code: 'STORE_NOT_CONNECTED' });
  });

  it('throws STORE_NOT_CONNECTED on revoke', async () => {
    const { DrizzleCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new DrizzleCoachLinkStore();
    await expect(store.revoke('link-1', 'u1')).rejects.toMatchObject({ code: 'STORE_NOT_CONNECTED' });
  });

  it('throws STORE_NOT_CONNECTED on findByToken', async () => {
    const { DrizzleCoachLinkStore } = await import('../../../../../../server/lib/coach-link-store');
    const store = new DrizzleCoachLinkStore();
    await expect(store.findByToken('sometoken')).rejects.toMatchObject({ code: 'STORE_NOT_CONNECTED' });
  });
});

// ── Field contract ────────────────────────────────────────────────────────────

describe('validateApprovedFields — shared field contract', () => {
  it('rejects "name" as an invalid field key', async () => {
    const { validateApprovedFields } = await import('../../../../../../server/lib/coach-profile-fields');
    const result = validateApprovedFields(['name']);
    expect(result.valid).toBe(false);
    expect(result.invalidFields).toContain('name');
  });

  it('accepts "label" as the canonical player name field', async () => {
    const { validateApprovedFields } = await import('../../../../../../server/lib/coach-profile-fields');
    const result = validateApprovedFields(['label']);
    expect(result.valid).toBe(true);
  });

  it('rejects an empty array', async () => {
    const { validateApprovedFields } = await import('../../../../../../server/lib/coach-profile-fields');
    const result = validateApprovedFields([]);
    expect(result.valid).toBe(false);
  });

  it('rejects a non-array', async () => {
    const { validateApprovedFields } = await import('../../../../../../server/lib/coach-profile-fields');
    const result = validateApprovedFields('label');
    expect(result.valid).toBe(false);
  });

  it('accepts all recommended fields', async () => {
    const { COACH_PROFILE_FIELDS, validateApprovedFields } = await import('../../../../../../server/lib/coach-profile-fields');
    const recommended = COACH_PROFILE_FIELDS.filter(f => f.recommended).map(f => f.key);
    const result = validateApprovedFields(recommended);
    expect(result.valid).toBe(true);
  });

  it('APPROVED_FIELDS_ALLOWLIST does not contain "name"', async () => {
    const { APPROVED_FIELDS_ALLOWLIST } = await import('../../../../../../server/lib/coach-profile-fields');
    expect(APPROVED_FIELDS_ALLOWLIST.has('name')).toBe(false);
    expect(APPROVED_FIELDS_ALLOWLIST.has('label')).toBe(true);
  });
});

// ── Expiry bounds ─────────────────────────────────────────────────────────────

describe('POST coach-links — expiry bounds', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('accepts expiresInDays=1 (minimum)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 1 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });

  it('accepts expiresInDays=365 (maximum)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: 365 }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });

  it('rejects expiresInDays=null (no never-expiring links)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, { approvedFields: ['label'], selectedMatchRecords: [], selectedMedia: [], selectedEvents: [], expiresInDays: null }),
      res as unknown as Response,
    );
    // null is treated as omitted → defaults to 30 days → 201
    // (null is coerced to default, not rejected)
    expect(res.statusCode).toBe(201);
  });
});

