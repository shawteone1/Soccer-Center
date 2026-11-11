/**
 * GET /api/my-soccer/league-club-feed
 *
 * Returns videos for a specific channel slug (league or club) from the shared
 * YouTube cache. Requires authentication — club content is not publicly accessible.
 *
 * Query params:
 *   slug    required — channel slug (e.g. "premier-league", "arsenal")
 *   limit   max videos to return (default 6, max 50)
 *   offset  pagination offset (default 0)
 *   tag     optional tag filter: highlights | interviews | training | features
 *
 * Returns:
 *   { videos, total, hasMore, channelName, channelUrl, status }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scYoutubeCache } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import channelsData from '../../../../data/channels.json';

interface ChannelSource {
  slug: string;
  name: string;
  kind: 'club' | 'league';
  channelUrl: string;
  website: string;
  enabled?: boolean;
}

interface CachedVideo {
  id: string;
  title: string;
  publishedAt: string;
  duration: string;
  thumbnail: string | null;
  tags: string[];
  embeddable: boolean;
  watchUrl: string;
}

const ALL_CHANNELS = channelsData as ChannelSource[];

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const slug = (req.query.slug as string) ?? '';
  const limitParam = parseInt((req.query.limit as string) ?? '6', 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0', 10));
  const tagFilter = (req.query.tag as string) ?? '';

  if (!slug) {
    res.status(400).json({ error: 'slug is required' });
    return;
  }

  const channel = ALL_CHANNELS.find((ch) => ch.slug === slug);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  // Load from cache
  const [row] = await db
    .select({ payload: scYoutubeCache.payload, fetchedAt: scYoutubeCache.fetchedAt, syncError: scYoutubeCache.syncError })
    .from(scYoutubeCache)
    .where(eq(scYoutubeCache.slug, slug))
    .limit(1);

  let videos: CachedVideo[] = [];
  let status: 'ready' | 'empty' | 'error' = 'empty';

  if (row?.payload) {
    try {
      const parsed = (typeof row.payload === 'string'
        ? JSON.parse(row.payload)
        : row.payload) as { videos?: CachedVideo[] };
      videos = parsed.videos ?? [];
      status = videos.length > 0 ? 'ready' : 'empty';
    } catch {
      status = 'error';
    }
  }

  // Apply tag filter
  const filtered = tagFilter
    ? videos.filter((v) => v.tags.includes(tagFilter))
    : videos;

  // Sort newest first
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  res
    .set('Cache-Control', 'private, max-age=60')
    .json({
      videos: page,
      total,
      hasMore: offset + limit < total,
      channelName: channel.name,
      channelUrl: channel.channelUrl,
      status,
    });
}
