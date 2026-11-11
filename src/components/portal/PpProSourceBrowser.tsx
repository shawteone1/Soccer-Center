/**
 * PpProSourceBrowser — Professional soccer source directory for the Parent Portal.
 *
 * Browse by competition tab (PL, LaLiga, Bundesliga, Ligue 1, Serie A, UCL, MLS, National Teams, Media).
 * Each source shows its connection status badge, verified outbound links, and a follow/unfollow button.
 * Follows are persisted to sc_parent_follows with sourceType = 'pro-club' | 'competition' | 'national-team' | 'media'.
 *
 * Data source: GET /api/catalog/teams (DB-backed, auth-gated).
 * Falls back to GET /api/pro-sources (static file) if catalog returns an error.
 *
 * Connection status badges:
 *   Live feed   — YouTube channel connected; videos available in Fanzone
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
} from 'lucide-react';
import { PpCard, PpSectionHeading } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'youtube-live' | 'link-only' | 'unresolved';

interface Follow {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceName: string | null;
}

// Normalised source shape used throughout this component.
interface ProSource {
  id: string;
  name: string;
  kind: 'club' | 'league' | 'competition' | 'national_team' | 'media';
  competition?: string;
  country: string;
  status: ConnectionStatus;
  website?: string;
  youtubeUrl?: string;
  channelSlug?: string;
}

interface ProCompetition {
  slug: string;
  name: string;
  shortName?: string;
  kind?: string;
  confederation?: string;
  country?: string;
  channelSlug?: string;
}

// Shape returned by /api/catalog/teams (DB-backed)
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

// Normalised internal shape
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
  { id: 'premier-league',   label: 'Premier League',  shortLabel: 'PL',      competitionSlug: 'premier-league' },
  { id: 'laliga',           label: 'LaLiga',           shortLabel: 'LaLiga',  competitionSlug: 'laliga' },
  { id: 'bundesliga',       label: 'Bundesliga',       shortLabel: 'BL',      competitionSlug: 'bundesliga' },
  { id: 'ligue-1',          label: 'Ligue 1',          shortLabel: 'L1',      competitionSlug: 'ligue-1' },
  { id: 'serie-a',          label: 'Serie A',          shortLabel: 'SA',      competitionSlug: 'serie-a' },
  { id: 'champions-league', label: 'UCL',              shortLabel: 'UCL',     competitionSlug: 'champions-league' },
  { id: 'mls',              label: 'MLS',              shortLabel: 'MLS',     competitionSlug: 'mls' },
  { id: 'national-teams',   label: 'National Teams',   shortLabel: 'NT',      special: 'national_teams' },
  { id: 'media',            label: 'Media',            shortLabel: 'Media',   special: 'media' },
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
      id: s.importKey,
      name: s.label ?? s.importKey,
      kind: 'media',
      country: '',
      status: s.connectorEnabled ? 'youtube-live' : 'link-only',
      website: s.url ?? undefined,
    })),
    ...data.media.podcasts.map((s): ProSource => ({
      id: s.importKey,
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
    kind: 'league',
    confederation: c.associationCode ?? '',
  }));

  return { competitions, byCompetition, nationalTeams, media: mediaSources };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'youtube-live') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
        style={{ background: 'hsl(var(--pp-badge-success-bg, 142 76% 90%))', color: 'hsl(var(--pp-badge-success-fg, 142 76% 25%))' }}
      >
        <Wifi size={9} />
        Live feed
      </span>
    );
  }
  if (status === 'link-only') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Globe size={9} />
        Link only
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}
    >
      <HelpCircle size={9} />
      Unresolved
    </span>
  );
}

// ─── Source row ───────────────────────────────────────────────────────────────

function SourceRow({
  source,
  follow,
  onFollow,
  onUnfollow,
  actionLoading,
}: {
  source: ProSource;
  follow: Follow | null;
  onFollow: (s: ProSource) => void;
  onUnfollow: (followId: string) => void;
  actionLoading: string | null;
}) {
  const isFollowing = !!follow;
  const loadingKey = source.id;
  const isLoading = actionLoading === loadingKey || actionLoading === (follow?.id ?? '');

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
          <StatusBadge status={source.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {source.website && (
            <a
              href={source.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px]"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              <ExternalLink size={9} />
              Website
            </a>
          )}
          {source.youtubeUrl && (
            <a
              href={source.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px]"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              <Youtube size={9} />
              YouTube
            </a>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {isFollowing ? (
          <button
            type="button"
            onClick={() => onUnfollow(follow.id)}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: 'hsl(var(--pp-navy))',
              background: 'hsl(var(--pp-blue-light))',
              color: 'hsl(var(--pp-navy))',
            }}
          >
            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            Following
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onFollow(source)}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              color: 'hsl(var(--pp-text-muted))',
            }}
          >
            {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Follow
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function sourceTypeForKind(kind: ProSource['kind']): string {
  if (kind === 'club') return 'pro-club';
  if (kind === 'national_team') return 'national-team';
  if (kind === 'league' || kind === 'competition') return 'competition';
  return 'media';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpProSourceBrowser() {
  const [activeTab, setActiveTab] = useState<string>('premier-league');
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<NormalisedCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [followsLoading, setFollowsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load catalog from /api/catalog/teams (DB-backed, auth-gated)
  useEffect(() => {
    async function load() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await apiFetch('/api/catalog/teams');
        if (!res.ok) throw new Error(`catalog/teams ${res.status}`);
        const data = await res.json() as CatalogTeamsResponse;
        setCatalog(normaliseCatalogResponse(data));
      } catch (e) {
        // Fallback to legacy /api/pro-sources (public, static)
        try {
          const fallback = await fetch('/api/pro-sources');
          if (!fallback.ok) throw new Error('Failed to load pro sources');
          const legacy = await fallback.json() as {
            competitions: ProCompetition[];
            byCompetition: Record<string, ProSource[]>;
            nationalTeams: ProSource[];
            media: ProSource[];
          };
          setCatalog({
            competitions: legacy.competitions,
            byCompetition: legacy.byCompetition,
            nationalTeams: legacy.nationalTeams,
            media: legacy.media,
          });
        } catch {
          setCatalogError(e instanceof Error ? e.message : 'Something went wrong');
        }
      } finally {
        setCatalogLoading(false);
      }
    }
    load();
  }, []);

  // Load follows
  const loadFollows = useCallback(async () => {
    setFollowsLoading(true);
    try {
      const res = await apiFetch('/api/parent/follows');
      if (!res.ok) return;
      const data = await res.json() as { follows: Follow[] };
      setFollows(data.follows);
    } finally {
      setFollowsLoading(false);
    }
  }, []);

  useEffect(() => { loadFollows(); }, [loadFollows]);

  async function handleFollow(source: ProSource) {
    setActionLoading(source.id);
    try {
      const sourceType = sourceTypeForKind(source.kind);
      const res = await apiFetch('/api/parent/follows', {
        method: 'POST',
        body: JSON.stringify({ sourceType, sourceId: source.id, sourceName: source.name }),
      });
      if (!res.ok) return;
      const data = await res.json() as { id: string };
      setFollows(prev => [...prev, { id: data.id, sourceType, sourceId: source.id, sourceName: source.name }]);
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

  // Determine sources for active tab
  function getTabSources(): ProSource[] {
    if (!catalog) return [];
    const tab = TABS.find(t => t.id === activeTab);
    if (!tab) return [];

    let sources: ProSource[] = [];
    if (tab.special === 'national_teams') {
      sources = catalog.nationalTeams;
    } else if (tab.special === 'media') {
      sources = catalog.media;
    } else if (tab.competitionSlug) {
      sources = catalog.byCompetition[tab.competitionSlug] ?? [];
      // For competition-level tabs (UCL, MLS) that have no clubs, show the competition itself
      if (sources.length === 0) {
        const comp = catalog.competitions.find(c => c.slug === tab.competitionSlug);
        if (comp) {
          sources = [{
            id: comp.slug,
            name: comp.name,
            kind: 'competition',
            country: comp.country ?? comp.confederation ?? '',
            status: comp.channelSlug ? 'youtube-live' : 'link-only',
            channelSlug: comp.channelSlug,
          }];
        }
      }
    }

    if (search.trim()) {
      const lc = search.toLowerCase();
      sources = sources.filter(s => s.name.toLowerCase().includes(lc));
    }
    return sources;
  }

  const tabSources = getTabSources();
  const isLoading = catalogLoading || followsLoading;

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>Professional sources</PpSectionHeading>
        <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {follows.filter(f => ['pro-club', 'competition', 'national-team', 'media'].includes(f.sourceType)).length} followed
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>Status:</span>
        <StatusBadge status="youtube-live" />
        <StatusBadge status="link-only" />
        <StatusBadge status="unresolved" />
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Browse by competition"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); }}
            className="text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors shrink-0"
            style={{
              borderColor: activeTab === tab.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              background: activeTab === tab.id ? 'hsl(var(--pp-navy))' : 'transparent',
              color: activeTab === tab.id ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sources…"
          className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            background: 'hsl(var(--pp-page-bg))',
            color: 'hsl(var(--pp-text))',
          }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      ) : catalogError ? (
        <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>{catalogError}</p>
      ) : tabSources.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {search ? 'No sources match your search.' : 'No sources in this category yet.'}
        </p>
      ) : (
        <div>
          <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {tabSources.length} source{tabSources.length !== 1 ? 's' : ''} ·{' '}
            {tabSources.filter(s => s.status === 'youtube-live').length} with live feed
          </p>
          {tabSources.map(source => (
            <SourceRow
              key={source.id}
              source={source}
              follow={followMap.get(source.id) ?? null}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </PpCard>
  );
}
