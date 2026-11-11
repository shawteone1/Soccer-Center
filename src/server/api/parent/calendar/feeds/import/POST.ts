/**
 * POST /api/parent/calendar/feeds/import
 *
 * Accepts a .ics file upload, parses it, and saves events as a one-time import.
 * No URL is stored or re-fetched. The feed is created with provider='import'.
 *
 * Multipart/form-data fields:
 *   file      — .ics file (required, max 2 MB)
 *   label     — friendly name (required)
 *   playerIds — JSON array string of player IDs (optional)
 *
 * The encrypted_url column stores a sentinel value (no real URL) since there
 * is no network source to re-fetch. The sync endpoint refuses import feeds (409).
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds, scCalendarEvents } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID, createCipheriv, randomBytes } from 'crypto';
import { getSecret } from '#airo/secrets';
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

function encryptSentinel(feedId: string): string {
  const keyHex = getSecret('FEED_ENCRYPTION_KEY') as string | undefined;
  if (!keyHex || keyHex.length < 64) {
    throw new Error('FEED_ENCRYPTION_KEY not configured or too short');
  }
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const iv = randomBytes(12);
  // Sentinel value — not a real URL, never fetched
  const sentinel = `ics-file-import::${feedId}`;
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(sentinel, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  });
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  // Run multer middleware
  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
    return;
  });

  // If response already sent (multer error above), stop
  if (res.headersSent) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Send a .ics file in the "file" field.' });
    return;
  }

  const label = (req.body as { label?: string }).label?.trim();
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const rawPlayerIds = (req.body as { playerIds?: string }).playerIds;
  let validPlayerIds: string[] = [];
  if (rawPlayerIds) {
    try {
      const parsed = JSON.parse(rawPlayerIds) as unknown;
      if (Array.isArray(parsed)) {
        validPlayerIds = parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      }
    } catch {
      // ignore malformed playerIds
    }
  }

  // Check feed limit
  const existing = await db
    .select({ id: scCalendarFeeds.id })
    .from(scCalendarFeeds)
    .where(eq(scCalendarFeeds.userId, user.id));

  if (existing.length >= 10) {
    res.status(400).json({ error: 'Maximum of 10 calendar feeds reached' });
    return;
  }

  // Parse the .ics file
  const icalText = file.buffer.toString('utf-8');
  const feedId = randomUUID();

  let parsedEvents: ReturnType<typeof parseIcal>;
  try {
    // Use a sentinel URL for provider inference (no real URL for file imports)
    parsedEvents = parseIcal(icalText, feedId, 'https://ics-file-import.local/');
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    res.status(422).json({ error: `Could not parse .ics file: ${msg}` });
    return;
  }

  // Encrypt sentinel (not a real URL — never fetched)
  let encryptedUrl: string;
  try {
    encryptedUrl = encryptSentinel(feedId);
  } catch (e) {
    console.error('[POST /api/parent/calendar/feeds/import] encrypt error', e);
    res.status(500).json({ error: 'Encryption configuration error — contact support' });
    return;
  }

  try {
    // Create feed row and events atomically. If the events insert fails,
    // the transaction rolls back and no orphaned feed row is left behind.
    await db.transaction(async (tx) => {
      await tx.insert(scCalendarFeeds).values({
        id: feedId,
        userId: user.id,
        provider: 'import',
        label,
        encryptedUrl,
        lastFetchStatus: 'ok',
        eventCount: parsedEvents.length,
        portalContext: 'parent',
        playerIds: validPlayerIds.length > 0 ? JSON.stringify(validPlayerIds) : null,
      });

      if (parsedEvents.length > 0) {
        await tx.insert(scCalendarEvents).values(
          parsedEvents.map(ev => ({
            id: randomUUID(),
            feedId,
            userId: user.id,
            uid: ev.uid.slice(0, 512),
            title: ev.title.slice(0, 512),
            startAt: ev.startAt,
            endAt: ev.endAt ?? ev.startAt,
            allDay: ev.allDay,
            location: ev.location?.slice(0, 512) ?? undefined,
            description: ev.description?.slice(0, 4000) ?? undefined,
            provider: 'import',
            teamName: ev.teamName?.slice(0, 255) ?? undefined,
            eventType: ev.eventType.slice(0, 64),
            status: ev.status.slice(0, 32),
            sequence: ev.sequence,
          })),
        );
      }
    });

    res.status(201).json({
      id: feedId,
      provider: 'import',
      label,
      eventCount: parsedEvents.length,
      lastFetchedAt: new Date().toISOString(),
      lastFetchStatus: 'ok',
      playerIds: validPlayerIds,
      // Preview: first 10 upcoming events
      preview: parsedEvents
        .filter(ev => new Date(ev.startAt) >= new Date())
        .slice(0, 10)
        .map(ev => ({
          uid: ev.uid,
          title: ev.title,
          start: ev.startAt,
          end: ev.endAt,
          allDay: ev.allDay,
          location: ev.location,
        })),
    });
  } catch (e) {
    console.error('[POST /api/parent/calendar/feeds/import]', e);
    res.status(500).json({ error: 'Failed to save imported calendar' });
  }
}
