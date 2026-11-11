/**
 * GET /api/my-soccer/publisher-feed
 *
 * Returns a personalized video feed from publisher (media) channels the user
 * follows. Reads ONLY from sc_youtube_cache — never calls YouTube API directly.
 *
 * Query params:
 *   limit   — max videos to return (default 30, max 100)
 *   filter  — channel slug to filter by (optional)
 *
 * Response: { videos, publisherStates, total }
 *
 * NBC Sports content is filtered to soccer-relevant videos using title keywords
 * to avoid surfacing NFL/NBA/NHL content.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scMemberProfiles, scYoutubeCache } from '@/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

// ── Publisher channel definitions ─────────────────────────────────────────────

export interface PublisherChannel {
  slug: string;
  name: string;
  website: string;
  channelUrl: string;
  /** When true, apply soccer keyword filter to titles */
  soccerFilterRequired: boolean;
}

export const PUBLISHER_CHANNELS: PublisherChannel[] = [
  {
    slug: 'nbc-sports',
    name: 'NBC Sports',
    website: 'https://www.nbcsports.com/soccer',
    channelUrl: 'https://www.youtube.com/@NBCSports',
    // NBC Sports covers multiple sports — filter to soccer-relevant content
    soccerFilterRequired: true,
  },
  {
    slug: 'cbs-sports-golazo',
    name: 'CBS Sports Golazo',
    website: 'https://www.cbssports.com/soccer/',
    channelUrl: 'https://www.youtube.com/@CBSSportsGolazo',
    soccerFilterRequired: false,
  },
  {
    slug: 'espn-fc',
    name: 'ESPN FC',
    website: 'https://www.espn.com/soccer/',
    channelUrl: 'https://www.youtube.com/@ESPNFC',
    soccerFilterRequired: false,
  },
];

// Soccer-relevant title keywords for NBC Sports filtering
const SOCCER_KEYWORDS =
  /\b(soccer|football|premier league|epl|mls|usmnt|uswnt|world cup|champions league|europa|bundesliga|laliga|serie a|ligue 1|fa cup|goal|goals|match|highlights|preview|recap|transfer|signing|manager|coach|fixture|standings|table|relegation|promotion|penalty|free kick|hat trick|brace|clean sheet|shutout|goalkeeper|striker|midfielder|defender|winger|fullback|center back|sweeper|playmaker|set piece|corner|offside|var|referee|pitch|kit|jersey|squad|lineup|formation|tactics|press conference|post-match|pre-match|matchday|gameweek|matchweek)\b/i;

function isSoccerRelevant(title: string): boolean {
  return SOCCER_KEYWORDS.test(title);
}

// ── Cache payload shape (mirrors highlights-cache) ────────────────────────────

interface CachedVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  channelTitle: string;
  tags: string[];
  duration?: string;
}

interface CachePayload {
  videos: CachedVideo[];
}

// ── Response types ─────────────────────────────────────────────────────────────

export interface PublisherVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  channelTitle: string;
  tags: string[];
  duration?: string;
  publisherSlug: string;
  publisherName: string;
  channelUrl: string;
  watchUrl: string;
}

export interface PublisherState {
  slug: string;
  name: string;
  channelUrl: string;
  website: string;
  hasVideos: boolean;
  videoCount: number;
  cachedAt: string | null;
}

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limitParam = parseInt((req.query.limit as string) ?? '30', 10);
  const limit = Math.min(Math.max(1, limitParam), 100);
  const filterSlug = typeof req.query.filter === 'string' ? req.query.filter : '';

  // Load user's followed publishers
  const [profileRow] = await db
    .select({ favPublishers: scMemberProfiles.favPublishers })
    .from(scMemberProfiles)
    .where(eq(scMemberProfiles.userId, userId))
    .limit(1);

  const followedSlugs = parseJson(profileRow?.favPublishers);

  // Determine which publisher slugs to fetch
  const targetSlugs = filterSlug
    ? followedSlugs.filter(s => s === filterSlug)
    : followedSlugs;

  if (targetSlugs.length === 0) {
    return res.json({
      videos: [],
      publisherStates: PUBLISHER_CHANNELS.map(p => ({
        slug: p.slug,
        name: p.name,
        channelUrl: p.channelUrl,
        website: p.website,
        hasVideos: false,
        videoCount: 0,
        cachedAt: null,
      })),
      total: 0,
      noFollows: followedSlugs.length === 0,
    });
  }

  // Load cache rows for followed publisher slugs
  const cacheRows = await db
    .select({
      slug: scYoutubeCache.slug,
      payload: scYoutubeCache.payload,
      fetchedAt: scYoutubeCache.fetchedAt,
    })
    .from(scYoutubeCache)
    .where(inArray(scYoutubeCache.slug, targetSlugs));

  const cacheMap = new Map(cacheRows.map(r => [r.slug, r]));

  // Build video list and publisher states
  const allVideos: PublisherVideoItem[] = [];
  const publisherStates: PublisherState[] = [];
  const seenIds = new Set<string>();

  for (const pub of PUBLISHER_CHANNELS) {
    const isFollowed = followedSlugs.includes(pub.slug);
    const row = cacheMap.get(pub.slug);
    let videos: CachedVideo[] = [];

    if (row?.payload) {
      try {
        const parsed = (typeof row.payload === 'string'
          ? JSON.parse(row.payload)
          : row.payload) as CachePayload;
        videos = parsed.videos ?? [];
      } catch { /* stale/corrupt — treat as empty */ }
    }

    // Apply soccer filter for NBC Sports
    if (pub.soccerFilterRequired) {
      videos = videos.filter(v => isSoccerRelevant(v.title));
    }

    publisherStates.push({
      slug: pub.slug,
      name: pub.name,
      channelUrl: pub.channelUrl,
      website: pub.website,
      hasVideos: videos.length > 0,
      videoCount: videos.length,
      cachedAt: row?.fetchedAt ? new Date(row.fetchedAt).toISOString() : null,
    });

    if (!isFollowed || (filterSlug && pub.slug !== filterSlug)) continue;

    for (const v of videos) {
      if (seenIds.has(v.id)) continue; // deduplicate by video ID
      seenIds.add(v.id);
      allVideos.push({
        id: v.id,
        title: v.title,
        publishedAt: v.publishedAt,
        thumbnail: v.thumbnail,
        channelTitle: v.channelTitle,
        tags: v.tags,
        duration: v.duration,
        publisherSlug: pub.slug,
        publisherName: pub.name,
        channelUrl: pub.channelUrl,
        watchUrl: `https://www.youtube.com/watch?v=${v.id}`,
      });
    }
  }

  // Sort newest first, then apply limit
  allVideos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const paged = allVideos.slice(0, limit);

  return res.json({
    videos: paged,
    publisherStates,
    total: allVideos.length,
    noFollows: followedSlugs.length === 0,
  });
}
