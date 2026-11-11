/**
 * GET /api/admin/import-log
 *
 * Returns paginated rows from sc_import_log.
 * Admin-only (isAdmin check via auth middleware).
 *
 * Query params:
 *   page      — 1-based page number (default 1)
 *   limit     — rows per page (default 50, max 200)
 *   action    — filter by action ('inserted'|'updated'|'skipped'|'conflict')
 *   entityType — filter by entityType ('team'|'competition'|'source')
 *   resolved  — 'true' | 'false' | omit for all
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scImportLog } from '@/server/db/schema.js';
import { eq, isNull, isNotNull, and, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;

    const actionFilter = req.query.action ? String(req.query.action) : null;
    const entityTypeFilter = req.query.entityType ? String(req.query.entityType) : null;
    const resolvedFilter = req.query.resolved ? String(req.query.resolved) : null;

    const conditions = [];
    if (actionFilter) conditions.push(eq(scImportLog.action, actionFilter));
    if (entityTypeFilter) conditions.push(eq(scImportLog.entityType, entityTypeFilter));
    if (resolvedFilter === 'true') conditions.push(isNotNull(scImportLog.resolvedAt));
    if (resolvedFilter === 'false') conditions.push(isNull(scImportLog.resolvedAt));

    const rows = await db
      .select()
      .from(scImportLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(scImportLog.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      page,
      limit,
      count: rows.length,
      rows,
    });
  } catch (err) {
    console.error('[import-log GET]', err);
    res.status(500).json({ error: 'Failed to fetch import log', message: String(err) });
  }
}
