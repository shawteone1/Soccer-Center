/**
 * POST /api/parent/recruiting/saved
 *
 * Save or update a recruiting opportunity for a player.
 * Body: { playerId, itemType, itemId, status?, notes? }
 *
 * status: 'interested' | 'reminder_set' | 'registered'
 *   'registered' must be explicitly set by the parent — never auto-assigned.
 *
 * Idempotent: upserts on (player_id, item_type, item_id).
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingBaseAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const VALID_ITEM_TYPES = new Set(['camp', 'showcase', 'coach']);
const VALID_STATUSES = new Set(['interested', 'reminder_set', 'registered']);

export default async function handler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const playerId = typeof body.playerId === 'string' ? body.playerId : null;
  const itemType = typeof body.itemType === 'string' ? body.itemType : null;
  const itemId   = typeof body.itemId   === 'string' ? body.itemId   : null;
  const status   = typeof body.status   === 'string' ? body.status   : 'interested';
  const notes    = typeof body.notes    === 'string' ? body.notes    : null;

  if (!playerId || !itemType || !itemId) {
    res.status(400).json({ error: 'playerId, itemType, and itemId are required' });
    return;
  }
  if (!VALID_ITEM_TYPES.has(itemType)) {
    res.status(400).json({ error: 'itemType must be camp, showcase, or coach' });
    return;
  }
  if (!VALID_STATUSES.has(status)) {
    res.status(400).json({ error: 'status must be interested, reminder_set, or registered' });
    return;
  }

  const access = await requireRecruitingBaseAccess(req, res, playerId);
  if (!access) return;

  try {
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_recruiting_saved'`));
    const tableArr = Array.isArray(tableCheck) ? tableCheck : (tableCheck as { rows?: unknown[] }).rows ?? [];
    if (!tableArr.length) {
      res.status(503).json({ error: 'Recruiting schema not yet migrated.' });
      return;
    }

    const id = randomUUID();
    const safeUserId   = access.userId.replace(/'/g, "''");
    const safePlayerId = playerId.replace(/'/g, "''");
    const safeItemType = itemType.replace(/'/g, "''");
    const safeItemId   = itemId.replace(/'/g, "''");
    const safeStatus   = status.replace(/'/g, "''");
    const safeNotes    = notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL';

    await db.execute(sql.raw(`
      INSERT INTO sc_recruiting_saved (id, user_id, player_id, item_type, item_id, status, notes)
      VALUES ('${id}', '${safeUserId}', '${safePlayerId}', '${safeItemType}', '${safeItemId}', '${safeStatus}', ${safeNotes})
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        notes  = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP
    `));

    // Fetch the upserted row
    const result = await db.execute(sql.raw(`
      SELECT id, status, notes, saved_at, updated_at
      FROM sc_recruiting_saved
      WHERE user_id = '${safeUserId}' AND player_id = '${safePlayerId}'
        AND item_type = '${safeItemType}' AND item_id = '${safeItemId}'
      LIMIT 1
    `));
    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
    const row = rows[0] ?? {};

    res.status(201).json({ ok: true, saved: { id: row['id'], status: row['status'], notes: row['notes'] ?? null } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to save item', detail: msg });
  }
}
