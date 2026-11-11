/**
 * DELETE /api/parent/players/:playerId/match-records/:recordId
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const { playerId, recordId } = req.params;

  // Verify player belongs to this parent
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    if (!(rows[0] as unknown as Array<unknown>).length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Database error' });
    return;
  }

  try {
    await db.execute(
      sql`DELETE FROM sc_player_match_records WHERE id = ${recordId} AND player_id = ${playerId}`
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete match record' });
  }
}
