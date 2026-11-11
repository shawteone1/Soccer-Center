/**
 * POST /api/parent/players/:playerId/photo
 *
 * Uploads a player avatar photo. Accepts multipart/form-data with field "file".
 * Stores the file in /private/uploads/player-photos/{userId}/{playerId}-{revision}.{ext}
 * and writes the authenticated route URL back to sc_player_profiles.avatar_url.
 *
 * Limits: images only, 10 MB max.
 * Protected by requireParentAccess(). Player must belong to the caller.
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { PERSISTENT_UPLOAD_ROOT } from '@/server/lib/private-uploads.js';
import { randomUUID } from 'node:crypto';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are accepted (JPEG, PNG, WebP, GIF)'));
  },
}).single('file');

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(String(playerId)) || !/^[a-zA-Z0-9_-]+$/.test(user.id)) {
    res.status(400).json({ error: 'Invalid player identifier' }); return;
  }

  // Verify ownership — avatar_url is part of the base Drizzle schema and always present.
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`
    );
    if (!(rows as unknown as [unknown[]])[0].length) {
      res.status(404).json({ error: 'Player not found' }); return;
    }
  } catch (e) {
    console.error('[POST /photo] ownership', e);
    res.status(500).json({ error: 'Database error' }); return;
  }

  // Parse multipart
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err: unknown) => {
      if (err) reject(err); else resolve();
    });
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Upload error';
    res.status(400).json({ error: msg });
  });

  if (res.headersSent) return;

  const file = req.file;
  if (!file) { res.status(400).json({ error: 'No file provided' }); return; }

  // Determine extension
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif',
  };
  const ext = extMap[file.mimetype] ?? '.jpg';
  const asset = `${randomUUID()}${ext}`;
  const filename = `${playerId}-${asset}`;
  // Write to private storage — not web-accessible. Served through the
  // authenticated route GET /api/parent/uploads/player-photo/:playerId.
  const dir = path.join(PERSISTENT_UPLOAD_ROOT, 'player-photos', user.id);
  const filePath = path.join(dir, filename);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, file.buffer);
  } catch (e) {
    console.error('[POST /photo] write', e);
    res.status(500).json({ error: 'Failed to save photo' }); return;
  }

  // Store an exact revision in the authenticated URL. Replacing PNG/JPEG cannot
  // accidentally serve an older extension, and reloads retain this revision.
  const routeUrl = `/api/parent/uploads/player-photo/${playerId}?asset=${asset}`;

  try {
    await db.execute(
      sql`UPDATE sc_player_profiles
          SET avatar_url = ${routeUrl}, updated_at = NOW()
          WHERE id = ${playerId} AND user_id = ${user.id}`
    );
  } catch (e) {
    await fs.unlink(filePath).catch(() => {});
    console.error('[POST /photo] db update', e);
    res.status(500).json({ error: 'Photo could not be saved. Please try again.' }); return;
  }

  res.json({ ok: true, avatarUrl: routeUrl });
}
