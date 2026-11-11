/**
 * DELETE /api/parent/players/:playerId/collections/:collectionId
 * Deletes a collection and all its items (cascade). Media assignments are not deleted.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { collectionId } = req.params;

  try {
    await db.execute(
      sql`DELETE FROM sc_player_highlight_collections
          WHERE id = ${collectionId} AND user_id = ${user.id}`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /collections/:id]', e);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
}
