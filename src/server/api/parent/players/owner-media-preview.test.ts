import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const state = vi.hoisted(() => ({ signedIn: true, rows: [] as Record<string, unknown>[], found: true, query: undefined as unknown, stream: vi.fn(), resolve: vi.fn() }));
vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(async (_req: Request, res: Response) => {
    if (!state.signedIn) { res.status(401).end(); return null; }
    return { id: 'owner' };
  }), setPrivateCacheHeaders: vi.fn(),
}));
vi.mock('@/server/db/client.js', () => ({ db: { execute: vi.fn(async (query) => { state.query = query; return [state.rows]; }) } }));
vi.mock('@/server/lib/private-uploads.js', () => ({
  resolveUploadPath: (path: string) => { state.resolve(path); return { found: state.found, path: '/private/uploads/parent-media/owner/video.mp4' }; },
  streamFile: state.stream,
}));
import handler from './[playerId]/media-preview/[assignmentId]/GET';
function response() {
  return { code: 200, status(code: number) { this.code = code; return this; }, end: vi.fn(), setHeader: vi.fn() };
}
const req = { params: { playerId: 'player', assignmentId: 'assignment' }, headers: {} } as unknown as Request;
beforeEach(() => {
  vi.clearAllMocks(); state.signedIn = true; state.found = true;
  state.rows = [{ storage_path: 'parent-media/owner/video.mp4', media_type: 'video', deleted_at: null }];
});
describe('owner media preview', () => {
  it('resolves private storage and delegates range handling without caching', async () => {
    const res = response(); await handler(req, res as unknown as Response);
    expect(state.resolve).toHaveBeenCalledWith('parent-media/owner/video.mp4');
    expect(state.stream).toHaveBeenCalledWith('/private/uploads/parent-media/owner/video.mp4', res, { isVideo: true, noStore: true });
    const query = new MySqlDialect().sqlToQuery(state.query as Parameters<MySqlDialect['sqlToQuery']>[0]);
    expect(query.sql).toContain('p.user_id = a.user_id');
    expect(query.sql).toContain('m.user_id = a.user_id');
    expect(query.params).toContain('owner');
  });
  it('rejects unauthenticated access', async () => {
    state.signedIn = false; const res = response(); await handler(req, res as unknown as Response);
    expect(res.code).toBe(401); expect(state.stream).not.toHaveBeenCalled();
  });
  it.each(['missing assignment', 'deleted', 'not video', 'missing file'])('rejects %s', async reason => {
    if (reason === 'missing assignment') state.rows = [];
    if (reason === 'deleted') state.rows[0].deleted_at = '2026-10-29';
    if (reason === 'not video') state.rows[0].media_type = 'image';
    if (reason === 'missing file') state.found = false;
    const res = response(); await handler(req, res as unknown as Response);
    expect(res.code).toBe(404); expect(state.stream).not.toHaveBeenCalled();
  });
});
