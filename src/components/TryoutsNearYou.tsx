/**
 * TryoutsNearYou — personalized tryout section for the My Soccer Player Dev tab.
 *
 * Fetches from GET /api/my-soccer/tryouts (auth-gated).
 * Saves/unsaves via POST/DELETE /api/my-soccer/saved-tryouts.
 * "Add to Calendar" only appears for events with confirmed dates + times.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Clock,
  Calendar,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  AlertCircle,
  Filter,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TryoutCard {
  id: string;
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
  dateConfirmed: boolean;
  /** Resolved button URL — use this for the CTA */
  buttonUrl: string | null;
  /** 'Register' | 'Tryout Information' | 'Visit Club Website' | null */
  buttonLabel: string | null;
  /** True only when event details have supporting evidence from the source */
  detailsVerified: boolean;
}

interface TryoutsResponse {
  region: string;
  regionLabel: string;
  upcoming: TryoutCard[];
  tbd: TryoutCard[];
  total: number;
}

interface Props {
  /** Member's profile region slug (e.g. "colorado") */
  profileRegion: string | null;
  /** Active player's age band (e.g. "U12") — used for optional filter */
  playerAgeBand?: string | null;
  /** Already-saved tryout IDs from the parent */
  savedTryoutIds: Set<string>;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
}

// ── Region label map ──────────────────────────────────────────────────────────

const REGION_LABELS: Record<string, string> = {
  'colorado':   'Colorado',
  'arizona':    'Arizona',
  'cal-south':  'Southern California',
  'cal-north':  'Northern California',
  'oregon':     'Oregon',
  'washington': 'Washington',
  'nevada':     'Nevada',
};

const ALL_REGIONS = Object.keys(REGION_LABELS);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatVerified(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

/** Build an iCal VEVENT data-URI for "Add to Calendar" */
function buildIcsDataUri(card: TryoutCard): string {
  const uid = `tryout-${card.id}@soccercenter.org`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Try to parse a real date+time; fall back to all-day
  let dtStart = '';
  let dtEnd   = '';
  let allDay  = false;

  try {
    const dateStr = card.eventDate ?? '';
    const timeStr = card.eventTime ?? '';

    // Extract start time from ranges like "9:00 AM – 12:00 PM"
    const timeMatch = timeStr.match(/(\d{1,2}(?::\d{2})?\s*[AP]M)/i);
    const endMatch  = timeStr.match(/–\s*(\d{1,2}(?::\d{2})?\s*[AP]M)/i);

    const parsed = new Date(`${dateStr} ${timeMatch ? timeMatch[1] : '12:00 AM'}`);
    if (isNaN(parsed.getTime())) throw new Error('bad date');

    const endDate = endMatch
      ? new Date(`${dateStr} ${endMatch[1]}`)
      : new Date(parsed.getTime() + 2 * 60 * 60 * 1000); // default +2h

    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    dtStart = fmt(parsed);
    dtEnd   = fmt(endDate);
  } catch {
    // All-day fallback
    allDay = true;
    const d = (card.eventDate ?? '').replace(/[^0-9]/g, '');
    dtStart = d.length >= 8 ? d.slice(0, 8) : now.slice(0, 8);
    dtEnd   = dtStart;
  }

  const summary  = `${card.clubName} Tryout`;
  const location = card.location ?? card.city ?? '';
  const url      = card.registrationUrl ?? card.sourceUrl ?? card.clubUrl ?? '';
  const desc     = [
    card.ageGroups.length ? `Age groups: ${card.ageGroups.join(', ')}` : '',
    card.level ? `Level: ${card.level}` : '',
    card.notes ?? '',
    url ? `More info: ${url}` : '',
  ].filter(Boolean).join('\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Soccer Center//Tryouts//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}`   : `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : '',
    desc ? `DESCRIPTION:${desc}` : '',
    url ? `URL:${url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;
}

// ── Single tryout card ────────────────────────────────────────────────────────

function TryoutEventCard({
  card,
  saved,
  onSave,
  onUnsave,
}: {
  card: TryoutCard;
  saved: boolean;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canAddToCalendar = card.dateConfirmed && !!card.eventDate;

  const primaryLink = card.buttonUrl;
  const buttonLabel = card.buttonLabel;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Club name + level badge */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-semibold text-foreground text-sm leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                {card.clubName}
              </h4>
              {card.level && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                  {card.level}
                </span>
              )}
            </div>

            {/* Age groups */}
            {card.ageGroups.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-2">
                <Users size={11} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {card.ageGroups.slice(0, 6).join(' · ')}
                  {card.ageGroups.length > 6 && ` +${card.ageGroups.length - 6} more`}
                </span>
              </div>
            )}

            {/* Date / time */}
            <div className="flex items-center gap-1 mb-1">
              <Calendar size={11} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {card.dateConfirmed
                  ? `${card.eventDate}${card.eventTime ? ` · ${card.eventTime}` : ''}`
                  : 'Dates TBD'}
              </span>
            </div>

            {/* Location */}
            {card.location && (
              <div className="flex items-start gap-1">
                <MapPin size={11} className="text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground line-clamp-1">{card.location}</span>
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={() => saved ? onUnsave(card.id) : onSave(card.id)}
            className={`shrink-0 p-1.5 rounded-md transition-colors ${
              saved
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-label={saved ? 'Unsave tryout' : 'Save tryout'}
            title={saved ? 'Remove from saved' : 'Save tryout'}
          >
            {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {primaryLink && buttonLabel && (
            <a
              href={primaryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {buttonLabel}
              <ExternalLink size={11} />
            </a>
          )}

          {canAddToCalendar && (
            <a
              href={buildIcsDataUri(card)}
              download={`${card.clubName.replace(/\s+/g, '-')}-tryout.ics`}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted transition-colors"
            >
              <Calendar size={11} />
              Add to Calendar
            </a>
          )}

          {(card.notes || card.lastVerifiedAt) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2">
          {card.notes && (
            <p className="text-xs text-muted-foreground leading-relaxed">{card.notes}</p>
          )}
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground/70">
            {card.lastVerifiedAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Verified {formatVerified(card.lastVerifiedAt)}
              </span>
            )}
            {card.sourceUrl && (
              <a
                href={card.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
              >
                <ExternalLink size={10} />
                Official source
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function TryoutSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/5" />
          <div className="h-3 bg-muted rounded w-2/5" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
        <div className="w-7 h-7 bg-muted rounded-md shrink-0" />
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-7 bg-muted rounded-md w-20" />
        <div className="h-7 bg-muted rounded-md w-28" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TryoutsNearYou({
  profileRegion,
  playerAgeBand,
  savedTryoutIds,
  onSave,
  onUnsave,
}: Props) {
  const defaultRegion = profileRegion ?? 'colorado';

  const [region, setRegion]       = useState(defaultRegion);
  const [ageBandFilter, setAgeBandFilter] = useState<string>('');
  const [levelFilter, setLevelFilter]     = useState<string>('');
  const [showTbd, setShowTbd]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [data, setData]           = useState<TryoutsResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tbdExpanded, setTbdExpanded] = useState(false);

  const fetchTryouts = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ region, includeTbd: String(showTbd) });
      if (ageBandFilter) params.set('ageBand', ageBandFilter);
      if (levelFilter)   params.set('level', levelFilter);

      const res = await fetch(`/api/my-soccer/tryouts?${params}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as TryoutsResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tryouts');
    } finally {
      setLoading(false);
    }
  }, [region, ageBandFilter, levelFilter, showTbd]);

  // Fetch on mount and when filters change
  useEffect(() => { void fetchTryouts(); }, [fetchTryouts]);

  // Sync region when profile loads
  useEffect(() => {
    if (profileRegion && profileRegion !== region) {
      setRegion(profileRegion);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRegion]);

  const upcoming = data?.upcoming ?? [];
  const tbd      = data?.tbd ?? [];
  const regionLabel = data?.regionLabel ?? REGION_LABELS[region] ?? region;

  return (
    <section aria-label="Tryouts Near You">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Tryouts Near You
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upcoming tryouts in {regionLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              showFilters || ageBandFilter || levelFilter
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-label="Toggle filters"
          >
            <Filter size={12} />
            Filters
            {(ageBandFilter || levelFilter) && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                {[ageBandFilter, levelFilter].filter(Boolean).length}
              </span>
            )}
          </button>
          <button
            onClick={() => fetchTryouts()}
            disabled={loading}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            aria-label="Refresh tryouts"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 p-3 bg-muted/40 rounded-lg border border-border space-y-3">
          {/* Region selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ALL_REGIONS.map((r) => (
                <option key={r} value={r}>{REGION_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Age band filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Age Group</label>
              <select
                value={ageBandFilter}
                onChange={(e) => setAgeBandFilter(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All ages</option>
                {['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19'].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Level filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Level</label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All levels</option>
                <option value="Recreational">Recreational</option>
                <option value="Competitive">Competitive</option>
                <option value="Elite">Elite</option>
                <option value="Academy">Academy</option>
              </select>
            </div>
          </div>

          {/* Show TBD toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTbd}
              onChange={(e) => setShowTbd(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">Show clubs with dates TBD</span>
          </label>

          {/* Age band hint from player profile */}
          {playerAgeBand && !ageBandFilter && (
            <button
              onClick={() => setAgeBandFilter(playerAgeBand)}
              className="text-xs text-primary hover:underline"
            >
              Filter to your player's age group ({playerAgeBand})
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <TryoutSkeleton key={i} />)}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle size={28} className="text-destructive/60" />
          <p className="text-sm text-muted-foreground">Couldn't load tryouts right now.</p>
          <button
            onClick={() => fetchTryouts()}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {!loading && !error && data && (
        <>
          {/* Upcoming confirmed events */}
          {upcoming.length > 0 ? (
            <div className="space-y-3">
              {upcoming.map((card) => (
                <TryoutEventCard
                  key={card.id}
                  card={card}
                  saved={savedTryoutIds.has(card.id)}
                  onSave={onSave}
                  onUnsave={onUnsave}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No upcoming tryouts with confirmed dates in {regionLabel}.
              </p>
              {region !== 'colorado' && (
                <button
                  onClick={() => setRegion('colorado')}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Check Colorado instead
                </button>
              )}
            </div>
          )}

          {/* Dates TBD section */}
          {showTbd && tbd.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setTbdExpanded((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3 w-full"
              >
                {tbdExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>Clubs with dates TBD ({tbd.length})</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">
                  No confirmed dates yet — official links available
                </span>
              </button>

              {tbdExpanded && (
                <div className="space-y-3">
                  {tbd.map((card) => (
                    <TryoutEventCard
                      key={card.id}
                      card={card}
                      saved={savedTryoutIds.has(card.id)}
                      onSave={onSave}
                      onUnsave={onUnsave}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View all link */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <a
              href="/tryouts"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink size={11} />
              View all Youth Tryouts
            </a>
          </div>
        </>
      )}
    </section>
  );
}
