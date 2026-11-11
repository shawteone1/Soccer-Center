/**
 * FanNewsstand — Written soccer coverage for Fan Arena.
 *
 * Fetches from GET /api/my-soccer/news-feed (followed sources) and
 * GET /api/my-soccer/media-sources (discover sources).
 *
 * Sections:
 *   My Sources  — articles from followed news sources
 *   Discover    — all available news sources to follow
 *
 * Each article card shows: publisher, headline, image (if available),
 * publication time, short excerpt, and a link to the original.
 * Subscription-required content is clearly labelled.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Newspaper,
  ExternalLink,
  Loader2,
  RefreshCw,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Rss,
  SlidersHorizontal,
} from 'lucide-react';

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
  /** API field from /api/my-soccer/media-sources */
  integrationStatus: string | null;
  /** Convenience alias — set from integrationStatus on load */
  status?: string;
  url?: string | null;
  isFollowed?: boolean;
  isFollowing?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch { return ''; }
}

function stripHtml(html: string | null): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// ─── Article card ─────────────────────────────────────────────────────────────

function ArticleCard({ item }: { item: NewsItem }) {
  const excerpt = truncate(stripHtml(item.description), 140);
  const isPremium = item.integrationStatus === 'premium' || item.integrationStatus === 'subscription';
  const relTime = formatRelativeTime(item.isoDate ?? item.pubDate);

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex flex-col sm:flex-row">
        {/* Thumbnail — full-width strip on mobile, fixed sidebar on sm+ */}
        {item.imageUrl && (
          <div className="sm:w-32 sm:shrink-0 h-36 sm:h-auto bg-muted overflow-hidden">
            <img
              src={item.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { const p = (e.currentTarget as HTMLImageElement).parentElement; if (p) p.style.display = 'none'; }}
            />
          </div>
        )}
        {/* Content */}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
          {/* Source + time row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
              {item.sourceLabel}
            </span>
            {isPremium && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 shrink-0">
                Subscription
              </span>
            )}
            {relTime && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-auto shrink-0">
                <Clock size={10} /> {relTime}
              </span>
            )}
          </div>
          {/* Headline */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-foreground leading-snug hover:text-primary transition-colors line-clamp-2"
          >
            {item.title}
          </a>
          {/* Excerpt */}
          {excerpt && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{excerpt}</p>
          )}
          {/* Read more */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity mt-auto pt-1"
          >
            Read article <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </article>
  );
}

// ─── Source discover row ──────────────────────────────────────────────────────

function SourceDiscoverRow({
  source,
  onFollow,
  onUnfollow,
  actionLoading,
}: {
  source: NewsSource;
  onFollow: (id: string) => void;
  onUnfollow: (id: string) => void;
  actionLoading: string | null;
}) {
  const isLoading = actionLoading === source.id;
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{source.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${
            (source.integrationStatus === 'rss' || source.integrationStatus === 'active' || source.integrationStatus === 'live')
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            {(source.integrationStatus === 'rss' || source.integrationStatus === 'active' || source.integrationStatus === 'live') ? 'Live feed' : 'Link only'}
          </span>
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
              <ExternalLink size={9} /> Website
            </a>
          )}
        </div>
      </div>
      {source.isFollowing ? (
        <button
          onClick={() => onUnfollow(source.id)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border border-primary text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
          Following
        </button>
      ) : (
        <button
          onClick={() => onFollow(source.id)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Follow
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type NewsstandSection = 'my-sources' | 'discover';

export default function FanNewsstand({ onManageSources }: { onManageSources?: () => void }) {
  const [section, setSection] = useState<NewsstandSection>('my-sources');
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedWarning, setFeedWarning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [noFollows, setNoFollows] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadArticles = useCallback(async (pg = 0, append = false) => {
    if (pg === 0) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/my-soccer/news-feed?limit=20&page=${pg}`, { credentials: 'include' });
      if (res.status === 503) {
        const body = await res.json() as { error?: string };
        if (body.error === 'schema_unavailable') {
          setError('News feed unavailable — setup required. Contact your administrator.');
          return;
        }
      }
      if (!res.ok) throw new Error('Failed to load news');
      const data = await res.json() as {
        items: NewsItem[];
        hasMore: boolean;
        noFollows: boolean;
        sources: NewsSource[];
      };
      setArticles((prev) => append ? [...prev, ...data.items] : data.items);
      setHasMore(data.hasMore);
      setNoFollows(data.noFollows ?? false);
      if (data.sources) setSources(data.sources);
      const statuses = data.sources as (NewsSource & { feedState?: string })[];
      setFeedWarning((statuses ?? []).filter(s => ['stale', 'failed'].includes(s.feedState ?? '')).map(s => `${s.label}: ${s.feedState === 'stale' ? 'showing previously loaded articles' : 'feed temporarily unavailable'}`).join('. '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch('/api/my-soccer/media-sources', { credentials: 'include' });
      if (res.status === 503) {
        const body = await res.json() as { error?: string };
        if (body.error === 'schema_unavailable') {
          setError('Sources unavailable — setup required. Contact your administrator.');
          return;
        }
      }
      if (!res.ok) return;
      const data = await res.json() as { sources: Array<{
        id: string;
        label: string;
        url: string | null;
        integrationStatus: string | null;
        connectorEnabled: boolean;
        isFollowing: boolean;
      }> };
      setSources(data.sources.map((s) => ({
        id: s.id,
        label: s.label,
        url: s.url,
        integrationStatus: s.integrationStatus,
        isFollowing: s.isFollowing,
      })));
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void loadArticles(0);
    void loadSources();
  }, [loadArticles, loadSources]);

  const handleFollow = useCallback(async (sourceId: string) => {
    setActionLoading(sourceId);
    try {
      await fetch('/api/my-soccer/following', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityId: sourceId, entityType: 'source', action: 'follow' }),
      });
      setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, isFollowing: true } : s));
      // Reload articles after following
      void loadArticles(0);
    } catch { /* non-fatal */ }
    setActionLoading(null);
  }, [loadArticles]);

  const handleUnfollow = useCallback(async (sourceId: string) => {
    setActionLoading(sourceId);
    try {
      await fetch('/api/my-soccer/following', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityId: sourceId, entityType: 'source', action: 'unfollow' }),
      });
      setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, isFollowing: false } : s));
      void loadArticles(0);
    } catch { /* non-fatal */ }
    setActionLoading(null);
  }, [loadArticles]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    void loadArticles(next, true);
  };

  return (
    <div>
      {/* Section tabs */}
      {feedWarning && <div role="status" className="border rounded-xl p-3 mb-3 text-sm">{feedWarning} <button type="button" className="min-h-11 underline" onClick={() => void loadArticles(0)}>Retry news</button></div>}
      <div className="flex gap-1 mb-5 border-b border-border -mx-0">
        {([
          { id: 'my-sources' as NewsstandSection, label: 'My Sources', icon: <Rss size={13} /> },
          { id: 'discover' as NewsstandSection, label: 'Discover Sources', icon: <Newspaper size={13} /> },
        ]).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              section === s.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
        {section === 'my-sources' && (
          <button
            onClick={() => void loadArticles(0)}
            disabled={refreshing}
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-2 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
        {onManageSources && (
          <button
            onClick={onManageSources}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-2 ml-1"
            title="Manage sources"
          >
            <SlidersHorizontal size={13} />
            <span className="hidden sm:inline">Manage</span>
          </button>
        )}
      </div>

      {/* My Sources section */}
      {section === 'my-sources' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border p-8 text-center">
              <AlertTriangle size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button onClick={() => void loadArticles(0)} className="mt-3 text-xs text-primary hover:underline">
                Retry
              </button>
            </div>
          ) : articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Newspaper size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm font-semibold text-foreground mb-1">No articles yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Follow news publishers in the Discover tab to personalise your feed.
              </p>
              <button
                onClick={() => setSection('discover')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition"
              >
                <Newspaper size={12} /> Discover sources
              </button>
            </div>
          ) : (
            <>
              {/* Soft prompt when showing all sources (none followed yet) */}
              {noFollows && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 mb-4">
                  <p className="text-xs text-muted-foreground">
                    Showing all sources. Follow publishers to personalise your feed.
                  </p>
                  <button
                    onClick={() => setSection('discover')}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline"
                  >
                    Discover
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {articles.map((item) => (
                  <ArticleCard key={item.id} item={item} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-5 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition disabled:opacity-50"
                  >
                    {refreshing ? <Loader2 size={14} className="animate-spin" /> : null}
                    Load more articles
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Discover section */}
      {section === 'discover' && (
        <div>
          <p className="text-xs text-muted-foreground mb-4">
            Follow publishers to add their articles to your Newsstand. "Link only" sources link out to their website — full article ingestion is not yet available for those.
          </p>
          {sources.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4">
              {sources.map((source) => (
                <SourceDiscoverRow
                  key={source.id}
                  source={source}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
