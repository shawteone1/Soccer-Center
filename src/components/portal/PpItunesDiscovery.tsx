import PodcastAudioPlayer from '@/components/portal/PodcastAudioPlayer';
/**
 * PpItunesDiscovery — iTunes Search API podcast discovery for the Fan portal.
 *
 * Embedded in the Podcasts tab's Discover section.
 * Provides search-as-you-type against iTunes Search API (proxied via
 * /api/my-soccer/itunes-search), with:
 *   - Artwork thumbnail + show name + artist
 *   - Genre badge + episode count
 *   - Follow button (upserts to sc_sources via /api/my-soccer/podcast-import,
 *     then follows via /api/my-soccer/following)
 *   - Episode preview (loads RSS via /api/my-soccer/rss-feed after follow)
 *   - Inline HTML5 audio player
 *   - "Add by RSS URL" fallback preserved alongside
 *
 * Shows only when the user types in the search box.
 * Falls back gracefully when feedUrl is null (iTunes-only shows without a
 * public RSS feed — shows a "Listen on Apple Podcasts" link instead).
 */

import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, CheckCircle, Loader2, Headphones,
  ExternalLink, Radio, XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface iTunesResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl: string | null;
  feedUrl: string | null;
  trackCount: number | null;
  primaryGenreName: string | null;
  collectionViewUrl: string | null;
  sourceId: string | null;
  isFollowing: boolean;
}

interface RssEpisode {
  title: string;
  enclosureUrl: string | null;
  enclosureType: string | null;
  link: string | null;
  isoDate: string | null;
  duration: string | null;
  description: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Episode mini-player ──────────────────────────────────────────────────────

function EpisodeRow({ ep }: { ep: RssEpisode }) {
  const [playing, setPlaying] = useState(false);
  const hasAudio = !!ep.enclosureUrl && (
    ep.enclosureType?.startsWith('audio/') ||
    /\.(mp3|m4a|ogg|aac|wav)(\?|$)/i.test(ep.enclosureUrl)
  );

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-start gap-2 px-3 py-2.5">
        {hasAudio ? (
          <button
            type="button"
            onClick={() => setPlaying(v => !v)}
            className={`shrink-0 mt-0.5 min-w-11 min-h-11 px-2 gap-1 rounded-lg flex items-center justify-center transition-colors ${
              playing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
            aria-label={playing ? 'Close episode player' : 'Open episode player'}
          >
            <span className="text-xs">{playing ? 'Close' : 'Listen'}</span>
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current ml-0.5">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            )}
          </button>
        ) : (
          <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <Headphones size={10} className="text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">{ep.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ep.isoDate && <span className="text-[10px] text-muted-foreground">{formatRelativeDate(ep.isoDate)}</span>}
            {ep.duration && <span className="text-[10px] text-muted-foreground">{ep.duration}</span>}
            {!hasAudio && ep.link && (
              <a href={ep.link} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                <ExternalLink size={9} /> Listen
              </a>
            )}
          </div>
        </div>
      </div>
      {playing && ep.enclosureUrl && (
        <div className="px-3 pb-2.5">
          <PodcastAudioPlayer src={ep.enclosureUrl} title={ep.title} onEnded={() => setPlaying(false)} />
        </div>
      )}
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ITunesResultCard({
  result,
  onFollowed,
}: {
  result: iTunesResult;
  onFollowed: (sourceId: string, label: string) => void;
}) {
  const [following, setFollowing] = useState(result.isFollowing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<RssEpisode[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [epError, setEpError] = useState<string | null>(null);
  const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(result.sourceId);

  async function handleFollow() {
    if (!result.feedUrl) return;
    setLoading(true);
    setError(null);
    try {
      // Upsert into sc_sources via podcast-import
      const r = await apiFetch('/api/my-soccer/podcast-import', {
        method: 'POST',
        body: JSON.stringify({ feedUrl: result.feedUrl }),
      });
      const d = await r.json() as { ok: boolean; error?: string; source?: { id: string; label: string } };
      if (!d.ok) { setError(d.error ?? 'Import failed'); setLoading(false); return; }
      const sid = d.source!.id;
      setResolvedSourceId(sid);
      // Follow
      await apiFetch('/api/my-soccer/following', {
        method: 'POST',
        body: JSON.stringify({ entityId: sid, entityType: 'source', action: 'follow' }),
      });
      setFollowing(true);
      onFollowed(sid, d.source!.label);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  async function handleUnfollow() {
    if (!resolvedSourceId) return;
    setLoading(true);
    try {
      await apiFetch('/api/my-soccer/following', {
        method: 'POST',
        body: JSON.stringify({ entityId: resolvedSourceId, entityType: 'source', action: 'unfollow' }),
      });
      setFollowing(false);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function loadEpisodes() {
    if (!resolvedSourceId) return;
    setEpLoading(true);
    setEpError(null);
    try {
      const r = await apiFetch(`/api/my-soccer/rss-feed?sourceId=${encodeURIComponent(resolvedSourceId)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { items: RssEpisode[]; warning?: string };
      if (d.warning) setEpError(d.warning);
      setEpisodes(d.items ?? []);
    } catch (e) {
      setEpError(e instanceof Error ? e.message : 'Failed to load');
    }
    setEpLoading(false);
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && resolvedSourceId) void loadEpisodes();
  }

  const canPreview = !!result.feedUrl && !!resolvedSourceId;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          {result.artworkUrl ? (
            <img
              src={result.artworkUrl}
              alt=""
              className="h-12 w-12 rounded-xl object-cover shrink-0"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Radio size={20} className="text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {result.collectionName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{result.artistName}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {result.primaryGenreName && (
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                  {result.primaryGenreName}
                </span>
              )}
              {result.trackCount != null && (
                <span className="text-[10px] text-muted-foreground">
                  {result.trackCount} episodes
                </span>
              )}
              {!result.feedUrl && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  No public RSS
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <XCircle size={11} /> {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {result.feedUrl ? (
            <button
              type="button"
              onClick={() => void (following ? handleUnfollow() : handleFollow())}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                following
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-muted text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {loading ? <Loader2 size={12} className="animate-spin" />
                : following ? <CheckCircle size={12} /> : <Plus size={12} />}
              {following ? 'Following' : 'Follow'}
            </button>
          ) : (
            result.collectionViewUrl && (
              <a
                href={result.collectionViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink size={12} />
                Apple Podcasts
              </a>
            )
          )}
          {canPreview && (
            <button
              type="button"
              onClick={handleExpand}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                expanded
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Headphones size={11} />
              {expanded ? 'Hide' : 'Episodes'}
            </button>
          )}
        </div>
      </div>

      {/* Episode list */}
      {expanded && canPreview && (
        <div className="border-t border-border">
          {epLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {epError && (
            <p className="px-4 py-3 text-xs text-muted-foreground">Episode status: {epError} <button type="button" className="min-h-11 underline" onClick={() => void loadEpisodes()}>Retry episodes</button></p>
          )}
          {!epLoading && !epError && episodes.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">No episodes found in this feed.</p>
          )}
          {!epLoading && episodes.slice(0, 5).map((ep, i) => (
            <EpisodeRow key={i} ep={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpItunesDiscovery({
  onFollowed,
  query: controlledQuery,
}: {
  onFollowed?: (sourceId: string, label: string) => void;
  /** When provided, the parent owns the search field; this component hides its own. */
  query?: string;
}) {
  const [internalQuery, setInternalQuery] = useState('');
  // Use controlled query when provided, otherwise fall back to internal state
  const query = controlledQuery !== undefined ? controlledQuery : internalQuery;
  const [results, setResults] = useState<iTunesResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setSearched(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await apiFetch(`/api/my-soccer/itunes-search?q=${encodeURIComponent(q)}&limit=12`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json() as { results: iTunesResult[] };
        setResults(d.results ?? []);
        setSearched(true);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Search failed');
      }
      setSearching(false);
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <div className="space-y-4">
      {/* Search input — only shown when not controlled by parent */}
      {controlledQuery === undefined && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={internalQuery}
            onChange={e => setInternalQuery(e.target.value)}
            placeholder="Search iTunes for soccer podcasts…"
            className="w-full rounded-xl border border-border bg-muted/40 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {searching && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {/* Searching indicator when controlled */}
      {controlledQuery !== undefined && searching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Searching iTunes…
        </div>
      )}

      {searchError && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <XCircle size={12} /> {searchError}
        </p>
      )}

      {/* Results */}
      {searched && results.length === 0 && !searching && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Radio size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm font-semibold text-foreground mb-1">No podcasts found</p>
          <p className="text-xs text-muted-foreground">Try a different search term, or add a show by RSS URL above.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(r => (
            <ITunesResultCard
              key={r.collectionId}
              result={r}
              onFollowed={(sid, label) => onFollowed?.(sid, label)}
            />
          ))}
        </div>
      )}

      {!query && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Search size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm font-semibold text-foreground mb-1">Search the iTunes podcast catalog</p>
          <p className="text-xs text-muted-foreground">
            Find any soccer podcast by name, host, or topic. Results update as you type.
          </p>
        </div>
      )}
    </div>
  );
}
