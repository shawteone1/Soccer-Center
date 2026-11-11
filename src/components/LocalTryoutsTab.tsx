/**
 * LocalTryoutsTab
 *
 * My Soccer → Local Tryouts tab.
 * Calls /api/my-soccer/tryouts (auth-gated, reads member's saved region).
 * Reuses the same DB, visibility rules, and card shape as the public /tryouts page.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types (mirrors /api/my-soccer/tryouts GET response) ─────────────────────

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
  buttonUrl: string | null;
  buttonLabel: string | null;
  detailsVerified: boolean;
}

interface TryoutsResponse {
  region: string;
  regionLabel: string;
  upcoming: TryoutCard[];
  tbd: TryoutCard[];
  total: number;
}

// ─── Region config (matches public page) ─────────────────────────────────────

const REGIONS = [
  { slug: 'colorado',   label: 'Colorado' },
  { slug: 'arizona',    label: 'Arizona' },
  { slug: 'cal-south',  label: 'Southern California' },
  { slug: 'cal-north',  label: 'Northern California' },
  { slug: 'oregon',     label: 'Oregon' },
  { slug: 'washington', label: 'Washington' },
  { slug: 'nevada',     label: 'Nevada' },
] as const;

// ─── Level badge ──────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Elite:        'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Competitive:  'bg-primary/20 text-primary border-primary/30',
    Recreational: 'bg-secondary/20 text-secondary border-secondary/30',
  };
  const cls = map[level] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {level}
    </span>
  );
}

// ─── Single tryout card ───────────────────────────────────────────────────────

function TryoutEventCard({ event }: { event: TryoutCard }) {
  const ctaUrl   = event.buttonUrl   ?? event.registrationUrl ?? event.sourceUrl ?? null;
  const ctaLabel = event.buttonLabel ?? (event.registrationUrl ? 'Register' : event.sourceUrl ? 'Tryout Information' : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-border bg-background p-5 flex flex-col gap-3 ${event.isPast ? 'opacity-60' : ''}`}
      style={{ borderTopColor: 'hsl(var(--primary))', borderTopWidth: 3 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {event.detailsVerified && (
              <>
                <CheckCircle2 size={13} className="text-primary shrink-0" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Verified</span>
              </>
            )}
            {event.isPast && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">Past</span>
            )}
          </div>
          <h3 className="font-bold text-foreground text-base leading-snug">
            {event.clubUrl ? (
              <a href={event.clubUrl} target="_blank" rel="noopener noreferrer"
                className="hover:text-primary transition-colors">
                {event.clubName}
              </a>
            ) : event.clubName}
          </h3>
          {event.city && (
            <p className="text-sm text-muted-foreground mt-0.5">{event.city}</p>
          )}
        </div>
        {event.level && <LevelBadge level={event.level} />}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {event.eventDate && (
          <div className="flex items-center gap-2 text-foreground/80">
            <Calendar size={13} className="text-primary shrink-0" />
            <span>{event.eventDate}</span>
          </div>
        )}
        {event.eventTime && (
          <div className="flex items-center gap-2 text-foreground/80">
            <Clock size={13} className="text-primary shrink-0" />
            <span>{event.eventTime}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2 text-foreground/80 sm:col-span-2">
            <MapPin size={13} className="text-primary shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {event.ageGroups.length > 0 && (
          <div className="flex items-start gap-2 text-foreground/80 sm:col-span-2">
            <Users size={13} className="text-primary shrink-0 mt-0.5" />
            <span>{event.ageGroups.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {event.notes && (
        <p className="text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
          {event.notes}
        </p>
      )}

      {/* CTA */}
      {ctaUrl && ctaLabel && !event.isPast && (
        <a href={ctaUrl} target="_blank" rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          {ctaLabel} <ExternalLink size={12} />
        </a>
      )}

      {/* Source + verified date */}
      {(event.sourceUrl || event.lastVerifiedAt) && (
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border mt-1">
          {event.sourceUrl && (
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink size={11} />
              Official source
            </a>
          )}
          {event.lastVerifiedAt && (
            <span className="text-xs text-muted-foreground">
              Verified {new Date(event.lastVerifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

interface LocalTryoutsTabProps {
  /** Member's saved region slug from their profile (may be null if not set) */
  savedRegion: string | null;
}

type LoadState = 'idle' | 'loading' | 'success' | 'error';

export default function LocalTryoutsTab({ savedRegion }: LocalTryoutsTabProps) {
  // If the member has no saved region we ask them to pick one first
  const [region, setRegion] = useState<string>(savedRegion ?? '');
  const [data, setData] = useState<TryoutsResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [includePast, setIncludePast] = useState(false);
  const [showTbd, setShowTbd] = useState(true);
  const [tbdExpanded, setTbdExpanded] = useState(false);

  const fetchTryouts = useCallback(async (regionSlug: string, past: boolean) => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const params = new URLSearchParams({ region: regionSlug });
      if (past) params.set('includePast', 'true');
      const res = await fetch(`/api/my-soccer/tryouts?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as TryoutsResponse;
      setData(json);
      setLoadState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setLoadState('error');
    }
  }, []);

  // Auto-fetch when region is known
  useEffect(() => {
    if (region) void fetchTryouts(region, includePast);
  }, [region, includePast, fetchTryouts]);

  const regionLabel = REGIONS.find((r) => r.slug === region)?.label ?? region;

  // ── No region saved: ask the member to pick one ───────────────────────────
  if (!region) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <MapPin size={22} className="text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Choose your region
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Select a region to see upcoming tryouts and evaluations near you.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {REGIONS.map((r) => (
            <button
              key={r.slug}
              onClick={() => setRegion(r.slug)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors text-left"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  const isLoading = loadState === 'loading' || loadState === 'idle';

  return (
    <div className="flex flex-col gap-6">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Region selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="tryouts-region" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Region
          </label>
          <select
            id="tryouts-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {REGIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
              className="accent-primary"
            />
            Show past
          </label>
          <button
            onClick={() => void fetchTryouts(region, includePast)}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {loadState === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Could not load tryouts</p>
            <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
            <button
              onClick={() => void fetchTryouts(region, includePast)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-background p-5 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-3" />
              <div className="h-3 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {loadState === 'success' && data && (
        <AnimatePresence mode="wait">
          <motion.div
            key={region + String(includePast)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Section heading */}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                {regionLabel} — Upcoming Tryouts
                {data.total > 0 && (
                  <span className="ml-2 text-xs font-semibold bg-primary/15 text-primary rounded-full px-2 py-0.5">
                    {data.upcoming.length + (showTbd ? data.tbd.length : 0)}
                  </span>
                )}
              </h2>
            </div>

            {/* Confirmed-date upcoming events */}
            {data.upcoming.length > 0 ? (
              <div className="flex flex-col gap-3">
                {data.upcoming.map((ev) => (
                  <TryoutEventCard key={ev.id} event={ev} />
                ))}
              </div>
            ) : (
              data.tbd.length === 0 && (
                <div className="rounded-xl border border-border bg-background p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    No upcoming tryouts found for {regionLabel} right now.
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Check back soon — new events are added as clubs announce them.
                  </p>
                </div>
              )
            )}

            {/* TBD / date-unconfirmed events */}
            {data.tbd.length > 0 && showTbd && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setTbdExpanded((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tbdExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  Dates TBD ({data.tbd.length})
                </button>
                <AnimatePresence>
                  {tbdExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden flex flex-col gap-3"
                    >
                      {data.tbd.map((ev) => (
                        <TryoutEventCard key={ev.id} event={ev} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Toggle TBD visibility */}
            {data.tbd.length > 0 && (
              <button
                onClick={() => setShowTbd((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                {showTbd ? 'Hide' : 'Show'} {data.tbd.length} date-TBD event{data.tbd.length !== 1 ? 's' : ''}
              </button>
            )}

            {/* Footer link to public page */}
            <div className="pt-2 border-t border-border flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Results match the public Youth Tryouts page for {regionLabel}.
              </p>
              <a
                href="/tryouts"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                View all youth tryouts <ExternalLink size={11} />
              </a>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
