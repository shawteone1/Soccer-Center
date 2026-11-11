/**
 * POST /api/parent/players/:playerId/collections
 * Create a new highlight collection for a player.
 * Body: { name }
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

  const { playerId } = req.params;
  const { name } = req.body as { name?: string };

  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  // Verify ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    if (!(rows as unknown as [unknown[]])[0].length) {
      res.status(404).json({ error: 'Player not found' }); return;
    }
  } catch (e) {
    console.error('[POST /collections] ownership', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  const id = randomUUID();
  try {
    await db.execute(
      sql`INSERT INTO sc_player_highlight_collections (id, user_id, player_id, name, sort_order)
          VALUES (${id}, ${user.id}, ${playerId}, ${name.trim().slice(0, 255)}, 0)`
    );
    res.status(201).json({ id, ok: true });
  } catch (e) {
    console.error('[POST /collections]', e);
    res.status(500).json({ error: 'Failed to create collection' });
  }
}
