/**
 * GET /api/parent/players/:playerId/media-assignments
 *
 * Returns all media items assigned to this player, joined with the
 * sc_parent_media row for URL and type info.
 *
 * Protected by requireParentAccess(). Player must belong to the caller.
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
      sql`SELECT id FROM sc_player_profiles
          WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`
    );
    const arr = (rows as unknown as [Array<{ id: string }>])[0];
    if (!arr.length) { res.status(404).json({ error: 'Player not found' }); return; }
  } catch (e) {
    console.error('[GET /media-assignments] ownership', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  try {
    const rows = await db.execute(
      sql`SELECT
            a.id            AS assignment_id,
            a.media_id,
            a.season,
            a.game_event_ref,
            a.kind,
            a.title         AS assignment_title,
            a.created_at    AS assigned_at,
            m.public_url,
            m.media_type,
            m.original_name,
            m.caption,
            m.size_bytes,
            m.created_at    AS uploaded_at
          FROM sc_player_media_assignments a
          INNER JOIN sc_parent_media m ON m.id = a.media_id
          WHERE a.player_id = ${playerId}
            AND a.user_id   = ${user.id}
            AND m.user_id = ${user.id}
            AND m.deleted_at IS NULL
          ORDER BY a.created_at DESC`
    );

    type Row = {
      assignment_id: string; media_id: string; season: string | null;
      game_event_ref: string | null; kind: string; assignment_title: string | null;
      assigned_at: string | null; public_url: string; media_type: string;
      original_name: string | null; caption: string | null; size_bytes: number | null;
      uploaded_at: string | null;
    };

    const items = (rows as unknown as [Row[]])[0];

    res.json({
      assignments: items.map(r => ({
        id: r.assignment_id,
        mediaId: r.media_id,
        publicUrl: r.public_url,
        mediaType: r.media_type,
        originalName: r.original_name,
        caption: r.caption,
        sizeBytes: r.size_bytes,
        season: r.season,
        gameEventRef: r.game_event_ref,
        kind: r.kind,
        title: r.assignment_title,
        assignedAt: r.assigned_at,
        uploadedAt: r.uploaded_at,
      })),
      total: items.length,
    });
  } catch (err) {
    // DrizzleQueryError wraps the mysql2 error in .cause — check both the
    // outer error and the cause for ER_NO_SUCH_TABLE (errno 1146).
    const outer = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
    const code  = outer.code  ?? outer.cause?.code  ?? '';
    const errno = outer.errno ?? outer.cause?.errno ?? 0;
    if (code === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      // Tables not yet migrated — return empty, working state (not an error).
      res.json({ assignments: [], total: 0, tableAvailable: false });
      return;
    }
    console.error('[GET /media-assignments]', err);
    res.status(500).json({ error: 'Failed to load media assignments' });
  }
}
