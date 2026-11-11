/**
 * GET /api/parent/feed
 *
 * Parent Portal club and news feed.
 *
 * Preference source: sc_parent_follows (sourceType = 'club' | 'league' | 'media')
 * NOT sc_member_profiles.favTeams — that is the Fan Arena preference store.
 * A parent who has never used the Fan Arena will have no scMemberProfiles row
 * and would get an empty feed from /api/my-soccer/club-feed.
 *
 * Auth: requireParentAccess — enforces PARENT_PORTAL_ENABLED + accessType = 'PARENT'.
 *
 * Response shape matches /api/my-soccer/club-feed so PpCommunityFeed can use
 * either endpoint without changes.
 *
 * Query params:
 *   type    'videos' | 'news' (default: 'videos')
 *   limit   max items to return (default 20, max 100)
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scParentFollows, scYoutubeCache } from '@/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import channelsData from '../../../../data/channels.json';
import plClubsData from '../../../../data/pl-clubs.json';

interface ChannelSource {
  slug: string;
  name: string;
  kind: 'club' | 'league';
  channelId: string | null;
  channelUrl: string;
  website: string;
}

interface PlClub {
  slug: string;
  name: string;
  channelSlug: string;
  verified: boolean;
  crest: string | null;
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

interface CachePayload {
  channelId?: string;
  channelTitle?: string;
  videos: CachedVideo[];
}

interface ClubVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string | null;
  watchUrl: string;
  clubName: string;
  matchReason: string;
  embeddable: boolean;
}

interface ClubState {
  slug: string;
  name: string;
  channelUrl: string;
  hasVideos: boolean;
  videoCount: number;
}

const ALL_CHANNELS = channelsData as ChannelSource[];
const PL_CLUBS = plClubsData as PlClub[];

/** Round-robin interleave across per-source buckets */
function roundRobinMix(buckets: ClubVideoItem[][]): ClubVideoItem[] {
  const result: ClubVideoItem[] = [];
  const seen = new Set<string>();
  const queues = buckets.map(b => [...b]);
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const q of queues) {
      while (q.length > 0) {
        const item = q.shift()!;
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
          anyLeft = true;
          break;
        }
      }
    }
  }
  return result;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const limitParam = parseInt((req.query.limit as string) ?? '20', 10);
  const limit = Math.min(Math.max(1, limitParam), 100);

  // ── Load this parent's source follows ────────────────────────────────────────
  const follows = await db
    .select({ sourceType: scParentFollows.sourceType, sourceId: scParentFollows.sourceId, sourceName: scParentFollows.sourceName })
    .from(scParentFollows)
    .where(eq(scParentFollows.userId, user.id));

  // Map follows to channel slugs.
  // sourceId is stored as a channel slug (e.g. 'arsenal', 'premier-league').
  // For club follows, also try the PL club slug → channelSlug mapping.
  const channelSlugs: string[] = [];
  for (const f of follows) {
    if (f.sourceType !== 'club' && f.sourceType !== 'league') continue;
    const id = f.sourceId;
    // Direct channel slug match
    if (ALL_CHANNELS.some(ch => ch.slug === id)) {
      channelSlugs.push(id);
      continue;
    }
    // PL club slug → channelSlug
    const plClub = PL_CLUBS.find(c => c.slug === id);
    if (plClub && ALL_CHANNELS.some(ch => ch.slug === plClub.channelSlug)) {
      channelSlugs.push(plClub.channelSlug);
    }
  }

  const allSlugs = [...new Set(channelSlugs)];

  if (allSlugs.length === 0) {
    res.json({ videos: [], clubStates: [], total: 0, isLeagueOnly: false });
    return;
  }

  // ── Load YouTube cache rows ───────────────────────────────────────────────────
  const cacheRows = await db
    .select({ slug: scYoutubeCache.slug, payload: scYoutubeCache.payload })
    .from(scYoutubeCache)
    .where(inArray(scYoutubeCache.slug, allSlugs));

  const cacheMap = new Map(cacheRows.map(r => [r.slug, r]));

  const buckets: ClubVideoItem[][] = [];
  const clubStates: ClubState[] = [];

  for (const slug of allSlugs) {
    const channel = ALL_CHANNELS.find(ch => ch.slug === slug);
    if (!channel) continue;

    const plClub = PL_CLUBS.find(c => c.channelSlug === slug);
    const displayName = plClub?.name ?? channel.name;
    const isLeague = channel.kind === 'league';
    const matchReason = isLeague ? `From ${displayName}` : `From your club: ${displayName}`;

    const row = cacheMap.get(slug);
    let videos: CachedVideo[] = [];
    if (row?.payload) {
      try {
        const parsed = (typeof row.payload === 'string'
          ? JSON.parse(row.payload)
          : row.payload) as CachePayload;
        videos = parsed.videos ?? [];
      } catch { /* stale/corrupt — treat as empty */ }
    }

    // Sort newest first
    videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    clubStates.push({
      slug,
      name: displayName,
      channelUrl: channel.channelUrl,
      hasVideos: videos.length > 0,
      videoCount: videos.length,
    });

    if (videos.length > 0) {
      buckets.push(videos.map(v => ({
        id: v.id,
        title: v.title,
        publishedAt: v.publishedAt,
        thumbnail: v.thumbnail,
        watchUrl: v.watchUrl,
        clubName: displayName,
        matchReason,
        embeddable: v.embeddable,
      })));
    }
  }

  const mixed = roundRobinMix(buckets).slice(0, limit);

  res.json({
    videos: mixed,
    clubStates,
    total: mixed.length,
    isLeagueOnly: buckets.length === 0 && allSlugs.length > 0,
  });
}
