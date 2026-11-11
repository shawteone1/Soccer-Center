/**
 * ScoresTicker — compact scrolling scores bar.
 *
 * - Auth-gated: shows a sign-in prompt strip when not authenticated.
 * - CSS marquee animation; pauses on hover and on pause button click.
 * - prefers-reduced-motion: static, manually-scrollable list instead.
 * - Fetches today's matches for the provided league slugs in sequence
 *   (rate-limit friendly: one request per league, 200 ms apart).
 * - "Scores" link opens /scores.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { Pause, Play, Trophy, LogIn } from 'lucide-react';
import {
  type ScoresMatch,
  type ScoresMatchesResponse,
  isLive,
  statusLabel,
  scoreDisplay,
} from './scores-types';

interface TickerItem {
  matchId: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  status: string;
  live: boolean;
}

interface ScoresTickerProps {
  /** League slugs to show in the ticker */
  leagues: string[];
  /** Whether the current user is authenticated */
  isAuthenticated: boolean;
  /** Optional: compact mode (no "Scores" label, smaller text) */
  compact?: boolean;
}

function buildItems(matches: ScoresMatch[], leagueName: string): TickerItem[] {
  return matches
    .filter(m => m.status !== 'POSTPONED' && m.status !== 'CANCELLED')
    .map(m => ({
      matchId: m.id,
      leagueName,
      homeTeam: m.homeTeam.tla || m.homeTeam.shortName || m.homeTeam.name,
      awayTeam: m.awayTeam.tla || m.awayTeam.shortName || m.awayTeam.name,
      score: scoreDisplay(m),
      status: statusLabel(m.status, m.utcDate),
      live: isLive(m.status),
    }));
}

export default function ScoresTicker({ leagues, isAuthenticated, compact = false }: ScoresTickerProps) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const fetchLeagues = useCallback(async () => {
    if (!isAuthenticated || leagues.length === 0) { setLoading(false); return; }
    setLoading(true);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const collected: TickerItem[] = [];

    for (let i = 0; i < leagues.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 200)); // rate-limit spacing
      try {
        const res = await fetch(`/api/scores/matches?league=${leagues[i]}&date=${today}`, {
          credentials: 'include',
        });
        if (!res.ok) continue;
        const data = await res.json() as ScoresMatchesResponse;
        collected.push(...buildItems(data.matches, data.competition.name));
      } catch {
        // skip this league silently
      }
    }

    setItems(collected);
    setLoading(false);
  }, [isAuthenticated, leagues]);

  useEffect(() => { fetchLeagues(); }, [fetchLeagues]);

  // Auto-refresh every 60 s when any match is live
  useEffect(() => {
    const hasLive = items.some(i => i.live);
    if (!hasLive) return;
    const id = setInterval(fetchLeagues, 60_000);
    return () => clearInterval(id);
  }, [items, fetchLeagues]);

  const barStyle = {
    background: 'hsl(var(--muted))',
    borderColor: 'hsl(var(--border))',
  } as const;

  // ── Sign-in prompt ─────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 text-xs border-b"
        style={{ ...barStyle, color: 'hsl(var(--muted-foreground))' }}
      >
        <Trophy size={12} style={{ color: 'hsl(var(--primary))' }} />
        <span>Sign in to see live scores</span>
        <Link
          to="/login/auth"
          className="flex items-center gap-1 font-semibold hover:underline"
          style={{ color: 'hsl(var(--primary))' }}
        >
          <LogIn size={11} />
          Sign in
        </Link>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs border-b"
        style={{ ...barStyle, color: 'hsl(var(--muted-foreground))' }}
      >
        <Trophy size={12} style={{ color: 'hsl(var(--primary))' }} />
        <span>Loading scores…</span>
      </div>
    );
  }

  // ── No fixtures ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs border-b"
        style={{ ...barStyle, color: 'hsl(var(--muted-foreground))' }}
      >
        <Trophy size={12} style={{ color: 'hsl(var(--primary))' }} />
        <span>No fixtures today</span>
        <Link
          to="/scores"
          className="ml-auto font-semibold hover:underline"
          style={{ color: 'hsl(var(--primary))' }}
        >
          Scores
        </Link>
      </div>
    );
  }

  // ── Reduced-motion: static scrollable list ─────────────────────────────────
  if (reducedMotion) {
    return (
      <div
        className="flex items-center gap-0 border-b overflow-x-auto"
        style={{ ...barStyle, scrollbarWidth: 'none' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1 px-3 py-2 shrink-0">
          <Trophy size={12} style={{ color: 'hsl(var(--primary))' }} />
        </div>
        {items.map(item => (
          <TickerMatchChip key={item.matchId} item={item} compact={compact} />
        ))}
        <Link
          to="/scores"
          className="shrink-0 px-3 py-2 text-xs font-semibold hover:underline"
          style={{ color: 'hsl(var(--primary))' }}
        >
          All scores →
        </Link>
      </div>
    );
  }

  // ── Animated marquee ───────────────────────────────────────────────────────
  return (
    <div
      className="flex items-center border-b overflow-hidden"
      style={{ ...barStyle, height: compact ? '32px' : '36px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Label + pause button */}
      <div
        className="flex items-center gap-1.5 px-3 shrink-0 border-r"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <Trophy size={12} style={{ color: 'hsl(var(--primary))' }} />
        {!compact && (
          <span
            className="text-xs font-bold tracking-wide uppercase"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            Scores
          </span>
        )}
        <button
          type="button"
          onClick={() => setPaused(p => !p)}
          aria-label={paused ? 'Resume ticker' : 'Pause ticker'}
          className="ml-1 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={trackRef}
          className="flex items-center gap-0 whitespace-nowrap"
          style={{
            animation: paused ? 'none' : `sc-ticker ${Math.max(items.length * 8, 30)}s linear infinite`,
            willChange: 'transform',
          }}
        >
          {/* Duplicate items for seamless loop */}
          {[...items, ...items].map((item, idx) => (
            <TickerMatchChip key={`${item.matchId}-${idx}`} item={item} compact={compact} />
          ))}
        </div>
      </div>

      {/* All scores link */}
      <Link
        to="/scores"
        className="shrink-0 px-3 text-xs font-semibold hover:underline border-l"
        style={{ color: 'hsl(var(--primary))', borderColor: 'hsl(var(--border))' }}
      >
        All →
      </Link>
    </div>
  );
}

function TickerMatchChip({ item, compact }: { item: TickerItem; compact: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 border-r text-xs shrink-0"
      style={{
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--foreground))',
        fontSize: compact ? '11px' : '12px',
      }}
    >
      {item.live && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: 'hsl(var(--status-live-bar))' }}
          aria-label="Live"
        />
      )}
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{item.homeTeam}</span>
      <span className="font-bold tabular-nums">{item.score}</span>
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{item.awayTeam}</span>
      <span
        className="text-[10px] font-semibold px-1 rounded"
        style={{
          background: item.live ? 'hsl(var(--status-live-bg))' : 'hsl(var(--border))',
          color: item.live ? 'hsl(var(--status-live-fg))' : 'hsl(var(--muted-foreground))',
        }}
      >
        {item.status}
      </span>
    </span>
  );
}
