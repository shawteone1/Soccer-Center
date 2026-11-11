/**
 * GET /api/parent/uploads/player-photo/:playerId
 *
 * Ownership-enforced delivery of a player avatar photo.
 *
 * SECURITY
 * ────────
 * - Requires a valid BetterAuth session (requireParentAccess).
 * - The authenticated user must own the player record (user_id match).
 * - Returns 404 for unknown players, wrong owner, or missing file.
 * - No information leakage: 404 is returned for all failure modes.
 *
 * MIGRATION
 * ─────────
 * Files written before this change live at:
 *   /shared-storage/public/assets/uploads/player-photos/{userId}/{playerId}.{ext}
 * New files are written to:
 *   /private/uploads/player-photos/{userId}/{playerId}.{ext}
 *
 * On first access, if the private file is absent but the legacy file exists,
 * it is copied to private storage before serving. The DB is updated to point
 * to the new route URL so subsequent requests skip the migration check.
 */

import type { Request, Response } from 'express';
import { playerPhotoPath } from '../../../../../lib/player-photo-path.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { resolveUploadPath, migrateToPrivate, streamFile } from '@/server/lib/private-uploads.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;
  if (!playerId) { res.status(404).end(); return; }

  // ── Verify ownership and fetch avatar_url ─────────────────────────────────
  type Row = { avatar_url: string | null };
  let avatarUrl: string | null = null;
  try {
    const result = await db.execute(
      sql`SELECT avatar_url
           FROM sc_player_profiles
           WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL
           LIMIT 1`
    ) as unknown;
    const rows = (result as [Row[]])[0];
    if (!rows.length) { res.status(404).end(); return; }
    avatarUrl = rows[0].avatar_url ?? null;
  } catch {
    res.status(404).end();
    return;
  }

  if (!avatarUrl) { res.status(404).end(); return; }

  // ── Resolve file path ─────────────────────────────────────────────────────
  // avatar_url may be:
  //   (a) /api/parent/uploads/player-photo/{playerId}  — new route URL (no path info)
  //   (b) /airo-assets/uploads/player-photos/{userId}/{playerId}.{ext}  — legacy public URL
  //
  // For (a) we need to find the file by scanning the private dir for this player.
  // For (b) we extract the relative path and resolve it.

  const relativePath = playerPhotoPath(avatarUrl, user.id, String(playerId));

  if (!relativePath) { res.status(404).end(); return; }

  // ── Migrate legacy file if needed ─────────────────────────────────────────
  const { path: filePath, legacy } = resolveUploadPath(relativePath);

  if (legacy) {
    try {
      const privatePath = await migrateToPrivate(relativePath);
      // Update DB to new route URL so future requests skip migration
      await db.execute(
        sql`UPDATE sc_player_profiles
            SET avatar_url = ${`/api/parent/uploads/player-photo/${playerId}`}
            WHERE id = ${playerId} AND user_id = ${user.id}`
      );
      streamFile(privatePath, res, { noStore: true });
      return;
    } catch {
      // Migration failed — serve from legacy path directly
      streamFile(filePath, res, { noStore: true });
      return;
    }
  }

  streamFile(filePath, res, { noStore: true });
}
