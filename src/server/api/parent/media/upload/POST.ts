/**
 * POST /api/parent/media/upload
 * Multipart file upload for parent portal media (photos and videos).
 *
 * Accepts: multipart/form-data
 *   file   — the file (required)
 *   caption — optional caption string
 *   postId  — optional sc_parent_posts.id to attach to
 *
 * Limits:
 *   Images: max 10 MB, MIME: image/jpeg, image/png, image/webp, image/gif
 *   Videos: max 100 MB, MIME: video/mp4, video/quicktime, video/webm
 *   Max 20 media items per user (soft cap)
 *
 * Files are stored at:
 *   /private/uploads/parent-media/{userId}/{uuid}.{ext}
 * Served through the authenticated route:
 *   GET /api/parent/uploads/media/:mediaId
 *
 * Returns: { id, publicUrl, mediaType, caption, createdAt }
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentMedia } from '@/server/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import multer from 'multer';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { PERSISTENT_UPLOAD_ROOT } from '@/server/lib/private-uploads.js';

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;  // 100 MB
const MAX_MEDIA_PER_USER = 20;

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  };
  return map[mime] ?? 'bin';
}

// ─── Multer — memory storage (we write to disk ourselves) ────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype) || ALLOWED_VIDEO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, GIF, MP4, MOV, WebM.`));
    }
  },
}).single('file');

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Reject full libraries before buffering a potentially 100 MB multipart body.
  // Keep the later check as another upload may finish during this transfer.
  try {
    const existing = await db.select({ id: scParentMedia.id }).from(scParentMedia)
      .where(and(eq(scParentMedia.userId, user.id), isNull(scParentMedia.deletedAt)));
    if (existing.length >= MAX_MEDIA_PER_USER) {
      return res.status(400).json({ code: 'MEDIA_QUOTA_REACHED', used: existing.length,
        limit: MAX_MEDIA_PER_USER,
        error: 'Your library is full (20 items). Attach an existing file from your library, or delete an unwanted library file before uploading a new one.' });
    }
  } catch {
    return res.status(503).json({ code: 'MEDIA_USAGE_UNAVAILABLE',
      error: 'Could not check library capacity. No file was saved. Please retry.' });
  }

  // Run multer
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  });

  // If multer already sent a response (error), stop
  if (res.headersSent) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded. Include a "file" field in the multipart body.' });
  }

  const mime = file.mimetype;
  const isImage = ALLOWED_IMAGE_TYPES.has(mime);
  const isVideo = ALLOWED_VIDEO_TYPES.has(mime);
  const mediaType = isImage ? 'image' : 'video';

  // Size check (multer limits to VIDEO_MAX_BYTES; tighten for images)
  if (isImage && file.size > IMAGE_MAX_BYTES) {
    return res.status(400).json({ error: `Image too large. Maximum size is ${IMAGE_MAX_BYTES / 1024 / 1024} MB.` });
  }
  if (!isImage && !isVideo) {
    return res.status(400).json({ error: 'Unsupported file type.' });
  }

  // Soft cap
  const existing = await db
    .select({ id: scParentMedia.id })
    .from(scParentMedia)
    .where(and(eq(scParentMedia.userId, user.id), isNull(scParentMedia.deletedAt)));

  if (existing.length >= MAX_MEDIA_PER_USER) {
    return res.status(400).json({
      code: 'MEDIA_QUOTA_REACHED', used: existing.length, limit: MAX_MEDIA_PER_USER,
      error: `You have reached the maximum of ${MAX_MEDIA_PER_USER} media items. Delete some before uploading more.`,
    });
  }

  // Build storage path — write to private storage (not web-accessible).
  // Served through the authenticated route GET /api/parent/uploads/media/:id.
  const id = randomUUID();
  const ext = extForMime(mime);
  const filename = `${id}.${ext}`;
  const relativePath = `parent-media/${user.id}/${filename}`;
  const privateDir  = `${PERSISTENT_UPLOAD_ROOT}/parent-media/${user.id}`;
  const storagePath = `${privateDir}/${filename}`;
  // publicUrl is the authenticated delivery route — not a static file URL.
  const publicUrl = `/api/parent/uploads/media/${id}`;

  // Write to persistent private storage
  try {
    await fs.mkdir(privateDir, { recursive: true });
    await fs.writeFile(storagePath, file.buffer);
  } catch (e) {
    console.error('[POST /api/parent/media/upload] write error', e);
    return res.status(500).json({ code: 'UPLOAD_STORAGE_FAILED', error: 'The file could not be stored. Your upload was not saved. Please retry.' });
  }

  // Parse optional fields
  const caption = typeof req.body?.caption === 'string' ? req.body.caption.slice(0, 512) : null;
  const postId = typeof req.body?.postId === 'string' ? req.body.postId : null;

  // Insert DB record
  try {
    await db.insert(scParentMedia).values({
      id,
      userId: user.id,
      postId,
      storagePath: relativePath,
      publicUrl,
      mediaType,
      originalName: file.originalname?.slice(0, 255) ?? null,
      mimeType: mime,
      sizeBytes: file.size,
      caption,
    });
  } catch (e) {
    // Clean up the file if DB insert fails
    await fs.unlink(storagePath).catch(() => {});
    console.error('[POST /api/parent/media/upload] db error', e);
    return res.status(500).json({ code: 'UPLOAD_RECORD_FAILED', error: 'The upload record could not be saved. Please retry.' });
  }

  res.status(201).json({
    id,
    publicUrl,
    mediaType,
    caption,
    originalName: file.originalname ?? null,
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
  });
}
