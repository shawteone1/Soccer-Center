/**
 * POST /api/my-soccer/media/upload
 *
 * Fan avatar and cover image upload endpoint.
 * Auth-gated to FAN + PARENT (requireFanAccess).
 * Does NOT reuse /api/parent/media/upload — separate storage path and no DB record.
 *
 * Accepts: multipart/form-data
 *   file      — the image file (required)
 *   mediaType — 'avatar' | 'cover' (required)
 *
 * Limits:
 *   Images: max 8 MB, MIME: image/jpeg, image/png, image/webp, image/gif
 *
 * Files stored at:
 *   /shared-storage/public/assets/fan-media/{userId}/{mediaType}-{uuid}.{ext}
 * Served at:
 *   /airo-assets/uploads/fan-media/{userId}/{mediaType}-{uuid}.{ext}
 *
 * Returns: { publicUrl: string }
 */
import type { Request, Response } from 'express';
import { requireFanAccess } from '@/server/auth-policy.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] ?? 'jpg';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
}).single('file');

export default async function handler(req: Request, res: Response): Promise<void> {
  const userObj = await requireFanAccess(req, res);
  if (!userObj) return;
  // requireFanAccess returns a PolicyUser object — extract the string id
  const userId = userObj.id;

  // Run multer
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((err: unknown) => {
    res.status(400).json({ error: String(err) });
  });

  if (res.headersSent) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const mediaType = (req.body?.mediaType as string) ?? 'avatar';
  if (!['avatar', 'cover'].includes(mediaType)) {
    res.status(400).json({ error: 'mediaType must be avatar or cover' });
    return;
  }

  const ext = extForMime(file.mimetype);
  const uuid = randomUUID();
  const filename = `${mediaType}-${uuid}.${ext}`;
  const storageDir = `/shared-storage/public/assets/fan-media/${userId}`;
  const storagePath = path.join(storageDir, filename);
  const publicUrl = `/airo-assets/uploads/fan-media/${userId}/${filename}`;

  try {
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(storagePath, file.buffer);
    res.json({ publicUrl });
  } catch (err) {
    console.error('[fan media upload]', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}
