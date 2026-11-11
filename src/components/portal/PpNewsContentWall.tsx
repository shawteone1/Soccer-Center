import FeedShareButton from '@/components/FeedShareButton';
/**
 * PpNewsContentWall — Parent portal news feed.
 *
 * Reuses the same /api/my-soccer/news-feed endpoint as the Fan portal.
 * The endpoint reads sc_user_following rows for the authenticated user,
 * so Fan and Parent follows are shared (same userId, same table).
 *
 * Shows:
 *   - RSS articles from followed news sources (article cards with image/title/date)
 *   - Inline source manager (follow/unfollow RSS sources)
 *   - Per-source filter chips when >1 source followed
 *   - Link-only source notice
 *   - Load more pagination
 *
 * Does NOT show: vendor/club/podcast sources — news only.
 * Does NOT duplicate the PpSourceFeed "manage sources" panel.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Newspaper, Settings, Rss, Plus, CheckCircle, Loader2,
  ChevronDown, ExternalLink, Link2,
} from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string | null;
  isoDate: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceId: string;
  sourceLabel: string;
  integrationStatus: string;
}

interface NewsSource {
  id: string;
  label: string;
  integrationStatus: string;
  connectorEnabled: boolean;
  isFollowing: boolean;
  url: string | null;
  feedState?: string;
  lastSuccessAt?: string | null;
}

interface NewsFeedResponse {
  items: NewsItem[];
  total: number;
  page: number;
  hasMore: boolean;
  sources: NewsSource[];
  linkOnlyCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PpNewsContentWall() {
  const [data, setData] = useState<NewsFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [showSources, setShowSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadPage = async (p: number, replace = false) => {
    const id = ++requestId.current;
    setError(null);
    if (p === 0) setLoading(true); else setLoadingMore(true);
    try {
      const r = await apiFetch(`/api/my-soccer/news-feed?limit=12&page=${p}&sourceId=${encodeURIComponent(sourceFilter)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as NewsFeedResponse;
      if (id !== requestId.current) return;
      setData(d);
      setAllItems(prev => replace ? d.items : Array.from(new Map([...prev, ...d.items].map(item => [item.id, item])).values()));
      setPage(p);
    } catch {
      if (id !== requestId.current) return;
      setError('News could not be refreshed. Previously loaded articles are retained. Please retry.');
    }
    if (id === requestId.current) { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => { void loadPage(0, true); return () => { requestId.current++; }; }, [sourceFilter]);

  async function handleToggleFollow(source: NewsSource) {
    if (toggling.has(source.id)) return;
    setToggling(s => new Set([...s, source.id]));
    const action = source.isFollowing ? 'unfollow' : 'follow';
    // Optimistic update
    setData(prev => prev ? {
      ...prev,
      sources: prev.sources.map(s => s.id === source.id ? { ...s, isFollowing: !s.isFollowing } : s),
    } : prev);
    try {
      const response = await apiFetch('/api/my-soccer/following', {
        method: 'POST',
        body: JSON.stringify({ entityId: source.id, entityType: 'source', action }),
      });
      if (!response.ok) throw new Error('Follow update failed');
      void loadPage(0, true);
    } catch {
      setData(prev => prev ? { ...prev, sources: prev.sources.map(s => s.id === source.id ? source : s) } : prev);
      setError('Your source preference was not saved. Please retry.');
    }
    setToggling(s => { const n = new Set(s); n.delete(source.id); return n; });
  }

  const rssSources = data?.sources.filter(s => s.integrationStatus === 'rss' && s.connectorEnabled) ?? [];
  const linkOnlySources = data?.sources.filter(s => s.integrationStatus !== 'rss' || !s.connectorEnabled) ?? [];
  const followedCount = data?.sources.filter(s => s.isFollowing).length ?? 0;

  const visibleItems = sourceFilter
    ? allItems.filter(i => i.sourceId === sourceFilter)
    : allItems;

  const selected = data?.sources.find(s => s.id === sourceFilter);
  if (loading && !data) {
    return (
      <PpCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      </PpCard>
    );
  }

  return (
    <PpCard>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Newspaper size={15} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <PpSectionHeading>Latest News</PpSectionHeading>
          {followedCount > 0 && (
            <span
              className="text-[10px] font-semibold rounded-full px-2 py-0.5"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            >
              {followedCount} source{followedCount !== 1 ? 's' : ''} followed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSources(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
        >
          <Settings size={12} />
          Manage sources
          <ChevronDown
            size={11}
            className={`transition-transform ${showSources ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Source manager panel */}
      {showSources && (
        <div
          className="rounded-xl border p-4 space-y-3 mb-4"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            RSS sources — follow to include in your feed
          </p>
          <div className="flex flex-col gap-2">
            {rssSources.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Rss size={11} className="shrink-0" style={{ color: 'hsl(var(--pp-navy))' }} />
                  <span className="text-xs truncate" style={{ color: 'hsl(var(--pp-text))' }}>{s.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleFollow(s)}
                  disabled={toggling.has(s.id)}
                  className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all border"
                  style={s.isFollowing ? {
                    background: 'hsl(var(--pp-blue-light))',
                    color: 'hsl(var(--pp-navy))',
                    borderColor: 'hsl(var(--pp-navy))',
                  } : {
                    background: 'transparent',
                    color: 'hsl(var(--pp-text-muted))',
                    borderColor: 'hsl(var(--pp-border))',
                  }}
                >
                  {toggling.has(s.id)
                    ? <Loader2 size={10} className="animate-spin" />
                    : s.isFollowing ? <CheckCircle size={10} /> : <Plus size={10} />}
                  {s.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
          {linkOnlySources.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
              <p className="text-[10px] font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Sources without an active feed configured
              </p>
              <div className="flex flex-wrap gap-2">
                {linkOnlySources.map(s => (
                  <a
                    key={s.id}
                    href={s.url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 border transition-colors"
                    style={{ color: 'hsl(var(--pp-text-muted))', borderColor: 'hsl(var(--pp-border))' }}
                  >
                    <ExternalLink size={9} />
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-source filter chips — show when at least 1 source is followed */}
      {rssSources.filter(s => s.isFollowing).length >= 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSourceFilter('')}
            className="rounded-full px-3 py-1 text-xs font-semibold border transition-all"
            style={!sourceFilter ? {
              background: 'hsl(var(--pp-navy))',
              color: 'hsl(var(--pp-white))',
              borderColor: 'hsl(var(--pp-navy))',
            } : {
              background: 'transparent',
              color: 'hsl(var(--pp-text-muted))',
              borderColor: 'hsl(var(--pp-border))',
            }}
          >
            All
          </button>
          {rssSources.filter(s => s.isFollowing).map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSourceFilter(sourceFilter === s.id ? '' : s.id)}
              className="rounded-full px-3 py-1 text-xs font-semibold border transition-all"
              style={sourceFilter === s.id ? {
                background: 'hsl(var(--pp-navy))',
                color: 'hsl(var(--pp-white))',
                borderColor: 'hsl(var(--pp-navy))',
              } : {
                background: 'transparent',
                color: 'hsl(var(--pp-text-muted))',
                borderColor: 'hsl(var(--pp-border))',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div role="status" aria-live="polite" className="my-3 text-sm">
        {loading ? 'Refreshing news…' : error ?? (selected?.feedState === 'failed'
          ? 'This source could not be fetched. Try again after 30 seconds. This does not mean it has no RSS feed.'
          : selected?.feedState === 'stale' ? 'Refresh failed. Showing the last successfully loaded articles.'
          : selected?.feedState === 'not_configured' ? 'No feed URL is configured for this source.'
          : selected?.feedState === 'disabled' ? 'This source connector is currently disabled.' : '')}
        <PpButton variant="outline" size="sm" className="ml-2" disabled={loading} onClick={() => void loadPage(0, true)}>Retry news</PpButton>
      </div>
      {/* Empty selected results are distinct from a request failure. */}
      {visibleItems.length === 0 && !loading && !error && (
        <div
          className="rounded-xl border border-dashed p-8 text-center"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <Newspaper size={28} className="mx-auto mb-3 opacity-20" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
            {selected ? `No articles returned for ${selected.label}` : 'No articles available'}
          </p>
          <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {selected ? 'Try refreshing, or open Manage sources to check this publisher.' : 'Follow sources above to personalise your feed.'}
          </p>
          <PpButton variant="outline" size="sm" onClick={() => setShowSources(true)}>
            <Plus size={12} className="mr-1" />
            Add sources
          </PpButton>
        </div>
      )}
      {/* Soft prompt when showing all sources (none followed yet) */}
      {followedCount === 0 && allItems.length > 0 && (
        <div
          className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3 mb-4"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
        >
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Showing all sources. Follow publishers to personalise your feed.
          </p>
          <button
            type="button"
            onClick={() => setShowSources(true)}
            className="shrink-0 text-xs font-semibold hover:underline"
            style={{ color: 'hsl(var(--pp-navy))' }}
          >
            Manage
          </button>
        </div>
      )}

      {/* Article grid */}
      {visibleItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleItems.map(item => (
            <div key={item.id}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border overflow-hidden flex flex-col transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            >
              {item.imageUrl && (
                <div className="aspect-video overflow-hidden" style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => { const p = (e.target as HTMLImageElement).parentElement; if (p) p.style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="p-3 flex flex-col gap-2 flex-1">
                <p
                  className="text-xs font-semibold line-clamp-3 leading-snug"
                  style={{ color: 'hsl(var(--pp-text))' }}
                >
                  {item.title}
                </p>
                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <span
                    className="text-[10px] font-semibold rounded-full px-2 py-0.5 truncate max-w-[120px]"
                    style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                  >
                    {item.sourceLabel}
                  </span>
                  {item.isoDate && (
                    <span className="text-[10px] shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {formatRelativeDate(item.isoDate)}
                    </span>
                  )}
                </div>
              </div>
            </a>
            <FeedShareButton url={item.link} title={item.title} />
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {data?.hasMore && (
        <div className="flex justify-center pt-4">
          <PpButton
            variant="outline"
            size="sm"
            onClick={() => void loadPage(page + 1)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 size={12} className="animate-spin mr-1" /> : <ChevronDown size={12} className="mr-1" />}
            Load more articles
          </PpButton>
        </div>
      )}

      {/* Link-only notice */}
      {linkOnlySources.length > 0 && !showSources && !sourceFilter && (
        <div
          className="mt-4 rounded-xl border px-4 py-3 flex items-start gap-2"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
        >
          <Link2 size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span className="font-medium">Other sources have no active feed configured here.</span> Visit their websites or open Manage sources.
            {linkOnlySources.filter(s => s.url).map((s, i) => (
              <a
                key={i}
                href={s.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 font-medium hover:underline"
                style={{ color: 'hsl(var(--pp-blue))' }}
              >
                {s.label} ↗
              </a>
            ))}
          </p>
        </div>
      )}
    </PpCard>
  );
}
