/**
 * src/server/api/parent/players/[playerId]/coach-preview/handler.test.ts
 *
 * Automated handler tests for GET /api/parent/players/:playerId/coach-preview
 * and POST /api/parent/admin/run-schema-coach-profile-v1.
 *
 * These tests exercise the actual handler functions with mocked session and
 * database boundaries. They verify authentication, feature gating, ownership
 * enforcement, soft-delete exclusion, and admin access — without a live
 * database or browser session.
 *
 * LABEL: automated handler tests
 * Live authenticated verification against the deployed app remains pending
 * (requires a real admin session cookie and a running server).
 *
 * Mocking strategy:
 *   - auth-policy: vi.mock replaces requireParentAccess so we control which
 *     PolicyUser (or null) is returned per test.
 *   - #airo/secrets: vi.mock controls COACH_PROFILE_LINKS_ENABLED.
 *   - @/server/db/client: vi.mock returns a chainable Drizzle stub.
 *   - mysql2/promise: vi.mock prevents real DB connections in the migration handler.
 *   - node:fs: vi.mock prevents /local/config.json reads in the migration handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { PolicyUser } from '../../../../../../server/auth-policy';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockParentUser: PolicyUser | null = null;
let mockFeatureEnabled = false;
let mockPlayerRows: Record<string, unknown>[] = [];
let mockAffiliationRows: { orgName: string; season: string; ageGroupLabel: string }[] = [];
let mockMatchRecordRows: unknown[] = [];
let mockMatchRecordsThrow: Error | null = null;

// ── Module mocks (hoisted — must be at top level) ─────────────────────────────

vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(async (_req: Request, res: Response) => {
    if (!mockParentUser) { res.status(401).json({}); return null; }
    return mockParentUser;
  }),
  requireAdmin: vi.fn(async (_req: Request, res: Response) => {
    if (!mockParentUser) { res.status(401).json({}); return null; }
    if (!mockParentUser.isAdmin) { res.status(403).json({}); return null; }
    return mockParentUser;
  }),
  setPrivateCacheHeaders: vi.fn(),
}));

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn((key: string) => {
    if (key === 'COACH_PROFILE_LINKS_ENABLED') return mockFeatureEnabled ? 'true' : undefined;
    return undefined;
  }),
}));

// Drizzle stub — three sequential calls per handler invocation:
//   call 1: player row  (.select().from().where().limit(1))
//   call 2: affiliations (.select().from().where().orderBy())
//   call 3: match records (.select().from().where() — resolved or thrown)
// The stub reads from shared state variables (mockPlayerRows, etc.) that are
// reset in beforeEach, so each test gets a clean slate.
let dbSelectCallCount = 0;
let executeRows: unknown[][] = [];

vi.mock('@/server/db/client.js', () => {
  return {
    db: {
      execute: vi.fn(async () => [executeRows.shift() ?? []]),
      select: vi.fn(() => {
        dbSelectCallCount++;
        const callIdx = dbSelectCallCount;
        const inner: Record<string, (...args: unknown[]) => unknown> = {
          from: vi.fn(() => inner),
          // where() is the terminal call for match records (call 3)
          where: vi.fn(() => {
            if (callIdx >= 3) {
              // match records query ends with .where() — no further chaining
              if (mockMatchRecordsThrow) return Promise.reject(mockMatchRecordsThrow);
              return Promise.resolve(mockMatchRecordRows);
            }
            return inner;
          }),
          // orderBy() is the terminal call for affiliations (call 2)
          orderBy: vi.fn(() => {
            return Promise.resolve(mockAffiliationRows);
          }),
          // limit() is the terminal call for the player row (call 1)
          limit: vi.fn(() => {
            return Promise.resolve(mockPlayerRows);
          }),
        };
        return inner;
      }),
    },
  };
});

vi.mock('mysql2/promise', () => ({
  default: { createConnection: vi.fn() },
  createConnection: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => JSON.stringify({
      DATABASE: { VALUE: { HOST: 'localhost', PORT: 3306, USERNAME: 'u', PASSWORD: 'p', NAME: 'db' } },
    })),
  };
});

// ── Static imports of handlers (after mocks are declared) ─────────────────────

import coachPreviewHandler from './GET';
import migrationHandler from '../../../../../../server/api/parent/admin/run-schema-coach-profile-v1/POST';

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

function makeReq(params: Record<string, string> = {}, query: Record<string, string> = {}): Request {
  return { params, headers: {}, body: {}, query } as unknown as Request;
}

/** Minimal player row — no stat_* fields (intentionally absent from PlayerProjectionRow) */
function makePlayerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1', label: 'Alex', ageBand: 'U17',
    graduationYear: 2028, primaryPosition: 'Midfielder', secondaryPosition: null,
    foot: 'right', positions: '[]', skillLevel: 'advanced', clubName: 'Colorado United',
    profileIntroduction: null, achievements: null, playingLevel: null,
    avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg', avatarInitials: 'AM',
    ...overrides,
  };
}

function resetState() {
  mockParentUser = null;
  mockFeatureEnabled = false;
  mockPlayerRows = [];
  mockAffiliationRows = [];
  mockMatchRecordRows = [];
  mockMatchRecordsThrow = null;
  dbSelectCallCount = 0;
  executeRows = [];
}

// ── Tests: GET /api/parent/players/:playerId/coach-preview ────────────────────

describe('GET coach-preview — authentication', () => {
  beforeEach(resetState);

  it('returns 401 when no session exists', async () => {
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET coach-preview — feature gating', () => {
  beforeEach(() => { resetState(); mockParentUser = makeParentUser(); });

  it('returns 403 when COACH_PROFILE_LINKS_ENABLED is not set', async () => {
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({});
  });
});

describe('GET coach-preview — ownership and not-found', () => {
  beforeEach(() => { resetState(); mockParentUser = makeParentUser(); mockFeatureEnabled = true; });

  it('returns 404 when player does not belong to the authenticated user', async () => {
    mockPlayerRows = [];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'other-users-player' }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a soft-deleted player (WHERE isNull(deletedAt) excludes it)', async () => {
    mockPlayerRows = []; // Drizzle WHERE filters deleted rows — returns empty
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'deleted-player-id' }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with projection for own active player', async () => {
    mockPlayerRows = [makePlayerRow()];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const body = res.body as { profile: Record<string, unknown> };
    expect(body).toHaveProperty('profile');
    expect(body.profile.label).toBe('Alex');
  });

  it('avatarUrl is forwarded in the owner preview (mediaOriginProtected=true, proxy resolved)', async () => {
    // The owner preview is authenticated — the raw avatarUrl is safe for the
    // parent to see. mediaOriginProtected=true so the projection passes it through.
    mockPlayerRows = [makePlayerRow({ avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg' })];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const body = res.body as { profile: Record<string, unknown> };
    expect(body.profile.avatarUrl).toBe('/airo-assets/uploads/player-photos/u1/p1.jpg');
    expect(body.profile.mediaOriginProtected).toBe(true);
  });

  it('private fields are absent from the response', async () => {
    mockPlayerRows = [makePlayerRow({ avatarUrl: null, avatarInitials: null })];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const preview = (res.body as { profile: Record<string, unknown> }).profile;
    const forbidden = ['birthYear', 'clubUrl', 'clubDirectoryId', 'trainingPreferences',
      'tryoutInterest', 'goals', 'deletedAt', 'sortOrder', 'userId', 'notes'];
    for (const field of forbidden) {
      expect(preview, `forbidden field in response: ${field}`).not.toHaveProperty(field);
    }
  });

  it('profile-level stat_* fields are absent from the response', async () => {
    mockPlayerRows = [makePlayerRow()];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const preview = (res.body as { profile: Record<string, unknown> }).profile;
    const profileStatFields = ['statGp', 'statGoals', 'statAssists', 'statShots', 'statGa', 'statSaves', 'statSo'];
    for (const field of profileStatFields) {
      expect(preview, `profile stat field in response: ${field}`).not.toHaveProperty(field);
    }
  });
});

describe('GET coach-preview — stats policy (owner preview)', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('stats.available is false in owner preview (approvedMatchRecordIds=[])', async () => {
    // Owner preview always passes approvedMatchRecordIds=[] — no records are
    // pre-approved. The parent must select records when creating a share link.
    mockMatchRecordRows = [
      { id: 'mr-1', statGoals: 5, statAssists: 3, participated: true, seasonTotalsOverride: false,
        season: 'Fall 2025', positionPlayed: 'Midfielder', matchDate: '2025-09-14', opponent: 'Denver SC',
        statGp: 1, statShots: null, statGa: null, statSaves: null, statSo: null },
    ];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const preview = (res.body as { profile: Record<string, unknown> }).profile;
    const stats = preview.stats as { available: boolean; statsLabel: string };
    expect(stats.available).toBe(false);
    expect(stats.statsLabel).toBe('Stats from approved matches');
    expect(preview.approvedMatchRecordCount).toBe(0);
  });

  it('stats.available is false when match records table throws ER_NO_SUCH_TABLE', async () => {
    mockMatchRecordsThrow = Object.assign(new Error('Table not found'), { code: 'ER_NO_SUCH_TABLE' });
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const preview = (res.body as { profile: Record<string, unknown> }).profile;
    const stats = preview.stats as { available: boolean };
    expect(stats.available).toBe(false);
    expect(preview.statsTableAvailable).toBe(false);
  });
});

// ── Tests: POST /api/parent/admin/run-schema-coach-profile-v1 ─────────────────

describe('POST run-schema-coach-profile-v1 — authentication and access control', () => {
  beforeEach(resetState);

  it('returns 401 when no session exists', async () => {
    const res = makeRes();
    await migrationHandler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated user is not admin', async () => {
    mockParentUser = makeParentUser({ isAdmin: false });
    const res = makeRes();
    await migrationHandler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when admin but COACH_PROFILE_LINKS_ENABLED is not set', async () => {
    mockParentUser = makeParentUser({ isAdmin: true });
    mockFeatureEnabled = false;
    const res = makeRes();
    await migrationHandler(makeReq(), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, unknown>).error).toContain('COACH_PROFILE_LINKS_ENABLED');
  });

  it('admin check fires before feature-flag check (non-admin blocked regardless of flag)', async () => {
    mockParentUser = makeParentUser({ isAdmin: false });
    mockFeatureEnabled = true;
    const res = makeRes();
    await migrationHandler(makeReq(), res as unknown as Response);
    // 403 from admin check — not from feature flag
    expect(res.statusCode).toBe(403);
  });
});


describe('coach preview selection parity', () => {
  beforeEach(() => {
    resetState(); mockParentUser = makeParentUser(); mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
    executeRows = [
      [{ id: 'video-1', title: 'Play', season: '2026', media_type: 'video' }],
      [{ id: 'event-1', title: '@ Opponent', start_at: '2026-12-01', location: 'Field' }],
    ];
  });
  it.each([
    [{}, 1, 1],
    [{ selectedMedia: '', selectedEvents: '' }, 0, 0],
    [{ selectedMedia: 'video-1', selectedEvents: 'event-1' }, 1, 1],
    [{ selectedMedia: 'foreign', selectedEvents: 'foreign' }, 0, 0],
  ])('uses explicit selections %j', async (query, mediaCount, eventCount) => {
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }, query as Record<string, string>), res as unknown as Response);
    const body = res.body as { profile: { highlights: unknown[]; upcomingEvents: unknown[] } };
    expect(body.profile.highlights).toHaveLength(mediaCount as number);
    expect(body.profile.upcomingEvents).toHaveLength(eventCount as number);
  });
});

describe('upcoming appearances in coach preview', () => {
  beforeEach(() => { resetState(); mockParentUser = makeParentUser(); mockFeatureEnabled = true; mockPlayerRows = [makePlayerRow()]; });
  it.each(['camp', 'tournament', 'showcase'])('preserves selected %s identity and excludes unselected appearances', async eventType => {
    executeRows = [[], [
      {id:'chosen',title:'Winter event',start_at:'2026-12-01',location:'Field',event_type:eventType},
      {id:'private',title:'Unselected event',start_at:'2026-12-02',location:'Other field',event_type:eventType},
    ]];
    const res=makeRes();
    await coachPreviewHandler(makeReq({playerId:'p1'},{selectedEvents:'chosen'}),res as unknown as Response);
    const events=(res.body as {profile:{upcomingEvents:Array<{id:string;eventType:string}>}}).profile.upcomingEvents;
    expect(events).toHaveLength(1);expect(events[0]).toMatchObject({id:'chosen',eventType});
  });
  it('shares no appearance when the explicit selection is empty', async()=>{
    executeRows=[[],[{id:'private',title:'Camp',start_at:'2026-12-01',location:'Field',event_type:'camp'}]];
    const res=makeRes();await coachPreviewHandler(makeReq({playerId:'p1'},{selectedEvents:''}),res as unknown as Response);
    expect((res.body as {profile:{upcomingEvents:unknown[]}}).profile.upcomingEvents).toEqual([]);
  });
});
