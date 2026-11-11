/**
 * GET /api/my-soccer/club-feed
 *
 * Returns a personalized video feed from the shared YouTube cache,
 * filtered and mixed according to the member's favTeams preferences.
 *
 * Rules:
 *  - Reads ONLY from the shared sc_youtube_cache — never calls YouTube API.
 *  - If favTeams includes 'all-premier-league', returns videos from all PL clubs.
 *  - If favTeams includes 'premier-league', includes the PL official channel.
 *  - Videos from multiple clubs are interleaved round-robin (fair mix).
 *  - Deduped by video ID.
 *  - Sorted by publishedAt desc within each round-robin pass.
 *  - Each video carries a matchReason: "From your club: Arsenal".
 *  - If a club has no cached videos, returns an empty-state entry for it.
 *
 * Query params:
 *   limit   max videos to return (default 30, max 100)
 *   tag     filter by tag: highlights | interviews | training | features
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scMemberProfiles, scYoutubeCache } from '@/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import plClubsData from '../../../../data/pl-clubs.json';
import channelsData from '../../../../data/channels.json';

interface PlClub {
  slug: string;
  name: string;
  channelSlug: string;
  verified: boolean;
  crest: string | null;
}

interface ChannelSource {
  slug: string;
  name: string;
  kind: 'club' | 'league';
  channelId: string | null;
  channelUrl: string;
  website: string;
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
  regionAllowed?: boolean;
}

interface CachePayload {
  channelId?: string;
  channelTitle?: string;
  videos: CachedVideo[];
}

export interface ClubVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  duration: string;
  thumbnail: string | null;
  tags: string[];
  embeddable: boolean;
  watchUrl: string;
  channelSlug: string;
  channelName: string;
  clubSlug: string;
  clubName: string;
  matchReason: string;
}

export interface ClubFeedResponse {
  videos: ClubVideoItem[];
  clubStates: ClubState[];
  total: number;
  isLeagueOnly: boolean;
}

export interface ClubState {
  slug: string;
  name: string;
  channelUrl: string;
  hasVideos: boolean;
  verified: boolean;
  videoCount: number;
}

const PL_CLUBS = plClubsData as PlClub[];
const ALL_CHANNELS = channelsData as ChannelSource[];

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

/** Round-robin interleave: takes one video from each club per pass */
function roundRobinMix(buckets: ClubVideoItem[][]): ClubVideoItem[] {
  const result: ClubVideoItem[] = [];
  const seen = new Set<string>();
  const queues = buckets.map((b) => [...b]);
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
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limitParam = parseInt((req.query.limit as string) ?? '30', 10);
  const limit = Math.min(Math.max(1, limitParam), 100);
  const tagFilter = (req.query.tag as string) ?? '';

  // Load member profile — both favTeams (clubs) and favLeagues
  const [profileRow] = await db
    .select({ favTeams: scMemberProfiles.favTeams, fanInterests: scMemberProfiles.fanInterests, favLeagues: scMemberProfiles.favLeagues })
    .from(scMemberProfiles)
    .where(eq(scMemberProfiles.userId, userId))
    .limit(1);

  const favTeams = parseJson(profileRow?.favTeams);
  const fanInterests = parseJson(profileRow?.fanInterests).map((f) => f.toLowerCase());
  const favLeagues = parseJson(profileRow?.favLeagues);

  // Determine which club slugs to fetch
  const wantsAllPL = favTeams.includes('all-premier-league');
  const wantsPLChannel = favTeams.includes('premier-league') || fanInterests.includes('premier league') || favLeagues.includes('premier-league');
  // clubSlugs must be declared before isLeagueOnly / allSlugs reference it
  let clubSlugs: string[] = [];
  if (wantsAllPL) {
    clubSlugs = PL_CLUBS.map((c) => c.channelSlug);
  } else {
    // Map favTeam slugs to channel slugs
    clubSlugs = favTeams
      .filter((t) => t !== 'premier-league')
      .map((t) => {
        const club = PL_CLUBS.find((c) => c.slug === t);
        return club?.channelSlug ?? t;
      })
      .filter((s) => ALL_CHANNELS.some((ch) => ch.slug === s));
  }

  // Include all followed leagues as channel slugs
  const followedLeagueSlugs = favLeagues.filter((s) => ALL_CHANNELS.some((ch) => ch.slug === s));

  // Always include PL official channel if wanted
  const leagueSlugs: string[] = [
    ...(wantsPLChannel ? ['premier-league'] : []),
    ...followedLeagueSlugs.filter((s) => s !== 'premier-league'),
  ];
  const allSlugs = [...new Set([...leagueSlugs, ...clubSlugs])];
  // isLeagueOnly: user follows leagues but no specific clubs
  const isLeagueOnly = clubSlugs.length === 0 && allSlugs.length > 0;

  if (allSlugs.length === 0) {
    res.json({ videos: [], clubStates: [], total: 0, isLeagueOnly: false } satisfies ClubFeedResponse);
    return;
  }

  // Load cache rows for all relevant slugs
  const cacheRows = await db
    .select({ slug: scYoutubeCache.slug, payload: scYoutubeCache.payload, fetchedAt: scYoutubeCache.fetchedAt })
    .from(scYoutubeCache)
    .where(inArray(scYoutubeCache.slug, allSlugs));

  const cacheMap = new Map(cacheRows.map((r) => [r.slug, r]));

  // Build per-club video buckets
  const buckets: ClubVideoItem[][] = [];
  const clubStates: ClubState[] = [];

  for (const slug of allSlugs) {
    const channel = ALL_CHANNELS.find((ch) => ch.slug === slug);
    if (!channel) continue;

    const club = PL_CLUBS.find((c) => c.channelSlug === slug);
    const displayName = club?.name ?? channel.name;
    const isLeagueChannel = channel.kind === 'league' || (channel.kind as string) === 'competition';
    const reason = isLeagueChannel
      ? `From ${displayName}`
      : `From your club: ${displayName}`;

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

    // Apply tag filter
    const filtered = tagFilter
      ? videos.filter((v) => v.tags.includes(tagFilter))
      : videos;

    // Sort newest first
    const sorted = [...filtered].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

    const items: ClubVideoItem[] = sorted.map((v) => ({
      id: v.id,
      title: v.title,
      publishedAt: v.publishedAt,
      duration: v.duration,
      thumbnail: v.thumbnail,
      tags: v.tags,
      embeddable: v.embeddable,
      watchUrl: v.watchUrl,
      channelSlug: slug,
      channelName: channel.name,
      clubSlug: club?.slug ?? slug,
      clubName: displayName,
      matchReason: reason,
    }));

    buckets.push(items);
    clubStates.push({
      slug: club?.slug ?? slug,
      name: displayName,
      channelUrl: channel.channelUrl,
      hasVideos: items.length > 0,
      verified: club?.verified ?? true,
      videoCount: items.length,
    });
  }

  // Mix fairly and cap
  const mixed = roundRobinMix(buckets).slice(0, limit);

  res.set('Cache-Control', 'private, max-age=60').json({
    videos: mixed,
    clubStates,
    total: mixed.length,
    isLeagueOnly,
  } satisfies ClubFeedResponse);
}
