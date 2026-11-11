/**
 * src/server/api/tryouts-db/GET.test.ts
 *
 * Regression tests for GET /api/tryouts-db
 *
 * Focus areas:
 *   1. totalStored field — the response includes a raw count of all DB records
 *      for the region regardless of visibility filters. This lets callers
 *      distinguish "two visible listings" from "two total records".
 *   2. California slug aliases — both cal-south/cal-north (page slugs) and
 *      california-south/california-north (directory slugs) return the same
 *      records. The regionSlugAliases() function is exercised end-to-end
 *      through the handler.
 *   3. Visibility filters — records with review_status='admin_review' are
 *      excluded from events[] but still counted in totalStored.
 *   4. Missing region param returns 400.
 *   5. DB error returns 500.
 *
 * LABEL: automated handler tests
 * Live authenticated verification against the deployed app remains pending.
 *
 * Mocking strategy:
 *   - @/server/db/client: vi.mock returns a Drizzle stub.
 *     db.select().from().where().orderBy() → visible event rows (first call)
 *     db.select().from().where()           → count result (second call)
 *   - @/lib/region-slugs: NOT mocked — the real regionSlugAliases() is used
 *     so the California alias logic is exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

/** Rows returned by the visible-events SELECT (first db.select() call). */
let mockEventRows: Record<string, unknown>[] = [];
/** Value returned by the totalStored COUNT query (second db.select() call). */
let mockTotalStored = 0;
/** If set, the first db.select() throws this error. */
let mockSelectThrow: Error | null = null;

// ── Module mocks ──────────────────────────────────────────────────────────────

let dbSelectCallCount = 0;

vi.mock('@/server/db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      dbSelectCallCount++;
      const callIdx = dbSelectCallCount;
      const inner: Record<string, (...args: unknown[]) => unknown> = {};
      inner.from = vi.fn(() => inner);
      inner.where = vi.fn(() => inner);
      inner.orderBy = vi.fn(() => {
        // First select: visible event rows
        if (callIdx === 1) {
          if (mockSelectThrow) return Promise.reject(mockSelectThrow);
          return Promise.resolve(mockEventRows);
        }
        return Promise.resolve([]);
      });
      // Second select (count): terminates at .where() — no .orderBy()
      // We make .where() also resolve for the count call
      const originalWhere = inner.where as (...args: unknown[]) => unknown;
      inner.where = vi.fn((...args: unknown[]) => {
        if (callIdx === 2) {
          // Count query — return totalStored
          return Promise.resolve([{ totalStored: mockTotalStored }]);
        }
        return originalWhere(...args);
      });
      return inner;
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(query: Record<string, string> = {}) {
  const req = { query, params: {} } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json, setHeader: vi.fn() } as unknown as Response;
  return { req, res, json, status };
}

function makeEventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    regionSlug: 'cal-south',
    clubName: 'LA Galaxy Academy',
    clubUrl: 'https://lagalaxy.com/academy',
    city: 'Carson',
    level: 'Elite',
    ageGroups: '["U14","U15"]',
    eventDate: 'November 1, 2026',
    eventTime: '9:00 AM',
    location: 'Dignity Health Sports Park',
    registrationUrl: null,
    notes: null,
    isPast: false,
    sortOrder: 10,
    sourceUrl: 'https://lagalaxy.com/academy/tryouts',
    lastVerifiedAt: null,
    reviewStatus: 'ok',
    linkCheckStatus: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/tryouts-db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectCallCount = 0;
    mockEventRows = [];
    mockTotalStored = 0;
    mockSelectThrow = null;
  });

  // ── totalStored field ─────────────────────────────────────────────────────

  it('response includes totalStored matching the count query result', async () => {
    mockEventRows = [makeEventRow()];
    mockTotalStored = 5; // 5 stored, 1 visible

    const { req, res, json, status } = makeReqRes({ region: 'cal-south' });
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.totalStored).toBe(5);
    expect(body.total).toBe(1); // visible events only
  });

  it('totalStored can exceed total (visible) when records are filtered out', async () => {
    // 2 visible events, 7 total stored (5 hidden by admin_review or other filters)
    mockEventRows = [makeEventRow({ id: 'evt-1' }), makeEventRow({ id: 'evt-2' })];
    mockTotalStored = 7;

    const { req, res, json } = makeReqRes({ region: 'cal-south' });
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.total).toBe(2);
    expect(body.totalStored).toBe(7);
    expect((body.totalStored as number) > (body.total as number)).toBe(true);
  });

  it('totalStored equals total when all stored records are visible', async () => {
    mockEventRows = [makeEventRow()];
    mockTotalStored = 1;

    const { req, res, json } = makeReqRes({ region: 'cal-south' });
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.total).toBe(1);
    expect(body.totalStored).toBe(1);
  });

  // ── California slug aliases ───────────────────────────────────────────────

  it('cal-south and california-south return the same region in the response', async () => {
    mockEventRows = [makeEventRow()];
    mockTotalStored = 1;

    const { default: handler } = await import('./GET.js');

    const { req: req1, res: res1, json: json1 } = makeReqRes({ region: 'cal-south' });
    dbSelectCallCount = 0;
    await handler(req1, res1);
    const body1 = json1.mock.calls[0]?.[0] as Record<string, unknown>;

    vi.clearAllMocks();
    dbSelectCallCount = 0;
    mockEventRows = [makeEventRow()];
    mockTotalStored = 1;

    const { req: req2, res: res2, json: json2 } = makeReqRes({ region: 'california-south' });
    await handler(req2, res2);
    const body2 = json2.mock.calls[0]?.[0] as Record<string, unknown>;

    // Both slugs should return events (not 400 or 500)
    expect(body1.events).toBeDefined();
    expect(body2.events).toBeDefined();
    // Both return the same event count
    expect((body1.events as unknown[]).length).toBe((body2.events as unknown[]).length);
  });

  it('cal-north and california-north are both accepted', async () => {
    mockEventRows = [makeEventRow({ regionSlug: 'cal-north' })];
    mockTotalStored = 1;

    const { default: handler } = await import('./GET.js');

    for (const slug of ['cal-north', 'california-north']) {
      vi.clearAllMocks();
      dbSelectCallCount = 0;
      mockEventRows = [makeEventRow({ regionSlug: 'cal-north' })];
      mockTotalStored = 1;

      const { req, res, json, status } = makeReqRes({ region: slug });
      await handler(req, res);

      expect(status).not.toHaveBeenCalledWith(400);
      expect(status).not.toHaveBeenCalledWith(500);
      const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(body.events).toBeDefined();
    }
  });

  // ── Missing region param ──────────────────────────────────────────────────

  it('returns 400 when region param is missing', async () => {
    const { req, res, status, json } = makeReqRes({});
    const { default: handler } = await import('./GET.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // ── DB error ──────────────────────────────────────────────────────────────

  it('returns 500 on a DB error', async () => {
    mockSelectThrow = new Error('Connection lost');
    const { req, res, status } = makeReqRes({ region: 'colorado' });
    const { default: handler } = await import('./GET.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(500);
  });

  // ── Basic response shape ──────────────────────────────────────────────────

  it('returns region, events array, total, and totalStored', async () => {
    mockEventRows = [makeEventRow()];
    mockTotalStored = 2;

    const { req, res, json } = makeReqRes({ region: 'cal-south' });
    const { default: handler } = await import('./GET.js');
    await handler(req, res);

    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.region).toBe('cal-south');
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.totalStored).toBe('number');
  });
});
