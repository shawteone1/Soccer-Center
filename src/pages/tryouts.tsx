import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { tryouts } from 'virtual:content';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Users,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import ShareButton from '@/components/ShareButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifiedEvent {
  id: string;
  regionSlug: string;
  clubName: string;
  clubUrl?: string | null;
  city?: string | null;
  level?: string | null;
  ageGroups: string[];
  eventDate?: string | null;
  eventTime?: string | null;
  location?: string | null;
  registrationUrl?: string | null;
  notes?: string | null;
  isPast: boolean;
  sortOrder: number;
  sourceUrl?: string | null;
  lastVerifiedAt?: string | null;
  /** Resolved button URL — confirmed working; may differ from registrationUrl */
  buttonUrl?: string | null;
  /** 'Register' | 'Tryout Information' | 'Visit Club Website' | null */
  buttonLabel?: string | null;
  /** True only when event details have supporting evidence from the source */
  detailsVerified?: boolean;
}

interface ScrapedTryout {
  clubName: string;
  clubUrl: string;
  city: string;
  level: string;
  ageGroups: string[];
  dates: string[];
  times: string[];
  registrationUrl: string | null;
  location: string;
  notes: string;
  sourceUrl: string;
}

// ─── Region config ────────────────────────────────────────────────────────────

const REGIONS = [
  { slug: 'colorado',   label: 'Colorado',            cssVar: '--primary' },
  { slug: 'arizona',    label: 'Arizona',             cssVar: '--secondary' },
  { slug: 'cal-south',  label: 'Southern California', cssVar: '--accent' },
  { slug: 'cal-north',  label: 'Northern California', cssVar: '--region-purple' },
  { slug: 'oregon',     label: 'Oregon',              cssVar: '--region-orange' },
  { slug: 'washington', label: 'Washington',          cssVar: '--region-sky' },
  { slug: 'nevada',     label: 'Nevada',              cssVar: '--region-pink' },
] as const;

type RegionSlug = typeof REGIONS[number]['slug'];

/**
 * Normalize URL param slugs to the page's canonical slug set.
 *
 * The soccer directory uses "california-south" / "california-north" in its
 * region slugs (matching directory_regions.json), while this page's REGIONS
 * array uses the shorter "cal-south" / "cal-north" forms.  Both must select
 * the correct tab so that the directory → Tryouts link works correctly.
 */
function normalizeRegionSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === 'california-south') return 'cal-south';
  if (s === 'california-north') return 'cal-north';
  return s;
}

function regionColor(cssVar: string) {
  return `hsl(var(${cssVar}))`;
}

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

// ─── Verified event card ──────────────────────────────────────────────────────

function VerifiedCard({ event, color }: { event: VerifiedEvent; color: string }) {
  // Use resolved button fields when available; fall back gracefully for older data
  const ctaUrl   = event.buttonUrl   ?? event.registrationUrl ?? event.sourceUrl ?? null;
  const ctaLabel = event.buttonLabel ?? (event.registrationUrl ? 'Register' : event.sourceUrl ? 'Tryout Information' : null);
  const showVerifiedBadge = event.detailsVerified === true;

  const shareUrl = `https://soccercenter.org/tryouts`;
  const shareText = [
    `⚽ ${event.clubName} tryouts`,
    event.eventDate ? `on ${event.eventDate}` : null,
    event.ageGroups.length > 0 ? `for ${event.ageGroups.join(', ')}` : null,
    '— via Soccer Center',
  ].filter(Boolean).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-border bg-card p-5 flex flex-col gap-3 ${event.isPast ? 'opacity-60' : ''}`}
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {showVerifiedBadge && (
              <>
                <CheckCircle2 size={14} className="text-primary shrink-0" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Verified</span>
              </>
            )}
            {event.isPast && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">Past</span>
            )}
          </div>
          <h3 className="font-bold text-foreground text-base leading-snug">
            {event.clubUrl ? (
              <a
                href={event.clubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {event.clubName}
              </a>
            ) : (
              event.clubName
            )}
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
            <Calendar size={14} className="text-primary shrink-0" />
            <span>{event.eventDate}</span>
          </div>
        )}
        {event.eventTime && (
          <div className="flex items-center gap-2 text-foreground/80">
            <Clock size={14} className="text-primary shrink-0" />
            <span>{event.eventTime}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2 text-foreground/80 sm:col-span-2">
            <MapPin size={14} className="text-primary shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {event.ageGroups.length > 0 && (
          <div className="flex items-start gap-2 text-foreground/80 sm:col-span-2">
            <Users size={14} className="text-primary shrink-0 mt-0.5" />
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

      {/* CTA — only when a confirmed URL is available */}
      {ctaUrl && ctaLabel && !event.isPast && (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {ctaLabel} <ExternalLink size={13} />
        </a>
      )}

      {/* Source attribution */}
      {(event.sourceUrl || (event.detailsVerified && event.lastVerifiedAt)) && (
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border mt-1">
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink size={11} />
              Official source
            </a>
          )}
          {event.detailsVerified && event.lastVerifiedAt && (
            <span className="text-xs text-muted-foreground">
              Verified {new Date(event.lastVerifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          <div className="ml-auto">
            <ShareButton url={shareUrl} text={shareText} />
          </div>
        </div>
      )}
      {/* Share button when no source attribution row */}
      {!event.sourceUrl && !(event.detailsVerified && event.lastVerifiedAt) && (
        <div className="flex justify-end pt-2 border-t border-border mt-1">
          <ShareButton url={shareUrl} text={shareText} />
        </div>
      )}
    </motion.div>
  );
}

// ─── Scraped result card ──────────────────────────────────────────────────────

function ScrapedCard({ tryout }: { tryout: ScrapedTryout }) {
  const shareUrl = `https://soccercenter.org/tryouts`;
  const shareText = [
    `⚽ ${tryout.clubName} tryouts`,
    tryout.dates.length > 0 ? `on ${tryout.dates[0]}` : null,
    tryout.ageGroups.length > 0 ? `for ${tryout.ageGroups.slice(0, 3).join(', ')}` : null,
    '— via Soccer Center',
  ].filter(Boolean).join(' ');
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={13} className="text-accent shrink-0" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wide">Live scrape</span>
          </div>
          <h3 className="font-bold text-foreground text-base leading-snug">
            <a href={tryout.clubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              {tryout.clubName}
            </a>
          </h3>
          {tryout.city && <p className="text-sm text-muted-foreground mt-0.5">{tryout.city}</p>}
        </div>
        {tryout.level && <LevelBadge level={tryout.level} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {tryout.dates.length > 0 && (
          <div className="flex items-center gap-2 text-foreground/80">
            <Calendar size={14} className="text-accent shrink-0" />
            <span>{tryout.dates.slice(0, 2).join(' · ')}</span>
          </div>
        )}
        {tryout.times.length > 0 && (
          <div className="flex items-center gap-2 text-foreground/80">
            <Clock size={14} className="text-accent shrink-0" />
            <span>{tryout.times[0]}</span>
          </div>
        )}
        {tryout.location && (
          <div className="flex items-center gap-2 text-foreground/80 sm:col-span-2">
            <MapPin size={14} className="text-accent shrink-0" />
            <span>{tryout.location}</span>
          </div>
        )}
        {tryout.ageGroups.length > 0 && (
          <div className="flex items-start gap-2 text-foreground/80 sm:col-span-2">
            <Users size={14} className="text-accent shrink-0 mt-0.5" />
            <span>{tryout.ageGroups.slice(0, 6).join(', ')}</span>
          </div>
        )}
      </div>

      {tryout.notes && (
        <p className="text-sm text-muted-foreground leading-relaxed border-t border-border pt-3 line-clamp-3">
          {tryout.notes}
        </p>
      )}

      {tryout.registrationUrl && (
        <a
          href={tryout.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          Register <ExternalLink size={13} />
        </a>
      )}

      <div className="flex justify-end pt-2 border-t border-border mt-1">
        <ShareButton url={shareUrl} text={shareText} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TryoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive the active region directly from the URL param so that Back/Forward
  // navigation (popstate) always reflects the current URL without needing a
  // separate sync effect. React Router re-renders on every URL change, so
  // reading searchParams here is sufficient — no useEffect needed.
  //
  // Normalize before validating: the directory passes "california-south" /
  // "california-north" (matching directory_regions.json slugs), while REGIONS
  // uses the shorter "cal-south" / "cal-north" forms.  Both must select the
  // correct tab.
  const rawRegionFromUrl = searchParams.get('region');
  const normalizedRegionFromUrl = rawRegionFromUrl ? normalizeRegionSlug(rawRegionFromUrl) : null;
  const validRegionFromUrl = normalizedRegionFromUrl && REGIONS.some((r) => r.slug === normalizedRegionFromUrl)
    ? (normalizedRegionFromUrl as RegionSlug)
    : null;
  const activeRegion: RegionSlug = validRegionFromUrl ?? 'colorado';
  const [showPast, setShowPast] = useState(false);

  // Verified DB events
  const [verifiedEvents, setVerifiedEvents] = useState<VerifiedEvent[]>([]);
  const [verifiedLoading, setVerifiedLoading] = useState(true);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);

  // Live scraper
  const [scrapedTryouts, setScrapedTryouts] = useState<ScrapedTryout[]>([]);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperError, setScraperError] = useState<string | null>(null);
  const [scraperPartial, setScraperPartial] = useState(false);
  const [scraperCachedAt, setScraperCachedAt] = useState<string | null>(null);

  // Scraper job status
  const [jobStatus, setJobStatus] = useState<{
    dailyLastRunAt: string | null;
    discoveryLastRunAt: string | null;
    dailyNextRunAt: string | null;
  } | null>(null);

  useEffect(() => {
    fetch('/api/tryouts/scraper-status')
      .then((r) => r.json())
      .then((d) => setJobStatus(d))
      .catch(() => {/* non-critical */});
  }, []);

  const regionConfig = REGIONS.find((r) => r.slug === activeRegion)!;
  const activeColor = regionColor(regionConfig.cssVar);

  // Keep ?region= in sync with the active tab so back/forward and shared
  // links land on the correct region. Use replace:false so each region
  // switch creates a history entry that Back/Forward can navigate.
  const handleRegionChange = useCallback((slug: RegionSlug) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('region', slug);
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  // ── Fetch verified events ──────────────────────────────────────────────────

  // Ref to the AbortController for the in-flight verified-events request.
  // When a new region is selected we abort the previous request so its
  // response can never overwrite the current region's results.
  const verifiedAbortRef = useRef<AbortController | null>(null);

  const fetchVerified = useCallback(async (region: RegionSlug, past: boolean) => {
    // Cancel any in-flight request for a previous region.
    verifiedAbortRef.current?.abort();
    const controller = new AbortController();
    verifiedAbortRef.current = controller;

    setVerifiedLoading(true);
    setVerifiedError(null);
    // Clear immediately so stale results from the previous region don't
    // remain visible while the new request is in flight.
    setVerifiedEvents([]);
    try {
      const res = await fetch(`/api/tryouts-db?region=${region}&includePast=${past}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events: VerifiedEvent[] };
      // Guard: ignore the response if this request was superseded.
      if (controller.signal.aborted) return;
      setVerifiedEvents(data.events ?? []);
    } catch (err) {
      // AbortError is expected when the user switches regions quickly — not an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      setVerifiedError('Could not load verified listings.');
      setVerifiedEvents([]);
    } finally {
      if (!controller.signal.aborted) {
        setVerifiedLoading(false);
      }
    }
  }, []);

  // ── Live scraper ───────────────────────────────────────────────────────────

  // Abort controller for the in-flight scraper fetch.
  const scraperAbortRef = useRef<AbortController | null>(null);
  // Retry timer handle — cleared on region change and unmount.
  const scraperRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically-increasing generation counter.  Each call to runScraper
  // increments it; the response handler checks that the generation hasn't
  // changed before applying results, so a stale response from a previous
  // region or a superseded retry is silently discarded.
  const scraperGenRef = useRef(0);

  // Cancel any in-flight scraper request and pending retry timer.
  const cancelScraper = useCallback(() => {
    scraperAbortRef.current?.abort();
    scraperAbortRef.current = null;
    if (scraperRetryTimerRef.current !== null) {
      clearTimeout(scraperRetryTimerRef.current);
      scraperRetryTimerRef.current = null;
    }
  }, []);

  // When the region changes: fetch verified events for the new region, cancel
  // any in-flight scraper request and retry timer, and clear scraper state so
  // results from the previous region are never shown under the new heading.
  useEffect(() => {
    fetchVerified(activeRegion, showPast);
    cancelScraper();
    setScrapedTryouts([]);
    setScraperError(null);
    setScraperPartial(false);
    setScraperCachedAt(null);
  }, [activeRegion, showPast, fetchVerified, cancelScraper]);

  // Cancel scraper on unmount.
  useEffect(() => {
    return () => { cancelScraper(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScraper = useCallback(async () => {
    // Cancel any previous in-flight request and retry timer before starting.
    cancelScraper();

    const controller = new AbortController();
    scraperAbortRef.current = controller;
    // Capture the generation at call time; used to detect stale responses.
    const gen = ++scraperGenRef.current;
    const regionAtStart = activeRegion;

    setScraperLoading(true);
    setScraperError(null);
    try {
      const res = await fetch(`/api/tryouts?region=${regionAtStart}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        tryouts: ScrapedTryout[];
        partial?: boolean;
        cachedAt?: string;
        diagnostics?: {
          timedOut: number;
          httpError: number;
          noContent: number;
          completed: number;
        };
      };
      // Discard if a newer call has started (region changed or user clicked again).
      if (gen !== scraperGenRef.current) return;
      setScrapedTryouts(data.tryouts ?? []);
      setScraperPartial(data.partial ?? false);
      setScraperCachedAt(data.cachedAt ?? null);
      // Schedule a retry only when the server confirmed background execution is
      // still running (partial=true).  The server's fire-and-forget scrape
      // updates the cache; the retry re-fetches from that updated cache.
      if (data.partial) {
        scraperRetryTimerRef.current = setTimeout(() => {
          // Only retry if the region hasn't changed since this scan started.
          if (scraperGenRef.current === gen) {
            void runScraper();
          }
        }, 12000);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (gen !== scraperGenRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setScraperError(`Live scan did not complete (${msg}). Try again or check back later.`);
    } finally {
      if (gen === scraperGenRef.current) {
        setScraperLoading(false);
      }
    }
  }, [activeRegion, cancelScraper]);

  const site = 'https://soccercenter.org';
  const pageUrl = `${site}/tryouts`;
  const title = 'Soccer Tryouts | Soccer Center — Colorado, Arizona & West Coast';
  const description =
    'Find verified soccer tryout listings across Colorado, Arizona, Southern California, Northern California, Oregon, Washington, and Nevada. Updated regularly.';

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${site}/airo-assets/images/pages/home/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${site}/airo-assets/images/pages/home/hero`} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          '@id': `${pageUrl}#tryout-list`,
          name: 'Youth Soccer Tryouts — Colorado, Arizona & West Coast',
          description: 'Verified youth soccer tryout listings across Colorado, Arizona, California, Oregon, Washington, and Nevada.',
          url: pageUrl,
          numberOfItems: 7,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Colorado Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 2, name: 'Arizona Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 3, name: 'Southern California Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 4, name: 'Northern California Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 5, name: 'Oregon Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 6, name: 'Washington Youth Soccer Tryouts' },
            { '@type': 'ListItem', position: 7, name: 'Nevada Youth Soccer Tryouts' },
          ],
        }).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="pt-28 pb-12 px-6 bg-background relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 50%, hsl(var(--primary)) 0%, transparent 60%), radial-gradient(circle at 70% 20%, hsl(var(--secondary)) 0%, transparent 50%)',
            }}
          />
          <div className="max-w-5xl mx-auto relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-primary font-semibold text-sm tracking-wide mb-3">
                {tryouts.hero.eyebrow}
              </p>
              <h1 className="font-heading text-4xl md:text-6xl font-black text-foreground leading-tight mb-4">
                Youth Tryouts
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                {tryouts.hero.subtitle}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Region tabs ───────────────────────────────────────────────── */}
        <div className="sticky top-16 md:top-20 z-30 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
              {REGIONS.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => handleRegionChange(r.slug)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    activeRegion === r.slug
                      ? 'text-background'
                      : 'text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted'
                  }`}
                  style={activeRegion === r.slug ? { background: regionColor(r.cssVar) } : {}}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Controls row */}
          <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
            <div>
              <h2
                className="font-heading text-2xl md:text-3xl font-black text-foreground"
                style={{ color: activeColor }}
              >
                {regionConfig.label}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tryout listings for this region
              </p>
              {jobStatus?.dailyLastRunAt && (
                <p className="text-xs text-muted-foreground mt-0.5 opacity-70">
                  Sources last checked {new Date(jobStatus.dailyLastRunAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`relative w-10 h-5 rounded-full transition-colors ${showPast ? 'bg-primary' : 'bg-muted'}`}
                onClick={() => setShowPast((v) => !v)}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showPast ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Show past events</span>
            </label>
          </div>

          {/* Verified listings */}
          <AnimatePresence mode="wait">
            {verifiedLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl border border-border bg-card h-48 animate-pulse" />
                ))}
              </motion.div>
            ) : verifiedError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-10"
              >
                <AlertCircle size={18} />
                <span className="text-sm">{verifiedError}</span>
              </motion.div>
            ) : verifiedEvents.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 mb-10"
              >
                <Calendar size={40} className="text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="text-muted-foreground font-medium">
                  No verified tryout listings for this region right now.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {showPast ? 'Check back soon.' : 'Try enabling "Show past events" above.'}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`events-${activeRegion}-${showPast}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
              >
                {verifiedEvents.map((ev) => (
                  <VerifiedCard key={ev.id} event={ev} color={activeColor} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live scraper section */}
          <div className="border-t border-border pt-10">
            <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={16} className="text-accent" />
                  <h3 className="font-heading text-xl font-bold text-foreground">{tryouts.liveScanner.title}</h3>
                  {scraperLoading && (
                    <span className="flex items-center gap-1 text-xs text-accent font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      Scanning…
                    </span>
                  )}
                  {scraperPartial && !scraperLoading && (
                    <span className="text-xs text-accent font-semibold">Partial — refreshing…</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {tryouts.liveScanner.description}{' '}
                  {scraperCachedAt && (
                    <span className="text-xs">
                      Last scan: {new Date(scraperCachedAt).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={runScraper}
                disabled={scraperLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={scraperLoading ? 'animate-spin' : ''} />
                {scraperLoading ? 'Scanning…' : scrapedTryouts.length > 0 ? 'Refresh' : 'Scan Now'}
              </button>
            </div>

            {scraperError && (
              <div className="flex items-center gap-3 text-accent bg-accent/10 border border-accent/20 rounded-xl p-4 mb-6">
                <AlertCircle size={16} />
                <span className="text-sm">{scraperError}</span>
              </div>
            )}

            {!scraperLoading && scrapedTryouts.length === 0 && !scraperError && !scraperPartial && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Zap size={32} className="text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground text-sm">
                  {tryouts.liveScanner.emptyTitle}
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  {tryouts.liveScanner.emptyNote}
                </p>
              </div>
            )}

            {/* Partial scan with zero results — scan ran but deadline fired before any club responded */}
            {!scraperLoading && scrapedTryouts.length === 0 && !scraperError && scraperPartial && (
              <div className="rounded-xl border border-dashed border-accent/30 bg-accent/5 p-8 text-center">
                <RefreshCw size={32} className="text-accent mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-sm font-medium">
                  Scan incomplete — no results yet
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  The scan is still running in the background. Results will appear automatically, or click Refresh to check again.
                </p>
              </div>
            )}

            {scrapedTryouts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scrapedTryouts.map((t, i) => (
                  <ScrapedCard key={`${t.clubName}-${i}`} tryout={t} />
                ))}
              </div>
            )}
          </div>

          {/* Submit CTA */}
          <div className="mt-14 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
            <h3 className="font-heading text-2xl font-black text-foreground mb-2">
              {tryouts.submitCta.title}
            </h3>
            <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">
              {tryouts.submitCta.body}
            </p>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm px-6 py-3 hover:opacity-90 transition"
            >
              {tryouts.submitCta.buttonLabel} <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
