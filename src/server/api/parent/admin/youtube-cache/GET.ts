/**
 * GET /api/parent/admin/youtube-cache
 *
 * Returns the actual sc_youtube_cache DB rows for every channel in channels.json,
 * plus scheduler state. Admin-only.
 *
 * Response shape:
 *   {
 *     verified: boolean,          // CHANNELS_VERIFIED secret value
 *     schedulerRunning: boolean,  // always true in prod (started at boot)
 *     channels: [{
 *       slug, name, kind, channelId, handle,
 *       dbRow: { exists, fetchedAt, lastAttempt, syncError, videoCount } | null,
 *       status: 'ready'|'not-ready'|'stale'|'expired'|'error'|'no-row'
 *     }]
 *   }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scYoutubeCache } from '@/server/db/schema.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';
import channelsData from '../../../../../data/channels.json';

interface ChannelEntry {
  slug: string;
  name: string;
  kind: string;
  handle?: string;
  channelId?: string;
  enabled?: boolean;
}

interface CacheRow {
  slug: string;
  payload: string;
  fetchedAt: Date | null;
  lastAttempt: Date | null;
  syncError: string | null;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const verified = getSecret('CHANNELS_VERIFIED') === 'true';
  const channels = (channelsData as ChannelEntry[]).filter((c) => c.enabled !== false);

  // Load all cache rows
  const rows = await db
    .select({
      slug: scYoutubeCache.slug,
      payload: scYoutubeCache.payload,
      fetchedAt: scYoutubeCache.fetchedAt,
      lastAttempt: scYoutubeCache.lastAttempt,
      syncError: scYoutubeCache.syncError,
    })
    .from(scYoutubeCache);

  const rowMap = new Map<string, CacheRow>(rows.map((r) => [r.slug, r as CacheRow]));
  const now = Date.now();

  const channelStatus = channels.map((ch) => {
    const row = rowMap.get(ch.slug);

    let videoCount = 0;
    if (row?.payload) {
      try {
        const p = JSON.parse(row.payload) as { videos?: unknown[] };
        videoCount = p.videos?.length ?? 0;
      } catch { /* malformed */ }
    }

    const fetchedAt = row?.fetchedAt instanceof Date ? row.fetchedAt : row?.fetchedAt ? new Date(String(row.fetchedAt).replace(' ', 'T') + 'Z') : null;
    const lastAttempt = row?.lastAttempt instanceof Date ? row.lastAttempt : row?.lastAttempt ? new Date(String(row.lastAttempt).replace(' ', 'T') + 'Z') : null;

    let status: string;
    if (!row) {
      status = 'no-row';
    } else if (!fetchedAt) {
      status = row.syncError ? 'error' : 'not-ready';
    } else if (now - fetchedAt.getTime() > SEVEN_DAYS_MS) {
      status = 'expired';
    } else if (row.syncError) {
      status = 'stale';
    } else if (now - fetchedAt.getTime() > FOUR_HOURS_MS) {
      status = 'stale';
    } else {
      status = 'ready';
    }

    return {
      slug: ch.slug,
      name: ch.name,
      kind: ch.kind,
      channelId: ch.channelId ?? null,
      handle: ch.handle ?? null,
      dbRow: row
        ? {
            exists: true,
            fetchedAt: fetchedAt?.toISOString() ?? null,
            lastAttempt: lastAttempt?.toISOString() ?? null,
            syncError: row.syncError ?? null,
            videoCount,
          }
        : null,
      status,
    };
  });

  const notReady = channelStatus.filter((c) => c.status !== 'ready');

  res.json({
    verified,
    schedulerRunning: true, // started at boot in production
    totalChannels: channels.length,
    readyCount: channelStatus.filter((c) => c.status === 'ready').length,
    notReadyCount: notReady.length,
    channels: channelStatus,
    notReady,
  });
}
