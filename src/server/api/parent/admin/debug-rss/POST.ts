/**
 * POST /api/parent/admin/debug-rss
 *
 * Admin-only. Live-tests an RSS feed endpoint from the server and returns
 * diagnostic information: HTTP status, content-type, item count, first item.
 * Also supports force-refreshing a specific source in the news-feed cache.
 *
 * Body: { sourceId?: string, feedUrl?: string, forceRefresh?: boolean }
 *   - sourceId: sc_sources.id — looks up feedEndpoint from DB and tests it
 *   - feedUrl: raw URL to test directly (no DB lookup)
 *   - forceRefresh: if true, clears the in-memory cache for this source
 *
 * Returns: { ok, status, contentType, itemCount, firstItem, rawPreview, error? }
 */
import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scSources } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchSource, newsFeedCache } from '../../../my-soccer/news-feed/GET.js';

const RSS_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.skysports.com/',
};

export default async function handler(req: Request, res: Response): Promise<void> {
  const isAdmin = await requireAdmin(req, res);
  if (!isAdmin) return;

  const { sourceId, feedUrl, forceRefresh } = req.body as {
    sourceId?: string;
    feedUrl?: string;
    forceRefresh?: boolean;
  };

  if (!sourceId && !feedUrl) {
    res.status(400).json({ error: 'Provide sourceId or feedUrl' });
    return;
  }

  // Resolve the feed URL
  let resolvedUrl = feedUrl ?? '';
  let resolvedId = sourceId ?? 'direct';

  if (sourceId && !feedUrl) {
    const [row] = await db
      .select({ feedEndpoint: scSources.feedEndpoint, label: scSources.label })
      .from(scSources)
      .where(eq(scSources.id, sourceId))
      .limit(1);
    if (!row?.feedEndpoint) {
      res.status(404).json({ error: `Source ${sourceId} not found or has no feedEndpoint` });
      return;
    }
    resolvedUrl = row.feedEndpoint;
    resolvedId = sourceId;
  }

  // Optionally clear the cache entry first
  if (forceRefresh && resolvedId !== 'direct') {
    newsFeedCache.delete(resolvedId);
  }

  // Raw fetch for diagnostics
  let rawStatus = 0;
  let rawContentType = '';
  let rawPreview = '';
  let fetchError: string | null = null;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const resp = await fetch(resolvedUrl, {
      signal: ctrl.signal,
      headers: RSS_FETCH_HEADERS,
      redirect: 'follow',
    });
    clearTimeout(t);
    rawStatus = resp.status;
    rawContentType = resp.headers.get('content-type') ?? '';
    const text = await resp.text();
    rawPreview = text.slice(0, 500);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  // Also run through the full parser (uses cache if not force-refreshed)
  let itemCount = 0;
  let firstItem: unknown = null;
  if (!fetchError && rawStatus === 200) {
    const items = await fetchSource(resolvedId, resolvedUrl, forceRefresh ?? false);
    itemCount = items.length;
    firstItem = items[0] ?? null;
  }

  res.json({
    ok: !fetchError && rawStatus === 200 && itemCount > 0,
    sourceId: resolvedId,
    feedUrl: resolvedUrl,
    httpStatus: rawStatus,
    contentType: rawContentType,
    itemCount,
    firstItem,
    rawPreview,
    fetchError,
    cacheCleared: !!(forceRefresh && resolvedId !== 'direct'),
  });
}
