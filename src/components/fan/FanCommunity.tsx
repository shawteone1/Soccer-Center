/**
 * FanCommunity — Community section for Fan Arena.
 *
 * Pulls supporter groups, regional fan communities, watch-party/pub
 * information, and Premier League supporter groups from the public Fan Zone
 * catalog (fanzone content). Links back to /fanzone for the full catalog.
 *
 * Sections:
 *   Supporter Groups — official and independent fan groups
 *   Watch Parties & Pubs — bars and venues by region
 *   How to Watch — TV/streaming guide summary
 *   PL Groups — Premier League supporter groups (Colorado-first, club filter)
 */

import { useState, useEffect } from 'react';
import {
  Users,
  MapPin,
  ExternalLink,
  Tv,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Star,
} from 'lucide-react';

// ─── Types (matching fanzone.json shape) ─────────────────────────────────────

interface FanGroup {
  id: string;
  tag: string;
  heading: string;
  body: string;
  linkLabel: string;
  url: string;
  barName?: string;
  barAddress?: string;
  barUrl?: string;
}

interface Pub {
  id: string;
  tag: string;
  name: string;
  description: string;
  address: string;
  venueUrl: string;
  mapsUrl: string;
}

interface PubRegion {
  id: string;
  label: string;
  pubs: Pub[];
}

interface TvRow {
  id: string;
  competition: string;
  streaming: string;
  tv: string;
  notes: string;
  link1Label: string;
  link1Url: string;
  link2Label: string;
  link2Url: string;
}

interface PlGroupLink {
  id: string;
  label: string;
  url: string;
}

interface PlSupportersGroup {
  id: string;
  plTeam: string;
  name: string;
  area: string;
  description: string;
  venueLabel: string;
  venueNote: string;
  links: PlGroupLink[];
}

interface FanzoneContent {
  hero: { headline: string; subtext: string };
  fanGroups?: FanGroup[];
  pubRegions?: PubRegion[];
  tvRows?: TvRow[];
  tvTitle?: string;
  tvIntro?: string;
  note?: string;
  plSupportersTitle?: string;
  plSupportersIntro?: string;
  plSupportersNote?: string;
  plSupportersGroups?: PlSupportersGroup[];
}

// ─── Region mapping ───────────────────────────────────────────────────────────
// fanGroup IDs encode the region in their prefix: fg-co*, fg-az*, fg-socal*, etc.
// This map is the single source of truth for region derivation from group ID.
const GROUP_ID_TO_REGION: Record<string, string> = {
  'fg-co':    'colorado',
  'fg-az':    'arizona',
  'fg-socal': 'cal-south',
  'fg-norcal':'cal-north',
  'fg-or':    'oregon',
  'fg-wa':    'washington',
  'fg-nv':    'nevada',
};

const REGION_LABELS: Record<string, string> = {
  'colorado':  'Colorado',
  'arizona':   'Arizona',
  'cal-south': 'Southern California',
  'cal-north': 'Northern California',
  'oregon':    'Oregon',
  'washington':'Washington',
  'nevada':    'Nevada',
};

/** Derive region slug from a fanGroup id, or null if unknown. */
function groupRegion(id: string): string | null {
  // Try longest prefix first (e.g. fg-socal before fg-so)
  const prefixes = Object.keys(GROUP_ID_TO_REGION).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (id.startsWith(prefix)) return GROUP_ID_TO_REGION[prefix];
  }
  return null;
}

// ─── PL group region derivation ───────────────────────────────────────────────
// All current plSupportersGroups are Colorado-based. Derive a display region
// from the `area` field for future-proofing and for the region filter.
// IDs use prefix plsg-co*, plsg-az*, etc. — same encoding as fanGroups.
const PLSG_ID_TO_REGION: Record<string, string> = {
  'plsg-co':    'colorado',
  'plsg-az':    'arizona',
  'plsg-socal': 'cal-south',
  'plsg-norcal':'cal-north',
  'plsg-or':    'oregon',
  'plsg-wa':    'washington',
  'plsg-nv':    'nevada',
};

function plsgRegion(id: string): string | null {
  const prefixes = Object.keys(PLSG_ID_TO_REGION).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (id.startsWith(prefix)) return PLSG_ID_TO_REGION[prefix];
  }
  return null;
}

// ─── PL Supporter Group card ──────────────────────────────────────────────────

function PlGroupCard({ group }: { group: PlSupportersGroup }) {
  const hasVenue = group.venueLabel.trim().length > 0;
  const hasNote = group.venueNote.trim().length > 0;
  const venueMissing = !hasVenue && !hasNote;

  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Star size={15} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{group.plTeam}</span>
          <h3 className="text-sm font-semibold text-foreground leading-snug mt-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
            {group.name}
          </h3>
          {group.area && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{group.area}</p>
          )}
        </div>
      </div>

      {group.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{group.description}</p>
      )}

      {/* Venue */}
      {hasVenue && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin size={11} className="shrink-0 mt-0.5 text-primary" />
          <span>{group.venueLabel}</span>
        </div>
      )}
      {!hasVenue && hasNote && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground italic">
          <MapPin size={11} className="shrink-0 mt-0.5" />
          <span>{group.venueNote}</span>
        </div>
      )}
      {venueMissing && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground/60 italic">
          <MapPin size={11} className="shrink-0 mt-0.5" />
          <span>Venue not listed — check group links for current details.</span>
        </div>
      )}

      {/* Links */}
      {group.links.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          {group.links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
            >
              {link.label} <ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

// ─── Fan Group card ───────────────────────────────────────────────────────────

function FanGroupCard({ group }: { group: FanGroup }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Shield size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{group.tag}</span>
          <h3 className="text-sm font-semibold text-foreground leading-snug mt-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
            {group.heading}
          </h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{group.body}</p>
      {group.barName && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin size={11} className="shrink-0 mt-0.5" />
          <span>
            {group.barName}
            {group.barAddress && <> · {group.barAddress}</>}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 mt-1">
        {group.url && (
          <a
            href={group.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
          >
            {group.linkLabel || 'Learn more'} <ExternalLink size={10} />
          </a>
        )}
        {group.barUrl && (
          <a
            href={group.barUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Venue <ExternalLink size={10} />
          </a>
        )}
      </div>
    </article>
  );
}

// ─── Pub card ─────────────────────────────────────────────────────────────────

function PubCard({ pub }: { pub: Pub }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{pub.tag}</span>
          <h3 className="text-sm font-semibold text-foreground leading-snug mt-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
            {pub.name}
          </h3>
          {pub.address && (
            <p className="text-xs text-muted-foreground mt-0.5">{pub.address}</p>
          )}
        </div>
      </div>
      {pub.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{pub.description}</p>
      )}
      <div className="flex items-center gap-3 mt-1">
        {pub.venueUrl && (
          <a
            href={pub.venueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
          >
            Website <ExternalLink size={10} />
          </a>
        )}
        {pub.mapsUrl && (
          <a
            href={pub.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Directions <ExternalLink size={10} />
          </a>
        )}
      </div>
    </article>
  );
}

// ─── TV row ───────────────────────────────────────────────────────────────────

function TvRowCard({ row }: { row: TvRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border last:border-0 py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">{row.competition}</span>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          {row.streaming && <p><span className="font-medium text-foreground">Streaming:</span> {row.streaming}</p>}
          {row.tv && <p><span className="font-medium text-foreground">TV:</span> {row.tv}</p>}
          {row.notes && <p className="italic">{row.notes}</p>}
          <div className="flex gap-3 mt-1.5">
            {row.link1Url && (
              <a href={row.link1Url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:opacity-80 transition-opacity font-medium">
                {row.link1Label} <ExternalLink size={9} />
              </a>
            )}
            {row.link2Url && (
              <a href={row.link2Url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:opacity-80 transition-opacity font-medium">
                {row.link2Label} <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type CommunitySection = 'groups' | 'pubs' | 'watch' | 'pl-groups';

export default function FanCommunity({ userRegion }: { userRegion?: string | null }) {
  const [section, setSection] = useState<CommunitySection>('groups');
  const [content, setContent] = useState<FanzoneContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Groups region: default to user's saved region; 'all' = show everything
  const [groupsRegion, setGroupsRegion] = useState<string>(userRegion ?? 'all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  // PL groups filters — region defaults to user's saved region, club = all
  const [plRegion, setPlRegion] = useState<string>(userRegion ?? 'colorado');
  const [plClub, setPlClub] = useState<string>('all');
  const [retryCount, setRetryCount] = useState(0);

  // Sync groupsRegion and plRegion when userRegion prop resolves (async profile load)
  useEffect(() => {
    if (userRegion) {
      if (groupsRegion === 'all') setGroupsRegion(userRegion);
      setPlRegion(userRegion);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRegion]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        // Cache-busting param ensures a fresh response even if the browser
        // cached a previous 503 from before the endpoint was fixed.
        const res = await fetch(`/api/fanzone/content?_t=${Date.now()}`, { credentials: 'include' });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json() as FanzoneContent;
            setContent(data);
          } else {
            setLoadError(true);
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [retryCount]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 size={24} className="animate-spin" />
        <p className="text-sm">Loading community info…</p>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <AlertTriangle size={24} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground mb-1">Couldn't load community info</p>
        <p className="text-xs text-muted-foreground mb-4">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => setRetryCount(c => c + 1)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const fanGroups = content?.fanGroups ?? [];
  const pubRegions = content?.pubRegions ?? [];
  const tvRows = content?.tvRows ?? [];
  const plGroups = content?.plSupportersGroups ?? [];

  // Derive available regions from the actual group IDs (stable prefix encoding)
  const groupRegions = [...new Set(
    fanGroups.map(g => groupRegion(g.id)).filter((r): r is string => r !== null)
  )];
  const groupRegionOptions = [
    { id: 'all', label: 'All regions' },
    ...groupRegions.map(r => ({ id: r, label: REGION_LABELS[r] ?? r })),
  ];

  // Filter groups: exclude groups with unknown region from regional results
  const filteredGroups = groupsRegion === 'all'
    ? fanGroups
    : fanGroups.filter(g => {
        const r = groupRegion(g.id);
        return r === groupsRegion;
      });

  const allRegions = [{ id: 'all', label: 'All regions' }, ...pubRegions.map((r) => ({ id: r.id, label: r.label }))];
  const filteredRegions = selectedRegion === 'all'
    ? pubRegions
    : pubRegions.filter((r) => r.id === selectedRegion);

  // ── PL Groups filters ────────────────────────────────────────────────────────
  // Derive available regions from plsg-* ID prefixes
  const plGroupRegions = [...new Set(
    plGroups.map(g => plsgRegion(g.id)).filter((r): r is string => r !== null)
  )];
  const plRegionOptions = [
    { id: 'all', label: 'All regions' },
    ...plGroupRegions.map(r => ({ id: r, label: REGION_LABELS[r] ?? r })),
  ];

  // Filter by region first
  const plByRegion = plRegion === 'all'
    ? plGroups
    : plGroups.filter(g => plsgRegion(g.id) === plRegion);

  // Derive club options from the region-filtered set
  const plClubOptions = [
    { id: 'all', label: 'All clubs' },
    ...[...new Set(plByRegion.map(g => g.plTeam))].sort().map(t => ({ id: t, label: t })),
  ];

  // Apply club filter
  const filteredPlGroups = plClub === 'all'
    ? plByRegion
    : plByRegion.filter(g => g.plTeam === plClub);

  return (
    <div>
      {/* Section tabs */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
        {([
          { id: 'groups' as CommunitySection, label: 'Supporter Groups', short: 'Groups', icon: <Shield size={13} /> },
          { id: 'pl-groups' as CommunitySection, label: 'PL Groups', short: 'PL', icon: <Star size={13} /> },
          { id: 'pubs' as CommunitySection, label: 'Watch Parties & Pubs', short: 'Pubs', icon: <MapPin size={13} /> },
          { id: 'watch' as CommunitySection, label: 'How to Watch', short: 'Watch', icon: <Tv size={13} /> },
        ]).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              section === s.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.icon}
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{s.short}</span>
          </button>
        ))}
        <a
          href="/fanzone#pl-supporters"
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-2 shrink-0"
        >
          Full Fan Zone <ExternalLink size={11} />
        </a>
      </div>

      {/* Supporter Groups */}
      {section === 'groups' && (
        <div>
          {/* Region filter for groups */}
          {groupRegionOptions.length > 2 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {groupRegionOptions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setGroupsRegion(r.id)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                    groupsRegion === r.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Users size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              {groupsRegion !== 'all' ? (
                <>
                  <p className="text-sm text-muted-foreground mb-2">No supporter groups listed for {REGION_LABELS[groupsRegion] ?? groupsRegion} yet.</p>
                  <button
                    type="button"
                    onClick={() => setGroupsRegion('all')}
                    className="text-xs text-primary hover:underline"
                  >
                    Show all regions
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No supporter groups listed yet.</p>
              )}
              <a href="/fanzone" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View Fan Zone <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredGroups.map((group) => (
                <FanGroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Premier League Supporter Groups */}
      {section === 'pl-groups' && (
        <div>
          {content?.plSupportersIntro && (
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{content.plSupportersIntro}</p>
          )}

          {/* Region filter — only show when more than one region exists */}
          {plRegionOptions.length > 2 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {plRegionOptions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setPlRegion(r.id); setPlClub('all'); }}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                    plRegion === r.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Club filter — always show when there are groups */}
          {plByRegion.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {plClubOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPlClub(c.id)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                    plClub === c.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {filteredPlGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Star size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              {plRegion !== 'all' && plByRegion.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    No Premier League supporter groups listed for {REGION_LABELS[plRegion] ?? plRegion} yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setPlRegion('all'); setPlClub('all'); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Show all regions
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No groups match the selected filters.</p>
              )}
              <a href="/fanzone#pl-supporters" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View Fan Zone <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredPlGroups.map((group) => (
                <PlGroupCard key={group.id} group={group} />
              ))}
            </div>
          )}

          {content?.plSupportersNote && (
            <p className="text-[11px] text-muted-foreground/70 mt-4 leading-relaxed">{content.plSupportersNote}</p>
          )}
        </div>
      )}

      {/* Watch Parties & Pubs */}
      {section === 'pubs' && (
        <div>
          {/* Region filter */}
          {pubRegions.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {allRegions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                    selectedRegion === r.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {filteredRegions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <MapPin size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No venues listed for this region.</p>
              <a href="/fanzone" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View Fan Zone <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            filteredRegions.map((region) => (
              <div key={region.id} className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                  <MapPin size={14} className="text-primary" /> {region.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {region.pubs.map((pub) => (
                    <PubCard key={pub.id} pub={pub} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* How to Watch */}
      {section === 'watch' && (
        <div>
          {content?.tvTitle && (
            <h3 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
              {content.tvTitle}
            </h3>
          )}
          {content?.tvIntro && (
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{content.tvIntro}</p>
          )}
          {tvRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Tv size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No TV guide data available.</p>
              <a href="/fanzone" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View Fan Zone <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4">
              {tvRows.map((row) => (
                <TvRowCard key={row.id} row={row} />
              ))}
            </div>
          )}
          {content?.note && (
            <p className="text-[11px] text-muted-foreground/70 mt-3 leading-relaxed">{content.note}</p>
          )}
        </div>
      )}
    </div>
  );
}
