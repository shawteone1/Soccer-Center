/**
 * POST /api/parent/players/:playerId/collections/:collectionId/items
 * Add an assignment to a collection.
 * Body: { assignmentId }
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { collectionId } = req.params;
  const { assignmentId } = req.body as { assignmentId?: string };

  if (!assignmentId?.trim()) { res.status(400).json({ error: 'assignmentId is required' }); return; }

  const id = randomUUID();
  try {
    await db.execute(
      sql`INSERT INTO sc_player_collection_items (id, collection_id, assignment_id, sort_order)
          VALUES (${id}, ${collectionId}, ${assignmentId}, 0)`
    );
    res.status(201).json({ id, ok: true });
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Already in collection' }); return;
    }
    console.error('[POST /collections/:id/items]', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
}
