import { fetchPublicText } from '@/server/lib/safe-outbound-text.js';
/**
 * GET /api/my-soccer/rss-feed?sourceId=<id>
 *
 * Server-side RSS/Atom proxy. Fetches the source's feedEndpoint, parses the
 * XML, and returns normalized items. Used by both the news panel and the
 * podcast episode listing.
 *
 * Returns up to 30 items. Cached for 15 minutes per source (in-memory).
 * Only sources with integrationStatus='rss' and connectorEnabled=true are
 * served — link-only sources return 403.
 *
 * Response shape:
 *   { items: RssItem[], sourceLabel: string, feedUrl: string }
 *
 * RssItem:
 *   { title, link, pubDate, isoDate, description, enclosureUrl,
 *     enclosureType, duration, imageUrl }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSources } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

// ── In-memory cache ────────────────────────────────────────────────────────────
interface CacheEntry { items: RssItem[]; sourceLabel: string; feedUrl: string; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

import { parseRss, type RssItem } from '@/server/lib/rss-parser.js';

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const sourceId = (req.query.sourceId as string) ?? '';
  if (!sourceId) {
    res.status(400).json({ error: 'sourceId required' });
    return;
  }

  // Load source from DB
  const rows = await db
    .select({
      label: scSources.label,
      feedEndpoint: scSources.feedEndpoint,
      integrationStatus: scSources.integrationStatus,
      connectorEnabled: scSources.connectorEnabled,
    })
    .from(scSources)
    .where(eq(scSources.id, sourceId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  const source = rows[0];

  if (source.integrationStatus !== 'rss' || !source.connectorEnabled || !source.feedEndpoint) {
    res.status(403).json({
      error: 'This source does not have an RSS feed enabled',
      integrationStatus: source.integrationStatus,
    });
    return;
  }

  // Check cache
  const cached = cache.get(sourceId);
  if (cached && cached.feedUrl === source.feedEndpoint && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.set('Cache-Control', 'private, max-age=900').json({
      items: cached.items,
      sourceLabel: cached.sourceLabel,
      feedUrl: cached.feedUrl,
      cached: true,
    });
    return;
  }

  const fallback = () => {
    if (cached && cached.feedUrl === source.feedEndpoint) {
      res.set('Cache-Control', 'no-store').json({ items: cached.items, sourceLabel: cached.sourceLabel,
        feedUrl: cached.feedUrl, stale: true, warning: 'Refresh failed; showing previously loaded episodes.' });
    } else res.status(502).json({ error: 'Could not load this publisher feed. Please retry.' });
  };
  // Fetch RSS
  let xml: string;
  try {
    xml = await fetchPublicText(source.feedEndpoint,{allowHttp:true,timeoutMs:10_000});
  } catch (e) {
    fallback();
    return;
  }

  let items: RssItem[];
  try { items = parseRss(xml); }
  catch { fallback(); return; }
  const entry: CacheEntry = {
    items,
    sourceLabel: source.label ?? 'Unknown',
    feedUrl: source.feedEndpoint,
    ts: Date.now(),
  };
  cache.set(sourceId, entry);

  res.set('Cache-Control', 'private, max-age=900').json({
    items,
    sourceLabel: entry.sourceLabel,
    feedUrl: entry.feedUrl,
    cached: false,
  });
}
