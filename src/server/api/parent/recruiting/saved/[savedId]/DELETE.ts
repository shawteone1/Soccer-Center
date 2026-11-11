/**
 * DELETE /api/parent/recruiting/saved/:savedId?playerId=:id
 *
 * Remove a saved recruiting opportunity.
 * Enforces auth + player ownership. Available to all age groups.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingBaseAccess } from '../../_guard.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const savedId = Array.isArray(req.params.savedId) ? req.params.savedId[0] : req.params.savedId;
  const { playerId } = req.query as { playerId?: string };

  if (!playerId) {
    res.status(400).json({ error: 'playerId is required' });
    return;
  }

  const access = await requireRecruitingBaseAccess(req, res, playerId);
  if (!access) return;

  try {
    await db.execute(sql.raw(`
      DELETE FROM sc_recruiting_saved
      WHERE id = '${savedId.replace(/'/g, "''")}'
        AND user_id = '${access.userId.replace(/'/g, "''")}'
        AND player_id = '${playerId.replace(/'/g, "''")}'
    `));
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to delete saved item', detail: msg });
  }
}
