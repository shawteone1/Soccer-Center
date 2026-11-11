/**
 * src/server/lib/private-uploads.ts
 *
 * Authorized delivery for player photos and parent media (videos and images).
 *
 * BACKGROUND
 * ──────────
 * Files written to /shared-storage/public/assets/uploads/ are served by the
 * platform's static file server at /airo-assets/uploads/. That path bypasses
 * Express entirely — no middleware can intercept it. Any URL under that prefix
 * is publicly accessible to anyone who knows or constructs it.
 *
 * This module moves new uploads to /private/ (not web-accessible) and serves
 * them exclusively through authenticated Express routes:
 *
 *   GET /api/parent/uploads/player-photo/:playerId
 *   GET /api/parent/uploads/media/:mediaId
 *
 * Both routes enforce ownership: the authenticated user must own the player or
 * media record. The coach proxy routes (/api/coach/photo/:token/:playerId and
 * /api/coach/media/:token/:assignmentId) continue to work — they read the
 * storage_path from the DB and stream from /private/ directly.
 *
 * MIGRATION
 * ─────────
 * Existing files already written to /shared-storage/public/assets/uploads/ are
 * migrated lazily: on first access through the new route, if the file is not
 * found at the private path, the handler checks the legacy public path and
 * copies it to private storage before serving. The DB record is updated to
 * reflect the new path. This is transparent to the caller.
 *
 * STORAGE PATHS
 * ─────────────
 * Private root:  /private/uploads/
 * Player photos: /private/uploads/player-photos/{userId}/{playerId}.{ext}
 * Parent media:  /private/uploads/parent-media/{userId}/{uuid}.{ext}
 *
 * DB columns
 * ──────────
 * sc_player_profiles.avatar_url  — set to the Express route URL:
 *   /api/parent/uploads/player-photo/{playerId}
 * sc_parent_media.storage_path   — set to the private relative path:
 *   player-photos/{userId}/{playerId}.{ext}  (for photos)
 *   parent-media/{userId}/{uuid}.{ext}       (for media)
 * sc_parent_media.public_url     — set to the Express route URL:
 *   /api/parent/uploads/media/{mediaId}
 *
 * COACH PROXY COMPATIBILITY
 * ─────────────────────────
 * The coach photo proxy reads avatar_url from sc_player_profiles and resolves
 * the file path. It currently expects /airo-assets/uploads/ prefix. After this
 * change, avatar_url is set to the Express route URL. The proxy handler is
 * updated to detect the new URL shape and resolve the private path directly.
 *
 * The coach media proxy reads storage_path from sc_parent_media. That column
 * stores a relative path under the storage root. The proxy is updated to check
 * /private/uploads/ first, then fall back to the legacy public path.
 */

import { createReadStream, statSync, existsSync, realpathSync } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { extname, dirname, resolve, sep } from 'node:path';

// ── Storage roots ─────────────────────────────────────────────────────────────

export const PRIVATE_ROOT    = '/private/uploads';
// PERSISTENT_UPLOAD_ROOT is the confirmed writable, non-publicly-served private
// path in this deployment. /shared-storage/private/ is read-only in the build
// container and does not exist at runtime; /private/ is the correct destination.
export const PERSISTENT_UPLOAD_ROOT = '/private/uploads';
export const LEGACY_ROOT     = '/shared-storage/public/assets/uploads';
// Some files written by an earlier handler landed one level above uploads/:
//   /shared-storage/public/assets/parent-media/{userId}/{uuid}.ext
// resolveUploadPath and migrateToPrivate check this path when the primary
// legacy path is absent, so existing media records are served without moving files.
export const LEGACY_ROOT_ALT = '/shared-storage/public/assets';

// ── MIME helpers ──────────────────────────────────────────────────────────────

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp', '.gif': 'image/gif',
};
const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ogv': 'video/ogg',
};

export function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_MIME[ext] ?? VIDEO_MIME[ext] ?? 'application/octet-stream';
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

// ── Path resolution ───────────────────────────────────────────────────────────

/** Reject traversal and symlink escapes before touching any upload root. */
function containedPath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\\') || relativePath.includes('\0') || relativePath.startsWith('/') || relativePath.split('/').some(p => p === '..' || p === '.')) {
    throw new Error('Invalid upload path');
  }
  const target = resolve(root, relativePath);
  if (!target.startsWith(resolve(root) + sep)) throw new Error('Invalid upload path');
  if (existsSync(root)) {
    let ancestor = target;
    while (!existsSync(ancestor) && ancestor !== root) ancestor = dirname(ancestor);
    const realRoot = realpathSync(root);
    const realAncestor = realpathSync(ancestor);
    if (realAncestor !== realRoot && !realAncestor.startsWith(realRoot + sep)) throw new Error('Upload path escapes storage root');
  }
  return target;
}

/**
 * Resolve the absolute filesystem path for a relative upload path.
 * Checks /private/uploads/ first; falls back to the legacy public path.
 * Returns { path, legacy, found } where:
 *   found=true  — the file exists at the returned path
 *   legacy=true — the file is in the old public location (should be migrated)
 *   found=false — neither location has the file; path is the private path
 */
export function resolveUploadPath(relativePath: string): { path: string; legacy: boolean; found: boolean } {
  try {
  // PERSISTENT_UPLOAD_ROOT === PRIVATE_ROOT — single private check.
  const privatePath = containedPath(PRIVATE_ROOT, relativePath);
  if (existsSync(privatePath)) return { path: privatePath, legacy: false, found: true };

  const legacyPath = containedPath(LEGACY_ROOT, relativePath);
  if (existsSync(legacyPath)) return { path: legacyPath, legacy: true, found: true };

  // Fallback: some files were written to the alt root (one level above uploads/).
  // e.g. storage_path = "parent-media/{userId}/{uuid}.ext"
  //      actual file  = /shared-storage/public/assets/parent-media/{userId}/{uuid}.ext
  const legacyAltPath = containedPath(LEGACY_ROOT_ALT, relativePath);
  if (existsSync(legacyAltPath)) return { path: legacyAltPath, legacy: true, found: true };

  return { path: privatePath, legacy: false, found: false }; // not found — caller handles 404
  } catch {
    return { path: '', legacy: false, found: false };
  }
}

/**
 * Migrate a file from the legacy public path to private storage.
 * No-op if the private file already exists. Returns the private path.
 */
export async function migrateToPrivate(relativePath: string): Promise<string> {
  const privatePath = containedPath(PRIVATE_ROOT, relativePath);
  if (existsSync(privatePath)) return privatePath;

  const legacyPath = containedPath(LEGACY_ROOT, relativePath);
  if (existsSync(legacyPath)) {
    await mkdir(dirname(privatePath), { recursive: true });
    await copyFile(legacyPath, privatePath);
    return privatePath;
  }

  // Fallback: check alt legacy root before giving up
  const legacyAltPath = containedPath(LEGACY_ROOT_ALT, relativePath);
  if (existsSync(legacyAltPath)) {
    await mkdir(dirname(privatePath), { recursive: true });
    await copyFile(legacyAltPath, privatePath);
    return privatePath;
  }

  return privatePath; // nothing to migrate
}

// ── Streaming helper ──────────────────────────────────────────────────────────

import type { Response } from 'express';

/**
 * Stream a file to the response with appropriate headers.
 * Supports HTTP Range requests for video seeking.
 */
export function streamFile(
  absolutePath: string,
  res: Response,
  opts: { isVideo?: boolean; cacheSeconds?: number; noStore?: boolean } = {},
): void {
  const { isVideo = false, cacheSeconds = 300, noStore = false } = opts;
  const mime = mimeForPath(absolutePath);

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absolutePath);
  } catch {
    res.status(404).end();
    return;
  }

  res.setHeader('Cache-Control', noStore ? 'private, no-store' : `private, max-age=${cacheSeconds}`);
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (isVideo) {
    const rangeHeader = res.req?.headers?.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      let start = 0;
      let end = stat.size - 1;
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        res.status(416).end();
        return;
      }
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   mime,
      });
      const stream = createReadStream(absolutePath, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Length': stat.size,
    'Content-Type':   mime,
    ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
  });
  const stream = createReadStream(absolutePath);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
