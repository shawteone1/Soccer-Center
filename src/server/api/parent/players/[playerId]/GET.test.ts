/**
 * src/server/api/parent/players/[playerId]/GET.test.ts
 *
 * Regression tests for GET /api/parent/players/:playerId
 *
 * Focus areas:
 *   1. "Failed to load player" root cause: the handler previously selected
 *      v1/v4 coach profile columns unconditionally. When those columns are
 *      absent from the DB (migrations not yet run), Drizzle throws a DB error
 *      → 500 → the UI catches it as "Failed to load player".
 *
 *      Fix: the handler now probes for v1/v4 columns via SHOW COLUMNS and
 *      omits absent ones from the SELECT. Missing columns are returned as null
 *      in the response shape.
 *
 *   2. When all columns are present, the handler returns 200 with the full
 *      player shape including v1/v4 fields.
 *
 *   3. Ownership: a player belonging to a different user returns 404.
 *
 *   4. Soft-delete: a deleted player (deletedAt IS NOT NULL) returns 404.
 *
 *   5. Unauthenticated requests return 401.
 *
 * LABEL: automated handler tests
 * Live authenticated verification against the deployed app remains pending
 * (requires a real authenticated session and a running server).
 *
 * Mocking strategy:
 *   - auth-policy: vi.mock controls which PolicyUser is returned.
 *   - @/server/db/client: vi.mock returns a Drizzle stub.
 *     db.execute() controls SHOW COLUMNS probe results (present/absent).
 *     db.select() returns player rows and affiliation rows in sequence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { PolicyUser } from '../../../../../server/auth-policy';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockUser: PolicyUser | null = null;

/**
 * Controls SHOW COLUMNS probe results.
 * Each entry is an array of rows returned for one SHOW COLUMNS call.
 * An empty array means the column is absent; a non-empty array means present.
 * The handler probes 10 columns (4 v1 + 6 v4) in two Promise.all batches.
 */
let executeQueue: unknown[][] = [];

/** Player rows returned by the first db.select() call. */
let mockPlayerRows: Record<string, unknown>[] = [];

/** Affiliation rows returned by the second db.select() call. */
let mockAffiliationRows: unknown[] = [];

/** If set, the first db.select() throws this error (simulates DB error). */
let mockSelectThrow: Error | null = null;

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(async (_req: Request, res: Response) => {
    if (!mockUser) { res.status(401).json({}); return null; }
    return mockUser;
  }),
  setPrivateCacheHeaders: vi.fn(),
}));

vi.mock('#airo/secrets', () => ({ getSecret: vi.fn(() => undefined) }));

let dbSelectCallCount = 0;

vi.mock('@/server/db/client.js', () => ({
  db: {
    // execute() handles SHOW COLUMNS probes — dequeues one result per call
    execute: vi.fn(async () => {
      const rows = executeQueue.shift() ?? [];
      return [rows];
    }),
    select: vi.fn(() => {
      dbSelectCallCount++;
      const callIdx = dbSelectCallCount;

      // Build a chainable stub. The player query chain is:
      //   .select(cols).from(table).where(cond).limit(1)  → Promise<rows>
      // The affiliations query chain is:
      //   .select().from(table).where(cond).orderBy(col)  → Promise<rows>
      const inner: Record<string, (...args: unknown[]) => unknown> = {};

      inner.from = vi.fn(() => inner);

      inner.where = vi.fn(() => {
        // where() returns inner so .limit() and .orderBy() can chain off it
        return inner;
      });

      inner.limit = vi.fn(() => {
        // Terminal for the player row query (call 1)
        if (callIdx === 1) {
          if (mockSelectThrow) return Promise.reject(mockSelectThrow);
          return Promise.resolve(mockPlayerRows);
        }
        return Promise.resolve([]);
      });

      inner.orderBy = vi.fn(() => {
        // Terminal for the affiliations query (call 2+)
        return Promise.resolve(mockAffiliationRows);
      });

      // Make inner thenable so it also works if awaited directly
      (inner as Record<string, unknown>).then = vi.fn((resolve: (v: unknown) => unknown) => {
        const result = callIdx === 1 ? mockPlayerRows : mockAffiliationRows;
        return Promise.resolve(result).then(resolve);
      });

      return inner;
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(playerId = 'player-1') {
  const req = { params: { playerId }, body: {} } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json, setHeader: vi.fn() } as unknown as Response;
  return { req, res, json, status };
}

/** A minimal player row with base columns only (no v1/v4 coach fields). */
function basePlayerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'player-1',
    label: 'Alex',
    birthYear: null,
    jersey: null,
    avatarInitials: 'AL',
    avatarUrl: null,
    primaryPosition: 'Midfielder',
    secondaryPosition: null,
    foot: null,
    goals: null,
    ageBand: 'U14',
    ageYears: null,
    positions: '[]',
    skillLevel: null,
    developmentInterests: '[]',
    trainingMode: null,
    clubName: 'FC Test',
    clubUrl: null,
    clubDirectoryId: null,
    trainingPreferences: null,
    tryoutInterest: true,
    sortOrder: 0,
    statGp: null,
    statGoals: null,
    statAssists: null,
    statShots: null,
    statGa: null,
    statSaves: null,
    statSo: null,
    ...overrides,
  };
}

/**
 * Build an executeQueue where all 10 coach profile column probes return "absent".
 * The handler probes 4 v1 columns + 6 v4 columns = 10 SHOW COLUMNS calls.
 */
function allColumnsAbsent(): unknown[][] {
  return Array.from({ length: 10 }, () => []);
}

/**
 * Build an executeQueue where all 10 coach profile column probes return "present".
 * A non-empty row array signals the column exists.
 */
function allColumnsPresent(): unknown[][] {
  return Array.from({ length: 10 }, () => [{ Field: 'col' }]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/parent/players/:playerId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectCallCount = 0;
    mockUser = { id: 'user-1', isAdmin: false } as PolicyUser;
    mockPlayerRows = [];
    mockAffiliationRows = [];
    mockSelectThrow = null;
    executeQueue = [];
  });

  // ── Bug regression: missing v1/v4 columns must not cause 500 ─────────────

  it('returns 200 with null coach fields when v1/v4 columns are absent (regression: no 500)', async () => {
    // Previously: selecting absent columns threw a DB error → 500 → "Failed to load player"
    // Now: absent columns are omitted from SELECT; response shape has null values
    executeQueue = allColumnsAbsent();
    mockPlayerRows = [basePlayerRow()];

    const { req, res, status, json } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    // Must not return 500
    expect(status).not.toHaveBeenCalledWith(500);

    // Must return 200 (via res.json directly, not res.status(200).json)
    expect(json).toHaveBeenCalledOnce();
    const body = json.mock.calls[0]?.[0] as { player?: Record<string, unknown> };
    expect(body.player).toBeDefined();

    // Coach profile fields must be null (not undefined, not an error)
    const p = body.player!;
    expect(p.graduationYear).toBeNull();
    expect(p.profileIntroduction).toBeNull();
    expect(p.achievements).toEqual([]);
    expect(p.playingLevel).toBeNull();
    expect(p.gpa).toBeNull();
    expect(p.gpaScale).toBeNull();
    expect(p.gpaWeighted).toBeNull();
    expect(p.intendedMajor).toBeNull();
    expect(p.collegeGoals).toBeNull();
    expect(p.contactEmail).toBeNull();
  });

  it('returns 200 with full coach fields when all columns are present', async () => {
    executeQueue = allColumnsPresent();
    mockPlayerRows = [basePlayerRow({
      graduationYear: 2028,
      profileIntroduction: 'Plays central midfield.',
      achievements: '["State champion 2025"]',
      playingLevel: 'competitive',
      gpa: '3.8',
      gpaScale: '4.0',
      gpaWeighted: 'unweighted',
      intendedMajor: 'Business',
      collegeGoals: 'D1 or D2',
      contactEmail: 'alex@example.com',
    })];

    const { req, res, status, json } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0] as { player?: Record<string, unknown> };
    const p = body.player!;
    expect(p.graduationYear).toBe(2028);
    expect(p.gpa).toBe('3.8');
    expect(p.contactEmail).toBe('alex@example.com');
    expect(p.achievements).toEqual(['State champion 2025']);
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  it('returns 404 when the player belongs to a different user', async () => {
    // The WHERE clause includes userId = user.id, so a different user's player
    // returns no rows → 404.
    executeQueue = allColumnsAbsent();
    mockPlayerRows = []; // no rows — ownership check fails

    const { req, res, status, json } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
    const errorArg = json.mock.calls[0]?.[0] as { error?: string };
    expect(errorArg.error).toBe('Player not found');
  });

  // ── Soft-delete ───────────────────────────────────────────────────────────

  it('returns 404 for a soft-deleted player (WHERE isNull(deletedAt) excludes it)', async () => {
    // The WHERE clause includes isNull(deletedAt), so a deleted player returns
    // no rows → 404. The mock simulates this by returning an empty player array.
    executeQueue = allColumnsAbsent();
    mockPlayerRows = []; // deleted player excluded by WHERE

    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  // ── Authentication ────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  // ── DB error handling ─────────────────────────────────────────────────────

  it('returns 500 on a genuine DB error (not a missing-column error)', async () => {
    // Columns probe succeeds (all present), but the SELECT itself throws.
    executeQueue = allColumnsPresent();
    mockSelectThrow = new Error('Connection lost');

    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(500);
  });

  // ── Base fields ───────────────────────────────────────────────────────────

  it('returns correct base fields when player exists', async () => {
    executeQueue = allColumnsAbsent();
    mockPlayerRows = [basePlayerRow({ label: 'Jordan', ageBand: 'U16', clubName: 'FC Test' })];

    const { req, res, json } = makeReqRes();
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    const body = json.mock.calls[0]?.[0] as { player?: Record<string, unknown> };
    const p = body.player!;
    expect(p.id).toBe('player-1');
    expect(p.label).toBe('Jordan');
    expect(p.ageBand).toBe('U16');
    expect(p.clubName).toBe('FC Test');
    expect(p.statsAvailable).toBe(true);
    expect(p.affiliations).toEqual([]);
  });
});
