import { it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const execute = vi.hoisted(() => vi.fn());
vi.mock('@/server/db/client.js', () => ({ db: { execute } }));
vi.mock('@/server/auth-policy.js', () => ({ requireParentAccess: vi.fn(async () => ({ id: 'owner' })) }));
import handler from './[playerId]/match-records/POST';
it('persists an explicit did-not-play value instead of silently dropping it', async () => {
  execute.mockResolvedValueOnce([[{ id: 'p1' }]]).mockResolvedValueOnce([{}]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ params: { playerId: 'p1' }, body: { match_date: '2026-10-29', opponent: 'Test', participated: false } } as unknown as Request, res as unknown as Response);
  expect(res.status).toHaveBeenCalledWith(201);
  const query = new MySqlDialect().sqlToQuery(execute.mock.calls[1][0]);
  expect(query.sql).toContain('participated');
  expect(query.params).toContain(false);
});
