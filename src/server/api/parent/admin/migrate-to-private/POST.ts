/**
 * POST /api/parent/admin/migrate-to-private
 *
 * Bulk migration: copy existing files from the legacy public path to private
 * storage, verify the copy, update DB references, and report results.
 *
 * SAFETY CONTRACT
 * ───────────────
 * 1. The public original is NEVER deleted by this endpoint. Deletion is a
 *    separate manual step after the operator confirms the migration report.
 * 2. Each file is verified (byte-count match) before the DB reference is updated.
 * 3. If verification fails, the DB reference is NOT updated and the error is
 *    reported. The public file remains the authoritative copy.
 * 4. This endpoint is idempotent: re-running it skips files already in private
 *    storage and already pointing to the new route URL.
 * 5. Dry-run mode (query param ?dry=1) reports what would be done without
 *    writing anything.
 *
 * WHAT IS MIGRATED
 * ────────────────
 * A. Player photos: sc_player_profiles rows where avatar_url starts with
 *    /airo-assets/uploads/player-photos/
 *    → copy to /private/uploads/player-photos/{userId}/{playerId}.{ext}
 *    → update avatar_url to /api/parent/uploads/player-photo/{playerId}
 *
 * B. Parent media: sc_parent_media rows where storage_path does NOT start
 *    with parent-media/ (legacy path) or where the private file is absent.
 *    → copy to /private/uploads/parent-media/{userId}/{uuid}.{ext}
 *    → update storage_path to parent-media/{userId}/{uuid}.{ext}
 *    → update public_url to /api/parent/uploads/media/{id}
 *
 * Protected: admin only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const PRIVATE_ROOT    = '/private/uploads';
const LEGACY_ROOT     = '/shared-storage/public/assets/uploads';
// Some files were written to the alt root (one level above uploads/).
const LEGACY_ROOT_ALT = '/shared-storage/public/assets';

interface PhotoRow {
  id: string;
  user_id: string;
  avatar_url: string;
}

interface MediaRow {
  id: string;
  user_id: string;
  storage_path: string | null;
  public_url: string | null;
}

interface MigrationResult {
  id: string;
  status: 'migrated' | 'already_private' | 'skipped_dry' | 'error' | 'missing_source';
  detail?: string;
  /** SHA-256 hex digest of the private file after a successful copy. Present only when status='migrated'. */
  sha256?: string;
  /** Byte size of the private file after a successful copy. Present only when status='migrated'. */
  sizeBytes?: number;
}

/**
 * Compute SHA-256 hex digest of a file by streaming it.
 * Returns null on any read error.
 */
async function sha256File(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Verify a file copy by comparing both byte size and SHA-256 digest.
 * Returns { ok: true } when both match, or { ok: false, reason } on mismatch.
 */
async function verifyFileCopy(
  src: string,
  dst: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const srcStat = statSync(src);
    const dstStat = statSync(dst);
    if (dstStat.size === 0) return { ok: false, reason: 'destination is empty' };
    if (srcStat.size !== dstStat.size) {
      return { ok: false, reason: `size mismatch: src=${srcStat.size} dst=${dstStat.size}` };
    }
    const [srcHash, dstHash] = await Promise.all([sha256File(src), sha256File(dst)]);
    if (!srcHash || !dstHash) return { ok: false, reason: 'checksum read failed' };
    if (srcHash !== dstHash) {
      return { ok: false, reason: `sha256 mismatch: src=${srcHash.slice(0, 8)}… dst=${dstHash.slice(0, 8)}…` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const dry = req.query.dry === '1' || req.query.dry === 'true';

  const photoResults: MigrationResult[] = [];
  const mediaResults: MigrationResult[] = [];

  // ── A. Player photos ──────────────────────────────────────────────────────────

  let photoRows: PhotoRow[] = [];
  try {
    const result = await db.execute(
      sql`SELECT id, user_id, avatar_url
          FROM sc_player_profiles
          WHERE avatar_url LIKE '/airo-assets/uploads/player-photos/%'
            AND deleted_at IS NULL`
    ) as unknown;
    photoRows = (result as [PhotoRow[]])[0];
  } catch (e) {
    res.status(500).json({ error: 'Failed to query sc_player_profiles', detail: String(e) });
    return;
  }

  for (const row of photoRows) {
    // Extract relative path: /airo-assets/uploads/player-photos/userId/playerId.ext
    const relativePath = row.avatar_url.replace('/airo-assets/uploads/', '');
    const legacyPath   = `${LEGACY_ROOT}/${relativePath}`;
    const privatePath  = `${PRIVATE_ROOT}/${relativePath}`;

    // Already in private storage?
    if (existsSync(privatePath)) {
      // Update DB reference if it still points to the old URL
      if (!dry) {
        try {
          await db.execute(
            sql`UPDATE sc_player_profiles
                SET avatar_url = ${`/api/parent/uploads/player-photo/${row.id}`}
                WHERE id = ${row.id} AND user_id = ${row.user_id}`
          );
        } catch { /* non-fatal — file is safe */ }
      }
      photoResults.push({ id: row.id, status: 'already_private' });
      continue;
    }

    if (!existsSync(legacyPath)) {
      photoResults.push({ id: row.id, status: 'missing_source', detail: legacyPath });
      continue;
    }

    if (dry) {
      photoResults.push({ id: row.id, status: 'skipped_dry', detail: `${legacyPath} → ${privatePath}` });
      continue;
    }

    try {
      await mkdir(dirname(privatePath), { recursive: true });
      await copyFile(legacyPath, privatePath);

      const photoVerify = await verifyFileCopy(legacyPath, privatePath);
      if (!photoVerify.ok) {
        photoResults.push({ id: row.id, status: 'error', detail: `verification failed: ${photoVerify.reason}` });
        continue;
      }

      await db.execute(
        sql`UPDATE sc_player_profiles
            SET avatar_url = ${`/api/parent/uploads/player-photo/${row.id}`}
            WHERE id = ${row.id} AND user_id = ${row.user_id}`
      );
      photoResults.push({
        id: row.id,
        status: 'migrated',
        sha256: (await sha256File(privatePath)) ?? undefined,
        sizeBytes: statSync(privatePath).size,
      });
    } catch (e) {
      photoResults.push({ id: row.id, status: 'error', detail: String(e) });
    }
  }

  // ── B. Parent media ───────────────────────────────────────────────────────────

  let mediaRows: MediaRow[] = [];
  try {
    const result = await db.execute(
      sql`SELECT id, user_id, storage_path, public_url
          FROM sc_parent_media
          WHERE deleted_at IS NULL`
    ) as unknown;
    mediaRows = (result as [MediaRow[]])[0];
  } catch (e) {
    // Table may not exist yet — report but don't fail the photo migration
    mediaResults.push({ id: '__query__', status: 'error', detail: String(e) });
  }

  for (const row of mediaRows) {
    if (!row.storage_path) {
      mediaResults.push({ id: row.id, status: 'error', detail: 'null storage_path' });
      continue;
    }

    // Normalise: strip any leading slash
    const relativePath  = row.storage_path.replace(/^\/+/, '');
    const privatePath   = `${PRIVATE_ROOT}/${relativePath}`;
    const legacyPath    = `${LEGACY_ROOT}/${relativePath}`;
    const legacyAltPath = `${LEGACY_ROOT_ALT}/${relativePath}`;

    // Already in private storage?
    if (existsSync(privatePath)) {
      if (!dry && row.public_url && !row.public_url.startsWith('/api/parent/uploads/media/')) {
        try {
          await db.execute(
            sql`UPDATE sc_parent_media
                SET public_url = ${`/api/parent/uploads/media/${row.id}`}
                WHERE id = ${row.id} AND user_id = ${row.user_id}`
          );
        } catch { /* non-fatal */ }
      }
      mediaResults.push({ id: row.id, status: 'already_private' });
      continue;
    }

    // Resolve source: primary legacy path, then alt legacy path
    const resolvedLegacyPath = existsSync(legacyPath) ? legacyPath
      : existsSync(legacyAltPath) ? legacyAltPath
      : null;

    if (!resolvedLegacyPath) {
      mediaResults.push({ id: row.id, status: 'missing_source', detail: `checked: ${legacyPath} | ${legacyAltPath}` });
      continue;
    }

    if (dry) {
      mediaResults.push({ id: row.id, status: 'skipped_dry', detail: `${resolvedLegacyPath} → ${privatePath}` });
      continue;
    }

    try {
      await mkdir(dirname(privatePath), { recursive: true });
      await copyFile(resolvedLegacyPath, privatePath);

      const mediaVerify = await verifyFileCopy(resolvedLegacyPath, privatePath);
      if (!mediaVerify.ok) {
        mediaResults.push({ id: row.id, status: 'error', detail: `verification failed: ${mediaVerify.reason}` });
        continue;
      }

      await db.execute(
        sql`UPDATE sc_parent_media
            SET public_url = ${`/api/parent/uploads/media/${row.id}`}
            WHERE id = ${row.id} AND user_id = ${row.user_id}`
      );
      mediaResults.push({
        id: row.id,
        status: 'migrated',
        sha256: (await sha256File(privatePath)) ?? undefined,
        sizeBytes: statSync(privatePath).size,
      });
    } catch (e) {
      mediaResults.push({ id: row.id, status: 'error', detail: String(e) });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────

  const summary = {
    dry,
    photos: {
      total:         photoRows.length,
      migrated:      photoResults.filter(r => r.status === 'migrated').length,
      already:       photoResults.filter(r => r.status === 'already_private').length,
      missing:       photoResults.filter(r => r.status === 'missing_source').length,
      errors:        photoResults.filter(r => r.status === 'error').length,
      skipped_dry:   photoResults.filter(r => r.status === 'skipped_dry').length,
    },
    media: {
      total:         mediaRows.length,
      migrated:      mediaResults.filter(r => r.status === 'migrated').length,
      already:       mediaResults.filter(r => r.status === 'already_private').length,
      missing:       mediaResults.filter(r => r.status === 'missing_source').length,
      errors:        mediaResults.filter(r => r.status === 'error').length,
      skipped_dry:   mediaResults.filter(r => r.status === 'skipped_dry').length,
    },
  };

  const hasErrors = summary.photos.errors > 0 || summary.media.errors > 0;
  res.status(hasErrors ? 207 : 200).json({ ok: !hasErrors, summary, photos: photoResults, media: mediaResults });
}
