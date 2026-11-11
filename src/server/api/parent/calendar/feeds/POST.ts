/**
 * POST /api/parent/calendar/feeds
 * Save a new iCal subscription feed for the authenticated parent.
 *
 * Body:
 *   provider  — 'teamsnap' | 'playmetrics' | 'other' | 'import'
 *   label     — friendly name (required)
 *   url       — raw iCal subscription URL (https required; stored encrypted)
 *               For provider='import', this is the source URL used during the
 *               one-time import. It is stored encrypted but never re-fetched.
 *   playerIds — string[] of sc_player_profiles.id to associate (optional)
 *
 * Duplicate detection: if the same normalized URL already exists for this user,
 * the existing feed is returned and player associations are updated (not a new row).
 * Token-bearing URLs are preserved exactly — the normalized URL is compared
 * in-memory only and never logged or returned to the browser.
 *
 * The raw URL is encrypted with AES-256-GCM using FEED_ENCRYPTION_KEY before
 * storage. It is NEVER returned to the browser.
 *
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scCalendarFeeds } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getSecret } from '#airo/secrets';
import { validateFeedUrl } from '@/server/ical-parser.js';

const VALID_PROVIDERS = ['teamsnap', 'playmetrics', 'other', 'import'] as const;
type Provider = typeof VALID_PROVIDERS[number];

function encryptUrl(rawUrl: string): string {
  const keyHex = getSecret('FEED_ENCRYPTION_KEY') as string | undefined;
  if (!keyHex || keyHex.length < 64) {
    throw new Error('FEED_ENCRYPTION_KEY not configured or too short');
  }
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawUrl, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  });
}

function decryptUrlLocal(stored: string): string | null {
  try {
    const keyHex = getSecret('FEED_ENCRYPTION_KEY') as string | undefined;
    if (!keyHex || keyHex.length < 64) return null;
    const key = Buffer.from(keyHex.slice(0, 64), 'hex');
    const { iv, authTag, ciphertext } = JSON.parse(stored) as {
      iv: string; authTag: string; ciphertext: string;
    };
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    return decipher.update(Buffer.from(ciphertext, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { provider, label, url, playerIds } = req.body as {
    provider?: string;
    label?: string;
    url?: string;
    playerIds?: string[];
  };

  if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
    return res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
  }
  if (!label?.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  if (!url?.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  // Validate URL format and SSRF allowlist for subscription feeds.
  // Import feeds also go through URL validation — the URL is stored encrypted
  // and used as a reference, but never re-fetched after the initial import.
  const validated = validateFeedUrl(url.trim());
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }
  const normalizedUrl = validated.normalized;

  // Validate and normalise playerIds — must be non-empty strings
  const validPlayerIds = Array.isArray(playerIds)
    ? playerIds.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];

  // Load existing feeds for this user (max 10) and check for duplicate URL.
  // Decrypt each in-memory only — never log or return the plaintext URL.
  const existing = await db
    .select()
    .from(scCalendarFeeds)
    .where(eq(scCalendarFeeds.userId, user.id));

  if (existing.length >= 10) {
    return res.status(400).json({ error: 'Maximum of 10 calendar feeds reached' });
  }

  // Duplicate detection: compare normalized URL against all existing feeds
  for (const feed of existing) {
    const existingUrl = decryptUrlLocal(feed.encryptedUrl);
    if (existingUrl === normalizedUrl) {
      // Same URL already exists — update player associations and return existing feed
      const mergedPlayerIds = feed.playerIds
        ? Array.from(new Set([
            ...(JSON.parse(feed.playerIds) as string[]),
            ...validPlayerIds,
          ]))
        : validPlayerIds;

      await db.update(scCalendarFeeds)
        .set({ playerIds: mergedPlayerIds.length > 0 ? JSON.stringify(mergedPlayerIds) : null })
        .where(eq(scCalendarFeeds.id, feed.id));

      return res.status(200).json({
        id: feed.id,
        provider: feed.provider,
        label: feed.label ?? label.trim(),
        eventCount: feed.eventCount ?? 0,
        lastFetchedAt: feed.lastFetchedAt?.toISOString() ?? null,
        lastFetchStatus: feed.lastFetchStatus ?? null,
        playerIds: mergedPlayerIds,
        duplicate: true,
      });
    }
  }

  let encryptedUrl: string;
  try {
    encryptedUrl = encryptUrl(normalizedUrl);
  } catch (e) {
    console.error('[POST /api/parent/calendar/feeds] encrypt error', e);
    return res.status(500).json({ error: 'Encryption configuration error — contact support' });
  }

  const id = randomUUID();

  try {
    await db.insert(scCalendarFeeds).values({
      id,
      userId: user.id,
      provider: provider as Provider,
      label: label.trim(),
      encryptedUrl,
      lastFetchStatus: null,
      eventCount: 0,
      portalContext: 'parent',
      playerIds: validPlayerIds.length > 0 ? JSON.stringify(validPlayerIds) : null,
    });

    res.status(201).json({
      id,
      provider,
      label: label.trim(),
      eventCount: 0,
      lastFetchedAt: null,
      lastFetchStatus: null,
      playerIds: validPlayerIds,
    });
  } catch (e) {
    console.error('[POST /api/parent/calendar/feeds]', e);
    res.status(500).json({ error: 'Failed to save calendar feed' });
  }
}
