/**
 * DELETE /api/parent/players/:playerId/media-assignments/:assignmentId
 *
 * Removes a media assignment from a player. Does NOT delete the underlying
 * sc_parent_media item — only the assignment link.
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId, assignmentId } = req.params;

  try {
    if (req.query.detachGame === 'true') {
      await db.execute(sql`UPDATE sc_player_media_assignments SET game_event_ref = NULL
        WHERE id = ${assignmentId} AND player_id = ${playerId} AND user_id = ${user.id}`);
      res.json({ ok: true }); return;
    }
    await db.execute(
      sql`DELETE FROM sc_player_media_assignments
          WHERE id = ${assignmentId}
            AND player_id = ${playerId}
            AND user_id   = ${user.id}`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /media-assignments/:id]', e);
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
}
