/**
 * PpSourceFeed — "Choose your sources" / "Manage my feed" for the Parent Portal.
 *
 * Sources come from two pools:
 *   1. STATIC_CATALOG — curated clubs, leagues, orgs, vendors, and media sources
 *      with verified website/social/YouTube/podcast links.
 *   2. Live clubs from /api/parent/clubs — distinct club names from the tryout
 *      events directory. These have "Website link only" channels since we have
 *      no confirmed social/feed connections for them.
 *
 * Vendors are preserved with "Under construction" status; saved vendor interest
 * does NOT imply a working feed.
 *
 * Follow/Unfollow persisted to account via /api/parent/follows.
 * Follows are separate from player club/team affiliations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle, Plus, Loader2, ExternalLink, Rss, RefreshCw, Info } from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton, PpDivider } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Follow {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceName: string | null;
  createdAt: string | null;
}

interface SourceItem {
  id: string;
  name: string;
  type: 'club' | 'team' | 'org' | 'vendor' | 'media';
  category: string;
  channels: string[];
  description?: string;
  websiteUrl?: string;
  underConstruction?: boolean;
  /** true = from live directory; false = from static catalog */
  fromDirectory?: boolean;
}

// ─── Static source catalog ────────────────────────────────────────────────────
// Curated sources with verified outbound links. Vendor names preserved.

const STATIC_CATALOG: SourceItem[] = [
  // Clubs (Colorado) — verified websites
  { id: 'club-colorado-rapids-youth', name: 'Colorado Rapids Youth SC', type: 'club', category: 'Clubs', channels: ['Website', 'Social'], websiteUrl: 'https://coloradorapidsyouth.com' },
  { id: 'club-colorado-storm', name: 'Colorado Storm Soccer Club', type: 'club', category: 'Clubs', channels: ['Website', 'Social'], websiteUrl: 'https://coloradostormsoccer.com' },
  { id: 'club-fc-colorado', name: 'FC Colorado', type: 'club', category: 'Clubs', channels: ['Website'], websiteUrl: 'https://fccolorado.com' },
  { id: 'club-real-colorado', name: 'Real Colorado', type: 'club', category: 'Clubs', channels: ['Website', 'Social'], websiteUrl: 'https://realcolorado.com' },
  { id: 'club-colorado-united', name: 'Colorado United', type: 'club', category: 'Clubs', channels: ['Website'], websiteUrl: 'https://coloradounitedsoccer.com' },

  // Teams & Leagues
  { id: 'league-ecnl', name: 'ECNL (Elite Clubs National League)', type: 'team', category: 'Teams & leagues', channels: ['Website', 'Social'], websiteUrl: 'https://ecnlgirls.com' },
  { id: 'league-usys', name: 'US Youth Soccer', type: 'team', category: 'Teams & leagues', channels: ['Website', 'Social'], websiteUrl: 'https://usyouthsoccer.org' },
  { id: 'league-csa', name: 'Colorado Soccer Association', type: 'team', category: 'Teams & leagues', channels: ['Website'], websiteUrl: 'https://coloradosoccer.org' },
  { id: 'league-ayso', name: 'AYSO Colorado', type: 'team', category: 'Teams & leagues', channels: ['Website'], websiteUrl: 'https://ayso.org' },

  // Community organizations
  { id: 'org-soccer-center', name: 'Soccer Center', type: 'org', category: 'Community organizations', channels: ['Website', 'Social', 'Blog'], websiteUrl: 'https://soccercenter.org' },
  { id: 'org-colorado-youth-soccer', name: 'Colorado Youth Soccer', type: 'org', category: 'Community organizations', channels: ['Website'], websiteUrl: 'https://coloradosoccer.org' },

  // Vendors & training providers — under construction; saved interest ≠ working feed
  { id: 'vendor-soccer-shots', name: 'Soccer Shots', type: 'vendor', category: 'Vendors & training providers', channels: ['Interest only'], underConstruction: true },
  { id: 'vendor-coerver', name: 'Coerver Coaching', type: 'vendor', category: 'Vendors & training providers', channels: ['Interest only'], underConstruction: true },
  { id: 'vendor-toca', name: 'TOCA Football', type: 'vendor', category: 'Vendors & training providers', channels: ['Interest only'], underConstruction: true },
  { id: 'vendor-total-futbol', name: 'Total Futbol Academy', type: 'vendor', category: 'Vendors & training providers', channels: ['Interest only'], underConstruction: true },

  // Soccer media — verified outbound links
  { id: 'media-the-athletic-soccer', name: 'The Athletic — Soccer', type: 'media', category: 'Soccer media', channels: ['Website'], websiteUrl: 'https://theathletic.com/soccer' },
  { id: 'media-soccer-america', name: 'Soccer America', type: 'media', category: 'Soccer media', channels: ['Website', 'Podcast'], websiteUrl: 'https://socceramerica.com' },
  { id: 'media-youth-soccer-insider', name: 'Youth Soccer Insider', type: 'media', category: 'Soccer media', channels: ['Website'], websiteUrl: 'https://youthsoccerinsider.com' },
];

const STATIC_IDS = new Set(STATIC_CATALOG.map(s => s.id));

const CATEGORIES = ['Clubs', 'Teams & leagues', 'Community organizations', 'Vendors & training providers', 'Soccer media'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function slugify(name: string) {
  return 'dir-club-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Source row ───────────────────────────────────────────────────────────────

function SourceRow({
  source,
  follow,
  onFollow,
  onUnfollow,
  loading,
}: {
  source: SourceItem;
  follow: Follow | null;
  onFollow: (s: SourceItem) => void;
  onUnfollow: (followId: string) => void;
  loading: boolean;
}) {
  const isFollowing = !!follow;

  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b"
      style={{ borderColor: 'hsl(var(--pp-border))' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {source.name}
          </p>
          {source.underConstruction && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}
            >
              Under construction
            </span>
          )}
          {source.fromDirectory && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            >
              Directory
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {source.channels.map(ch => (
            <span key={ch} className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {ch}
            </span>
          ))}
          {source.websiteUrl && !source.underConstruction && (
            <a
              href={source.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px]"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              <ExternalLink size={9} />
              Visit
            </a>
          )}
        </div>
        {source.underConstruction && (
          <p className="text-[10px] mt-0.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Saving interest does not create a live feed connection.
          </p>
        )}
      </div>

      <div className="shrink-0">
        {isFollowing ? (
          <button
            type="button"
            onClick={() => onUnfollow(follow.id)}
            disabled={loading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: 'hsl(var(--pp-navy))',
              background: 'hsl(var(--pp-blue-light))',
              color: 'hsl(var(--pp-navy))',
            }}
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            Following
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onFollow(source)}
            disabled={loading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              color: 'hsl(var(--pp-text-muted))',
            }}
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Follow
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Feed item (followed source link card) ────────────────────────────────────

function FeedItem({ source }: { source: SourceItem }) {
  if (!source.websiteUrl || source.underConstruction) return null;

  return (
    <div
      className="flex items-start gap-3 py-3 border-b"
      style={{ borderColor: 'hsl(var(--pp-border))' }}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
      >
        <Rss size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
          {source.name}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {source.channels.join(' · ')}
        </p>
        <a
          href={source.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs mt-1.5 font-medium"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          <ExternalLink size={11} />
          Visit {source.name}
        </a>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpSourceFeed({ mode = 'feed' }: { mode?: 'feed' | 'manage' }) {
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [view, setView] = useState<'feed' | 'manage'>(mode);

  // Live directory clubs
  const [dirClubs, setDirClubs] = useState<SourceItem[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirSearch, setDirSearch] = useState('');

  // Combined catalog = static + directory clubs (deduped by name)
  const allSources: SourceItem[] = [
    ...STATIC_CATALOG,
    ...dirClubs.filter(dc => !STATIC_IDS.has(dc.id)),
  ];

  const loadFollows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/parent/follows');
      if (!res.ok) throw new Error('Failed to load follows');
      const data = await res.json() as { follows: Follow[] };
      setFollows(data.follows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFollows(); }, [loadFollows]);

  // Load directory clubs when manage view is opened
  useEffect(() => {
    if (view !== 'manage') return;
    async function loadDirClubs() {
      setDirLoading(true);
      try {
        const res = await apiFetch('/api/parent/clubs?limit=100');
        if (!res.ok) return;
        const data = await res.json() as { clubs: { name: string; city: string | null }[] };
        const items: SourceItem[] = data.clubs
          .filter(c => c.name)
          .map(c => ({
            id: slugify(c.name),
            name: c.name,
            type: 'club' as const,
            category: 'Clubs',
            channels: ['Website link only'],
            description: c.city ? `${c.city}, CO` : undefined,
            fromDirectory: true,
          }));
        setDirClubs(items);
      } catch {
        // Non-fatal — static catalog still works
      } finally {
        setDirLoading(false);
      }
    }
    loadDirClubs();
  }, [view]);

  // Debounced directory search
  useEffect(() => {
    if (view !== 'manage' || !dirSearch.trim()) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/parent/clubs?q=${encodeURIComponent(dirSearch)}&limit=50`);
        if (!res.ok) return;
        const data = await res.json() as { clubs: { name: string; city: string | null }[] };
        const items: SourceItem[] = data.clubs
          .filter(c => c.name)
          .map(c => ({
            id: slugify(c.name),
            name: c.name,
            type: 'club' as const,
            category: 'Clubs',
            channels: ['Website link only'],
            description: c.city ? `${c.city}, CO` : undefined,
            fromDirectory: true,
          }));
        setDirClubs(items);
      } catch { /* non-fatal */ }
    }, 400);
    return () => clearTimeout(t);
  }, [dirSearch, view]);

  async function handleFollow(source: SourceItem) {
    setActionLoading(source.id);
    try {
      const res = await apiFetch('/api/parent/follows', {
        method: 'POST',
        body: JSON.stringify({ sourceType: source.type, sourceId: source.id, sourceName: source.name }),
      });
      if (!res.ok) throw new Error('Failed to follow');
      const data = await res.json() as { id: string };
      setFollows(prev => [...prev, { id: data.id, sourceType: source.type, sourceId: source.id, sourceName: source.name, createdAt: new Date().toISOString() }]);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnfollow(followId: string) {
    setActionLoading(followId);
    try {
      await apiFetch(`/api/parent/follows/${followId}`, { method: 'DELETE' });
      setFollows(prev => prev.filter(f => f.id !== followId));
    } finally {
      setActionLoading(null);
    }
  }

  const followMap = new Map(follows.map(f => [f.sourceId, f]));

  const filteredSources = allSources.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // For feed view: show followed sources from the combined catalog, plus any
  // followed sources that are no longer in the catalog (show name from follow record)
  const followedInCatalog = allSources.filter(s => followMap.has(s.id));
  const followedNotInCatalog = follows
    .filter(f => !allSources.find(s => s.id === f.sourceId))
    .map(f => ({
      id: f.sourceId,
      name: f.sourceName ?? f.sourceId,
      type: f.sourceType as SourceItem['type'],
      category: 'Other',
      channels: [],
    }));
  const followedSources = [...followedInCatalog, ...followedNotInCatalog];

  return (
    <PpCard>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>
          {view === 'feed' ? 'My feed' : 'Manage sources'}
        </PpSectionHeading>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView('feed')}
            className="text-xs px-2.5 py-1 rounded-full border transition-colors"
            style={{
              borderColor: view === 'feed' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              background: view === 'feed' ? 'hsl(var(--pp-navy))' : 'transparent',
              color: view === 'feed' ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            Feed
          </button>
          <button
            type="button"
            onClick={() => setView('manage')}
            className="text-xs px-2.5 py-1 rounded-full border transition-colors"
            style={{
              borderColor: view === 'manage' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              background: view === 'manage' ? 'hsl(var(--pp-navy))' : 'transparent',
              color: view === 'manage' ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            Manage
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      )}

      {error && (
        <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
      )}

      {/* Feed view — shows followed sources with outbound links */}
      {!loading && !error && view === 'feed' && (
        <>
          {followedSources.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                You're not following any sources yet.
              </p>
              <PpButton variant="outline" size="sm" onClick={() => setView('manage')}>
                Choose sources
              </PpButton>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {followedSources.length} followed source{followedSources.length !== 1 ? 's' : ''}.
                Source links open each organization's own website.
                Where a verified feed connection exists, updates appear here.
              </p>
              {followedSources.map(s => (
                <FeedItem key={s.id} source={s} />
              ))}
              <div className="mt-3">
                <PpButton variant="outline" size="sm" onClick={() => setView('manage')}>
                  Manage my feed
                </PpButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* Manage view — searchable source list with follow/unfollow */}
      {!loading && !error && view === 'manage' && (
        <>
          {/* Directory note */}
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 text-xs"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Sources marked <strong>Directory</strong> come from the tryout events database and have verified outbound links only — no live feed connection.
              Sources marked <strong>Under construction</strong> save your interest but do not create a working feed.
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setDirSearch(e.target.value); }}
              placeholder="Search sources…"
              className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: 'hsl(var(--pp-border))',
                background: 'hsl(var(--pp-page-bg))',
                color: 'hsl(var(--pp-text))',
              }}
            />
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {['All', ...CATEGORIES].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap"
                style={{
                  borderColor: activeCategory === cat ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  background: activeCategory === cat ? 'hsl(var(--pp-navy))' : 'transparent',
                  color: activeCategory === cat ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {dirLoading && (
            <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <RefreshCw size={11} className="animate-spin" />
              Loading directory clubs…
            </div>
          )}

          <PpDivider />

          {/* Source list */}
          {filteredSources.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No sources match your search.
            </p>
          ) : (
            <div>
              {filteredSources.map(source => (
                <SourceRow
                  key={source.id}
                  source={source}
                  follow={followMap.get(source.id) ?? null}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                  loading={actionLoading === source.id || actionLoading === (followMap.get(source.id)?.id ?? '')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PpCard>
  );
}
