/**
 * PpTryoutsTab — Tryouts tab for the Parent Portal.
 *
 * - Prominent ON/OFF toggle (persisted via /api/parent/tryout-prefs)
 * - Filters: age group, region, category, date range
 * - Real directory records from /api/my-soccer/tryouts
 * - Save opportunity → /api/my-soccer/saved-tryouts
 * - One illustrative demo card clearly labeled
 * - OFF state persists and does not delete saved items
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Trophy, ToggleLeft, ToggleRight, Bookmark, BookmarkCheck,
  ExternalLink, Filter, X, Info, Loader2, MapPin, Calendar,
  ChevronDown,
} from 'lucide-react';
import { PpCard, PpSectionHeading } from './PpPrimitives';
import { AGE_BANDS, COLORADO_REGIONS } from '@/lib/parent-options';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TryoutRecord {
  id: string;
  orgName: string;
  ageGroups: string[];
  location: string | null;
  region: string | null;
  dateLabel: string | null;
  dateVerified: boolean;
  category: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

interface SavedTryoutId {
  tryoutId: string;
}

// ─── Demo card ────────────────────────────────────────────────────────────────

const DEMO_CARD: TryoutRecord = {
  id: '__demo__',
  orgName: 'Colorado United FC (Illustrative)',
  ageGroups: ['U12', 'U13', 'U14'],
  location: 'Aurora Sports Park, Aurora CO',
  region: 'denver-metro',
  dateLabel: 'November 2, 2026 · 9:00 AM',
  dateVerified: true,
  category: 'Club',
  sourceUrl: null,
  notes: 'This is an illustrative demo card. Real tryout listings appear below when available.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

const CATEGORIES = ['Club', 'Academy', 'ODP', 'High School', 'Recreational'];

/**
 * Sub-region slugs are a UI concept only — the DB stores all Colorado records
 * under regionSlug = 'colorado'.  This map lets us filter client-side by city
 * after fetching the full Colorado set.
 *
 * Cities are matched case-insensitively as a substring of the event's city field.
 */
const SUB_REGION_CITIES: Record<string, string[]> = {
  'denver-metro':    ['Denver', 'Aurora', 'Littleton', 'Englewood', 'Lakewood', 'Centennial', 'Highlands Ranch', 'Parker', 'Castle Rock', 'Lone Tree', 'Greenwood Village', 'Thornton', 'Westminster', 'Arvada', 'Broomfield', 'Commerce City', 'Brighton'],
  'boulder':         ['Boulder', 'Longmont', 'Lafayette', 'Louisville', 'Erie', 'Superior'],
  'colorado-springs':['Colorado Springs', 'Pueblo', 'Fountain', 'Monument', 'Castle Pines'],
  'fort-collins':    ['Fort Collins', 'Loveland', 'Greeley', 'Windsor', 'Evans'],
  'pueblo':          ['Pueblo'],
  'western-slope':   ['Grand Junction', 'Durango', 'Montrose', 'Glenwood Springs', 'Steamboat Springs', 'Aspen', 'Telluride'],
};

/** Returns true when a tryout's city matches the selected sub-region, or when no sub-region is selected. */
function matchesSubRegion(city: string | null, subRegionSlug: string): boolean {
  if (!subRegionSlug) return true;
  const cities = SUB_REGION_CITIES[subRegionSlug];
  if (!cities) return true; // unknown slug → don't filter
  if (!city) return false;
  const lower = city.toLowerCase();
  return cities.some(c => lower.includes(c.toLowerCase()));
}

// ─── Tryout card ──────────────────────────────────────────────────────────────

function TryoutCard({
  record,
  saved,
  isDemo,
  onSave,
  onUnsave,
}: {
  record: TryoutRecord;
  saved: boolean;
  isDemo: boolean;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSaveToggle() {
    if (isDemo) return;
    setSaving(true);
    try {
      if (saved) {
        await onUnsave(record.id);
      } else {
        await onSave(record.id);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        borderColor: isDemo ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
        background: isDemo ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-card-bg))',
      }}
    >
      {isDemo && (
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={12} style={{ color: 'hsl(var(--pp-navy))' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--pp-navy))' }}>
            Illustrative demo — not a real listing
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            {record.orgName}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {record.ageGroups.map(ag => (
              <span
                key={ag}
                className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {ag}
              </span>
            ))}
            {record.category && (
              <span
                className="text-[10px] rounded-full px-2 py-0.5 border"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              >
                {record.category}
              </span>
            )}
          </div>
        </div>

        {!isDemo && (
          <button
            type="button"
            onClick={handleSaveToggle}
            disabled={saving}
            className="p-2 rounded-full transition-colors shrink-0"
            style={{ color: saved ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))' }}
            aria-label={saved ? 'Remove from saved' : 'Save opportunity'}
          >
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : saved
              ? <BookmarkCheck size={16} />
              : <Bookmark size={16} />
            }
          </button>
        )}
      </div>

      <div className="space-y-1.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {record.location && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" />
            <span>{record.location}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Calendar size={11} className="shrink-0" />
          {record.dateLabel ? (
            <span>
              {record.dateLabel}
              {!record.dateVerified && (
                <span className="ml-1.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  · Date awaiting verification
                </span>
              )}
            </span>
          ) : (
            <span className="italic">Date awaiting verification</span>
          )}
        </div>
      </div>

      {record.notes && (
        <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {record.notes}
        </p>
      )}

      {record.sourceUrl && (
        <a
          href={record.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          <ExternalLink size={11} />
          View source
        </a>
      )}
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface Filters {
  ageGroup: string;
  region: string;
  category: string;
  savedOnly: boolean;
}

function FilterBar({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasActive = filters.ageGroup || filters.region || filters.category || filters.savedOnly;

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors"
          style={{
            borderColor: hasActive ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            background: hasActive ? 'hsl(var(--pp-navy))' : 'transparent',
            color: hasActive ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
          }}
        >
          <Filter size={11} />
          Filters
          {hasActive && <span className="ml-0.5">·</span>}
          <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {filters.savedOnly && (
          <button
            type="button"
            onClick={() => onChange({ savedOnly: false })}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <BookmarkCheck size={10} />
            Saved only
            <X size={9} />
          </button>
        )}

        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
          >
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div
          className="mt-3 rounded-xl border p-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Age group
            </label>
            <select
              value={filters.ageGroup}
              onChange={e => onChange({ ageGroup: e.target.value })}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            >
              <option value="">All ages</option>
              {AGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Region
            </label>
            <select
              value={filters.region}
              onChange={e => onChange({ region: e.target.value })}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            >
              <option value="">All Colorado</option>
              {COLORADO_REGIONS.filter(r => r.slug !== 'colorado').map(r => (
                <option key={r.slug} value={r.slug}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Category
            </label>
            <select
              value={filters.category}
              onChange={e => onChange({ category: e.target.value })}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: filters.savedOnly ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  background: filters.savedOnly ? 'hsl(var(--pp-navy))' : 'transparent',
                }}
                onClick={() => onChange({ savedOnly: !filters.savedOnly })}
              >
                {filters.savedOnly && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>Show saved opportunities only</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PpTryoutsTabProps {
  tryoutsEnabled: boolean;
  onToggle: (v: boolean) => void;
  /** Called whenever a tryout is saved or unsaved — lets the parent invalidate the Saved tab */
  onSaveChange?: () => void;
  /** Increment to trigger a re-fetch of saved IDs (e.g. after Saved tab removes an item) */
  savedRefreshKey?: number;
}

export default function PpTryoutsTab({ tryoutsEnabled, onToggle, onSaveChange, savedRefreshKey }: PpTryoutsTabProps) {
  const [tryouts, setTryouts] = useState<TryoutRecord[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    ageGroup: '', region: '', category: '', savedOnly: false,
  });

  const [loadError, setLoadError] = useState(false);

  const loadTryouts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // Always fetch the full Colorado set — sub-region slugs (denver-metro, boulder, etc.)
      // are a UI concept only and don't exist as DB region_slug values.
      // Sub-region filtering is applied client-side via matchesSubRegion().
      const params = new URLSearchParams();
      if (filters.ageGroup) params.set('ageBand', filters.ageGroup);
      // Always use the top-level 'colorado' slug so the API returns all records.
      params.set('region', 'colorado');
      const [tryoutsRes, savedRes] = await Promise.all([
        fetch(`/api/my-soccer/tryouts?${params}`, { credentials: 'include' }),
        fetch('/api/my-soccer/saved-tryouts', { credentials: 'include' }),
      ]);
      if (tryoutsRes.ok) {
        // API returns { upcoming: TryoutCard[], tbd: TryoutCard[], total, region, regionLabel }
        const data = await tryoutsRes.json() as {
          upcoming?: Array<{ id: string; clubName: string; city?: string | null; level?: string | null; ageGroups: string[]; location?: string | null; eventDate?: string | null; eventTime?: string | null; registrationUrl?: string | null; notes?: string | null; sourceUrl?: string | null; buttonUrl?: string | null; buttonLabel?: string | null; detailsVerified?: boolean }>;
          tbd?: Array<{ id: string; clubName: string; city?: string | null; level?: string | null; ageGroups: string[]; location?: string | null; eventDate?: string | null; eventTime?: string | null; registrationUrl?: string | null; notes?: string | null; sourceUrl?: string | null; buttonUrl?: string | null; buttonLabel?: string | null; detailsVerified?: boolean }>;
          total?: number;
          region?: string;
        };
        // Merge upcoming + tbd into a flat list; map API shape → TryoutRecord
        const all = [...(data.upcoming ?? []), ...(data.tbd ?? [])];
        const mapped: TryoutRecord[] = all.map(r => ({
          id:           r.id,
          orgName:      r.clubName,
          ageGroups:    r.ageGroups ?? [],
          location:     r.location ?? null,
          region:       data.region ?? null,
          dateLabel:    r.eventDate ? [r.eventDate, r.eventTime].filter(Boolean).join(' · ') : null,
          dateVerified: !!r.detailsVerified,
          category:     r.level ?? null,
          sourceUrl:    r.buttonUrl ?? r.sourceUrl ?? null,
          notes:        r.notes ?? null,
        }));
        setTryouts(mapped);
      }
      if (savedRes.ok) {
        // GET /api/my-soccer/saved-tryouts returns { savedTryoutIds: string[] }
        const data = await savedRes.json() as { savedTryoutIds?: string[]; saved?: SavedTryoutId[] };
        // Support both the current shape (savedTryoutIds) and the legacy shape (saved[].tryoutId)
        const ids = data.savedTryoutIds
          ?? (data.saved ?? []).map((s: SavedTryoutId) => s.tryoutId);
        setSavedIds(new Set(ids));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filters.ageGroup]); // region is client-side only — no re-fetch needed

  useEffect(() => {
    if (tryoutsEnabled) loadTryouts();
  }, [tryoutsEnabled, loadTryouts]);

  // Re-fetch saved IDs when the Saved tab removes an item (savedRefreshKey increments)
  // without re-fetching the full tryout list.
  useEffect(() => {
    if (savedRefreshKey === undefined || savedRefreshKey === 0) return;
    fetch('/api/my-soccer/saved-tryouts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { savedTryoutIds?: string[]; saved?: Array<{ tryoutId: string }> } | null) => {
        if (!data) return;
        const ids = data.savedTryoutIds ?? (data.saved ?? []).map(s => s.tryoutId);
        setSavedIds(new Set(ids));
      })
      .catch(() => { /* silent — stale local state is acceptable */ });
  }, [savedRefreshKey]);

  async function handleSave(id: string) {
    await apiFetch('/api/my-soccer/saved-tryouts', {
      method: 'POST',
      body: JSON.stringify({ tryoutId: id }),
    });
    setSavedIds(prev => new Set([...prev, id]));
    onSaveChange?.();
  }

  async function handleUnsave(id: string) {
    await apiFetch(`/api/my-soccer/saved-tryouts/${id}`, { method: 'DELETE' });
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    onSaveChange?.();
  }

  // Apply client-side filters
  // - category and savedOnly: exact match
  // - region: sub-region city lookup (DB only has 'colorado' slug; sub-regions are UI-only)
  const visible = tryouts.filter(t => {
    if (filters.category && t.category !== filters.category) return false;
    if (filters.savedOnly && !savedIds.has(t.id)) return false;
    if (filters.region && !matchesSubRegion(t.location, filters.region)) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <PpCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              Colorado Tryout Listings
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {tryoutsEnabled
                ? 'Showing Colorado tryout opportunities. Turn off to hide listings — saved items are preserved.'
                : 'Tryout listings are off. Your saved opportunities are preserved and will reappear when you turn this back on.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tryoutsEnabled}
            onClick={() => onToggle(!tryoutsEnabled)}
            className="flex items-center gap-1.5 shrink-0"
            style={{ color: tryoutsEnabled ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))' }}
          >
            {tryoutsEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
            <span className="text-sm font-semibold">{tryoutsEnabled ? 'On' : 'Off'}</span>
          </button>
        </div>
      </PpCard>

      {!tryoutsEnabled ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Trophy size={28} className="mx-auto mb-3" style={{ color: 'hsl(var(--pp-navy))' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-navy))' }}>
            Tryout listings are off
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-navy))' }}>
            Turn on Colorado Tryouts above to browse opportunities. Your saved items are still here.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <FilterBar
            filters={filters}
            onChange={patch => setFilters(f => ({ ...f, ...patch }))}
            onClear={() => setFilters({ ageGroup: '', region: '', category: '', savedOnly: false })}
          />

          {/* Demo card */}
          <div>
            <PpSectionHeading>Example listing</PpSectionHeading>
            <TryoutCard
              record={DEMO_CARD}
              saved={false}
              isDemo={true}
              onSave={() => {}}
              onUnsave={() => {}}
            />
          </div>

          {/* Real listings */}
          <div>
            <PpSectionHeading>
              Colorado tryouts
              {!loading && (
                <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {visible.length} listing{visible.length !== 1 ? 's' : ''}
                </span>
              )}
            </PpSectionHeading>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
              </div>
            ) : loadError ? (
              <div
                className="rounded-2xl p-6 text-center space-y-2"
                style={{ background: 'hsl(var(--pp-blue-light))' }}
              >
                <Info size={20} className="mx-auto" style={{ color: 'hsl(var(--pp-navy))' }} />
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-navy))' }}>
                  Could not load tryout listings
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--pp-navy))' }}>
                  This may be a temporary issue. Try refreshing the page or check back later.
                </p>
                <button
                  type="button"
                  onClick={() => loadTryouts()}
                  className="text-xs font-medium underline"
                  style={{ color: 'hsl(var(--pp-blue))' }}
                >
                  Retry
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div
                className="rounded-2xl p-6 text-center space-y-1"
                style={{ background: 'hsl(var(--pp-blue-light))' }}
              >
                <Trophy size={24} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-navy))' }} />
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-navy))' }}>
                  {filters.savedOnly
                    ? 'No saved opportunities yet'
                    : filters.ageGroup || filters.category || filters.region
                    ? 'No listings match your filters'
                    : 'No upcoming tryouts found for Colorado'}
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--pp-navy))' }}>
                  {filters.savedOnly
                    ? 'Browse listings and tap the bookmark icon to save.'
                    : filters.ageGroup || filters.category || filters.region
                    ? 'Try adjusting or clearing the filters to see more listings.'
                    : 'Colorado listings are added as clubs publish their tryout schedules. Check back as the season approaches.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map(t => (
                  <TryoutCard
                    key={t.id}
                    record={t}
                    saved={savedIds.has(t.id)}
                    isDemo={false}
                    onSave={handleSave}
                    onUnsave={handleUnsave}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Saved count summary */}
          {savedIds.size > 0 && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            >
              <BookmarkCheck size={13} />
              <span>
                {savedIds.size} saved opportunit{savedIds.size !== 1 ? 'ies' : 'y'}.
                Use the filter above to view saved only.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
