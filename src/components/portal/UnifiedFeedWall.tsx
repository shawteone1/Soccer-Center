import PodcastAudioPlayer from '@/components/portal/PodcastAudioPlayer';
import FeedShareButton from '@/components/FeedShareButton';
/**
 * UnifiedFeedWall
 *
 * Renders the My Feed unified content wall — YouTube videos, RSS articles,
 * and podcast episodes merged into a single chronological grid.
 *
 * Includes:
 *   - Type filter chips (All / Videos / Articles / Podcasts)
 *   - "Manage sources" button → SourcePickerModal
 *   - Load-more pagination
 *   - Empty / no-follows states
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Rss,
  Tv2,
  Newspaper,
  Radio,
  ExternalLink,
  ChevronDown,
  Loader2,
  SlidersHorizontal,
  Play,
  X,
  Plus,
  CheckCircle,
  Link2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UnifiedFeedItem {
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
  videoId?: string;
  embeddable?: boolean;
  duration?: string;
  audioUrl?: string;
}

interface UnifiedFeedResponse {
  feedWarnings?: string[];
  items: UnifiedFeedItem[];
  total: number;
  page: number;
  hasMore: boolean;
  noFollows: boolean;
  followedTeamCount: number;
  followedSourceCount: number;
}

interface MediaSource {
  id: string;
  label: string;
  url: string | null;
  format: string | null;
  integrationStatus: string | null;
  connectorEnabled: boolean;
  notes: string | null;
  isFollowing: boolean;
}

interface MediaSourcesResponse {
  sources: MediaSource[];
  total: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function typeIcon(type: UnifiedFeedItem['type'], size = 12) {
  if (type === 'video') return <Tv2 size={size} />;
  if (type === 'podcast') return <Radio size={size} />;
  return <Newspaper size={size} />;
}

function typeLabel(type: UnifiedFeedItem['type']): string {
  if (type === 'video') return 'Video';
  if (type === 'podcast') return 'Podcast';
  return 'Article';
}

// ── Source Picker Modal ────────────────────────────────────────────────────────

function SourcePickerModal({
  onClose,
  onFollowChange,
}: {
  onClose: () => void;
  onFollowChange: () => void;
}) {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/my-soccer/media-sources', { credentials: 'include' })
      .then(r => r.json() as Promise<MediaSourcesResponse>)
      .then(d => { setSources(d.sources ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleFollow(source: MediaSource) {
    if (toggling.has(source.id)) return;
    setToggling(s => new Set([...s, source.id]));
    const action = source.isFollowing ? 'unfollow' : 'follow';
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, isFollowing: !s.isFollowing } : s));
    try {
      await fetch('/api/my-soccer/following', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: source.id, entityType: 'source', action }),
      });
      onFollowChange();
    } catch {
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, isFollowing: !s.isFollowing } : s));
    }
    setToggling(s => { const n = new Set(s); n.delete(source.id); return n; });
  }

  const filtered = sources.filter(s =>
    !search || s.label.toLowerCase().includes(search.toLowerCase())
  );

  const rssSources = filtered.filter(s => s.integrationStatus === 'rss' && s.connectorEnabled);
  const linkOnlySources = filtered.filter(s => s.integrationStatus !== 'rss' || !s.connectorEnabled);
  const followedCount = sources.filter(s => s.isFollowing).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Manage news sources"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              Manage sources
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {followedCount > 0
                ? `${followedCount} source${followedCount !== 1 ? 's' : ''} followed`
                : 'Follow sources to populate your feed'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <input
            type="search"
            placeholder="Search sources…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* RSS sources */}
              {rssSources.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Live feeds (RSS)
                  </p>
                  <div className="space-y-2">
                    {rssSources.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          {s.format === 'podcast' ? <Radio size={14} /> : <Rss size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.label}</p>
                          {s.notes && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{s.notes}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleFollow(s)}
                          disabled={toggling.has(s.id)}
                          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            s.isFollowing
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'bg-muted text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground'
                          }`}
                        >
                          {toggling.has(s.id)
                            ? <Loader2 size={10} className="animate-spin" />
                            : s.isFollowing
                              ? <CheckCircle size={10} />
                              : <Plus size={10} />}
                          {s.isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Link-only sources */}
              {linkOnlySources.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    External links (no RSS)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {linkOnlySources.map(s => (
                      <a
                        key={s.id}
                        href={s.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 transition-colors hover:border-primary/40"
                      >
                        <Link2 size={10} />
                        {s.label}
                        <ExternalLink size={9} className="opacity-60" />
                      </a>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    These sources don't have public RSS feeds — visit their sites directly.
                  </p>
                </div>
              )}

              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No sources match your search.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 text-sm hover:opacity-90 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Feed card ──────────────────────────────────────────────────────────────────

function FeedCard({
  item,
  onNavigateToControls,
}: {
  item: UnifiedFeedItem;
  onNavigateToControls?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  // embedBlocked: set when YouTube postMessage returns error 100/101/150/153
  const [embedBlocked, setEmbedBlocked] = useState(false);

  // Listen for YouTube IFrame API postMessage errors while playing
  useEffect(() => {
    if (!playing) return;
    function onMessage(e: MessageEvent) {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as { event?: string; info?: number };
        if (msg.event === 'onError' && typeof msg.info === 'number') {
          if ([100, 101, 150, 153].includes(msg.info)) setEmbedBlocked(true);
        }
      } catch { /* not a YouTube message */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [playing]);

  // Reset blocked state when stopped
  useEffect(() => { if (!playing) setEmbedBlocked(false); }, [playing]);

  if (item.type === 'video') {
    const embedOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://soccercenter.org';
    const embedSrc = item.videoId
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&rel=0&enablejsapi=1&origin=${embedOrigin}&modestbranding=1`
      : '';
    const watchUrl = item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : '#';

    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        {/* Thumbnail / player */}
        <div className="relative aspect-video bg-muted">
          {playing && item.videoId && item.embeddable && !embedBlocked ? (
            <iframe
              src={embedSrc}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={item.title}
              onError={() => setEmbedBlocked(true)}
            />
          ) : playing && (embedBlocked || !item.embeddable) ? (
            /* Embed blocked — Watch on YouTube fallback */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted px-4 text-center">
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <p className="text-xs font-semibold text-foreground">Embedding disabled by rights holder</p>
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
                >
                  Watch on YouTube
                  <ExternalLink size={12} />
                </a>
                <button type="button" onClick={() => setPlaying(false)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tv2 size={28} className="text-muted-foreground opacity-30" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors pointer-events-auto"
                aria-label={`Play ${item.title}`}
              >
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <Play size={16} className="text-foreground ml-0.5 fill-current" />
                </div>
              </button>
            </>
          )}
          {/* Type badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 text-white px-2 py-0.5 text-[10px] font-semibold pointer-events-none">
            <Tv2 size={9} />
            Video
          </div>
          {playing && !embedBlocked && item.embeddable && (
            <button
              type="button"
              onClick={() => setPlaying(false)}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors pointer-events-auto"
              aria-label="Stop video"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {/* Info */}
        <div className="p-3 flex-1 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{item.title}</p>
          <div className="flex items-center gap-2 flex-wrap mt-auto">
            <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5 truncate max-w-[120px]">
              {item.sourceBadge}
            </span>
            {item.publishedAt && (
              <span className="text-[10px] text-muted-foreground">{formatRelativeDate(item.publishedAt)}</span>
            )}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs font-semibold rounded-lg bg-primary text-primary-foreground py-1.5 hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
          >
            Watch on YouTube
            <ExternalLink size={10} />
          </a>
        </div>
        <FeedShareButton url={item.url} title={item.title} />
      </div>
    );
  }

  if (item.type === 'podcast') {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        {item.imageUrl && (
          <div className="aspect-video bg-muted overflow-hidden">
            <img
              src={item.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        <div className="p-4 flex flex-col gap-2 flex-1">
          {/* Type badge */}
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold bg-secondary/10 text-secondary rounded-full px-2 py-0.5">
              <Radio size={9} />
              Podcast
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[120px]">
              {item.sourceBadge}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{item.title}</p>
          {item.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
          )}
          {item.publishedAt && (
            <p className="text-[10px] text-muted-foreground">{formatRelativeDate(item.publishedAt)}</p>
          )}
          <div className="flex gap-2 mt-auto">
            {item.audioUrl && (
              <button
                type="button"
                onClick={() => setAudioPlaying(v => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-secondary text-secondary-foreground py-1.5 hover:opacity-90 transition-all"
              >
                {audioPlaying ? <X size={11} /> : <Play size={11} className="fill-current" />}
                {audioPlaying ? 'Stop' : 'Play episode'}
              </button>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${item.audioUrl ? '' : 'flex-1'} flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-muted text-foreground py-1.5 hover:bg-muted/70 transition-all`}
            >
              <ExternalLink size={10} />
              {item.audioUrl ? '' : 'Open'}
            </a>
          </div>
          {audioPlaying && item.audioUrl && (
            <PodcastAudioPlayer src={item.audioUrl} title={item.title} onEnded={() => setAudioPlaying(false)} />
          )}
        </div>
        <FeedShareButton url={item.url} title={item.title} />
      </div>
    );
  }

  // Article
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-2xl border border-border bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors"
    >
      {item.imageUrl && (
        <div className="aspect-video bg-muted overflow-hidden">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={e => { const p = (e.target as HTMLImageElement).parentElement; if (p) p.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
            <Newspaper size={9} />
            Article
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[120px]">
            {item.sourceBadge}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground line-clamp-3 leading-snug group-hover:text-primary transition-colors">
          {item.title}
        </p>
        {item.description && !item.imageUrl && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5 truncate max-w-[120px]">
            {item.sourceBadge}
          </span>
          {item.publishedAt && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatRelativeDate(item.publishedAt)}
            </span>
          )}
        </div>
      </div>
    </a>
    <FeedShareButton url={item.url} title={item.title} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { id: '', label: 'All', icon: <Rss size={11} /> },
  { id: 'video', label: 'Videos', icon: <Tv2 size={11} /> },
  { id: 'article', label: 'Articles', icon: <Newspaper size={11} /> },
  { id: 'podcast', label: 'Podcasts', icon: <Radio size={11} /> },
] as const;

export default function UnifiedFeedWall({
  onNavigateToControls,
  onTypeFilterChange,
}: {
  onNavigateToControls?: () => void;
  onTypeFilterChange?: (type: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const handleTypeFilterChange = (t: string) => {
    setTypeFilter(t);
    onTypeFilterChange?.(t);
  };
  const [allItems, setAllItems] = useState<UnifiedFeedItem[]>([]);
  const [meta, setMeta] = useState<Omit<UnifiedFeedResponse, 'items'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  // Distinct error states so the UI can show the right message
  const [fetchError, setFetchError] = useState<'auth' | 'server' | null>(null);

  const loadPage = useCallback(async (p: number, type: string, replace = false) => {
    if (p === 0) { setLoading(true); setFetchError(null); } else setLoadingMore(true);
    try {
      const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
      const r = await fetch(
        `/api/my-soccer/unified-feed?limit=20&page=${p}${typeParam}`,
        { credentials: 'include' }
      );
      if (r.status === 401) { setFetchError('auth'); setLoading(false); setLoadingMore(false); return; }
      if (!r.ok) { setFetchError('server'); setLoading(false); setLoadingMore(false); return; }
      const d = await r.json() as UnifiedFeedResponse;
      const { items, ...rest } = d;
      setMeta(rest);
      setAllItems(prev => replace ? items : [...prev, ...items]);
      setPage(p);
    } catch {
      setFetchError('server');
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    void loadPage(0, typeFilter, true);
  }, [typeFilter, loadPage]);

  function handleFollowChange() {
    void loadPage(0, typeFilter, true);
  }

  const noFollows = meta?.noFollows ?? false;
  const hasContent = allItems.length > 0;

  return (
    <div className="space-y-5">
      {!!meta?.feedWarnings?.length && <div role="status" className="border rounded-xl p-3 text-sm">
        {meta.feedWarnings.join(' ')} <button type="button" className="min-h-11 underline" disabled={loading} onClick={() => void loadPage(0, typeFilter, true)}>Retry feed</button>
      </div>}
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => { handleTypeFilterChange(f.id); }}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all ${
                typeFilter === f.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40'
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowSourcePicker(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal size={13} />
          Manage sources
          {(meta?.followedSourceCount ?? 0) > 0 && (
            <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
              {meta!.followedSourceCount}
            </span>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Auth / server error */}
      {!loading && fetchError && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Rss size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            {fetchError === 'auth' ? 'Sign in to see your feed' : 'Feed unavailable right now'}
          </p>
          <p className="text-xs text-muted-foreground">
            {fetchError === 'auth'
              ? 'Your session may have expired. Refresh the page to sign in again.'
              : 'There was a problem loading your feed. Please try again in a moment.'}
          </p>
          <button
            type="button"
            onClick={() => void loadPage(0, typeFilter, true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-muted text-foreground font-semibold py-2 px-4 text-xs hover:bg-muted/80 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* No follows onboarding */}
      {!loading && !fetchError && noFollows && (
        <div className="rounded-2xl border border-dashed border-border p-14 text-center">
          <Rss size={40} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-base font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Nothing in your feed yet
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            Follow teams and clubs to see their latest videos and content here.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSourcePicker(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 px-5 text-sm hover:opacity-90 transition-all"
            >
              <Plus size={14} />
              Add news sources
            </button>
            {onNavigateToControls && (
              <button
                type="button"
                onClick={onNavigateToControls}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card text-foreground font-semibold py-2.5 px-5 text-sm hover:border-primary/40 transition-all"
              >
                <SlidersHorizontal size={14} />
                Pick your teams
              </button>
            )}
          </div>
        </div>
      )}

      {/* Has follows but no content for this filter */}
      {!loading && !fetchError && !noFollows && !hasContent && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="mx-auto mb-3 text-muted-foreground opacity-30">
            {typeIcon(typeFilter as UnifiedFeedItem['type'] || 'article', 32)}
          </div>
          <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            {typeFilter ? `No ${typeLabel(typeFilter as UnifiedFeedItem['type']).toLowerCase()}s yet` : 'No content yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {typeFilter
              ? `Your followed sources haven't published any ${typeLabel(typeFilter as UnifiedFeedItem['type']).toLowerCase()}s recently.`
              : 'Your followed teams and sources haven\'t published anything recently. Check back soon.'}
          </p>
        </div>
      )}

      {/* Content grid */}
      {!loading && !fetchError && hasContent && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {allItems.map(item => (
            <FeedCard
              key={item.id}
              item={item}
              onNavigateToControls={onNavigateToControls}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {!loading && !fetchError && meta?.hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadPage(page + 1, typeFilter)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
            Load more
          </button>
        </div>
      )}

      {/* Source picker modal */}
      {showSourcePicker && (
        <SourcePickerModal
          onClose={() => setShowSourcePicker(false)}
          onFollowChange={handleFollowChange}
        />
      )}
    </div>
  );
}
