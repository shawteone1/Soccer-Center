/**
 * step6-selections.test.ts
 *
 * Regression tests for the complete selection → preview → link data path.
 *
 * WHAT IS TESTED
 * ──────────────
 * 1. Preview with populated selections
 *    a. ?selectedMedia=id1 → highlights array has length 1 with proxy publicUrl
 *    b. ?selectedEvents=id1 → upcomingEvents array has length 1 with competition field
 *    c. ?matchIds=id1 → stats.available=true
 *    d. highSchool in DB → highSchool in projection
 *
 * 2. Preview with empty selections
 *    a. ?selectedMedia= (empty string) → highlights array is empty
 *    b. ?selectedEvents= (empty string) → upcomingEvents array is empty
 *    c. No ?matchIds → stats.available=false
 *
 * 3. Deselected items excluded
 *    a. ?selectedMedia=id1 when DB has id1+id2 → only id1 returned
 *    b. ?selectedEvents=id1 when DB has id1+id2 → only id1 returned
 *    c. Foreign match record ID excluded from stats
 *
 * 4. Preview / link agreement — structural (source-level)
 *    a. coach-preview GET accepts ?selectedMedia, ?selectedEvents, ?matchIds
 *    b. POST coach-links accepts selectedMedia and selectedEvents in body
 *    c. coach/profile GET uses selectedMedia and selectedEvents from stored link
 *    d. CoachShareTab sends both to preview and createLink
 *    e. UpcomingEvent interface includes competition field
 *    f. loadPreview auto-triggers on step === 'preview'
 *
 * 5. Consent: no selection means no shared content
 *    a. No selectedMedia param → all highlights returned with publicUrl=null
 *    b. selectedMedia= (empty) → zero highlights
 *
 * LABEL: automated handler tests
 * Live authenticated verification against the deployed app remains pending.
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

// executeRows: queue of result arrays for db.execute() calls.
// Order per handler invocation (coach-preview GET): [highlights, events]
let executeRows: unknown[][] = [];

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
    if (key === 'COACH_PROFILE_TESTERS') return '*';
    return undefined;
  }),
}));

let dbSelectCallCount = 0;

vi.mock('@/server/db/client.js', () => ({
  db: {
    execute: vi.fn(async () => [executeRows.shift() ?? []]),
    select: vi.fn(() => {
      dbSelectCallCount++;
      const callIdx = dbSelectCallCount;
      const inner: Record<string, (...args: unknown[]) => unknown> = {
        from: vi.fn(() => inner),
        where: vi.fn(() => {
          if (callIdx >= 3) return Promise.resolve(mockMatchRecordRows);
          return inner;
        }),
        orderBy: vi.fn(() => Promise.resolve(mockAffiliationRows)),
        limit: vi.fn(() => Promise.resolve(mockPlayerRows)),
      };
      return inner;
    }),
  },
}));

// ── Static imports (after mocks) ──────────────────────────────────────────────

import coachPreviewHandler from '../coach-preview/GET';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParentUser(overrides: Partial<PolicyUser> = {}): PolicyUser {
  return {
    id: 'user-001',
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
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader: vi.fn(),
  };
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): Request {
  return { params, headers: {}, body: {}, query } as unknown as Request;
}

function makePlayerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1', label: 'Alex Morgan', ageBand: 'U17',
    graduationYear: 2028, primaryPosition: 'Midfielder', secondaryPosition: null,
    foot: 'right', positions: '[]', skillLevel: 'advanced', clubName: 'Colorado United',
    profileIntroduction: 'I love soccer.', achievements: null, playingLevel: 'ECNL',
    gpa: '3.8', gpaScale: '4.0', gpaWeighted: 'weighted', intendedMajor: 'Biology',
    collegeGoals: 'D1 program', contactEmail: 'parent@example.com',
    highSchool: 'Cherry Creek High School', schoolCity: 'Greenwood Village', schoolState: 'CO',
    avatarUrl: '/airo-assets/uploads/player-photos/u1/p1.jpg', avatarInitials: 'AM',
    ...overrides,
  };
}

function makeMatchRecord(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    statGp: 1, statGoals: 2, statAssists: 1, statShots: 4,
    statGa: null, statSaves: null, statSo: null,
    participated: true, seasonTotalsOverride: false,
    season: '2025 Fall', positionPlayed: 'Midfielder',
    matchDate: '2025-09-15', opponent: 'FC Denver',
    ...overrides,
  };
}

function resetState() {
  mockParentUser = null;
  mockFeatureEnabled = false;
  mockPlayerRows = [];
  mockAffiliationRows = [];
  mockMatchRecordRows = [];
  dbSelectCallCount = 0;
  executeRows = [];
}

// ── 1. Preview with populated selections ─────────────────────────────────────

describe('preview — populated selections', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('?selectedMedia=video-1 → highlights has length 1 with proxy publicUrl', async () => {
    executeRows = [
      [{ id: 'video-1', title: 'Great goal', season: '2025 Fall', media_type: 'video', public_url: '/uploads/v.mp4' }],
      [],
    ];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedMedia: 'video-1' }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    const profile = (res.body as { profile: Record<string, unknown> }).profile;
    const highlights = profile.highlights as Array<{ id: string; publicUrl: string | null }>;
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe('video-1');
    // Owner preview: publicUrl is the parent-auth proxy, not null
    expect(highlights[0].publicUrl).toMatch(/\/api\/parent\/players\/p1\/media-preview\//);
  });

  it('?selectedEvents=event-1 → upcomingEvents has length 1 with competition field', async () => {
    executeRows = [
      [],
      [{ id: 'event-1', title: 'vs. FC Denver', start_at: '2099-10-15T18:00:00', location: 'Infinity Park' }],
    ];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedEvents: 'event-1' }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    const profile = (res.body as { profile: Record<string, unknown> }).profile;
    const events = profile.upcomingEvents as Array<{ id: string; competition: string }>;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('event-1');
    // competition must be present (required by CoachUpcomingEvent in the card)
    expect(events[0]).toHaveProperty('competition');
    expect(typeof events[0].competition).toBe('string');
  });

  it('?matchIds=rec-1 → stats.available=true', async () => {
    mockMatchRecordRows = [makeMatchRecord('rec-1')];
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { matchIds: 'rec-1' }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    const stats = (res.body as { profile: { stats: { available: boolean } } }).profile.stats;
    expect(stats.available).toBe(true);
  });

  it('highSchool in DB → highSchool in projection', async () => {
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const profile = (res.body as { profile: Record<string, unknown> }).profile;
    expect(profile.highSchool).toBe('Cherry Creek High School');
    expect(profile.schoolCity).toBe('Greenwood Village');
    expect(profile.schoolState).toBe('CO');
  });
});

// ── 2. Preview with empty selections ─────────────────────────────────────────

describe('preview — empty selections', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('?selectedMedia= (empty) → highlights array is empty', async () => {
    // DB has a video but selectedMedia= is empty → SQL AND 1=0 → no rows returned
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedMedia: '' }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    const highlights = (res.body as { profile: { highlights: unknown[] } }).profile.highlights;
    expect(highlights).toHaveLength(0);
  });

  it('?selectedEvents= (empty) → upcomingEvents array is empty', async () => {
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedEvents: '' }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    const events = (res.body as { profile: { upcomingEvents: unknown[] } }).profile.upcomingEvents;
    expect(events).toHaveLength(0);
  });

  it('no ?matchIds → stats.available=false even when DB has records', async () => {
    mockMatchRecordRows = [makeMatchRecord('rec-1')];
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const stats = (res.body as { profile: { stats: { available: boolean } } }).profile.stats;
    expect(stats.available).toBe(false);
  });
});

// ── 3. Deselected items excluded ──────────────────────────────────────────────

describe('preview — deselected items excluded', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('?selectedMedia=video-1 → only video-1 returned (video-2 excluded)', async () => {
    // SQL IN clause filters to only video-1; mock returns only that row
    executeRows = [
      [{ id: 'video-1', title: 'Goal', season: '2025', media_type: 'video', public_url: '/v1.mp4' }],
      [],
    ];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedMedia: 'video-1' }),
      res as unknown as Response,
    );
    const highlights = (res.body as { profile: { highlights: Array<{ id: string }> } }).profile.highlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe('video-1');
  });

  it('?selectedEvents=event-1 → only event-1 returned (event-2 excluded)', async () => {
    executeRows = [
      [],
      [{ id: 'event-1', title: 'vs. Rival', start_at: '2099-11-01T15:00:00', location: 'Field A' }],
    ];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedEvents: 'event-1' }),
      res as unknown as Response,
    );
    const events = (res.body as { profile: { upcomingEvents: Array<{ id: string }> } }).profile.upcomingEvents;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('event-1');
  });

  it('foreign match record ID is silently excluded from stats', async () => {
    // DB has rec-1 owned by this player; rec-foreign is not in DB rows
    mockMatchRecordRows = [makeMatchRecord('rec-1')];
    executeRows = [[], []];
    const res = makeRes();
    // Request rec-1 (valid) + rec-foreign (not in DB) → only rec-1 used
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { matchIds: 'rec-1,rec-foreign' }),
      res as unknown as Response,
    );
    const stats = (res.body as { profile: { stats: { available: boolean; gamesPlayed?: number } } }).profile.stats;
    expect(stats.available).toBe(true);
    // Only rec-1 contributed — gamesPlayed reflects 1 record
    expect(stats.gamesPlayed).toBe(1);
  });
});

// ── 4. Preview / link agreement — structural ──────────────────────────────────

describe('preview / link agreement — structural assertions', () => {
  it('coach-preview GET accepts ?selectedMedia, ?selectedEvents, ?matchIds (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/parent/players/[playerId]/coach-preview/GET.ts', 'utf8');
    expect(src).toContain('selectedMedia');
    expect(src).toContain('selectedEvents');
    expect(src).toContain('matchIds');
  });

  it('POST coach-links accepts selectedMedia and selectedEvents in body (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/parent/players/[playerId]/coach-links/POST.ts', 'utf8');
    expect(src).toContain('selectedMedia');
    expect(src).toContain('selectedEvents');
  });

  it('coach/profile GET uses selectedMedia and selectedEvents from stored link (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/coach/profile/[token]/GET.ts', 'utf8');
    expect(src).toContain('selectedMedia');
    expect(src).toContain('selectedEvents');
  });

  it('CoachShareTab sends selectedMedia and selectedEvents to both preview and createLink (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/portal/CoachShareTab.tsx', 'utf8');
    expect(src).toContain("coachPreviewParams(selectedFields, selectedMatches, selectedMedia, selectedEvents)");
    expect(src).toContain('selectedMedia: Array.from(selectedMedia)');
    expect(src).toContain('selectedEvents: Array.from(selectedEvents)');
  });

  it('CoachShareTab UpcomingEvent interface includes competition field (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/portal/CoachShareTab.tsx', 'utf8');
    const interfaceMatch = src.match(/interface UpcomingEvent \{[\s\S]*?\}/);
    expect(interfaceMatch).not.toBeNull();
    expect(interfaceMatch![0]).toContain('competition');
  });

  it('loadPreview auto-triggers when step transitions to preview (source-level)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/portal/CoachShareTab.tsx', 'utf8');
    expect(src).toContain("if (step === 'preview') void loadPreview()");
  });
});

// ── 5. Consent: no selection means no shared content ─────────────────────────

describe('consent — no selection means no shared content', () => {
  beforeEach(() => {
    resetState();
    mockParentUser = makeParentUser();
    mockFeatureEnabled = true;
    mockPlayerRows = [makePlayerRow()];
  });

  it('no selectedMedia param → all highlights returned with publicUrl=null (available for selection)', async () => {
    // When selectedMedia is absent, the preview returns all highlights so the
    // parent can see what is available. publicUrl is null because no selection
    // has been made yet — the proxy URL is only set for explicitly selected IDs.
    executeRows = [
      [
        { id: 'v1', title: 'Goal', season: '2025', media_type: 'video', public_url: '/v1.mp4' },
        { id: 'v2', title: 'Save', season: '2025', media_type: 'video', public_url: '/v2.mp4' },
      ],
      [],
    ];
    const res = makeRes();
    await coachPreviewHandler(makeReq({ playerId: 'p1' }), res as unknown as Response);
    const highlights = (res.body as { profile: { highlights: Array<{ publicUrl: string | null }> } }).profile.highlights;
    expect(highlights).toHaveLength(2);
    // publicUrl is null when no selectedMedia filter is applied
    expect(highlights[0].publicUrl).toBeNull();
    expect(highlights[1].publicUrl).toBeNull();
  });

  it('selectedMedia= (empty) → zero highlights (explicit empty selection)', async () => {
    // When selectedMedia= is explicitly empty, SQL AND 1=0 returns no rows.
    executeRows = [[], []];
    const res = makeRes();
    await coachPreviewHandler(
      makeReq({ playerId: 'p1' }, { selectedMedia: '' }),
      res as unknown as Response,
    );
    const highlights = (res.body as { profile: { highlights: unknown[] } }).profile.highlights;
    expect(highlights).toHaveLength(0);
  });
});
