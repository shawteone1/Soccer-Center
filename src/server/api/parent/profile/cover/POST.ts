/**
 * POST /api/parent/profile/cover
 *
 * Multipart upload for the parent profile cover banner photo.
 * Accepts JPEG, PNG, WebP — max 10 MB.
 *
 * Stores the file at:
 *   /shared-storage/public/assets/uploads/parent-covers/{userId}-{revision}.{ext}
 * Served at:
 *   /airo-assets/uploads/parent-covers/{userId}-{revision}.{ext}
 *
 * Updates sc_member_profiles.cover_image_url for the authenticated user.
 * A saved photo takes precedence over the CSS preset.
 *
 * Returns: { publicUrl: string }
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scMemberProfiles } from '@/server/db/schema.js';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function extForMime(mime: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime] ?? 'jpg';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
}).single('file');

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);
  upload(req, res, async (err) => {

    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const ext = extForMime(req.file.mimetype);
    const filename = `${user.id}-${randomUUID()}.${ext}`;
    const dir = '/shared-storage/public/assets/uploads/parent-covers';
    const filePath = path.join(dir, filename);
    const publicUrl = `/airo-assets/uploads/parent-covers/${filename}`;

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, req.file.buffer);
    } catch (writeErr) {
      console.error('[cover upload] write error', writeErr);
      res.status(500).json({ error: 'Failed to save cover image' });
      return;
    }

    try {
      // Update cover_image_url in scMemberProfiles (the table that has this column)
      await db
        .insert(scMemberProfiles)
        .values({ userId: user.id, coverImageUrl: publicUrl })
        .onDuplicateKeyUpdate({ set: { coverImageUrl: publicUrl } });
    } catch (dbErr) {
      console.error('[cover upload] db error', dbErr);
      res.status(500).json({ error: 'The cover could not be saved. Please try again.' });
      return;
    }

    res.json({ publicUrl });
  });
}
