/**
 * DELETE /api/parent/players/:playerId
 *
 * Soft-deletes a player profile owned by the authenticated parent.
 * Sets deleted_at to NOW() rather than removing the row, so the record can be
 * restored within the undo window.
 *
 * Ownership is enforced server-side: only the owning user_id may delete.
 * Returns 404 if the player doesn't exist, belongs to another user, or is
 * already deleted.
 *
 * Returns 409 SCHEMA_REQUIRED if the deleted_at column is absent — the
 * soft-delete migration must be run before removal is available. The player
 * is never touched in this case.
 *
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

/** Check whether the deleted_at column exists (added by the softdelete migration). */
async function softDeleteAvailable(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`sc_player_profiles\` LIKE 'deleted_at'`)
    ) as unknown;
    const [rows] = result as [unknown[], unknown];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);

  // Require the soft-delete migration before allowing any removal.
  // Never fall back to hard-delete — that would be unrecoverable.
  const hasSoftDelete = await softDeleteAvailable();
  if (!hasSoftDelete) {
    return res.status(409).json({
      error: 'SCHEMA_REQUIRED',
      message:
        'Player removal is not yet available on this deployment. ' +
        'An admin must run the Player Soft-Delete Migration from Settings → Admin panel first.',
    });
  }

  // Confirm the player exists, is owned by this user, and is not already deleted.
  const result = await db.execute(
    sql.raw(
      `SELECT id FROM \`sc_player_profiles\`
       WHERE id = '${playerId.replace(/'/g, "''")}' 
         AND user_id = '${user.id.replace(/'/g, "''")}'
         AND deleted_at IS NULL
       LIMIT 1`
    )
  ) as unknown;
  const [rows] = result as [unknown[], unknown];
  const existing = Array.isArray(rows) && rows.length > 0;

  if (!existing) {
    return res.status(404).json({ error: 'Player not found' });
  }

  // Soft-delete: set deleted_at to now.
  await db.execute(
    sql.raw(
      `UPDATE \`sc_player_profiles\`
       SET deleted_at = NOW()
       WHERE id = '${playerId.replace(/'/g, "''")}' 
         AND user_id = '${user.id.replace(/'/g, "''")}'
         AND deleted_at IS NULL`
    )
  );

  return res.json({ ok: true, softDeleted: true });
}
