/**
 * GET /api/parent/players/:playerId/collections
 * Returns all highlight collections for a player, with their item assignment IDs.
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;

  // Verify ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    if (!(rows as unknown as [unknown[]])[0].length) {
      res.status(404).json({ error: 'Player not found' }); return;
    }
  } catch (e) {
    console.error('[GET /collections] ownership', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  try {
    type ColRow = { id: string; name: string; sort_order: number };
    type ItemRow = { collection_id: string; assignment_id: string };

    const [colRows, itemRows] = await Promise.all([
      db.execute(
        sql`SELECT id, name, sort_order FROM sc_player_highlight_collections
            WHERE player_id = ${playerId} AND user_id = ${user.id}
            ORDER BY sort_order ASC, created_at ASC`
      ),
      db.execute(
        sql`SELECT ci.collection_id, ci.assignment_id
            FROM sc_player_collection_items ci
            INNER JOIN sc_player_highlight_collections c ON c.id = ci.collection_id
            WHERE c.player_id = ${playerId} AND c.user_id = ${user.id}
            ORDER BY ci.sort_order ASC`
      ),
    ]);

    const cols = (colRows as unknown as [ColRow[]])[0];
    const items = (itemRows as unknown as [ItemRow[]])[0];

    const itemsByCol = items.reduce<Record<string, string[]>>((acc, r) => {
      if (!acc[r.collection_id]) acc[r.collection_id] = [];
      acc[r.collection_id].push(r.assignment_id);
      return acc;
    }, {});

    res.json({
      collections: cols.map(c => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        items: itemsByCol[c.id] ?? [],
      })),
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    const errno = (err as { errno?: number }).errno ?? 0;
    if (code === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      res.json({ collections: [] }); return;
    }
    console.error('[GET /collections]', err);
    res.status(500).json({ error: 'Failed to load collections' });
  }
}
