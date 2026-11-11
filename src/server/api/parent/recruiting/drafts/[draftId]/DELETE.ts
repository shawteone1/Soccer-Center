/**
 * DELETE /api/parent/recruiting/drafts/:draftId?playerId=:id
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingAccess } from '../../_guard.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const { draftId } = req.params as { draftId: string };
  const { playerId } = req.query as { playerId?: string };

  if (!playerId) {
    res.status(400).json({ error: 'playerId is required' });
    return;
  }

  const access = await requireRecruitingAccess(req, res, playerId);
  if (!access) return;

  try {
    await db.execute(sql.raw(`
      DELETE FROM sc_outreach_drafts
      WHERE id = '${draftId.replace(/'/g, "''")}' AND user_id = '${access.userId.replace(/'/g, "''")}' AND player_id = '${playerId.replace(/'/g, "''")}'
    `));
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to delete draft', detail: msg });
  }
}
