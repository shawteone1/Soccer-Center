/**
 * FanSourceBrowser — Professional soccer source directory for Fan Arena.
 *
 * Reuses the same catalog API as PpProSourceBrowser but persists follows to
 * sc_user_following (fan-scoped) via POST /api/my-soccer/following, keeping
 * Fan and Parent selections fully independent.
 *
 * Tabs: Premier League | LaLiga | Bundesliga | Ligue 1 | Serie A | UCL | MLS |
 *       National Teams | Media
 *
 * Connection status badges:
 *   Live feed   — YouTube channel connected; videos available in Team Videos
 *   Link only   — verified website/YouTube URL but no live feed integration
 *   Unresolved  — source known but no verified links yet
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle,
  Plus,
  Loader2,
  ExternalLink,
  Youtube,
  Globe,
  Wifi,
  HelpCircle,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'youtube-live' | 'link-only' | 'unresolved';

interface FanFollow {
  id: string;
  entityType: string;
  entityId: string;
}

interface ProSource {
  id: string;
  name: string;
  kind: 'club' | 'league' | 'competition' | 'national_team' | 'media';
  competition?: string;
  country: string;
  status: ConnectionStatus;
  website?: string;
  youtubeUrl?: string;
}

interface ProCompetition {
  slug: string;
  name: string;
}

interface CatalogTeamsResponse {
  teams: {
    clubs: CatalogTeam[];
    nationalTeams: CatalogTeam[];
    organizations: CatalogTeam[];
    leagues: CatalogTeam[];
  };
  competitions: CatalogCompetition[];
  media: { news: CatalogSource[]; podcasts: CatalogSource[] };
  byCompetition: Record<string, CatalogTeam[]>;
}

interface CatalogTeam {
  id: string;
  importKey: string;
  entityType: string;
  displayName: string;
  gender: string | null;
  associationCode: string | null;
  officialWebsite: string | null;
  mediaCoverage: string | null;
}

interface CatalogCompetition {
  id: string;
  importKey: string;
  name: string;
  type: string | null;
  associationCode: string | null;
}

interface CatalogSource {
  id: string;
  importKey: string;
  label: string | null;
  url: string | null;
  format: string | null;
  authority: string | null;
  feedEndpoint: string | null;
  connectorEnabled: boolean;
}

interface NormalisedCatalog {
  competitions: ProCompetition[];
  byCompetition: Record<string, ProSource[]>;
  nationalTeams: ProSource[];
  media: ProSource[];
}

// ─── Tab config ───────────────────────────────────────────────────────────────

interface TabDef {
  id: string;
  label: string;
  shortLabel: string;
  competitionSlug?: string;
  special?: 'national_teams' | 'media';
}

const TABS: TabDef[] = [
  { id: 'premier-league',   label: 'Premier League',  shortLabel: 'PL',    competitionSlug: 'premier-league' },
  { id: 'laliga',           label: 'LaLiga',           shortLabel: 'LaLiga',competitionSlug: 'laliga' },
  { id: 'bundesliga',       label: 'Bundesliga',       shortLabel: 'BL',    competitionSlug: 'bundesliga' },
  { id: 'ligue-1',          label: 'Ligue 1',          shortLabel: 'L1',    competitionSlug: 'ligue-1' },
  { id: 'serie-a',          label: 'Serie A',          shortLabel: 'SA',    competitionSlug: 'serie-a' },
  { id: 'champions-league', label: 'UCL',              shortLabel: 'UCL',   competitionSlug: 'champions-league' },
  { id: 'mls',              label: 'MLS',              shortLabel: 'MLS',   competitionSlug: 'mls' },
  { id: 'national-teams',   label: 'National Teams',   shortLabel: 'NT',    special: 'national_teams' },
  { id: 'media',            label: 'Media',            shortLabel: 'Media', special: 'media' },
];

// ─── Catalog normalisation ────────────────────────────────────────────────────

function compSlugFromImportKey(importKey: string): string {
  return importKey.replace(/^comp:/, '');
}

function statusFromCoverage(coverage: string | null): ConnectionStatus {
  if (coverage === 'full') return 'youtube-live';
  if (coverage === 'partial') return 'link-only';
  return 'unresolved';
}

function normaliseCatalogResponse(data: CatalogTeamsResponse): NormalisedCatalog {
  const compKeyToSlug = new Map<string, string>();
  for (const comp of data.competitions) {
    compKeyToSlug.set(comp.importKey, compSlugFromImportKey(comp.importKey));
  }

  const byCompetition: Record<string, ProSource[]> = {};
  for (const [compKey, teams] of Object.entries(data.byCompetition)) {
    const slug = compKeyToSlug.get(compKey) ?? compSlugFromImportKey(compKey);
    byCompetition[slug] = teams.map((t): ProSource => ({
      id: t.importKey,
      name: t.displayName,
      kind: 'club',
      competition: slug,
      country: t.associationCode ?? '',
      status: statusFromCoverage(t.mediaCoverage),
      website: t.officialWebsite ?? undefined,
    }));
  }

  const nationalTeams: ProSource[] = data.teams.nationalTeams.map((t): ProSource => ({
    id: t.importKey,
    name: t.displayName,
    kind: 'national_team',
    country: t.associationCode ?? '',
    status: statusFromCoverage(t.mediaCoverage),
    website: t.officialWebsite ?? undefined,
  }));

  const mediaSources: ProSource[] = [
    ...data.media.news.map((s): ProSource => ({
      // Use sc_sources.id (UUID) — not importKey — so entityId in sc_user_following
      // matches what /api/my-soccer/media-sources returns and Newsstand can read it.
      id: s.id,
      name: s.label ?? s.importKey,
      kind: 'media',
      country: '',
      status: s.connectorEnabled ? 'youtube-live' : 'link-only',
      website: s.url ?? undefined,
    })),
    ...data.media.podcasts.map((s): ProSource => ({
      // Podcasts are managed separately (podcast search tab); keep sc_sources.id
      // for consistency so any future cross-tab follow state also matches.
      id: s.id,
      name: s.label ?? s.importKey,
      kind: 'media',
      country: '',
      status: s.connectorEnabled ? 'youtube-live' : 'link-only',
      website: s.url ?? undefined,
    })),
    ...data.teams.organizations.map((t): ProSource => ({
      id: t.importKey,
      name: t.displayName,
      kind: 'media',
      country: t.associationCode ?? '',
      status: statusFromCoverage(t.mediaCoverage),
      website: t.officialWebsite ?? undefined,
    })),
  ];

  const competitions: ProCompetition[] = data.competitions.map((c): ProCompetition => ({
    slug: compSlugFromImportKey(c.importKey),
    name: c.name,
  }));

  return { competitions, byCompetition, nationalTeams, media: mediaSources };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'youtube-live') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">
        <Wifi size={9} /> Live feed
      </span>
    );
  }
  if (status === 'link-only') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">
        <Globe size={9} /> Link only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground/70">
      <HelpCircle size={9} /> Unresolved
    </span>
  );
}

// ─── Source row ───────────────────────────────────────────────────────────────

function SourceRow({
  source,
  isFollowing,
  onFollow,
  onUnfollow,
  actionLoading,
  followsUnavailable,
}: {
  source: ProSource;
  isFollowing: boolean;
  onFollow: (s: ProSource) => void;
  onUnfollow: (s: ProSource) => void;
  actionLoading: string | null;
  followsUnavailable: boolean;
}) {
  const isLoading = actionLoading === source.id;
  const disabled = isLoading || followsUnavailable;

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{source.name}</p>
          {source.country && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{source.country}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <StatusBadge status={source.status} />
          {source.website && (
            <a
              href={source.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink size={9} /> Website
            </a>
          )}
          {source.youtubeUrl && (
            <a
              href={source.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <Youtube size={9} /> YouTube
            </a>
          )}
          {source.status === 'link-only' && (
            <span className="text-[10px] text-muted-foreground/60 italic">
              Links out — no live feed
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {isFollowing ? (
          <button
            onClick={() => onUnfollow(source)}
            disabled={disabled}
            title={followsUnavailable ? 'Follow data unavailable — setup required' : undefined}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border border-primary text-primary hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            Following
          </button>
        ) : (
          <button
            onClick={() => onFollow(source)}
            disabled={disabled}
            title={followsUnavailable ? 'Follow data unavailable — setup required' : undefined}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Follow
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FanSourceBrowser() {
  const [catalog, setCatalog] = useState<NormalisedCatalog | null>(null);
  const [follows, setFollows] = useState<FanFollow[]>([]);
  const [loading, setCatalogLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // followsUnavailable = true when the follows endpoint returned an error.
  // In this state all follow/unfollow buttons are disabled with an explanatory notice.
  const [followsUnavailable, setFollowsUnavailable] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load catalog + fan follows in parallel
  useEffect(() => {
    void (async () => {
      setCatalogLoading(true);
      setError(null);
      setFollowsUnavailable(false);
      try {
        const [catalogRes, followsRes] = await Promise.all([
          fetch('/api/catalog/teams', { credentials: 'include' }),
          fetch('/api/my-soccer/following', { credentials: 'include' }),
        ]);

        if (!catalogRes.ok) throw new Error('Catalog unavailable');
        const catalogData = await catalogRes.json() as CatalogTeamsResponse;
        setCatalog(normaliseCatalogResponse(catalogData));

        if (followsRes.ok) {
          const followsData = await followsRes.json() as { follows: FanFollow[] };
          setFollows(followsData.follows ?? []);
        } else {
          // Follows endpoint failed — sc_user_following table likely missing.
          // Catalog still loads but follow state is unknown, not empty.
          // Disable all follow/unfollow buttons until the table exists.
          setFollowsUnavailable(true);
          setFollows([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sources');
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  const isFollowing = useCallback((sourceId: string): boolean => {
    return follows.some((f) => f.entityId === sourceId);
  }, [follows]);

  const handleFollow = useCallback(async (source: ProSource) => {
    setActionLoading(source.id);
    try {
      const res = await fetch('/api/my-soccer/following', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityId: source.id, entityType: 'source', action: 'follow' }),
      });
      if (res.ok) {
        const data = await res.json() as { followId?: string };
        setFollows((prev) => [
          ...prev,
          { id: data.followId ?? crypto.randomUUID(), entityType: 'source', entityId: source.id },
        ]);
      }
    } catch { /* non-fatal */ }
    setActionLoading(null);
  }, []);

  const handleUnfollow = useCallback(async (source: ProSource) => {
    setActionLoading(source.id);
    try {
      const res = await fetch('/api/my-soccer/following', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityId: source.id, entityType: 'source', action: 'unfollow' }),
      });
      if (res.ok) {
        setFollows((prev) => prev.filter((f) => f.entityId !== source.id));
      }
    } catch { /* non-fatal */ }
    setActionLoading(null);
  }, []);

  // Get sources for the active tab
  const getTabSources = (): ProSource[] => {
    if (!catalog) return [];
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab) return [];
    if (tab.special === 'national_teams') return catalog.nationalTeams;
    if (tab.special === 'media') return catalog.media;
    if (tab.competitionSlug) return catalog.byCompetition[tab.competitionSlug] ?? [];
    return [];
  };

  const tabSources = getTabSources();
  const filtered = search.trim()
    ? tabSources.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : tabSources;

  const followedCount = follows.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            Follow clubs, national teams, and media sources to populate your Feed and Team Videos.
          </p>
          {followsUnavailable ? (
            <p className="text-xs text-destructive mt-0.5 font-medium">
              Follow data unavailable — setup required. Contact your administrator.
            </p>
          ) : followedCount > 0 && (
            <p className="text-xs text-primary mt-0.5 font-medium">
              {followedCount} source{followedCount !== 1 ? 's' : ''} followed
            </p>
          )}
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources…"
            className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-44"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Competition tabs — horizontal scroll, no visible scrollbar */}
      <div className="-mx-1 px-1 mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1 fa-mobile-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearch(''); }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Source list */}
      <div className="rounded-xl border border-border bg-card px-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? `No sources matching "${search}"` : 'No sources in this category yet.'}
          </p>
        ) : (
          filtered.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              isFollowing={isFollowing(source.id)}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              actionLoading={actionLoading}
              followsUnavailable={followsUnavailable}
            />
          ))
        )}
      </div>

      {/* Info note */}
      <p className="text-[11px] text-muted-foreground/70 mt-3 leading-relaxed">
        "Link only" sources have verified websites or YouTube channels but are not yet integrated for live feed ingestion.
        Following them saves your preference for when integration is added.
      </p>
    </div>
  );
}
