/**
 * coach-profile-gaps.test.ts
 *
 * Tests for the four specific failure paths from the review:
 *
 * 1. Request submission rejects disabled, expired, revoked, and unknown links.
 * 2. Inbox GET enforces parent ownership (another parent cannot read requests).
 * 3. Unknown-column diagnosis: PATCH returns 503 MIGRATION_REQUIRED with
 *    missingColumns when v4 columns are absent; entered values are preserved
 *    (no false save confirmation).
 * 4. Media proxy rejects expired, revoked, and unknown tokens, and rejects
 *    assignmentIds not in selectedMedia.
 *
 * No database writes, no live secrets, no external access.
 * All persistence is mocked via injected in-memory adapters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    end() { return res; },
    setHeader(k: string, v: string) { headers[k] = v; return res; },
    getHeader(k: string) { return headers[k]; },
    set(k: string, v: string) { headers[k] = v; return res; },
    writeHead(_code: number, _hdrs: Record<string, unknown>) { return res; },
    pipe(_stream: unknown) { return res; },
    _status: () => statusCode,
    _body: () => body,
    _headers: () => headers,
  };
  return res;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    headers: {},
    method: 'GET',
    url: '/test',
    ...overrides,
  } as unknown as Request;
}

// ── 1. Request submission — link state validation ─────────────────────────────

describe('POST /api/coach/profile/:token/requests — link state validation', () => {
  // We test the handler logic by mocking the store and feature flag.
  // Each test resets modules so mocks apply cleanly to a fresh import.

  const validBody = {
    requesterName: 'Coach Smith',
    requesterEmail: 'coach@example.com',
    message: 'I would like to learn more about this player.',
  };

  beforeEach(() => { vi.resetModules(); });

  it('returns 404 when COACH_PROFILE_LINKS_ENABLED is not true', async () => {
    vi.doMock('#airo/secrets', () => ({ getSecret: () => undefined }));
    vi.doMock('@/server/lib/coach-link-store.js', () => ({ getCoachLinkStore: () => null }));
    vi.doMock('@/server/lib/redact-coach-token.js', () => ({ redactCoachToken: (u: string) => u }));
    vi.doMock('@/server/db/client.js', () => ({ db: {} }));
    const { default: handler } = await import(
      '../../../../../../server/api/coach/profile/[token]/requests/POST'
    );
    const req = mockReq({ params: { token: 'validtoken123' }, body: validBody });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 503 when store is null (durable store not connected)', async () => {
    vi.doMock('#airo/secrets', () => ({ getSecret: (k: string) => k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : undefined }));
    vi.doMock('@/server/lib/coach-link-store.js', () => ({ getCoachLinkStore: () => null }));
    vi.doMock('@/server/lib/redact-coach-token.js', () => ({ redactCoachToken: (u: string) => u }));
    vi.doMock('@/server/db/client.js', () => ({ db: {} }));
    const { default: handler } = await import(
      '../../../../../../server/api/coach/profile/[token]/requests/POST'
    );
    const req = mockReq({ params: { token: 'validtoken123' }, body: validBody });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(503);
  });

  it('returns 404 for an unknown token (findByToken returns null)', async () => {
    vi.doMock('#airo/secrets', () => ({ getSecret: (k: string) => k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : undefined }));
    vi.doMock('@/server/lib/coach-link-store.js', () => ({
      getCoachLinkStore: () => ({
        findByToken: async () => null,
      }),
    }));
    vi.doMock('@/server/db/client.js', () => ({ db: {} }));
    vi.doMock('@/server/lib/redact-coach-token.js', () => ({ redactCoachToken: (u: string) => u }));
    const { default: handler } = await import(
      '../../../../../../server/api/coach/profile/[token]/requests/POST'
    );
    const req = mockReq({ params: { token: 'unknowntoken123' }, body: validBody });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 for a revoked link', async () => {
    vi.doMock('#airo/secrets', () => ({ getSecret: (k: string) => k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : undefined }));
    vi.doMock('@/server/lib/coach-link-store.js', () => ({
      getCoachLinkStore: () => ({
        findByToken: async () => ({
          id: 'link-1',
          playerId: 'player-1',
          revokedAt: new Date('2026-01-01'),
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      }),
    }));
    vi.doMock('@/server/db/client.js', () => ({ db: {} }));
    vi.doMock('@/server/lib/redact-coach-token.js', () => ({ redactCoachToken: (u: string) => u }));
    const { default: handler } = await import(
      '../../../../../../server/api/coach/profile/[token]/requests/POST'
    );
    const req = mockReq({ params: { token: 'revokedtoken123' }, body: validBody });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 for an expired link', async () => {
    vi.doMock('#airo/secrets', () => ({ getSecret: (k: string) => k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : undefined }));
    vi.doMock('@/server/lib/coach-link-store.js', () => ({
      getCoachLinkStore: () => ({
        findByToken: async () => ({
          id: 'link-2',
          playerId: 'player-1',
          revokedAt: null,
          expiresAt: new Date('2020-01-01'), // past
        }),
      }),
    }));
    vi.doMock('@/server/db/client.js', () => ({ db: {} }));
    vi.doMock('@/server/lib/redact-coach-token.js', () => ({ redactCoachToken: (u: string) => u }));
    const { default: handler } = await import(
      '../../../../../../server/api/coach/profile/[token]/requests/POST'
    );
    const req = mockReq({ params: { token: 'expiredtoken123' }, body: validBody });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });
});

// ── 2. Inbox GET — parent ownership enforcement ───────────────────────────────

describe('GET /api/parent/players/:playerId/coach-requests — ownership enforcement', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns 404 when the player does not belong to the authenticated user', async () => {
    // Mock requireParentAccess to return a user with a different userId
    vi.doMock('@/server/auth-policy.js', () => ({
      requireParentAccess: async (_req: Request, _res: Response) => ({ id: 'user-A', isAdmin: false }),
      setPrivateCacheHeaders: () => {},
    }));
    vi.doMock('#airo/secrets', () => ({ getSecret: (k: string) => k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : undefined }));
    vi.doMock('@/server/db/client.js', () => ({
      db: {
        execute: async () => {
          // Simulate: player exists but belongs to user-B, not user-A
          // The query is: SELECT id FROM sc_player_profiles WHERE id = ? AND user_id = ? AND deleted_at IS NULL
          // With user-A querying for player-B's player, returns empty
          return [[]] as unknown;
        },
      },
    }));
    const { default: handler } = await import(
      '../../../../../../server/api/parent/players/[playerId]/coach-requests/GET'
    );
    const req = mockReq({ params: { playerId: 'player-owned-by-user-B' } });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
    const body = res._body() as { error?: string };
    expect(body.error).toBe('Player not found');
  });
});

// ── 3. PATCH unknown-column diagnosis ────────────────────────────────────────

describe('PATCH /api/parent/players/:playerId — v4 column probe', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 503 MIGRATION_REQUIRED with missingColumns when v4 columns are absent', async () => {
    // Mock requireParentAccess to return a valid user
    vi.doMock('@/server/auth-policy.js', () => ({
      requireParentAccess: async (_req: Request, _res: Response) => ({ id: 'user-1', isAdmin: false }),
      setPrivateCacheHeaders: () => {},
    }));
    vi.doMock('#airo/secrets', () => ({ getSecret: () => undefined }));

    // Mock db.execute to simulate missing columns:
    // - SHOW COLUMNS for gpa returns empty (column absent)
    // - All other SHOW COLUMNS also return empty
    vi.doMock('@/server/db/client.js', () => ({
      db: {
        execute: async (query: unknown) => {
          const q = String(query);
          // Ownership check: SELECT id FROM sc_player_profiles WHERE id = ? AND user_id = ?
          if (q.includes('sc_player_profiles') && q.includes('SELECT')) {
            return [[ { id: 'player-1' } ]] as unknown;
          }
          // SHOW COLUMNS probe — return empty to simulate missing columns
          if (q.includes('SHOW COLUMNS')) {
            return [[]] as unknown;
          }
          return [[]] as unknown;
        },
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'player-1', userId: 'user-1', deletedAt: null }],
            }),
          }),
        }),
      },
    }));

    const { default: handler } = await import(
      '../../../../../../server/api/parent/players/[playerId]/PATCH'
    );
    const req = mockReq({
      params: { playerId: 'player-1' },
      body: {
        gpa: '3.85',
        gpaScale: '4.0',
        gpaWeighted: 'unweighted',
        intendedMajor: 'Exercise Science',
        collegeGoals: 'Play D1 soccer',
        contactEmail: 'parent@example.com',
      },
    });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(503);
    const body = res._body() as { error?: string; missingColumns?: string[] };
    expect(body.error).toBe('MIGRATION_REQUIRED');
    expect(Array.isArray(body.missingColumns)).toBe(true);
    expect(body.missingColumns!.length).toBeGreaterThan(0);
  });
});

// ── 4. Media proxy — token/assignment validation ──────────────────────────────
// See coach-media-proxy.test.ts — uses static imports + hoisted vi.mock,
// which is required because @/server/lib/private-uploads.js must be in the
// vitest.config.ts alias table (added alongside this note) for Vite's
// import-analysis plugin to resolve it before any mock factory runs.

