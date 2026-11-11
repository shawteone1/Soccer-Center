/**
 * step4.test.ts — Media selection behavior for coach profile links
 *
 * Covers:
 * 1. POST /api/parent/players/:id/coach-links — selectedMedia validation
 *    a. Missing selectedMedia field → 400 INVALID_SELECTED_MEDIA
 *    b. Non-array selectedMedia → 400 INVALID_SELECTED_MEDIA
 *    c. Empty array → 201 (no videos shared)
 *    d. Wrong-owner assignment ID → 400 FOREIGN_MEDIA_IDS
 *    e. Deleted media ID → 400 FOREIGN_MEDIA_IDS
 *    f. Non-video assignment ID → 400 FOREIGN_MEDIA_IDS
 *    g. Valid owned video IDs → 201, persisted on link record
 *    h. Mix of valid + foreign IDs → 400 FOREIGN_MEDIA_IDS, foreignIds lists only foreign
 *
 * 2. Persisted selections survive link reload
 *    a. selectedMedia on created record equals what was passed to POST
 *
 * 3. Source-level structural assertions
 *    a. coach/profile GET uses SQL IN clause (not JS post-filter)
 *    b. coach/profile GET has mediaOriginProtected: true
 *    c. coach-preview GET accepts ?selectedMedia query param
 *    d. ProfileBuilder onSaved uses /api/parent/players/:id (not coach-preview)
 *    e. run-schema-coach-profile-v1 accepts COACH_PROFILE_SCHEMA_ENABLED independently
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import type { PolicyUser } from '../../../../../../server/auth-policy';
import {
  InMemoryCoachLinkStore,
  setCoachLinkStore,
} from '../../../../../../server/lib/coach-link-store';

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockParentUser: PolicyUser | null = null;
let mockFeatureEnabled = false;
let mockPlayerRows: Record<string, unknown>[] = [];
// '*' = open to all; comma-separated emails = restricted; '' = no one (admin-only)
let mockCohortTesters = '*';

// Media rows returned by db.execute() for the media validation query.
// The mock filters these by player_id, user_id, kind, media_type, deleted_at.
let mockMediaRows: Array<{
  id: string;
  player_id: string;
  user_id: string;
  kind: string;
  media_type: string;
  deleted_at: string | null;
}> = [];

// ─── Module mocks ─────────────────────────────────────────────────────────────

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
    if (key === 'COACH_PROFILE_TESTERS') return mockCohortTesters;
    return undefined;
  }),
}));

// DB mock: handles both db.select() (player ownership) and db.execute() (media validation).
// The POST handler call sequence:
//   1. db.select().from().where().limit(1) — player ownership → mockPlayerRows
//   2. db.select().from().where() (match records) — skipped for selectedMedia tests
//   3. db.execute(sql`SELECT a.id FROM sc_player_media_assignments ...`) — media validation
vi.mock('@/server/db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      const inner: Record<string, (...args: unknown[]) => unknown> = {
        from: vi.fn(() => inner),
        where: vi.fn(() => {
          const chainable = {
            ...inner,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            catch: (reject: (e: unknown) => unknown) => Promise.resolve([]).catch(reject),
            limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
          };
          inner.where = vi.fn(() => chainable);
          return chainable;
        }),
        orderBy: vi.fn(() => Promise.resolve([])),
        limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
      };
      const chainable = {
        ...inner,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve([]).catch(reject),
        limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
      };
      inner.where = vi.fn(() => chainable);
      return inner;
    }),
    execute: vi.fn(async () => {
      // Media assignment ownership check — return only valid rows
      return [mockMediaRows.filter(r =>
        r.player_id === 'p1' &&
        r.user_id === 'user-parent-001' &&
        r.kind === 'highlight' &&
        r.media_type === 'video' &&
        r.deleted_at === null
      )];
    }),
  },
}));

// ─── Handlers ─────────────────────────────────────────────────────────────────

import postLinksHandler from './POST';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown>,
): Request {
  return { params, headers: {}, body, url: `/api/parent/players/${params.playerId}/coach-links`, method: 'POST' } as unknown as Request;
}

let testStore: InMemoryCoachLinkStore;

function resetState() {
  mockParentUser = makeParentUser();
  mockFeatureEnabled = true;
  mockPlayerRows = [{ id: 'p1', ageBand: 'U17' }];
  mockMediaRows = [];
  testStore = new InMemoryCoachLinkStore();
  setCoachLinkStore(testStore);
}

// ─── 0. Test-cohort enforcement ──────────────────────────────────────────────

describe('POST coach-links — test-cohort enforcement', () => {
  beforeEach(() => {
    mockParentUser = makeParentUser(); // non-admin
    mockFeatureEnabled = true;
    mockPlayerRows = [{ id: 'p1', ageBand: 'U17' }];
    mockMediaRows = [];
    testStore = new InMemoryCoachLinkStore();
    setCoachLinkStore(testStore);
  });

  afterEach(() => {
    mockCohortTesters = '*'; // restore default
  });

  it('returns 403 NOT_IN_TEST_COHORT when user is not admin and not in COACH_PROFILE_TESTERS', async () => {
    mockCohortTesters = 'allowed@example.com'; // our user is parent@example.com
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toBe('NOT_IN_TEST_COHORT');
  });

  it('blocks admin users not in COACH_PROFILE_TESTERS (no admin bypass)', async () => {
    mockCohortTesters = 'other@example.com'; // not our user (parent@example.com)
    mockParentUser = makeParentUser({ isAdmin: true });
    // Admin is subject to the same cohort check — no bypass
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toBe('NOT_IN_TEST_COHORT');
  });

  it('allows admin users when their email is in COACH_PROFILE_TESTERS', async () => {
    mockCohortTesters = 'parent@example.com'; // matches our admin user
    mockParentUser = makeParentUser({ isAdmin: true });
    // Admin is in the allowlist — reaches player ownership check (404 since no player row)
    mockPlayerRows = [];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(404);
  });

  it('allows wildcard COACH_PROFILE_TESTERS=* for all parents', async () => {
    // mockCohortTesters is '*' by default — all parents allowed
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
  });
});

// ─── 1. POST selectedMedia validation ─────────────────────────────────────────

describe('POST coach-links — selectedMedia validation', () => {
  beforeEach(resetState);

  it('rejects missing selectedMedia field (400 INVALID_SELECTED_MEDIA)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        // selectedMedia intentionally omitted
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('INVALID_SELECTED_MEDIA');
  });

  it('rejects non-array selectedMedia (400 INVALID_SELECTED_MEDIA)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: 'not-an-array',
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('INVALID_SELECTED_MEDIA');
  });

  it('accepts empty selectedMedia array (201)', async () => {
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: [],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    // Verify the link was created with empty selectedMedia
    const links = await testStore.listForPlayer('p1', 'user-parent-001');
    expect(links).toHaveLength(1);
    expect(links[0].selectedMedia).toEqual([]);
  });

  it('rejects wrong-owner assignment ID (400 FOREIGN_MEDIA_IDS)', async () => {
    // mockMediaRows is empty — no owned media
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['foreign-assignment-id'],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; foreignIds: string[] };
    expect(body.error).toBe('FOREIGN_MEDIA_IDS');
    expect(body.foreignIds).toContain('foreign-assignment-id');
  });

  it('rejects deleted media ID (400 FOREIGN_MEDIA_IDS)', async () => {
    // deleted_at is non-null — the mock filter excludes it
    mockMediaRows = [{
      id: 'deleted-assignment',
      player_id: 'p1',
      user_id: 'user-parent-001',
      kind: 'highlight',
      media_type: 'video',
      deleted_at: '2026-01-01T00:00:00Z',
    }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['deleted-assignment'],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('FOREIGN_MEDIA_IDS');
  });

  it('rejects non-video assignment ID (400 FOREIGN_MEDIA_IDS)', async () => {
    // media_type is 'image' — the mock filter excludes it
    mockMediaRows = [{
      id: 'photo-assignment',
      player_id: 'p1',
      user_id: 'user-parent-001',
      kind: 'highlight',
      media_type: 'image',
      deleted_at: null,
    }];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['photo-assignment'],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('FOREIGN_MEDIA_IDS');
  });

  it('accepts valid owned video assignment IDs (201) and persists them', async () => {
    mockMediaRows = [
      { id: 'vid-1', player_id: 'p1', user_id: 'user-parent-001', kind: 'highlight', media_type: 'video', deleted_at: null },
      { id: 'vid-2', player_id: 'p1', user_id: 'user-parent-001', kind: 'highlight', media_type: 'video', deleted_at: null },
    ];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['vid-1', 'vid-2'],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    // Verify persisted on the link record
    const links = await testStore.listForPlayer('p1', 'user-parent-001');
    expect(links).toHaveLength(1);
    expect(links[0].selectedMedia).toEqual(['vid-1', 'vid-2']);
  });

  it('rejects a mix of valid and foreign IDs (400 FOREIGN_MEDIA_IDS)', async () => {
    mockMediaRows = [
      { id: 'vid-owned', player_id: 'p1', user_id: 'user-parent-001', kind: 'highlight', media_type: 'video', deleted_at: null },
    ];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['vid-owned', 'vid-foreign'],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; foreignIds: string[] };
    expect(body.error).toBe('FOREIGN_MEDIA_IDS');
    expect(body.foreignIds).toEqual(['vid-foreign']);
    expect(body.foreignIds).not.toContain('vid-owned');
  });
});

// ─── 2. Persisted selections survive link reload ───────────────────────────────

describe('POST coach-links — selectedMedia persisted on link record', () => {
  beforeEach(resetState);

  it('selectedMedia on created record equals what was passed to POST', async () => {
    mockMediaRows = [
      { id: 'vid-a', player_id: 'p1', user_id: 'user-parent-001', kind: 'highlight', media_type: 'video', deleted_at: null },
    ];
    const res = makeRes();
    await postLinksHandler(
      makeReq({ playerId: 'p1' }, {
        approvedFields: ['label'],
        selectedMatchRecords: [],
        selectedMedia: ['vid-a'],
        selectedEvents: [],
        expiresInDays: 30,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    const links = await testStore.listForPlayer('p1', 'user-parent-001');
    expect(links).toHaveLength(1);
    // The persisted selectedMedia must exactly match what was submitted
    expect(links[0].selectedMedia).toEqual(['vid-a']);
  });
});

// ─── 3. Source-level structural assertions ────────────────────────────────────

describe('source-level structural assertions', () => {
  it('coach/profile GET uses SQL IN clause for selectedMedia (not JS post-filter)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/coach/profile/[token]/GET.ts', 'utf-8');
    // The SQL must contain the IN clause with selectedMediaIds
    expect(src).toContain('WHERE a.id        IN');
    expect(src).toContain('selectedMediaIds.map(id => sql');
    // The old JS post-filter must be gone
    expect(src).not.toContain('selectedSet.has(h.id)');
    expect(src).not.toContain('.filter(h => selectedSet');
  });

  it('coach/profile GET has mediaOriginProtected: true in the real path', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/coach/profile/[token]/GET.ts', 'utf-8');
    // The real path section starts after the demo early-return
    const realStart = src.indexOf('// ── Fetch player ──');
    expect(realStart).toBeGreaterThan(0);
    const realSection = src.slice(realStart);
    expect(realSection).toContain('mediaOriginProtected: true,');
    expect(realSection).not.toContain('mediaOriginProtected: false,');
  });

  it('coach-preview GET accepts ?selectedMedia query param', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      'src/server/api/parent/players/[playerId]/coach-preview/GET.ts',
      'utf-8',
    );
    expect(src).toContain('req.query.selectedMedia');
    expect(src).toContain('requestedMediaIds');
    // Foreign IDs are silently excluded (not 400) in the preview
    expect(src).toContain('ownedIdSet');
    expect(src).toContain('validatedMediaIds');
  });

  it('ProfileBuilder onSaved uses /api/parent/players/:id (not coach-preview)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/portal/ProfileBuilder.tsx', 'utf-8');
    const onSavedStart = src.indexOf('setSaveOk(true)');
    const onSavedEnd = src.indexOf('onSaved(saved)', onSavedStart);
    const onSavedSection = src.slice(onSavedStart, onSavedEnd);
    // Must use the authenticated player endpoint
    expect(onSavedSection).toContain('/api/parent/players/');
    // Must NOT use the coach-preview endpoint (gated by COACH_PROFILE_LINKS_ENABLED)
    expect(onSavedSection).not.toContain('coach-preview');
    // Must use the player data for identity fields
    expect(onSavedSection).toContain('playerData.player');
  });

  it('run-schema-coach-profile-v1 accepts COACH_PROFILE_SCHEMA_ENABLED independently', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      'src/server/api/parent/admin/run-schema-coach-profile-v1/POST.ts',
      'utf-8',
    );
    // Must check the schema flag
    expect(src).toContain('COACH_PROFILE_SCHEMA_ENABLED');
    // Must allow either flag
    expect(src).toContain('schemaEnabled');
    expect(src).toContain('linksEnabled');
    // Must reject only when BOTH are absent
    expect(src).toContain('!schemaEnabled && !linksEnabled');
  });
});
