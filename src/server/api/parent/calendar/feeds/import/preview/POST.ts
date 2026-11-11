/**
 * POST /api/parent/calendar/feeds/import/preview
 *
 * Accepts a .ics file upload, parses it, and returns a preview of upcoming
 * events WITHOUT saving anything to the database. The client shows this
 * preview and the user confirms before the actual import is committed.
 *
 * Multipart/form-data fields:
 *   file — .ics file (required, max 2 MB)
 *
 * Response:
 *   { eventCount, events: [{ uid, title, start, end, allDay, location }] }
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { parseIcal } from '@/server/ical-parser.js';
import multer from 'multer';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/calendar' ||
      file.mimetype === 'application/ics' ||
      file.originalname.toLowerCase().endsWith('.ics');
    if (ok) cb(null, true);
    else cb(new Error('Only .ics calendar files are accepted'));
  },
}).single('file');

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Run multer middleware
  let multerError: Error | null = null;
  await new Promise<void>((resolve) => {
    upload(req, res, (err) => {
      if (err instanceof Error) multerError = err;
      resolve();
    });
  });

  if (multerError) {
    res.status(400).json({ error: (multerError as Error).message });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Send a .ics file in the "file" field.' });
    return;
  }

  // Parse — no DB writes
  const icalText = file.buffer.toString('utf-8');
  // Use a stable sentinel feed ID for parsing (not persisted)
  const sentinelFeedId = 'preview-only';

  let parsedEvents: ReturnType<typeof parseIcal>;
  try {
    parsedEvents = parseIcal(icalText, sentinelFeedId, 'https://ics-file-import.local/');
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    res.status(422).json({ error: `Could not parse .ics file: ${msg}` });
    return;
  }

  const preview = parsedEvents
    .filter(ev => new Date(ev.startAt) >= new Date())
    .slice(0, 10)
    .map(ev => ({
      uid: ev.uid,
      title: ev.title,
      start: ev.startAt,
      end: ev.endAt,
      allDay: ev.allDay,
      location: ev.location,
    }));

  res.json({
    eventCount: parsedEvents.length,
    events: preview,
  });
}
