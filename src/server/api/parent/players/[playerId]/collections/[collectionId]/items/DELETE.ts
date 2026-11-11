/**
 * DELETE /api/parent/players/:playerId/collections/:collectionId/items
 * Remove an assignment from a collection.
 * Body: { assignmentId }
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
  const { assignmentId } = req.body as { assignmentId?: string };

  if (!assignmentId?.trim()) { res.status(400).json({ error: 'assignmentId is required' }); return; }

  try {
    await db.execute(
      sql`DELETE FROM sc_player_collection_items
          WHERE collection_id = ${collectionId} AND assignment_id = ${assignmentId}`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /collections/:id/items]', e);
    res.status(500).json({ error: 'Failed to remove item' });
  }
}
