/**
 * coach-media-proxy.test.ts
 *
 * Unit tests for GET /api/coach/media/:token/:assignmentId
 *
 * Tests that the media proxy correctly rejects:
 * - Disabled feature flag
 * - Expired links
 * - Revoked links
 * - Assignment IDs not in selectedMedia
 * - Demo-mode links
 *
 * Uses static imports + hoisted vi.mock so Vite's import analysis
 * resolves all dependencies before any test runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Hoisted mocks — must be declared before any imports that use them ─────────

// private-uploads: prevent filesystem access during tests
vi.mock('@/server/lib/private-uploads.js', () => ({
  resolveUploadPath: (_p: string) => ({ path: '/private/uploads/test.mp4', legacy: false, found: true }),
  streamFile: (_p: string, res: { status: (n: number) => { end: () => void } }) => { res.status(404).end(); },
  PRIVATE_ROOT: '/private/uploads',
  isVideoMime: (m: string) => m.startsWith('video/'),
  mimeForPath: () => 'video/mp4',
}));

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockFeatureEnabled = false;
let mockLinkRecord: Record<string, unknown> | null = null;

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn((key: string) => {
    if (key === 'COACH_PROFILE_LINKS_ENABLED') return mockFeatureEnabled ? 'true' : undefined;
    return undefined;
  }),
}));

vi.mock('@/server/lib/coach-link-store.js', () => ({
  getCoachLinkStore: vi.fn(() => ({
    findByToken: async () => mockLinkRecord,
  })),
}));

vi.mock('@/server/lib/redact-coach-token.js', () => ({
  redactCoachToken: (u: string) => u,
}));

vi.mock('@/server/db/client.js', () => ({
  db: {
    execute: async () => [[]] as unknown,
  },
}));

// ── Static import of handler ──────────────────────────────────────────────────

import handler from '../../../../../../server/api/coach/media/[token]/[assignmentId]/GET';

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
    req: { headers: {} },
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/coach/media/:token/:assignmentId — access control', () => {
  beforeEach(() => {
    mockFeatureEnabled = false;
    mockLinkRecord = null;
  });

  it('returns 404 when COACH_PROFILE_LINKS_ENABLED is not true', async () => {
    mockFeatureEnabled = false;
    const req = mockReq({ params: { token: 'tok', assignmentId: 'a1' }, headers: {} });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 for an expired link', async () => {
    mockFeatureEnabled = true;
    mockLinkRecord = {
      id: 'link-1', playerId: 'p1', userId: 'u1',
      revokedAt: null,
      expiresAt: new Date('2020-01-01'), // past
      selectedMedia: ['a1'],
      demoMode: false,
    };
    const req = mockReq({ params: { token: 'expiredtoken12', assignmentId: 'a1' }, headers: {} });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 for a revoked link', async () => {
    mockFeatureEnabled = true;
    mockLinkRecord = {
      id: 'link-2', playerId: 'p1', userId: 'u1',
      revokedAt: new Date(), // revoked
      expiresAt: new Date(Date.now() + 86_400_000),
      selectedMedia: ['a1'],
      demoMode: false,
    };
    const req = mockReq({ params: { token: 'revokedtoken12', assignmentId: 'a1' }, headers: {} });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 when assignmentId is not in selectedMedia', async () => {
    mockFeatureEnabled = true;
    mockLinkRecord = {
      id: 'link-3', playerId: 'p1', userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      selectedMedia: ['approved-assignment-id'],
      demoMode: false,
    };
    const req = mockReq({ params: { token: 'validtoken1234', assignmentId: 'not-in-selected-media' }, headers: {} });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });

  it('returns 404 for demo-mode links (never serve real media)', async () => {
    mockFeatureEnabled = true;
    mockLinkRecord = {
      id: 'link-4', playerId: 'demo-player', userId: 'demo-user',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      selectedMedia: ['a1'],
      demoMode: true, // demo link — must not serve real files
    };
    const req = mockReq({ params: { token: 'demotoken12345', assignmentId: 'a1' }, headers: {} });
    const res = mockRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status()).toBe(404);
  });
});
