/**
 * src/server/api/parent/players/POST.test.ts
 *
 * Regression tests for POST /api/parent/players
 *
 * Focus areas:
 *   1. Player limit counts only active (non-deleted) players for the
 *      authenticated user. Deleted players (deletedAt IS NOT NULL) must not
 *      consume a slot.
 *   2. 10 active players enforces the limit — the 11th POST returns 400.
 *   3. A user with 9 active players (plus any number of deleted ones) can
 *      still create a new player.
 *   4. A user at exactly 10 active players cannot create another.
 *
 * LABEL: automated handler tests
 * Live authenticated verification against the deployed app remains pending
 * (requires a real authenticated session and a running server).
 *
 * Mocking strategy:
 *   - auth-policy: vi.mock controls which PolicyUser is returned.
 *   - @/server/db/client: vi.mock returns a Drizzle stub whose count()
 *     result is controlled per test via mockActiveCount.
 *   - The stub also intercepts db.execute() (SHOW COLUMNS probes) and
 *     db.insert() so the handler can complete without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { PolicyUser } from '../../../../server/auth-policy';
import { MySqlDialect } from 'drizzle-orm/mysql-core';

const dialect = new MySqlDialect();

/**
 * Render a Drizzle SQL object to a plain SQL string for assertion.
 * Uses MySqlDialect.sqlToQuery() — the same path the mysql2 driver uses.
 */
function renderSql(sqlArg: unknown): string {
  if (!sqlArg || typeof sqlArg !== 'object') return '';
  try {
    return dialect.sqlToQuery(sqlArg as Parameters<typeof dialect.sqlToQuery>[0]).sql;
  } catch {
    return '';
  }
}

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockUser: PolicyUser | null = null;
/** Number the count() query returns — represents active (non-deleted) players. */
let mockActiveCount = 0;
/**
 * Captures the WHERE argument passed to the count query so tests can assert
 * that isNull(deletedAt) is included — not just that the mocked count is used.
 */
let lastWhereArg: unknown = undefined;

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/server/auth-policy.js', () => ({
  requireParentAccess: vi.fn(async (_req: Request, res: Response) => {
    if (!mockUser) { res.status(401).json({}); return null; }
    return mockUser;
  }),
  setPrivateCacheHeaders: vi.fn(),
}));

vi.mock('#airo/secrets', () => ({ getSecret: vi.fn(() => undefined) }));

// Drizzle stub:
//   db.select().from().where() → count result (mockActiveCount); captures WHERE arg
//   db.execute()               → SHOW COLUMNS probes (always return empty → columns absent)
//                                + INSERT (returns success)
//
// The handler no longer calls db.insert() — it uses db.execute() for the INSERT.
// db.insert() is kept in the mock so any accidental call throws a clear error.
vi.mock('@/server/db/client.js', () => ({
  db: {
    execute: vi.fn(async () => [[/* empty — column probes return "absent"; INSERT succeeds */]]),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((whereArg: unknown) => {
          lastWhereArg = whereArg;
          return Promise.resolve([{ value: mockActiveCount }]);
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => {
        throw new Error('db.insert() should not be called — handler uses db.execute() for INSERT');
      }),
    })),
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/parent/players — player limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1', isAdmin: false } as PolicyUser;
    mockActiveCount = 0;
    lastWhereArg = undefined;
  });

  function makeReqRes(body: Record<string, unknown> = { label: 'Test Player' }) {
    const req = { body, params: {} } as unknown as Request;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status, json, setHeader: vi.fn() } as unknown as Response;
    return { req, res, json, status };
  }

  it('allows creation when the user has 0 active players', async () => {
    mockActiveCount = 0;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    // Should not have called status(400)
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('allows creation when the user has 9 active players', async () => {
    mockActiveCount = 9;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('blocks creation when the user has exactly 10 active players', async () => {
    mockActiveCount = 10;
    const { req, res, status, json } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    // Error message must mention the limit
    const errorArg = json.mock.calls[0]?.[0] as { error?: string } | undefined;
    expect(errorArg?.error).toMatch(/10/);
  });

  it('blocks creation when the user has 11 active players (over limit)', async () => {
    mockActiveCount = 11;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('deleted players do not consume a slot — 9 active + any deleted still allows creation', async () => {
    // The count query already filters deletedAt IS NULL server-side.
    // This test verifies that mockActiveCount=9 (representing 9 active rows
    // regardless of how many deleted rows exist) still allows creation.
    // If the handler were counting all rows (including deleted), a user with
    // 9 active + 1 deleted would incorrectly hit the limit.
    mockActiveCount = 9; // 9 active; deleted rows are excluded by the WHERE clause
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('deleted players do not consume a slot — 10 deleted + 0 active allows creation', async () => {
    // 10 deleted players exist but the count returns 0 active → creation allowed.
    mockActiveCount = 0;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  /**
   * WHERE clause structure test — verifies the count query actually passes
   * isNull(deletedAt) to the WHERE clause, not just that the mock returns a
   * count.
   *
   * Drizzle SQL objects are circular (MySqlTable back-references), so we cannot
   * use JSON.stringify. Instead we walk the `queryChunks` array recursively and
   * collect all string values, then assert that both the userId column name and
   * the deletedAt IS NULL condition appear.
   */
  it('count query WHERE clause includes isNull(deletedAt) — not just userId equality', async () => {
    mockActiveCount = 0;
    const { req, res } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);

    expect(lastWhereArg).toBeDefined();

    // Recursively collect all string values from the Drizzle SQL object tree,
    // skipping circular references via a visited Set.
    function collectStrings(node: unknown, visited = new Set<object>()): string[] {
      if (node === null || node === undefined) return [];
      if (typeof node === 'string') return [node];
      if (typeof node !== 'object') return [String(node)];
      if (visited.has(node as object)) return [];
      visited.add(node as object);
      const results: string[] = [];
      for (const val of Object.values(node as Record<string, unknown>)) {
        results.push(...collectStrings(val, visited));
      }
      return results;
    }

    const strings = collectStrings(lastWhereArg);
    const combined = strings.join(' ').toLowerCase();

    // Must reference the userId column
    expect(combined).toMatch(/user_id|userid/);
    // Must reference the deletedAt / deleted_at column
    expect(combined).toMatch(/deleted_at|deletedat/);
    // The IS NULL operator in Drizzle is encoded as 'is null' in the SQL chunk
    expect(combined).toMatch(/is null|isnull/);
  });

  it('returns 401 when not authenticated', async () => {
    mockUser = null;
    const { req, res, status } = makeReqRes();
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('successful creation returns 201 with an id', async () => {
    mockActiveCount = 0;
    const { req, res, status } = makeReqRes({ label: 'Alex Morgan' });
    const { default: handler } = await import('./POST.js');
    await handler(req, res);
    // Should not be a 400 or 401
    expect(status).not.toHaveBeenCalledWith(400);
    expect(status).not.toHaveBeenCalledWith(401);
    // The handler calls res.status(201).json({ id }) — check the status call
    const statusArg = status.mock.calls.find((c: unknown[]) => c[0] === 201);
    expect(statusArg).toBeDefined();
  });

  /**
   * Regression: v4 columns absent from DB — INSERT must not reference them.
   *
   * Before the fix, Drizzle included all schema columns (including v4) in the
   * INSERT column list even when the values object omitted them, causing MySQL
   * to return ER_BAD_FIELD_ERROR (Unknown column 'gpa' in 'field list') and the
   * wizard to show "Internal server error" at step 6.
   *
   * The fix: probe for 'gpa' before building baseValues; when absent, omit all
   * six v4 fields from the values object so Drizzle never lists them.
   *
   * This test verifies that when db.execute() returns empty (columns absent),
   * db.insert().values() is called with an object that does NOT contain any v4
   * field keys, and the handler returns 201 rather than 500.
   */
  /**
   * Regression: v4 columns absent from DB — INSERT SQL must not reference them.
   *
   * Root cause (confirmed via MySqlInsertBuilder.toSQL() probe):
   *   Drizzle's db.insert().values(obj) always generates the FULL column list
   *   from the schema definition, emitting DEFAULT for any column absent from
   *   the values object. Omitting a key from the values object does NOT remove
   *   it from the generated SQL. When v4 migration columns are absent from the
   *   production DB, MySQL rejects the INSERT with ER_BAD_FIELD_ERROR.
   *
   * Fix:
   *   The handler now uses db.execute(sql`INSERT ...`) with sql.join() to build
   *   a raw parameterized INSERT that only lists columns confirmed to exist.
   *   Column names are hardcoded strings (no user input); values are bound
   *   parameters via sql`${p}`.
   *
   * This test verifies that when all SHOW COLUMNS probes return empty (columns
   * absent), the rendered SQL passed to db.execute() does NOT contain any of
   * the six v4 column names, and the handler returns 201.
   *
   * renderSql() uses MySqlDialect.sqlToQuery() — the same path the mysql2
   * driver uses — so the assertion is on the actual SQL that would be sent.
   */
  it('regression: v4 columns absent — INSERT SQL excludes v4 column names', async () => {
    mockActiveCount = 0;
    // Default mock: db.execute returns empty → all SHOW COLUMNS probes return absent.
    const { db } = await import('@/server/db/client.js');
    const executeSpy = db.execute as ReturnType<typeof vi.fn>;

    const { req, res, status } = makeReqRes({ label: 'Finn Shaw', ageBand: 'U11' });
    const { default: handler } = await import('./POST.js');
    await handler(req, res);

    // Handler must succeed with 201
    expect(status).not.toHaveBeenCalledWith(500);
    const statusArg = status.mock.calls.find((c: unknown[]) => c[0] === 201);
    expect(statusArg).toBeDefined();

    // Find the INSERT call among all db.execute() calls.
    // SHOW COLUMNS probes also use db.execute() — filter by rendered SQL content.
    const insertCall = executeSpy.mock.calls.find((callArgs: unknown[]) => {
      const rendered = renderSql(callArgs[0]);
      return rendered.includes('INSERT INTO') && rendered.includes('sc_player_profiles');
    });

    expect(insertCall).toBeDefined();
    const insertSqlStr = renderSql(insertCall![0]);

    // v4 column names must NOT appear in the SQL when columns are absent
    const v4ColNames = ['`gpa`', '`gpa_scale`', '`gpa_weighted`', '`intended_major`', '`college_goals`', '`contact_email`'];
    for (const col of v4ColNames) {
      expect(insertSqlStr).not.toContain(col);
    }

    // Base columns MUST appear
    expect(insertSqlStr).toContain('`id`');
    expect(insertSqlStr).toContain('`user_id`');
    // Values must be bound params (? placeholders), not string literals
    expect(insertSqlStr).toContain('?');
    expect(insertSqlStr).not.toContain("'Finn Shaw'");
  });

  /**
   * Regression (inverse): v4 columns present — INSERT SQL must include them.
   *
   * When all six v4 columns exist (SHOW COLUMNS returns non-empty), the handler
   * must include them in the INSERT so newly created players have null slots
   * ready for the parent to fill in via PATCH.
   */
  it('regression: v4 columns present — INSERT SQL includes v4 column names', async () => {
    mockActiveCount = 0;
    const { db } = await import('@/server/db/client.js');

    // Override db.execute: SHOW COLUMNS probes return non-empty (column exists);
    // INSERT returns success. Use renderSql() to distinguish probe from INSERT.
    (db.execute as ReturnType<typeof vi.fn>).mockImplementation(async (sqlArg: unknown) => {
      const rendered = renderSql(sqlArg);
      if (rendered.includes('SHOW COLUMNS')) {
        return [[{ Field: 'gpa' }]]; // non-empty → column exists
      }
      return [[]]; // INSERT succeeds
    });

    const executeSpy = db.execute as ReturnType<typeof vi.fn>;
    const { req, res, status } = makeReqRes({ label: 'Sam Rivera', ageBand: 'U16' });
    const { default: handler } = await import('./POST.js');
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(500);

    const insertCall = executeSpy.mock.calls.find((callArgs: unknown[]) => {
      const rendered = renderSql(callArgs[0]);
      return rendered.includes('INSERT INTO') && rendered.includes('sc_player_profiles');
    });

    expect(insertCall).toBeDefined();
    const insertSqlStr = renderSql(insertCall![0]);

    // v4 column names MUST appear when all columns are present
    const v4ColNames = ['`gpa`', '`gpa_scale`', '`gpa_weighted`', '`intended_major`', '`college_goals`', '`contact_email`'];
    for (const col of v4ColNames) {
      expect(insertSqlStr).toContain(col);
    }
  });
});
