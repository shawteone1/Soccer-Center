/**
 * GET /api/parent/admin/db-tables
 *
 * Lists ALL tables in the current database schema.
 * Used to diagnose which tables exist before running migrations.
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const result = await db.execute(sql`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    // Drizzle returns [rows, fields] for raw execute — handle both shapes
    const rawRows: unknown[] = Array.isArray(result) && Array.isArray(result[0])
      ? (result[0] as unknown[])
      : Array.isArray(result) ? result : [];

    const tables = rawRows.map((r) => {
      const row = r as Record<string, unknown>;
      // MySQL2 may return column names in any case depending on driver version
      const name = String(
        row['TABLE_NAME'] ?? row['table_name'] ?? row['Table_name'] ?? ''
      );
      const rowCount = Number(
        row['TABLE_ROWS'] ?? row['table_rows'] ?? 0
      );
      return { name, rows: rowCount };
    }).filter(t => t.name.length > 0);

    res.json({
      count: tables.length,
      tables,
      scTables: tables.filter(t => t.name.startsWith('sc_')).map(t => t.name),
      userTable: tables.some(t => t.name === 'user'),
    });
  } catch (err) {
    const e = err as Record<string, unknown>;
    const detail =
      (typeof e['sqlMessage'] === 'string' && e['sqlMessage']) ||
      (typeof e['message'] === 'string' && e['message']) ||
      JSON.stringify(err, Object.getOwnPropertyNames(err));
    res.status(503).json({ error: 'DB query failed', detail });
  }
}
