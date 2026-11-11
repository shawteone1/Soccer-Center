import { fetchPublicText } from '@/server/lib/safe-outbound-text.js';
/**
 * GET /api/my-soccer/news-feed
 *
 * Aggregated news feed for the current user.
 * Fetches RSS from all followed news sources in parallel, merges,
 * deduplicates by URL, and returns a unified chronological feed.
 *
 * Query params:
 *   limit   default 30, max 60
 *   page    default 0 (0-based)
 *
 * Response:
 *   {
 *     items: NewsItem[],
 *     total: number,
 *     page: number,
 *     hasMore: boolean,
 *     sources: { id, label, status }[],
 *   }
 *
 * NewsItem:
 *   { id, title, link, pubDate, isoDate, description, imageUrl,
 *     sourceId, sourceLabel, integrationStatus }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSources, scUserFollowing } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

// ── In-memory cache per source ─────────────────────────────────────────────────
interface CacheEntry { items: RawItem[]; ts: number; endpoint?: string; attemptedAt?: number; failed?: boolean }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

interface RawItem {
  title: string;
  link: string;
  pubDate: string | null;
  isoDate: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface NewsItem extends RawItem {
  id: string;           // dedup key = sourceId + ':' + link
  sourceId: string;
  sourceLabel: string;
  integrationStatus: string;
}

// ── XML helpers ────────────────────────────────────────────────────────────────
function text(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeEntities(m[1].trim()) || null;
}
function attr(xml: string, tag: string, attribute: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attribute}=["']([^"']*)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() || null : null;
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '').trim();
}

/** Decode HTML entities in a URL string (e.g. &amp; → &) without stripping tags. */
function decodeUrlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Extract the best image URL from an RSS item chunk.
 * Prefers media:content at width≥460 (Guardian, Sky Sports), then any
 * media:content, then media:thumbnail, then enclosure.
 * Accepts any URL that starts with http — does NOT require a file extension
 * because Guardian URLs end in /master/NNN.jpg?width=460&quality=85&... which
 * contains .jpg but other valid CDN URLs may not.
 */
function extractImageUrl(chunk: string): string | null {
  // Collect all media:content url= values with their width= attributes
  const contentRe = /<(?:[^:>]+:)?content\b[^>]*\surl=["']([^"']+)["'][^>]*>/gi;
  let best: { url: string; width: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = contentRe.exec(chunk)) !== null) {
    const rawUrl = m[1].trim();
    if (!rawUrl.startsWith('http')) continue;
    const url = decodeUrlEntities(rawUrl);
    // Parse width from the same tag
    const widthM = m[0].match(/\bwidth=["'](\d+)["']/i);
    const width = widthM ? parseInt(widthM[1], 10) : 0;
    if (!best || width > best.width) best = { url, width };
  }
  if (best) return best.url;

  // Fallback: media:thumbnail url=
  const thumbM = chunk.match(/<(?:[^:>]+:)?thumbnail\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
  if (thumbM) {
    const u = decodeUrlEntities(thumbM[1].trim());
    if (u.startsWith('http')) return u;
  }

  // Fallback: enclosure url= (images only, not audio)
  const encM = chunk.match(/<(?:[^:>]+:)?enclosure\b[^>]*\surl=["']([^"']+)["'][^>]*>/i);
  if (encM) {
    const u = decodeUrlEntities(encM[1].trim());
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

function parseRss(xml: string): RawItem[] {
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const items: RawItem[] = [];
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
      });
    }
  } else {
    const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null && items.length < 40) {
      const c = m[1];
      const pubDate = text(c, 'pubDate') ?? text(c, 'published');
      items.push({
        title: text(c, 'title') ?? '(no title)',
        link: text(c, 'link') ?? attr(c, 'link', 'href') ?? '',
        pubDate,
        isoDate: toIso(pubDate),
        description: stripHtml(text(c, 'description') ?? text(c, 'summary')),
        imageUrl: extractImageUrl(c),
      });
    }
  }
  return items;
}

// Browser-like User-Agent avoids 403/redirect blocks from media sites (e.g. Sky Sports).
// Some RSS endpoints check UA and return HTML or redirect to a consent page for bots.
// Sky Sports specifically blocks the "compatible; SoccerCenter" UA pattern — use a
// full Chrome UA string instead. The Referer header also helps bypass consent checks.
const RSS_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.skysports.com/',
};

async function fetchSource(sourceId: string, feedEndpoint: string, forceRefresh = false): Promise<RawItem[]> {
  const existing = cache.get(sourceId);
  const cached = existing?.endpoint === feedEndpoint ? existing : undefined;
  if (!forceRefresh && cached && Date.now() - (cached.attemptedAt ?? cached.ts) < (cached.failed ? 30_000 : CACHE_TTL_MS)) return cached.items;
  try {
    const xml = await fetchPublicText(feedEndpoint,{allowHttp:true,timeoutMs:12_000,headers:RSS_FETCH_HEADERS});
    if (!/<(?:rss|feed)\b/i.test(xml)) throw new Error('Response is not a supported RSS or Atom document');
    const items = parseRss(xml);
    if (/<(?:item|entry)\b/i.test(xml) && items.length === 0) throw new Error('Feed entries could not be parsed');
    console.info(`[news-feed] source ${sourceId} fetched ${items.length} items`);
    cache.set(sourceId, { items, ts: Date.now(), attemptedAt: Date.now(), endpoint: feedEndpoint, failed: false });
    return items;
  } catch (err) {
    console.warn(`[news-feed] source ${sourceId} fetch error: ${err instanceof Error ? err.message : String(err)}`);
    cache.set(sourceId, { items: cached?.items ?? [], ts: cached?.ts ?? 0,
      attemptedAt: Date.now(), endpoint: feedEndpoint, failed: true });
    return cached?.items ?? [];
  }
}

/** Exported so the admin debug/force-refresh endpoint can call it directly. */
export { fetchSource, cache as newsFeedCache };

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limitParam = Math.min(Math.max(1, Number.parseInt(String(req.query.limit ?? '30'), 10) || 30), 60);
  const page = Math.max(0, Number.parseInt(String(req.query.page ?? '0'), 10) || 0);
  const selectedSource = typeof req.query.sourceId === 'string' ? req.query.sourceId : '';

  // Load user's followed source IDs
  let followingRows: { entityId: string }[];
  try {
    followingRows = await db
      .select({ entityId: scUserFollowing.entityId })
      .from(scUserFollowing)
      .where(and(eq(scUserFollowing.userId, userId), eq(scUserFollowing.entityType, 'source')));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish a missing-table schema error from a transient DB failure.
    // Only return schema_unavailable when the error is specifically about the table not existing.
    if (msg.includes("Table") && msg.includes("doesn't exist") || msg.includes("sc_user_following")) {
      res.status(503).json({
        error: 'schema_unavailable',
        detail: 'The sc_user_following table does not exist. Run run-schema-foundation from the admin panel.',
      });
      return;
    }
    console.error('[GET /api/my-soccer/news-feed] follows query failed:', msg);
    res.status(500).json({ error: 'Failed to load news feed' });
    return;
  }

  const followedIds = followingRows.map(r => r.entityId);

  // Load all RSS-enabled news sources (show even if not followed — but mark)
  let newsRows: {
    id: string;
    label: string | null;
    feedEndpoint: string | null;
    integrationStatus: string | null;
    connectorEnabled: boolean | null;
    url: string | null;
  }[];
  try {
    newsRows = await db
      .select({
        id: scSources.id,
        label: scSources.label,
        feedEndpoint: scSources.feedEndpoint,
        integrationStatus: scSources.integrationStatus,
        connectorEnabled: scSources.connectorEnabled,
        url: scSources.url,
      })
      .from(scSources)
      .where(eq(scSources.format, 'news'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Table") && msg.includes("doesn't exist") || msg.includes("sc_sources")) {
      res.status(503).json({
        error: 'schema_unavailable',
        detail: 'The sc_sources table does not exist. Run run-schema-foundation from the admin panel.',
      });
      return;
    }
    console.error('[GET /api/my-soccer/news-feed] sources query failed:', msg);
    res.status(500).json({ error: 'Failed to load news feed' });
    return;
  }

  // Separate RSS-capable from link-only
  const rssSources = newsRows.filter(s => s.integrationStatus === 'rss' && s.connectorEnabled && s.feedEndpoint);
  const linkOnlySources = newsRows.filter(s => s.integrationStatus !== 'rss' || !s.connectorEnabled || !s.feedEndpoint);

  // Only fetch RSS for followed sources (or all if none followed yet)
  const eligible = followedIds.length > 0 ? rssSources.filter(s => followedIds.includes(s.id)) : rssSources;
  // Filter before sorting/pagination: a selected publisher may not appear in page 1 of All.
  const sourcesToFetch = selectedSource ? eligible.filter(s => s.id === selectedSource) : eligible;

  // Fetch all in parallel
  const fetched = await Promise.all(
    sourcesToFetch.map(async (s) => {
      const items = await fetchSource(s.id, s.feedEndpoint!);
      return { source: s, items };
    })
  );
  // Merge + deduplicate by URL
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const { source, items } of fetched) {
    const skipped = items.filter(i => !i.link.trim()).length;
    if (skipped > 0) console.warn(`[news-feed] source ${source.id} (${source.label}) dropped ${skipped}/${items.length} items with empty link`);
    for (const item of items) {
      const key = item.link.trim().toLowerCase();
      if (!/^https?:\/\//i.test(key) || seen.has(key)) continue;
      seen.add(key);
      merged.push({
        ...item,
        id: `${source.id}:${key}`,
        sourceId: source.id,
        sourceLabel: source.label ?? 'Unknown',
        integrationStatus: source.integrationStatus ?? 'rss',
      });
    }
  }

  // Sort chronologically (newest first)
  merged.sort((a, b) => {
    const ta = a.isoDate ? new Date(a.isoDate).getTime() : 0;
    const tb = b.isoDate ? new Date(b.isoDate).getTime() : 0;
    return tb - ta;
  });

  const total = merged.length;
  const start = page * limitParam;
  const pageItems = merged.slice(start, start + limitParam);

  // Source status summary
  const followedSet = new Set(followedIds);
  const sourcesSummary = newsRows.map(s => ({
    id: s.id,
    label: s.label ?? s.url ?? 'Unknown',
    integrationStatus: s.integrationStatus ?? 'link_only',
    connectorEnabled: s.connectorEnabled ?? false,
    isFollowing: followedSet.has(s.id),
    url: s.url,
    feedState: !s.feedEndpoint ? 'not_configured'
      : s.integrationStatus !== 'rss' || !s.connectorEnabled ? 'disabled'
      : !sourcesToFetch.some(f => f.id === s.id) ? 'not_requested'
      : cache.get(s.id)?.failed ? (cache.get(s.id)?.items.length ? 'stale' : 'failed')
      : cache.get(s.id)?.items.length ? 'ready' : 'empty',
    lastSuccessAt: cache.get(s.id)?.ts ? new Date(cache.get(s.id)!.ts).toISOString() : null,
  }));

  res.set('Cache-Control', 'private, no-store').json({
    items: pageItems,
    total,
    page,
    hasMore: start + limitParam < total,
    noFollows: followedIds.length === 0,
    sources: sourcesSummary,
    linkOnlyCount: linkOnlySources.length,
  });
}
