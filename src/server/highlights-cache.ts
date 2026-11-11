/**
 * YouTube highlights cache service.
 * Ported from the reference src/cache.mjs — atomic DB claims, 4-hour refresh
 * interval, 7-day purge, stale-retention on failure, and quota-safe public reads.
 *
 * Public GET reads the database only. Visitors NEVER trigger YouTube API calls.
 */

import { randomUUID } from 'node:crypto';
import { db } from './db/client.js';
import { scYoutubeCache } from './db/schema.js';
import { notInArray, lt, sql } from 'drizzle-orm';
import {
  apiClient,
  fetchChannel,
  publicSnapshot,
  validateSources,
  type ChannelSource,
  type PublicSnapshot,
} from './youtube.js';

export interface FeedServiceOptions {
  key: string;
  sources: ChannelSource[];
  region?: string;
  verified?: boolean;
}

export interface FeedService {
  refreshDue(): Promise<void>;
  snapshot(): Promise<PublicSnapshot>;
}

export function createFeedService({
  key,
  sources,
  region = 'US',
  verified = false,
}: FeedServiceOptions): FeedService {
  const approved = validateSources(sources);
  if (!/^[A-Z]{2}$/.test(region)) throw new Error('Use a two-letter country code.');

  let active = false;

  async function refreshDue(): Promise<void> {
    if (active || !verified || !key || key.startsWith('REPLACE_')) return;
    active = true;
    try {
      const api = apiClient(key);

      for (const s of approved) {
        // Ensure a row exists for this slug (INSERT IGNORE equivalent)
        await db
          .insert(scYoutubeCache)
          .values({ slug: s.slug, payload: JSON.stringify({ videos: [] }) })
          .onDuplicateKeyUpdate({ set: { slug: s.slug } });

        // Atomic claim: only refresh if last_attempt is NULL or > 4 hours ago
        const claim = randomUUID();
        const updated = await db.execute(sql`
          UPDATE sc_youtube_cache
          SET last_attempt = UTC_TIMESTAMP(), refresh_token = ${claim}
          WHERE slug = ${s.slug}
            AND (last_attempt IS NULL OR last_attempt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 HOUR))
        `);

        // mysql2 returns [ResultSetHeader, ...]; affectedRows is on [0]
        const affectedRows = (updated as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
        if (!affectedRows) continue;

        try {
          const payload = await fetchChannel(s, api, { region });
          await db.execute(sql`
            UPDATE sc_youtube_cache
            SET payload = ${JSON.stringify(payload)}, fetched_at = UTC_TIMESTAMP(), sync_error = NULL
            WHERE slug = ${s.slug} AND refresh_token = ${claim}
          `);
        } catch {
          // Preserve previous snapshot; mark stale
          await db.execute(sql`
            UPDATE sc_youtube_cache
            SET sync_error = 'Source refresh failed. Last supported snapshot retained temporarily.'
            WHERE slug = ${s.slug} AND refresh_token = ${claim}
          `);
        }
      }

      // Purge API metadata older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await db
        .update(scYoutubeCache)
        .set({ payload: JSON.stringify({ videos: [] }) })
        .where(lt(scYoutubeCache.fetchedAt, sevenDaysAgo));

      // Remove rows for slugs no longer in the approved list
      const approvedSlugs = approved.map((s) => s.slug);
      await db
        .delete(scYoutubeCache)
        .where(notInArray(scYoutubeCache.slug, approvedSlugs));
    } finally {
      active = false;
    }
  }

  async function snapshot(): Promise<PublicSnapshot> {
    const rows = await db
      .select({
        slug: scYoutubeCache.slug,
        payload: scYoutubeCache.payload,
        fetched_at: scYoutubeCache.fetchedAt,
        sync_error: scYoutubeCache.syncError,
      })
      .from(scYoutubeCache);

    return publicSnapshot(approved, rows, { region, verified });
  }

  return { refreshDue, snapshot };
}

// ─── Singleton service ────────────────────────────────────────────────────────
// Loaded once at server start; shared by the API route and the scheduler.

import { getSecret } from '#airo/secrets';
// Inline the channel list at build time — avoids runtime filesystem path issues
// in the production bundle (dist/server.bundle.mjs lives at /app/dist/).
import channelsData from '../../src/data/channels.json';

function loadChannels(): ChannelSource[] {
  return channelsData as ChannelSource[];
}

function rawSecret(name: string): string {
  const v = getSecret(name);
  return typeof v === 'string' ? v : '';
}

const _channels = loadChannels();
const _key = rawSecret('YOUTUBE_API_KEY');
const _verified = rawSecret('CHANNELS_VERIFIED') === 'true';
const _region = rawSecret('YOUTUBE_REGION') || 'US';

let _service: FeedService | null = null;

export function getHighlightsFeedService(): FeedService {
  if (_service) return _service;
  if (!_channels.length) {
    // Return a no-op service if channels.json couldn't be loaded
    _service = {
      async refreshDue() { /* no-op */ },
      async snapshot() {
        return { channels: [], region: _region, refreshHours: 4, checkedAt: new Date().toISOString() };
      },
    };
    return _service;
  }
  _service = createFeedService({
    key: _key,
    sources: _channels,
    region: _region,
    verified: _verified,
  });
  return _service;
}
