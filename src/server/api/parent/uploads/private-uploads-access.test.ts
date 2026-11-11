/**
 * private-uploads-access.test.ts
 *
 * Access-control tests for the private-uploads delivery routes.
 *
 * Routes under test:
 *   GET /api/parent/uploads/player-photo/:playerId  — owner access, wrong-parent rejection
 *   GET /api/parent/uploads/media/:mediaId          — owner access, wrong-parent rejection, video seeking
 *   GET /api/coach/photo/:token/:playerId           — approved coach access, expiry, revocation
 *   GET /api/coach/media/:token/:assignmentId       — approved coach access, expiry, revocation
 *
 * All filesystem and DB calls are mocked. No real files are read.
 * No real DB connections are made.
 *
 * Uses static imports + hoisted vi.mock (required for Vite import-analysis).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock('@/server/lib/private-uploads.js', () => ({
  PRIVATE_ROOT: '/private/uploads',
  LEGACY_ROOT:  '/shared-storage/public/assets/uploads',
  resolveUploadPath: vi.fn((_p: string) => ({ path: '/private/uploads/test.mp4', legacy: false, found: true })),
  migrateToPrivate:  vi.fn(async (_p: string) => '/private/uploads/test.mp4'),
  streamFile:        vi.fn((_p: string, res: Response) => { (res as unknown as MockRes)._streamed = true; }),
  mimeForPath:       vi.fn(() => 'video/mp4'),
  isVideoMime:       vi.fn((m: string) => m.startsWith('video/')),
}));

vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(),
  requireAdmin:        vi.fn(),
  setPrivateCacheHeaders: vi.fn(),
}));

vi.mock('@/server/db/client.js', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn(),
}));

vi.mock('@/server/lib/coach-link-store.js', () => ({
  getCoachLinkStore: vi.fn(),
}));

vi.mock('@/server/lib/redact-coach-token.js', () => ({
  redactCoachToken: vi.fn((u: string) => u),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: actual,
    existsSync: vi.fn(() => true),
    statSync:   vi.fn(() => ({ size: 1024 })),
    createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
  };
});

// ── Static handler imports (after mocks) ─────────────────────────────────────

import photoHandler  from './player-photo/[playerId]/GET';
import mediaHandler  from './media/[mediaId]/GET';
import coachPhotoHandler from '../../../api/coach/photo/[token]/[playerId]/GET';
import coachMediaHandler from '../../../api/coach/media/[token]/[assignmentId]/GET';

// ── Mock imports for control ──────────────────────────────────────────────────

import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { getSecret } from '#airo/secrets';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { resolveUploadPath, streamFile } from '@/server/lib/private-uploads.js';

const mockRequireParentAccess = vi.mocked(requireParentAccess);
const mockSetPrivateCacheHeaders = vi.mocked(setPrivateCacheHeaders);
const mockDbExecute = vi.mocked(db.execute);
const mockGetSecret = vi.mocked(getSecret);
const mockGetCoachLinkStore = vi.mocked(getCoachLinkStore);
const mockResolveUploadPath = vi.mocked(resolveUploadPath);
const mockStreamFile = vi.mocked(streamFile);

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MockRes {
  _statusCode: number;
  _body: unknown;
  _headers: Record<string, string>;
  _streamed: boolean;
  status(code: number): MockRes;
  json(data: unknown): MockRes;
  end(): MockRes;
  setHeader(k: string, v: string): MockRes;
  getHeader(k: string): string;
  writeHead(code: number, hdrs: Record<string, unknown>): MockRes;
  req: { headers: Record<string, string> };
}

function mockRes(rangeHeader?: string): MockRes & Response {
  const r: MockRes = {
    _statusCode: 200,
    _body: undefined,
    _headers: {},
    _streamed: false,
    status(code) { this._statusCode = code; return this; },
    json(data)   { this._body = data; return this; },
    end()        { return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    getHeader(k)    { return this._headers[k]; },
    writeHead(_code, _hdrs) { return this; },
    req: { headers: rangeHeader ? { range: rangeHeader } : {} },
  };
  return r as unknown as MockRes & Response;
}

function mockReq(params: Record<string, string> = {}, headers: Record<string, string> = {}): Request {
  return { params, headers, body: {}, method: 'GET', url: '/test' } as unknown as Request;
}

function makeLink(overrides: Partial<{
  playerId: string; userId: string; revokedAt: Date | null;
  expiresAt: Date | null; selectedMedia: string[]; demoMode: boolean;
  approvedFields: string[];
}> = {}) {
  return {
    id: 'link-1',
    playerId: 'player-1',
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    selectedMedia: ['assign-1'],
    demoMode: false,
    approvedFields: ['photo', 'stats', 'media'],
    ...overrides,
  };
}

// ── Reset mocks before each test ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSetPrivateCacheHeaders.mockImplementation(() => {});
  mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/test.mp4', legacy: false, found: true });
  mockStreamFile.mockImplementation((_p, res) => { (res as unknown as MockRes)._streamed = true; });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Player photo — owner access
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/parent/uploads/player-photo/:playerId — owner access', () => {
  it('returns 401 when session is absent', async () => {
    mockRequireParentAccess.mockImplementation(async (_req, res) => {
      (res as unknown as MockRes)._statusCode = 401;
      return null;
    });
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._statusCode).toBe(401);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when player does not exist', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    // DB returns empty rows — player not found
    mockDbExecute.mockResolvedValue([[]] as never);
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when player belongs to a different user (wrong-parent rejection)', async () => {
    // Authenticated as user-2, but DB returns empty (ownership check fails)
    mockRequireParentAccess.mockResolvedValue({ id: 'user-2' } as never);
    mockDbExecute.mockResolvedValue([[]] as never);
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when avatar_url is null', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ avatar_url: null }]] as never);
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('streams the file when owner requests their own player photo (new route URL)', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ avatar_url: '/api/parent/uploads/player-photo/player-1' }]] as never);
    // resolveUploadPath returns a private path (legacy=false) — existsSync on that path returns true (mocked)
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/player-photos/user-1/player-1.jpg', legacy: false, found: true });
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._streamed).toBe(true);
  });

  it('streams the file when owner requests their own player photo (legacy URL)', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ avatar_url: '/airo-assets/uploads/player-photos/user-1/player-1.jpg' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/player-photos/user-1/player-1.jpg', legacy: false, found: true });
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._streamed).toBe(true);
  });

  it('migrates legacy file on first access and streams from private path', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ avatar_url: '/airo-assets/uploads/player-photos/user-1/player-1.jpg' }]] as never);
    // resolveUploadPath returns legacy=true (file is in old location)
    mockResolveUploadPath.mockReturnValue({ path: '/shared-storage/public/assets/uploads/player-photos/user-1/player-1.jpg', legacy: true, found: true });
    const { migrateToPrivate } = await import('@/server/lib/private-uploads.js');
    vi.mocked(migrateToPrivate).mockResolvedValue('/private/uploads/player-photos/user-1/player-1.jpg');
    // DB update for migration
    mockDbExecute.mockResolvedValueOnce([[{ avatar_url: '/airo-assets/uploads/player-photos/user-1/player-1.jpg' }]] as never)
                 .mockResolvedValueOnce([] as never); // UPDATE
    const req = mockReq({ playerId: 'player-1' });
    const res = mockRes();
    await photoHandler(req, res);
    expect(res._streamed).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Parent media — owner access, wrong-parent rejection, video seeking
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/parent/uploads/media/:mediaId — owner access', () => {
  it('returns 401 when session is absent', async () => {
    mockRequireParentAccess.mockImplementation(async (_req, res) => {
      (res as unknown as MockRes)._statusCode = 401;
      return null;
    });
    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes();
    await mediaHandler(req, res);
    expect(res._statusCode).toBe(401);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when media record does not exist', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[]] as never);
    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes();
    await mediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when media belongs to a different user (wrong-parent rejection)', async () => {
    // Authenticated as user-2, DB returns empty (ownership check in WHERE clause)
    mockRequireParentAccess.mockResolvedValue({ id: 'user-2' } as never);
    mockDbExecute.mockResolvedValue([[]] as never);
    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes();
    await mediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('streams the file when owner requests their own media', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ storage_path: 'parent-media/user-1/abc.mp4', mime_type: 'video/mp4' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/abc.mp4', legacy: false, found: true });
    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes();
    await mediaHandler(req, res);
    expect(res._streamed).toBe(true);
  });

  it('passes isVideo=true for video MIME types (enables range support)', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ storage_path: 'parent-media/user-1/abc.mp4', mime_type: 'video/mp4' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/abc.mp4', legacy: false, found: true });

    let capturedOpts: { isVideo?: boolean } = {};
    mockStreamFile.mockImplementation((_p, res, opts) => {
      capturedOpts = opts ?? {};
      (res as unknown as MockRes)._streamed = true;
    });

    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes('bytes=0-1023');
    await mediaHandler(req, res);
    expect(res._streamed).toBe(true);
    expect(capturedOpts.isVideo).toBe(true);
  });

  it('passes isVideo=false for image MIME types', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ storage_path: 'parent-media/user-1/photo.jpg', mime_type: 'image/jpeg' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/photo.jpg', legacy: false, found: true });

    let capturedOpts: { isVideo?: boolean } = {};
    mockStreamFile.mockImplementation((_p, res, opts) => {
      capturedOpts = opts ?? {};
      (res as unknown as MockRes)._streamed = true;
    });

    const req = mockReq({ mediaId: 'media-1' });
    const res = mockRes();
    await mediaHandler(req, res);
    expect(res._streamed).toBe(true);
    expect(capturedOpts.isVideo).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Coach photo proxy — token-gated access
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/coach/photo/:token/:playerId — coach access control', () => {
  function setupCoachPhotoStore(link: ReturnType<typeof makeLink> | null) {
    mockGetSecret.mockImplementation((k: string) =>
      k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : null
    );
    mockGetCoachLinkStore.mockReturnValue({
      findByToken: vi.fn().mockResolvedValue(link),
    } as never);
  }

  it('returns 404 when feature flag is disabled', async () => {
    mockGetSecret.mockReturnValue(null);
    const req = mockReq({ token: 'validtoken1234', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 for an expired link', async () => {
    setupCoachPhotoStore(makeLink({ expiresAt: new Date('2020-01-01') }));
    const req = mockReq({ token: 'expiredtoken12', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 for a revoked link', async () => {
    setupCoachPhotoStore(makeLink({ revokedAt: new Date() }));
    const req = mockReq({ token: 'revokedtoken12', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when playerId in URL does not match link.playerId', async () => {
    setupCoachPhotoStore(makeLink({ playerId: 'player-1' }));
    const req = mockReq({ token: 'validtoken1234', playerId: 'different-player' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when photo is not in approvedFields', async () => {
    setupCoachPhotoStore(makeLink({ approvedFields: ['stats'] })); // no 'photo'
    mockDbExecute.mockResolvedValue([[{ avatar_url: '/api/parent/uploads/player-photo/player-1' }]] as never);
    const req = mockReq({ token: 'validtoken1234', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when avatar_url is null', async () => {
    setupCoachPhotoStore(makeLink());
    mockDbExecute.mockResolvedValue([[{ avatar_url: null }]] as never);
    const req = mockReq({ token: 'validtoken1234', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('streams the photo when link is valid, photo is approved, and file exists (legacy URL)', async () => {
    setupCoachPhotoStore(makeLink());
    mockDbExecute.mockResolvedValue([[{ avatar_url: '/airo-assets/uploads/player-photos/user-1/player-1.jpg' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/player-photos/user-1/player-1.jpg', legacy: false, found: true });
    const req = mockReq({ token: 'validtoken1234', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._streamed).toBe(true);
  });

  it('returns 404 for an external avatar_url (not proxied)', async () => {
    setupCoachPhotoStore(makeLink());
    mockDbExecute.mockResolvedValue([[{ avatar_url: 'https://external.example.com/photo.jpg' }]] as never);
    const req = mockReq({ token: 'validtoken1234', playerId: 'player-1' });
    const res = mockRes();
    await coachPhotoHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Coach media proxy — token-gated access, expiry, revocation, video seeking
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/coach/media/:token/:assignmentId — coach access control', () => {
  function setupCoachMediaStore(link: ReturnType<typeof makeLink> | null) {
    mockGetSecret.mockImplementation((k: string) =>
      k === 'COACH_PROFILE_LINKS_ENABLED' ? 'true' : null
    );
    mockGetCoachLinkStore.mockReturnValue({
      findByToken: vi.fn().mockResolvedValue(link),
    } as never);
  }

  function setupMediaRow(overrides: Partial<{ storage_path: string; media_type: string; deleted_at: string | null }> = {}) {
    mockDbExecute.mockResolvedValue([[{
      storage_path: 'parent-media/user-1/video.mp4',
      media_type: 'video',
      deleted_at: null,
      ...overrides,
    }]] as never);
  }

  it('returns 404 when feature flag is disabled', async () => {
    mockGetSecret.mockReturnValue(null);
    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 for an expired link', async () => {
    setupCoachMediaStore(makeLink({ expiresAt: new Date('2020-01-01') }));
    const req = mockReq({ token: 'expiredtoken12', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 for a revoked link', async () => {
    setupCoachMediaStore(makeLink({ revokedAt: new Date() }));
    const req = mockReq({ token: 'revokedtoken12', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when assignmentId is not in selectedMedia', async () => {
    setupCoachMediaStore(makeLink({ selectedMedia: ['other-assign'] }));
    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 for demo-mode links (never serve real media)', async () => {
    setupCoachMediaStore(makeLink({ demoMode: true }));
    const req = mockReq({ token: 'demotoken12345', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when media row is deleted', async () => {
    setupCoachMediaStore(makeLink());
    setupMediaRow({ deleted_at: '2026-01-01T00:00:00Z' });
    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('returns 404 when media_type is not video', async () => {
    setupCoachMediaStore(makeLink());
    setupMediaRow({ media_type: 'image' });
    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._streamed).toBe(false);
  });

  it('streams the video when link is valid and assignment is approved', async () => {
    setupCoachMediaStore(makeLink());
    setupMediaRow();
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/video.mp4', legacy: false, found: true });
    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(res._streamed).toBe(true);
  });

  it('resolves the private path before streaming (not the legacy public path)', async () => {
    setupCoachMediaStore(makeLink());
    setupMediaRow();
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/video.mp4', legacy: false, found: true });

    let capturedPath = '';
    mockStreamFile.mockImplementation((p, res) => {
      capturedPath = p;
      (res as unknown as MockRes)._streamed = true;
    });

    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    expect(capturedPath).toBe('/private/uploads/parent-media/user-1/video.mp4');
    expect(capturedPath).not.toContain('/shared-storage/');
  });

  it('falls back to legacy path when private file is absent', async () => {
    setupCoachMediaStore(makeLink());
    setupMediaRow();
    // resolveUploadPath returns the legacy path when private file is absent
    mockResolveUploadPath.mockReturnValue({
      path: '/shared-storage/public/assets/uploads/parent-media/user-1/video.mp4',
      legacy: true,
      found: true,
    });

    let capturedPath = '';
    mockStreamFile.mockImplementation((p, res) => {
      capturedPath = p;
      (res as unknown as MockRes)._streamed = true;
    });

    const req = mockReq({ token: 'validtoken1234', assignmentId: 'assign-1' });
    const res = mockRes();
    await coachMediaHandler(req, res);
    // Handler streams from whatever path resolveUploadPath returns
    expect(res._streamed).toBe(true);
    expect(capturedPath).toContain('parent-media/user-1/video.mp4');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. streamFile — range request support (unit test of the helper)
//
// streamFile is mocked in this file (required for handler tests). Range
// behaviour is verified by inspecting the opts passed to the mock: the
// handlers must pass isVideo=true for video MIME types, which is the
// precondition for range support. The real streamFile range logic is
// exercised in private-uploads-stream.test.ts (separate file, no mock).
// ═════════════════════════════════════════════════════════════════════════════

describe('streamFile opts — isVideo flag passed correctly by handlers', () => {
  it('media handler passes isVideo=true for video/mp4', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ storage_path: 'parent-media/user-1/v.mp4', mime_type: 'video/mp4' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/v.mp4', legacy: false, found: true });

    let capturedOpts: { isVideo?: boolean } | undefined;
    mockStreamFile.mockImplementation((_p, res, opts) => {
      capturedOpts = opts;
      (res as unknown as MockRes)._streamed = true;
    });

    await mediaHandler(mockReq({ mediaId: 'media-1' }), mockRes('bytes=0-1023'));
    expect(capturedOpts?.isVideo).toBe(true);
  });

  it('media handler passes isVideo=false for image/jpeg', async () => {
    mockRequireParentAccess.mockResolvedValue({ id: 'user-1' } as never);
    mockDbExecute.mockResolvedValue([[{ storage_path: 'parent-media/user-1/p.jpg', mime_type: 'image/jpeg' }]] as never);
    mockResolveUploadPath.mockReturnValue({ path: '/private/uploads/parent-media/user-1/p.jpg', legacy: false, found: true });

    let capturedOpts: { isVideo?: boolean } | undefined;
    mockStreamFile.mockImplementation((_p, res, opts) => {
      capturedOpts = opts;
      (res as unknown as MockRes)._streamed = true;
    });

    await mediaHandler(mockReq({ mediaId: 'media-1' }), mockRes());
    expect(capturedOpts?.isVideo).toBe(false);
  });
});
