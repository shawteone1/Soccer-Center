/**
 * /scores — Ceefax-style full scores page.
 *
 * Auth-required: redirects to /login if not signed in.
 * Black background, monospace font, cyan league headings, white team names,
 * yellow scores, green live indicators.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSession } from '@/lib/auth/auth-client';
import { ChevronLeft, ChevronRight, RefreshCw, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import {
  type ScoresMatch,
  type ScoresMatchesResponse,
  type MatchStatus,
  isLive,
  statusLabel,
  scoreDisplay,
} from '@/components/scores/scores-types';
import { scores } from 'virtual:content';

const siteUrl = 'https://soccercenter.org';

// ── Supported leagues — free-tier only (MLS/NWSL excluded: HTTP 403 on free plan) ──
const LEAGUES = [
  { slug: 'premier-league',   name: 'Premier League' },
  { slug: 'laliga',           name: 'LaLiga' },
  { slug: 'bundesliga',       name: 'Bundesliga' },
  { slug: 'ligue-1',          name: 'Ligue 1' },
  { slug: 'serie-a',          name: 'Serie A' },
  { slug: 'champions-league', name: 'UEFA Champions League' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
function denverToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}
function offsetDate(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}
function formatDateLabel(iso: string): string {
  const today = denverToday();
  if (iso === today) return scores.nav.today;
  const yesterday = offsetDate(today, -1);
  const tomorrow  = offsetDate(today, +1);
  if (iso === yesterday) return scores.nav.yesterday;
  if (iso === tomorrow)  return scores.nav.tomorrow;
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Goal type label ───────────────────────────────────────────────────────────
function goalTypeLabel(type: ScoresMatch['goals'][0]['type']): string {
  if (type === 'OWN_GOAL') return ' (OG)';
  if (type === 'PENALTY')  return ' (pen)';
  return '';
}

// ── Per-league data state ─────────────────────────────────────────────────────
interface LeagueData {
  slug: string;
  name: string;
  matches: ScoresMatch[];
  cachedAt: string | null;
  live: boolean;
  stale: boolean;
  loading: boolean;
  error: string | null;
}

export default function ScoresPage() {
  const { isAuthenticated, isPending } = useSession();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(denverToday);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(LEAGUES.map(l => l.slug));
  const [leagueData, setLeagueData] = useState<Record<string, LeagueData>>({});
  const [expandedMatches, setExpandedMatches] = useState<Set<number>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      navigate(`/login/auth?returnTo=/scores`, { replace: true });
    }
  }, [isPending, isAuthenticated, navigate]);

  const fetchLeague = useCallback(async (slug: string, date: string) => {
    setLeagueData(prev => ({
      ...prev,
      [slug]: { ...(prev[slug] ?? { slug, name: LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, error: null }), loading: true },
    }));

    try {
      const res = await fetch(`/api/scores/matches?league=${slug}&date=${date}`, {
        credentials: 'include',
      });
      const body = await res.json() as ScoresMatchesResponse & { error?: string; message?: string };

      if (!res.ok) {
        setLeagueData(prev => ({
          ...prev,
          [slug]: { ...(prev[slug] ?? { slug, name: LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, loading: false }), loading: false, error: body.message ?? 'Unavailable' },
        }));
        return;
      }

      setLeagueData(prev => ({
        ...prev,
        [slug]: {
          slug,
          name: body.competition?.name ?? LEAGUES.find(l => l.slug === slug)?.name ?? slug,
          matches: body.matches ?? [],
          cachedAt: body.cachedAt,
          live: body.live ?? false,
          stale: body.stale ?? false,
          loading: false,
          error: null,
        },
      }));
      setLastUpdated(new Date().toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true }));
    } catch {
      setLeagueData(prev => ({
        ...prev,
        [slug]: { ...(prev[slug] ?? { slug, name: LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, loading: false }), loading: false, error: 'Network error' },
      }));
    }
  }, []);

  // Fetch all selected leagues with rate-limit spacing
  const fetchAll = useCallback(async () => {
    for (let i = 0; i < selectedLeagues.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 200));
      await fetchLeague(selectedLeagues[i], selectedDate);
    }
  }, [selectedLeagues, selectedDate, fetchLeague]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAll();
  }, [isAuthenticated, selectedDate, fetchAll]);

  // Auto-refresh every 60 s when any league has a live match
  useEffect(() => {
    const hasLive = Object.values(leagueData).some(d => d.live);
    if (!hasLive) return;
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [leagueData, fetchAll]);

  function toggleMatch(id: number) {
    setExpandedMatches(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleLeague(slug: string) {
    setSelectedLeagues(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug],
    );
  }

  if (isPending || !isAuthenticated) return null;

  const anyLive = Object.values(leagueData).some(d => d.live);

  return (
    <>
      <Helmet>
        <title>Scores · Soccer Center</title>
        <meta name="description" content="Live and today's soccer scores — Premier League, LaLiga, Bundesliga, MLS, Champions League and more." />
        <link rel="canonical" href={`${siteUrl}/scores`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <main
        className="min-h-screen font-mono"
        style={{ background: 'hsl(var(--ceefax-bg, 0 0% 0%))', color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}
      >
        {/* ── Header bar ──────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b"
          style={{
            background: 'hsl(var(--ceefax-bg, 0 0% 0%))',
            borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))',
          }}
        >
          <div className="flex items-center gap-3">
            <Trophy size={14} style={{ color: 'hsl(var(--primary))' }} />
            <h1
              className="text-sm font-bold tracking-widest uppercase"
              style={{ color: 'hsl(var(--ceefax-heading, 180 100% 70%))' }}
            >
              <span>{scores.header.title}</span>
            </h1>
            {anyLive && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded animate-pulse"
                style={{
                  background: 'hsl(var(--status-live-bg))',
                  color: 'hsl(var(--status-live-fg))',
                }}
              >
                <span>{scores.header.liveLabel}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                Updated {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={fetchAll}
              aria-label="Refresh scores"
              className="hover:opacity-70 transition-opacity"
              style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* ── Date navigation ──────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-center gap-4 px-4 py-2 border-b"
          style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}
        >
          <button
            type="button"
            onClick={() => setSelectedDate(d => offsetDate(d, -1))}
            className="hover:opacity-70 transition-opacity"
            style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}
            aria-label="Previous day"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold tracking-wide" style={{ color: 'hsl(var(--ceefax-heading, 180 100% 70%))' }}>
            {formatDateLabel(selectedDate)}
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate(d => offsetDate(d, +1))}
            className="hover:opacity-70 transition-opacity"
            style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}
            aria-label="Next day"
          >
            <ChevronRight size={16} />
          </button>
          {selectedDate !== denverToday() && (
            <button
              type="button"
              onClick={() => setSelectedDate(denverToday())}
              className="text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Today
            </button>
          )}
        </div>

        {/* ── League filter chips ───────────────────────────────────────────── */}
        <div
          className="flex flex-wrap gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}
        >
          {LEAGUES.map(l => {
            const active = selectedLeagues.includes(l.slug);
            return (
              <button
                key={l.slug}
                type="button"
                onClick={() => toggleLeague(l.slug)}
                className="text-xs px-2 py-1 rounded border transition-colors"
                style={{
                  background: active ? 'hsl(var(--primary))' : 'transparent',
                  color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--ceefax-muted, 0 0% 55%))',
                  borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--ceefax-border, 0 0% 20%))',
                }}
              >
                {l.name}
              </button>
            );
          })}
        </div>

        {/* ── League sections ───────────────────────────────────────────────── */}
        <div className="px-4 py-4 space-y-8 max-w-3xl mx-auto">
          {selectedLeagues.map(slug => {
            const d = leagueData[slug];
            const leagueName = d?.name ?? LEAGUES.find(l => l.slug === slug)?.name ?? slug;

            return (
              <section key={slug}>
                {/* League heading */}
                <h2
                  className="text-sm font-bold tracking-widest uppercase mb-3 pb-1 border-b"
                  style={{
                    color: 'hsl(var(--ceefax-heading, 180 100% 70%))',
                    borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))',
                  }}
                >
                  {leagueName}
                  {d?.stale && (
                    <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                      (<span>{scores.empty.cached}</span>)
                    </span>
                  )}
                </h2>

                {/* Loading */}
                {(!d || d.loading) && (
                  <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                    <span>{scores.empty.loading}</span>
                  </p>
                )}

                {/* Error */}
                {d && !d.loading && d.error && (
                  <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                    {d.error === 'This competition is not available on the current plan.'
                      ? 'Not available on free tier'
                      : d.error}
                  </p>
                )}

                {/* No fixtures */}
                {d && !d.loading && !d.error && d.matches.length === 0 && (
                  <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                    <span>{scores.empty.noFixtures}</span>
                  </p>
                )}

                {/* Match rows */}
                {d && !d.loading && !d.error && d.matches.map(m => {
                  const live = isLive(m.status as MatchStatus);
                  const expanded = expandedMatches.has(m.id);
                  const hasGoals = m.goals && m.goals.length > 0;

                  return (
                    <div key={m.id} className="mb-1">
                      <button
                        type="button"
                        onClick={() => hasGoals && toggleMatch(m.id)}
                        className="w-full text-left flex items-center gap-2 py-1 hover:opacity-80 transition-opacity"
                        style={{ cursor: hasGoals ? 'pointer' : 'default' }}
                        aria-expanded={expanded}
                      >
                        {/* Live indicator */}
                        <span className="w-2 shrink-0">
                          {live && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{ background: 'hsl(var(--status-live-bar))' }}
                            />
                          )}
                        </span>

                        {/* Home team */}
                        <span
                          className="flex-1 text-xs truncate"
                          style={{ color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}
                        >
                          {m.homeTeam.name}
                        </span>

                        {/* Score */}
                        <span
                          className="text-xs font-bold tabular-nums w-12 text-center shrink-0"
                          style={{ color: 'hsl(var(--ceefax-score, 60 100% 70%))' }}
                        >
                          {scoreDisplay(m)}
                        </span>

                        {/* Away team */}
                        <span
                          className="flex-1 text-xs truncate text-right"
                          style={{ color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}
                        >
                          {m.awayTeam.name}
                        </span>

                        {/* Status */}
                        <span
                          className="text-[10px] w-14 text-right shrink-0"
                          style={{
                            color: live
                              ? 'hsl(var(--status-live-fg))'
                              : 'hsl(var(--ceefax-muted, 0 0% 55%))',
                          }}
                        >
                          {statusLabel(m.status as MatchStatus, m.utcDate)}
                        </span>

                        {/* Expand chevron */}
                        {hasGoals && (
                          <span style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </span>
                        )}
                      </button>

                      {/* Goalscorers */}
                      {expanded && hasGoals && (
                        <div
                          className="ml-4 mb-2 pl-3 border-l text-xs space-y-0.5"
                          style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}
                        >
                          {m.goals.map((g, gi) => {
                            const scorerName = g.scorer?.name ?? null;
                            const minute = g.minute != null ? `${g.minute}'` : '';
                            const suffix = goalTypeLabel(g.type);
                            const isHome = g.team?.id === m.homeTeam.id;
                            return (
                              <div
                                key={gi}
                                className="flex items-center gap-2"
                                style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}
                              >
                                <span className="w-6 text-right shrink-0">{minute}</span>
                                {scorerName
                                  ? <span>{scorerName}{suffix}</span>
                                  : <span className="italic opacity-60">Scorer details unavailable from the data provider</span>
                                }
                                <span className="text-[10px]">({isHome ? m.homeTeam.tla : m.awayTeam.tla})</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
