import { fetchPublicText } from '@/server/lib/safe-outbound-text.js';
/**
 * GET /api/my-soccer/unified-feed
 *
 * Merges YouTube club videos, RSS news articles, and podcast episodes
 * into a single chronological wall for the authenticated fan.
 *
 * Only includes content from sources/teams the user follows.
 * If the user follows nothing yet, returns an empty wall with a
 * `noFollows: true` flag so the UI can show the onboarding prompt.
 *
 * Query params:
 *   limit    default 20, max 40
 *   page     default 0 (0-based)
 *   type     optional — filter by type: video | article | podcast
 *
 * Response:
 *   {
 *     items: UnifiedFeedItem[],
 *     total: number,
 *     page: number,
 *     hasMore: boolean,
 *     noFollows: boolean,
 *     followedTeamCount: number,
 *     followedSourceCount: number,
 *   }
 *
 * UnifiedFeedItem:
 *   {
 *     id: string,
 *     type: 'video' | 'article' | 'podcast',
 *     title: string,
 *     description: string | null,
 *     imageUrl: string | null,
 *     url: string,
 *     publishedAt: string | null,   // ISO 8601
 *     sourceId: string,
 *     sourceLabel: string,
 *     sourceBadge: string,          // e.g. 'Sky Sports' | 'Arsenal' | 'Men in Blazers'
 *     badgeColor: 'primary' | 'secondary' | 'muted',
 *     // video-only
 *     videoId?: string,
 *     embeddable?: boolean,
 *     duration?: string,
 *     // podcast-only
 *     audioUrl?: string,
 *   }
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import {
  scMemberProfiles,
  scSources,
  scUserFollowing,
  scYoutubeCache,
} from '@/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import channelsData from '../../../../data/channels.json';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChannelSource {
  slug: string;
  name: string;
  kind: 'club' | 'league';
  channelId: string | null;
  channelUrl: string;
  competition?: string;
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

export interface UnifiedFeedItem {
  id: string;
  type: 'video' | 'article' | 'podcast';
  title: string;
  description: string | null;
  imageUrl: string | null;
  url: string;
  publishedAt: string | null;
  sourceId: string;
  sourceLabel: string;
  sourceBadge: string;
  badgeColor: 'primary' | 'secondary' | 'muted';
  // video
  videoId?: string;
  embeddable?: boolean;
  duration?: string;
  // podcast
  audioUrl?: string;
}

// ── RSS helpers ────────────────────────────────────────────────────────────────

interface CacheEntry { items: RssRaw[]; ts: number; endpoint: string; attemptedAt: number; failed: boolean }
const rssCache = new Map<string, CacheEntry>();
const RSS_TTL = 15 * 60 * 1000;

interface RssRaw {
  title: string;
  link: string;
  pubDate: string | null;
  isoDate: string | null;
  description: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
}

function text(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeEnt(m[1].trim()) || null;
}
function attr(xml: string, tag: string, attribute: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attribute}=["']([^"']*)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() || null : null;
}
function decodeEnt(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '').trim();
}

/** Decode HTML entities in a URL string (e.g. &amp; → &) without stripping tags. */
function decodeUrlEnt(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Extract the best image URL from an RSS item chunk.
 * Prefers media:content at highest width (Guardian/Sky Sports provide 140/460/700px).
 * Decodes HTML entities in the URL (&amp; → &) before returning.
 * Accepts any http URL — no extension filter (CDN URLs may lack .jpg extension).
 */
function extractImageUrl(chunk: string): string | null {
  // Collect all media:content url= values, pick highest width
  const contentRe = /<(?:[^:>]+:)?content\b[^>]*\surl=["']([^"']+)["'][^>]*>/gi;
  let best: { url: string; width: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = contentRe.exec(chunk)) !== null) {
    const rawUrl = m[1].trim();
    if (!rawUrl.startsWith('http')) continue;
    const url = decodeUrlEnt(rawUrl);
    const widthM = m[0].match(/\bwidth=["'](\d+)["']/i);
    const width = widthM ? parseInt(widthM[1], 10) : 0;
    if (!best || width > best.width) best = { url, width };
  }
  if (best) return best.url;

  // Fallback: media:thumbnail url=
  const thumbM = chunk.match(/<(?:[^:>]+:)?thumbnail\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
  if (thumbM) {
    const u = decodeUrlEnt(thumbM[1].trim());
    if (u.startsWith('http')) return u;
  }

  // Fallback: enclosure url= (images only, not audio)
  const encM = chunk.match(/<(?:[^:>]+:)?enclosure\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
  if (encM) {
    const u = decodeUrlEnt(encM[1].trim());
    const typeM = encM[0].match(/\btype=["']([^"']+)["']/i);
    const mime = typeM ? typeM[1] : '';
    if (u.startsWith('http') && (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)/i.test(u))) return u;
  }

  return null;
}
function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}
function toIso(d: string | null): string | null {
  if (!d) return null;
  try { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.toISOString(); }
  catch { return null; }
}

function parseRss(xml: string): RssRaw[] {
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const items: RssRaw[] = [];
  if (isAtom) {
    const re = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null && items.length < 40) {
      const c = m[1];
      const linkHref = (() => { const lr = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(c); return lr ? lr[1] : null; })();
      const pubDate = text(c, 'published') ?? text(c, 'updated');
      items.push({
        title: text(c, 'title') ?? '(no title)',
        link: linkHref ?? '',
        pubDate,
        isoDate: toIso(pubDate),
        description: stripHtml(text(c, 'summary') ?? text(c, 'content')),
        imageUrl: extractImageUrl(c),
        audioUrl: null,
      });
    }
  } else {
    const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null && items.length < 40) {
      const c = m[1];
      const pubDate = text(c, 'pubDate') ?? text(c, 'published');
      const enclosureUrl = attr(c, 'enclosure', 'url');
      const enclosureType = attr(c, 'enclosure', 'type') ?? '';
      const isAudio = enclosureType.startsWith('audio/') || enclosureUrl?.match(/\.(mp3|m4a|ogg|aac)(\?|$)/i) != null;
      items.push({
        title: text(c, 'title') ?? '(no title)',
        link: text(c, 'link') ?? attr(c, 'link', 'href') ?? '',
        pubDate,
        isoDate: toIso(pubDate),
        description: stripHtml(text(c, 'description') ?? text(c, 'summary')),
        imageUrl: isAudio ? null : extractImageUrl(c),
        audioUrl: isAudio ? enclosureUrl : null,
      });
    }
  }
  return items;
}

export async function fetchRss(sourceId: string, feedEndpoint: string): Promise<RssRaw[]> {
  const existing = rssCache.get(sourceId);
  const cached = existing?.endpoint === feedEndpoint ? existing : undefined;
  if (cached && Date.now() - cached.attemptedAt < (cached.failed ? 30_000 : RSS_TTL)) return cached.items;
  try {
    const xml = await fetchPublicText(feedEndpoint,{allowHttp:true,timeoutMs:8_000});
    if (!/<(?:rss|feed)\b/i.test(xml)) throw new Error('Invalid feed document');
    const items = parseRss(xml);
    console.info(`[unified-feed] source ${sourceId} fetched ${items.length} items`);
    rssCache.set(sourceId, { items, ts: Date.now(), attemptedAt: Date.now(), endpoint: feedEndpoint, failed: false });
    return items;
  } catch (err) {
    console.warn(`[unified-feed] source ${sourceId} fetch error: ${err instanceof Error ? err.message : String(err)}`);
    rssCache.set(sourceId, {items: cached?.items ?? [], ts: cached?.ts ?? 0, attemptedAt: Date.now(), endpoint: feedEndpoint, failed: true});
    return cached?.items ?? [];
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limitParam = Math.min(Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)), 40);
  const page = Math.max(0, parseInt((req.query.page as string) ?? '0', 10));
  const typeFilter = (req.query.type as string) ?? '';
  const feedWarnings: string[] = [];

  // ── 1. Load user's followed entities ────────────────────────────────────────
  const [followingRows, profileRow] = await Promise.all([
    db
      .select({ entityId: scUserFollowing.entityId, entityType: scUserFollowing.entityType })
      .from(scUserFollowing)
      .where(eq(scUserFollowing.userId, userId)),
    db
      .select({ favTeams: scMemberProfiles.favTeams, favLeagues: scMemberProfiles.favLeagues })
      .from(scMemberProfiles)
      .where(eq(scMemberProfiles.userId, userId))
      .limit(1),
  ]);

  const followedSourceIds = followingRows
    .filter(r => r.entityType === 'source')
    .map(r => r.entityId);

  // favTeams from profile (JSON array of club slugs / league keys)
  let favTeams: string[] = [];
  try {
    const raw = profileRow[0]?.favTeams;
    if (raw) favTeams = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]);
  } catch { /* ignore */ }

  // noFollows is recomputed below after favLeagues is read (see noFollowsFinal)

  const allItems: UnifiedFeedItem[] = [];

  // ── 2. YouTube club/league videos ───────────────────────────────────────────
  // Also read favLeagues from profile so league follows contribute videos.
  let favLeagues: string[] = [];
  try {
    const rawLeagues = profileRow[0]?.favLeagues;
    if (rawLeagues) favLeagues = typeof rawLeagues === 'string' ? JSON.parse(rawLeagues) : (rawLeagues as string[]);
  } catch { /* ignore */ }

  // Recompute noFollows now that we have favLeagues
  const noFollowsFinal = followedSourceIds.length === 0 && favTeams.length === 0 && favLeagues.length === 0;

  if (!typeFilter || typeFilter === 'video') {
    const allFollowed = [...new Set([...favTeams, ...favLeagues])];
    if (allFollowed.length > 0) {
      const channels = channelsData as ChannelSource[];

      // sc_youtube_cache is keyed by SLUG (e.g. "arsenal", "premier-league"),
      // NOT by YouTube channelId. Resolve slugs directly — no channelId lookup needed.
      const wantedSlugs: string[] = [];
      const slugMeta: Record<string, { name: string }> = {};

      for (const team of allFollowed) {
        if (team === 'all-premier-league') {
          channels
            .filter(c => c.kind === 'club' && c.competition === 'premier-league')
            .forEach(c => {
              wantedSlugs.push(c.slug);
              slugMeta[c.slug] = { name: c.name };
            });
        } else {
          const ch = channels.find(c => c.slug === team);
          if (ch) {
            wantedSlugs.push(ch.slug);
            slugMeta[ch.slug] = { name: ch.name };
          }
        }
      }

      if (wantedSlugs.length > 0) {
        const cacheRows = await db
          .select({ slug: scYoutubeCache.slug, payload: scYoutubeCache.payload })
          .from(scYoutubeCache)
          .where(inArray(scYoutubeCache.slug, wantedSlugs));

        for (const row of cacheRows) {
          let payload: CachePayload;
          try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as CachePayload); }
          catch { continue; }
          const meta = slugMeta[row.slug] ?? { name: row.slug };
          for (const v of (payload.videos ?? []).slice(0, 15)) {
            allItems.push({
              id: `video:${v.id}`,
              type: 'video',
              title: v.title,
              description: null,
              imageUrl: v.thumbnail,
              url: v.watchUrl,
              publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : null,
              sourceId: row.slug,
              sourceLabel: meta.name,
              sourceBadge: meta.name,
              badgeColor: 'primary',
              videoId: v.id,
              embeddable: v.embeddable,
              duration: v.duration,
            });
          }
        }
      }
    }
  }

  // ── 3. RSS articles + podcasts ───────────────────────────────────────────────
  // Fetch RSS for followed sources, or ALL RSS sources when none are followed yet
  // (same fallback behaviour as news-feed/GET.ts so articles always appear).
  if (!typeFilter || typeFilter === 'article' || typeFilter === 'podcast') {
    const sourceRows = await db
      .select({
        id: scSources.id,
        label: scSources.label,
        format: scSources.format,
        feedEndpoint: scSources.feedEndpoint,
        integrationStatus: scSources.integrationStatus,
        connectorEnabled: scSources.connectorEnabled,
        url: scSources.url,
      })
      .from(scSources)
      .where(
        followedSourceIds.length > 0
          ? and(
              inArray(scSources.id, followedSourceIds),
              inArray(scSources.integrationStatus, ['rss']),
            )
          : inArray(scSources.integrationStatus, ['rss']),
      );

    const rssSources = sourceRows.filter(s => s.connectorEnabled && s.feedEndpoint);

    console.info(`[unified-feed] userId=${userId} followedSources=${followedSourceIds.length} rssSourcesToFetch=${rssSources.length} ids=[${rssSources.map(s => s.id).join(',')}]`);

    const fetched = await Promise.all(
      rssSources.map(async s => ({ source: s, items: await fetchRss(s.id, s.feedEndpoint!) }))
    );

    for (const { source, items } of fetched) {
      const isPodcast = source.format === 'podcast';
      if (typeFilter === 'article' && isPodcast) continue;
      if (typeFilter === 'podcast' && !isPodcast) continue;
      if (rssCache.get(source.id)?.failed) feedWarnings.push(`${source.label ?? 'Publisher'}: ${items.length ? 'showing previously loaded content' : 'feed temporarily unavailable'}.`);

      const skipped = items.filter(i => !i.link).length;
      if (skipped > 0) console.warn(`[unified-feed] source ${source.id} (${source.label}) dropped ${skipped}/${items.length} items with empty link`);

      for (const item of items) {
        if (!item.link) continue;
        allItems.push({
          id: `${isPodcast ? 'podcast' : 'article'}:${source.id}:${item.link}`,
          type: isPodcast ? 'podcast' : 'article',
          title: item.title,
          description: item.description,
          imageUrl: item.imageUrl,
          url: item.link,
          publishedAt: item.isoDate,
          sourceId: source.id,
          sourceLabel: source.label ?? 'Unknown',
          sourceBadge: source.label ?? 'Unknown',
          badgeColor: isPodcast ? 'secondary' : 'muted',
          audioUrl: item.audioUrl ?? undefined,
        });
      }
    }
  }

  // ── 4. Deduplicate by id, sort newest-first ──────────────────────────────────
  const seen = new Set<string>();
  const deduped: UnifiedFeedItem[] = [];
  for (const item of allItems) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });

  const total = deduped.length;
  const start = page * limitParam;
  const pageItems = deduped.slice(start, start + limitParam);

  res.set('Cache-Control', 'private, no-store').json({
    feedWarnings,
    items: pageItems,
    total,
    page,
    hasMore: start + limitParam < total,
    noFollows: noFollowsFinal,
    followedTeamCount: favTeams.length + favLeagues.length,
    followedSourceCount: followedSourceIds.length,
  });
  console.info(`[unified-feed] response userId=${userId} type=${typeFilter||'all'} total=${total} page=${page} followedSources=${followedSourceIds.length} followedTeams=${favTeams.length + favLeagues.length}`);
}
