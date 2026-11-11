/**
 * GET /api/my-soccer/itunes-search
 *
 * Proxy for the iTunes Search API — finds podcast shows matching a query.
 * Results are enriched with isFollowing status from the user's sc_user_following rows.
 *
 * Query params:
 *   q       required — search term
 *   limit   default 10, max 25
 *
 * Response:
 *   {
 *     results: iTunesResult[],
 *     term: string,
 *   }
 *
 * iTunesResult:
 *   { collectionId, collectionName, artistName, artworkUrl100, feedUrl,
 *     trackCount, primaryGenreName, isFollowing, sourceId }
 *
 * sourceId is populated when the feed URL already exists in sc_sources,
 * so the UI can show "Following" without a separate lookup.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSources, scUserFollowing } from '@/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

interface iTunesEntry {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  feedUrl?: string;
  trackCount?: number;
  primaryGenreName?: string;
  genres?: string[];
  collectionViewUrl?: string;
}

export interface iTunesResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl: string | null;
  feedUrl: string | null;
  trackCount: number | null;
  primaryGenreName: string | null;
  collectionViewUrl: string | null;
  /** Populated when this feed URL already exists in sc_sources */
  sourceId: string | null;
  isFollowing: boolean;
}

// Simple in-memory cache: term → { results, ts }
const cache = new Map<string, { results: iTunesEntry[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function searchItunes(term: string, limit: number): Promise<iTunesEntry[]> {
  const cacheKey = `${term}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.results;

  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('media', 'podcast');
  url.searchParams.set('entity', 'podcast');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('country', 'US');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const resp = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SoccerCenter/1.0 (+https://soccercenter.org)' },
    });
    clearTimeout(t);
    if (!resp.ok) return [];
    const data = await resp.json() as { results?: iTunesEntry[] };
    const results = data.results ?? [];
    cache.set(cacheKey, { results, ts: Date.now() });
    return results;
  } catch {
    clearTimeout(t);
    return [];
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const term = ((req.query.q as string) ?? '').trim();
  if (!term) {
    res.status(400).json({ error: 'q is required' });
    return;
  }
  const limit = Math.min(Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)), 25);

  const raw = await searchItunes(term, limit);

  // Collect feed URLs to check against sc_sources
  const feedUrls = raw.map(r => r.feedUrl).filter((u): u is string => !!u);

  // Find existing sources by feedEndpoint
  const existingSources = feedUrls.length > 0
    ? await db
        .select({ id: scSources.id, feedEndpoint: scSources.feedEndpoint })
        .from(scSources)
        .where(inArray(scSources.feedEndpoint, feedUrls))
    : [];

  const sourceByFeed = new Map(existingSources.map(s => [s.feedEndpoint!, s.id]));

  // Load user's followed source IDs
  const followingRows = existingSources.length > 0
    ? await db
        .select({ entityId: scUserFollowing.entityId })
        .from(scUserFollowing)
        .where(and(
          eq(scUserFollowing.userId, userId),
          eq(scUserFollowing.entityType, 'source'),
          inArray(scUserFollowing.entityId, existingSources.map(s => s.id)),
        ))
    : [];

  const followedIds = new Set(followingRows.map(r => r.entityId));

  const results: iTunesResult[] = raw.map(entry => {
    const sourceId = entry.feedUrl ? (sourceByFeed.get(entry.feedUrl) ?? null) : null;
    return {
      collectionId: entry.collectionId,
      collectionName: entry.collectionName,
      artistName: entry.artistName,
      artworkUrl: entry.artworkUrl600 ?? entry.artworkUrl100 ?? null,
      feedUrl: entry.feedUrl ?? null,
      trackCount: entry.trackCount ?? null,
      primaryGenreName: entry.primaryGenreName ?? null,
      collectionViewUrl: entry.collectionViewUrl ?? null,
      sourceId,
      isFollowing: sourceId ? followedIds.has(sourceId) : false,
    };
  });

  res.set('Cache-Control', 'private, max-age=300').json({ results, term });
}
