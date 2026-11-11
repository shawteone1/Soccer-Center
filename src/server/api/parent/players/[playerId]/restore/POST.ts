/**
 * POST /api/parent/players/:playerId/restore
 *
 * Restores a soft-deleted player profile owned by the authenticated parent.
 * Clears deleted_at so the player reappears in My Players.
 * Returns 404 if the player doesn't exist, belongs to another user, or is
 * not currently deleted (nothing to restore).
 *
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);

  // Confirm the player exists, is owned by this user, and IS currently deleted.
  const result = await db.execute(
    sql.raw(
      `SELECT id FROM \`sc_player_profiles\`
       WHERE id = '${playerId.replace(/'/g, "''")}' 
         AND user_id = '${user.id.replace(/'/g, "''")}'
         AND deleted_at IS NOT NULL
       LIMIT 1`
    )
  ) as unknown;
  const [rows] = result as [unknown[], unknown];
  const existing = Array.isArray(rows) && rows.length > 0;

  if (!existing) {
    return res.status(404).json({ error: 'Deleted player not found' });
  }

  await db.execute(
    sql.raw(
      `UPDATE \`sc_player_profiles\`
       SET deleted_at = NULL
       WHERE id = '${playerId.replace(/'/g, "''")}' 
         AND user_id = '${user.id.replace(/'/g, "''")}'`
    )
  );

  res.json({ ok: true });
}
