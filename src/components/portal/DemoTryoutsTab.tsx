/**
 * DemoTryoutsTab — Tryouts tab inside /demo/parent-portal.
 *
 * Fetches from /api/tryouts-db (the real DB-backed tryout directory).
 * No duplicate dataset — reuses the same data the public Tryouts page uses.
 *
 * Defaults:
 *   - Region: derived from the selected player's club (all demo clubs → colorado)
 *   - Age group: the selected player's ageGroup (editable)
 *   - Program: all levels (editable)
 *
 * Age-group matching:
 *   - We compare the player's ageGroup label against the raw ageGroups strings
 *     returned by the scraper. These are free-text (e.g. "U14", "U-14",
 *     "Girls U14", "Born 2012"). We flag unclear matches rather than silently
 *     inferring from birth year.
 *
 * Saves and calendar additions:
 *   - Stored in localStorage under sc_demo_pp_tryout_saved / sc_demo_pp_tryout_cal.
 *   - Isolated from real account records.
 *   - Reset clears both keys (handled in use-portal-demo.ts).
 *
 * Demo label:
 *   - Any listing shown is real public data from the directory.
 *   - No fabricated listings are added. If the DB is empty or no matches exist,
 *     an honest empty state is shown with links to official club pages.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, MapPin, ExternalLink, Bookmark, Calendar,
  AlertCircle, Loader2, ChevronDown, ChevronUp,
  Check, Info, Clock, Filter,
} from 'lucide-react';
import type { DemoPlayer } from '@/lib/demo/portal-demo-data';
import { DEMO_CLUBS } from '@/lib/demo/portal-demo-data';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TryoutEvent {
  id: number;
  regionSlug: string;
  clubName: string;
  clubUrl: string | null;
  city: string | null;
  level: string | null;
  ageGroups: string[];
  eventDate: string | null;
  eventTime: string | null;
  location: string | null;
  registrationUrl: string | null;
  notes: string | null;
  isPast: boolean;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  buttonUrl: string | null;
  buttonLabel: string | null;
  detailsVerified: boolean;
}

/** Saved tryout: { eventId → status } */
export type TryoutSavedMap = Record<number, 'interested' | 'registered'>;

/** Calendar additions: Set of eventIds (stored as number[]) */
export type TryoutCalSet = number[];

// ─── Region map ───────────────────────────────────────────────────────────────

/** All demo clubs are Colorado-based. */
const CLUB_REGION: Record<string, string> = {
  'club-rush':   'colorado',
  'club-rapids': 'colorado',
  'club-fc':     'colorado',
};

const REGION_LABELS: Record<string, string> = {
  'colorado':        'Colorado',
  'arizona':         'Arizona',
  'california-south':'Cal South',
  'california-north':'Cal North',
  'oregon':          'Oregon',
  'washington':      'Washington',
  'nevada':          'Nevada',
};

const ALL_REGIONS = Object.keys(REGION_LABELS);

const LEVEL_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'Elite',    label: 'Elite' },
  { value: 'Premier',  label: 'Premier' },
  { value: 'Select',   label: 'Select' },
  { value: 'Rec',      label: 'Recreational' },
];

// ─── Age-group matching ───────────────────────────────────────────────────────

/**
 * Returns 'match' | 'possible' | 'unclear' | 'none'.
 *
 * 'match'    — the listing's ageGroups array contains an unambiguous reference
 *              to the player's age group (e.g. "U14", "U-14", "Girls U14").
 * 'possible' — the listing has no age group data at all (open tryout) or
 *              contains a birth-year range that plausibly includes the player.
 * 'unclear'  — the listing has age group data but none of it matches.
 * 'none'     — ageGroups is empty and the listing has no other age signal.
 */
function matchAgeGroup(
  playerAgeGroup: string,
  listingAgeGroups: string[],
): 'match' | 'possible' | 'unclear' | 'none' {
  if (!listingAgeGroups.length) return 'none';

  // Normalise: strip "U-" → "U", lowercase
  const norm = (s: string) => s.replace(/U-/gi, 'U').toLowerCase().trim();
  const playerNorm = norm(playerAgeGroup); // e.g. "u14"

  for (const ag of listingAgeGroups) {
    const agNorm = norm(ag);
    // Direct substring match: "u14" in "girls u14" or "u14 boys"
    if (agNorm.includes(playerNorm)) return 'match';
    // Reverse: "girls u14" contains "u14" — already covered above
  }

  // Check for birth-year ranges — we don't infer birth year from age group label
  // (per spec), so flag these as 'possible' rather than 'match' or 'unclear'.
  const hasBirthYear = listingAgeGroups.some(ag => /\b(19|20)\d{2}\b/.test(ag));
  if (hasBirthYear) return 'possible';

  // Has age data but nothing matched
  return 'unclear';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(d: string | null): string {
  if (!d) return 'Date TBD';
  // Season strings like "Fall 2026"
  if (/^(fall|spring|summer|winter)/i.test(d)) return d;
  // Try to parse as a date
  const parsed = new Date(d);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }
  return d;
}

function isUpcoming(event: TryoutEvent): boolean {
  if (event.isPast) return false;
  if (!event.eventDate) return true; // no date = unknown, show as upcoming
  if (/^(fall|spring|summer|winter)/i.test(event.eventDate)) return true;
  const parsed = new Date(event.eventDate);
  if (isNaN(parsed.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed >= today;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgeMatchBadge({ match }: { match: ReturnType<typeof matchAgeGroup> }) {
  if (match === 'match') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'hsl(var(--pp-green) / 0.12)', color: 'hsl(var(--pp-green))' }}>
      <Check size={9} /> Age match
    </span>
  );
  if (match === 'possible') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'hsl(var(--pp-amber) / 0.12)', color: 'hsl(var(--pp-amber-dark))' }}>
      <AlertCircle size={9} /> Check eligibility
    </span>
  );
  if (match === 'unclear') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
      Age unclear
    </span>
  );
  // 'none' — no age data
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
      Open tryout
    </span>
  );
}

function StatusBadge({ upcoming }: { upcoming: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: upcoming ? 'hsl(var(--pp-green) / 0.12)' : 'hsl(var(--pp-border))',
        color: upcoming ? 'hsl(var(--pp-green))' : 'hsl(var(--pp-text-muted))',
      }}>
      {upcoming ? 'Upcoming' : 'Past / unconfirmed'}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DemoTryoutsTab({
  player,
  clubId,
  savedMap,
  calSet,
  onSave,
  onUnsave,
  onAddToCalendar,
  onRemoveFromCalendar,
}: {
  player: DemoPlayer;
  clubId: string;
  savedMap: TryoutSavedMap;
  calSet: TryoutCalSet;
  onSave: (eventId: number, status: 'interested' | 'registered') => void;
  onUnsave: (eventId: number) => void;
  onAddToCalendar: (eventId: number) => void;
  onRemoveFromCalendar: (eventId: number) => void;
}) {
  // ── Filters ────────────────────────────────────────────────────────────────
  const defaultRegion = CLUB_REGION[clubId] ?? 'colorado';
  const [region, setRegion] = useState(defaultRegion);
  const [ageFilter, setAgeFilter] = useState(player.ageGroup);
  const [levelFilter, setLevelFilter] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [q, setQ] = useState('');

  // Reset filters when player changes
  const prevPlayerRef = useRef(player.id);
  useEffect(() => {
    if (player.id !== prevPlayerRef.current) {
      prevPlayerRef.current = player.id;
      setRegion(CLUB_REGION[clubId] ?? 'colorado');
      setAgeFilter(player.ageGroup);
      setLevelFilter('');
      setShowPast(false);
      setQ('');
    }
  }, [player.id, player.ageGroup, clubId]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const [events, setEvents] = useState<TryoutEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ region });
      if (showPast) params.set('includePast', 'true');
      const res = await fetch(`/api/tryouts-db?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events?: TryoutEvent[]; error?: string };
      if (data.error) throw new Error(data.error);
      setEvents(data.events ?? []);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tryouts');
    } finally {
      setLoading(false);
    }
  }, [region, showPast]);

  useEffect(() => { load(); }, [load]);

  // ── Expanded cards ─────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = events.filter(ev => {
    if (!showPast && !isUpcoming(ev)) return false;
    if (levelFilter && ev.level !== levelFilter) return false;
    if (q.trim()) {
      const lower = q.toLowerCase();
      if (
        !ev.clubName.toLowerCase().includes(lower) &&
        !(ev.city ?? '').toLowerCase().includes(lower) &&
        !(ev.notes ?? '').toLowerCase().includes(lower)
      ) return false;
    }
    return true;
  });

  // Separate age-matched from others for display ordering
  const withMatch = filtered.map(ev => ({
    ev,
    match: matchAgeGroup(ageFilter, ev.ageGroups),
  }));

  // Sort: upcoming first, then by date, then by age match quality
  const matchScore = (m: ReturnType<typeof matchAgeGroup>) =>
    m === 'match' ? 0 : m === 'possible' ? 1 : m === 'none' ? 2 : 3;

  const sorted = [...withMatch].sort((a, b) => {
    const aUp = isUpcoming(a.ev) ? 0 : 1;
    const bUp = isUpcoming(b.ev) ? 0 : 1;
    if (aUp !== bUp) return aUp - bUp;
    // Within upcoming: age match quality first
    const ms = matchScore(a.match) - matchScore(b.match);
    if (ms !== 0) return ms;
    // Then by date
    if (a.ev.eventDate && b.ev.eventDate) {
      return a.ev.eventDate.localeCompare(b.ev.eventDate);
    }
    return 0;
  });

  // ── Club links for empty state ─────────────────────────────────────────────
  const clubLinks = DEMO_CLUBS.map(c => ({
    name: c.name,
    // We don't have a direct URL in demo data, so link to the tryouts page
    url: `https://soccercenter.org/tryouts?region=${CLUB_REGION[c.id] ?? 'colorado'}`,
  }));

  const upcomingCount = sorted.filter(({ ev }) => isUpcoming(ev)).length;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div
        className="flex items-start gap-2 rounded-lg p-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', border: '1px solid hsl(var(--pp-border))' }}
      >
        <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
        <p style={{ color: 'hsl(var(--pp-text))' }}>
          Tryout listings are from the public Soccer Center directory — the same data shown on the
          public Tryouts page. Saves and calendar additions here are demo-only and do not affect
          your real account.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Region */}
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            aria-label="Region"
            className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
          >
            {ALL_REGIONS.map(r => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>

          {/* Age group */}
          <div className="relative">
            <input
              value={ageFilter}
              onChange={e => setAgeFilter(e.target.value)}
              placeholder="Age group (e.g. U14)"
              aria-label="Age group filter"
              className="rounded-lg border px-2 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
            />
          </div>

          {/* Level */}
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            aria-label="Level filter"
            className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
          >
            {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[140px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search club or city…"
              className="w-full rounded-lg border pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
            />
          </div>
        </div>

        {/* Show past toggle */}
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={showPast}
            onChange={e => setShowPast(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Include past / unconfirmed listings</span>
        </label>
      </div>

      {/* Age filter note */}
      {ageFilter && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'hsl(var(--pp-page-bg))', border: '1px solid hsl(var(--pp-border))' }}
        >
          <Filter size={11} style={{ color: 'hsl(var(--pp-blue))' }} />
          <span style={{ color: 'hsl(var(--pp-text))' }}>
            Showing age match for <strong>{ageFilter}</strong>.
            Age labels in listings are free-text from club websites — "Check eligibility" means the listing
            uses birth years or ranges. Verify directly with the club.
          </span>
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-blue))' }} />
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg p-3 text-sm" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Results summary */}
      {!loading && !error && (
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {upcomingCount > 0
            ? `${upcomingCount} upcoming listing${upcomingCount !== 1 ? 's' : ''} in ${REGION_LABELS[region] ?? region}`
            : `No upcoming listings found in ${REGION_LABELS[region] ?? region}`}
          {fetchedAt && ` · Updated ${new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && sorted.length === 0 && (
        <div
          className="rounded-xl border p-6 text-center space-y-3"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div className="flex justify-center">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <Search size={18} style={{ color: 'hsl(var(--pp-blue))' }} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              No tryout listings found
            </p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              The directory doesn't have confirmed upcoming sessions for these filters right now.
              Check club websites directly for the latest tryout dates.
            </p>
          </div>
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Official club tryout pages:</p>
            {clubLinks.map(cl => (
              <a
                key={cl.name}
                href={cl.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs font-medium"
                style={{ color: 'hsl(var(--pp-blue))' }}
              >
                <ExternalLink size={11} /> {cl.name} tryouts
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Event cards */}
      {!loading && !error && sorted.map(({ ev, match }) => {
        const upcoming = isUpcoming(ev);
        const isSaved = ev.id in savedMap;
        const inCal = calSet.includes(ev.id);
        const isExpanded = expanded.has(ev.id);

        return (
          <div
            key={ev.id}
            className="rounded-xl border overflow-hidden"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-card-bg))',
              opacity: upcoming ? 1 : 0.7,
            }}
          >
            {/* Card header */}
            <div className="flex items-start gap-3 p-3">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {ev.clubName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                  {ev.clubName}
                </p>
                <p className="text-xs truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {[ev.city, ev.level].filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <StatusBadge upcoming={upcoming} />
                  {ageFilter && <AgeMatchBadge match={match} />}
                  {ev.detailsVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}>
                      <Check size={9} /> Verified
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleExpand(ev.id)}
                className="p-1 rounded shrink-0"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* Date / time row — always visible */}
            <div className="px-3 pb-2 flex flex-wrap gap-3 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {formatEventDate(ev.eventDate)}
              </span>
              {ev.eventTime && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {ev.eventTime}
                </span>
              )}
              {ev.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {ev.location.slice(0, 60)}
                </span>
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-3 pb-3 border-t space-y-3" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                {/* Age groups */}
                {ev.ageGroups.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Age groups / programs
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ev.ageGroups.map((ag, i) => (
                        <span key={i} className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}>
                          {ag}
                        </span>
                      ))}
                    </div>
                    {match === 'possible' && (
                      <p className="text-[10px] mt-1.5 flex items-start gap-1" style={{ color: 'hsl(var(--pp-amber-dark))' }}>
                        <AlertCircle size={10} className="mt-0.5 shrink-0" />
                        This listing uses birth years or ranges. We can't confirm eligibility from
                        the age-group label alone — verify directly with the club.
                      </p>
                    )}
                    {match === 'unclear' && (
                      <p className="text-[10px] mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        Listed age groups don't clearly include {ageFilter}. Confirm with the club before registering.
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                {ev.notes && (
                  <div className="rounded p-2 text-xs" style={{ background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}>
                    {ev.notes}
                  </div>
                )}

                {/* Last verified */}
                {ev.lastVerifiedAt && (
                  <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Last verified: {new Date(ev.lastVerifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}

                {/* Links */}
                <div className="flex flex-wrap gap-3">
                  {ev.buttonUrl && ev.buttonLabel && (
                    <a
                      href={ev.buttonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}
                    >
                      <ExternalLink size={11} /> {ev.buttonLabel}
                    </a>
                  )}
                  {ev.clubUrl && ev.buttonUrl !== ev.clubUrl && (
                    <a
                      href={ev.clubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'hsl(var(--pp-text-muted))' }}
                    >
                      <ExternalLink size={11} /> Club website
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Save / unsave */}
                  {isSaved ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={savedMap[ev.id]}
                        onChange={e => onSave(ev.id, e.target.value as 'interested' | 'registered')}
                        className="rounded-lg border px-2 py-1 text-xs focus:outline-none"
                        style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                      >
                        <option value="interested">Interested</option>
                        <option value="registered">Registered</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onUnsave(ev.id)}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSave(ev.id, 'interested')}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors"
                      style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                    >
                      <Bookmark size={11} /> Save
                    </button>
                  )}

                  {/* Calendar */}
                  {upcoming && (
                    inCal ? (
                      <button
                        type="button"
                        onClick={() => onRemoveFromCalendar(ev.id)}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors"
                        style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))', borderColor: 'hsl(var(--pp-navy))' }}
                      >
                        <Check size={11} /> On calendar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddToCalendar(ev.id)}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors"
                        style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                      >
                        <Calendar size={11} /> Add to calendar
                      </button>
                    )
                  )}
                </div>

                {/* Demo isolation note */}
                {(isSaved || inCal) && (
                  <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Demo only — saves and calendar additions are stored locally and do not affect your real account.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Saved summary */}
      {Object.keys(savedMap).length > 0 && (
        <div
          className="rounded-xl border p-3 space-y-1"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            Saved tryouts ({Object.keys(savedMap).length})
          </p>
          {Object.entries(savedMap).map(([idStr, status]) => {
            const id = Number(idStr);
            const ev = events.find(e => e.id === id);
            return (
              <div key={id} className="flex items-center justify-between text-xs">
                <span style={{ color: 'hsl(var(--pp-text))' }}>{ev?.clubName ?? `#${id}`}</span>
                <span className="capitalize" style={{ color: 'hsl(var(--pp-text-muted))' }}>{status}</span>
              </div>
            );
          })}
          <p className="text-[10px] pt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Demo only · Reset demo to clear
          </p>
        </div>
      )}
    </div>
  );
}
