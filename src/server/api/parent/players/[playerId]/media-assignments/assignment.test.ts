import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const mock = vi.hoisted(() => ({ execute: vi.fn(), txExecute: vi.fn(), transaction: vi.fn() }));
vi.mock('@/server/auth-policy.js', () => ({ requireParentAccess: async () => ({ id: 'owner' }), setPrivateCacheHeaders: vi.fn() }));
vi.mock('@/server/db/client.js', () => ({ db: { execute: mock.execute, transaction: mock.transaction } }));
import handler from './POST';
import detachHandler from './[assignmentId]/DELETE';
const dialect = new MySqlDialect();
function response() {
 const res = { statusCode: 200, body: {} as any, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
 return res;
}
async function run(body = { mediaId: 'media', gameEventRef: 'game' }) {
 const res = response();
 await handler({ params: { playerId: 'player' }, body } as unknown as Request, res as unknown as Response);
 return res;
}
beforeEach(() => {
 vi.clearAllMocks();
 mock.execute.mockReset().mockResolvedValueOnce([[{ id: 'player' }]]).mockResolvedValueOnce([[{ id: 'media', media_type: 'video' }]]).mockResolvedValue([[{ id: 'game' }]]);
 mock.txExecute.mockReset().mockResolvedValue([]).mockResolvedValueOnce([]).mockResolvedValueOnce([[{ id: 'existing', game_event_ref: null }]]);
 mock.transaction.mockImplementation(async (callback: any) => callback({ execute: mock.txExecute }));
});
describe('game media assignment handlers', () => {
 it('attaches an existing untagged assignment and preserves its ID', async () => {
   const res = await run();
   expect(res.statusCode).toBe(200); expect(res.body.id).toBe('existing');
   const update = dialect.sqlToQuery(mock.txExecute.mock.calls[2][0]);
   expect(update.sql).toContain('SET game_event_ref = ?');
   expect(update.params).toEqual(['game', 'existing', 'owner', 'player']);
 });
 it('uses the actual media type rather than treating video as a photo', async () => {
   await run();
   const insert = dialect.sqlToQuery(mock.txExecute.mock.calls[0][0]);
   expect(insert.params).toContain('video'); expect(insert.params).not.toContain('photo');
 });
 it('same-game retries are idempotent', async () => {
   mock.txExecute.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([[{ id: 'existing', game_event_ref: 'game' }]]);
   expect((await run()).statusCode).toBe(200); expect(mock.txExecute).toHaveBeenCalledTimes(2);
 });
 it('reports a different-game conflict without silently claiming success', async () => {
   mock.txExecute.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([[{ id: 'existing', game_event_ref: 'other' }]]);
   const res = await run(); expect(res.statusCode).toBe(409); expect(res.body.code).toBe('MEDIA_ATTACHED_TO_OTHER_GAME');
   expect(mock.txExecute).toHaveBeenCalledTimes(2);
 });
 it('does not write when the requested game cannot be found', async () => {
   mock.execute.mockReset().mockResolvedValueOnce([[{ id: 'player' }]]).mockResolvedValueOnce([[{ id: 'media', media_type: 'video' }]]).mockResolvedValue([[]]);
   expect((await run()).statusCode).toBe(404); expect(mock.transaction).not.toHaveBeenCalled();
 });
 it('does not write for a missing or unauthorized player', async () => {
   mock.execute.mockReset().mockResolvedValue([[]]);
   expect((await run()).statusCode).toBe(404); expect(mock.transaction).not.toHaveBeenCalled();
 });
 it('surfaces transaction failure without a success response', async () => {
   mock.transaction.mockRejectedValueOnce(new Error('database failure'));
   expect((await run()).statusCode).toBe(500);
 });
 it('detaches only the game reference, preserving the player library assignment', async () => {
   mock.execute.mockReset().mockResolvedValue([[{ id: 'existing' }]]);
   const res = response();
   await detachHandler({ params: { playerId: 'player', assignmentId: 'existing' }, query: { detachGame: 'true' } } as unknown as Request, res as unknown as Response);
   expect(res.statusCode).toBe(200);
   const queries = mock.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q).sql).join('\n');
   expect(queries).toContain('SET game_event_ref = NULL'); expect(queries).not.toContain('DELETE FROM');
 });
});
