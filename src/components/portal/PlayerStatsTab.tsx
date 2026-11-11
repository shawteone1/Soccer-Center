/**
 * PlayerStatsTab
 *
 * Stats tab for /parent-portal/players/:id
 *
 * Shows:
 *   1. Season totals card — aggregated live from sc_player_match_records
 *      (falls back to sc_player_profiles stat columns when the table is absent)
 *   2. "Log stats for a scheduled game" — opens GameDetailsPanel for a chosen
 *      game event, reusing the same panel and records as the Schedule tab.
 *   3. Per-game log — from sc_player_match_records via
 *      GET /api/parent/players/:playerId/match-records
 *      Gracefully handles tableAvailable:false (migration not yet run)
 *
 * Season totals are re-aggregated from match records after every save/edit/delete
 * so they never double-count and always reflect the current game log.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart2, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { PpCard, PpSectionHeading } from './PpPrimitives';
import GameRecordsSection from './GameRecordsSection';
import GameSelector, { type ScheduleGameEvent } from './GameSelector';
import GameDetailsPanel, { type ScheduleEvent as GameDetailEvent } from './GameDetailsPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerStatSummary {
  statGp:      number | null;
  statGoals:   number | null;
  statAssists: number | null;
  statShots:   number | null;
  statGa:      number | null;
  statSaves:   number | null;
  statSo:      number | null;
  statsAvailable: boolean;
  primaryPosition: string | null;
  positions: string[];
}

interface MatchRecord {
  goals:    number | null;
  assists:  number | null;
  ga:       number | null;
  saves:    number | null;
  shutouts: number | null;
  season:   string | null;
}

interface LiveTotals {
  games:    number;
  goals:    number;
  assists:  number;
  ga:       number | null;
  saves:    number | null;
  shutouts: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isGk(player: PlayerStatSummary): boolean {
  const pos = (player.primaryPosition ?? player.positions[0] ?? '').toLowerCase();
  return pos.includes('goalkeeper') || pos.includes('keeper') || pos === 'gk';
}

function statVal(n: number | null): string {
  return n == null ? '—' : String(n);
}

const CURRENT_SEASON = '2026-27';

function aggregateRecords(records: MatchRecord[], season: string): LiveTotals {
  const filtered = season === 'all' ? records : records.filter(r => r.season === season);
  return filtered.reduce<LiveTotals>(
    (acc, r) => ({
      games:    acc.games + 1,
      goals:    acc.goals   + (r.goals   ?? 0),
      assists:  acc.assists + (r.assists  ?? 0),
      ga:       r.ga      != null ? (acc.ga      ?? 0) + r.ga      : acc.ga,
      saves:    r.saves   != null ? (acc.saves   ?? 0) + r.saves   : acc.saves,
      shutouts: r.shutouts != null ? (acc.shutouts ?? 0) + r.shutouts : acc.shutouts,
    }),
    { games: 0, goals: 0, assists: 0, ga: null, saves: null, shutouts: null }
  );
}

// ─── Season Totals Card ───────────────────────────────────────────────────────

function SeasonTotalsCard({
  player,
  playerId,
  refreshKey,
}: {
  player: PlayerStatSummary;
  playerId: string;
  refreshKey: number;
}) {
  const gk = isGk(player);
  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [tableAvailable, setTableAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonFilter, setSeasonFilter] = useState(CURRENT_SEASON);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/parent/players/${playerId}/match-records`, { credentials: 'include' });
      if (!res.ok) { setTableAvailable(false); return; }
      const data = await res.json() as { tableAvailable: boolean; records: MatchRecord[] };
      setTableAvailable(data.tableAvailable);
      setRecords(data.records ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [playerId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!player.statsAvailable && tableAvailable === false) {
    return (
      <PpCard>
        <div className="flex items-center gap-2 text-xs py-2"
          style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <AlertCircle size={13} />
          Season totals unavailable — run the stats schema migration from the admin panel.
        </div>
      </PpCard>
    );
  }

  if (loading) {
    return (
      <PpCard>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      </PpCard>
    );
  }

  // When match records are available, aggregate from them (always fresh, no double-counting)
  if (tableAvailable && records.length > 0) {
    const seasons = Array.from(new Set([CURRENT_SEASON, ...records.map(r => r.season).filter(Boolean) as string[]])).sort().reverse();
    const totals = aggregateRecords(records, seasonFilter);

    const stats = gk
      ? [
          { label: 'GP',       value: String(totals.games) },
          { label: 'GA',       value: statVal(totals.ga) },
          { label: 'Saves',    value: statVal(totals.saves) },
          { label: 'Shutouts', value: statVal(totals.shutouts) },
        ]
      : [
          { label: 'GP',      value: String(totals.games) },
          { label: 'Goals',   value: String(totals.goals) },
          { label: 'Assists', value: String(totals.assists) },
        ];

    return (
      <PpCard>
        <div className="flex items-center justify-between mb-3">
          <PpSectionHeading icon={<TrendingUp size={14} />} title="Season totals" />
          <select
            value={seasonFilter}
            onChange={e => setSeasonFilter(e.target.value)}
            className="text-xs rounded-lg border px-2 py-1"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
          >
            <option value="all">All seasons</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className={`grid gap-3 mt-1`} style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(s => (
            <div
              key={s.label}
              className="flex flex-col items-center justify-center rounded-xl py-3 gap-0.5"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <span
                className="text-2xl font-bold leading-none"
                style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}
              >
                {s.value}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-2 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Aggregated from match records · {records.length} game{records.length !== 1 ? 's' : ''} logged
        </p>
      </PpCard>
    );
  }

  // Fallback: no match records yet — show profile stat columns if available
  const hasAnyStats = gk
    ? (player.statGp != null || player.statGa != null || player.statSaves != null || player.statSo != null)
    : (player.statGp != null || player.statGoals != null || player.statAssists != null || player.statShots != null);

  const stats = gk
    ? [
        { label: 'GP',       value: statVal(player.statGp) },
        { label: 'GA',       value: statVal(player.statGa) },
        { label: 'Saves',    value: statVal(player.statSaves) },
        { label: 'Shutouts', value: statVal(player.statSo) },
      ]
    : [
        { label: 'GP',      value: statVal(player.statGp) },
        { label: 'Goals',   value: statVal(player.statGoals) },
        { label: 'Assists', value: statVal(player.statAssists) },
        { label: 'Shots',   value: statVal(player.statShots) },
      ];

  return (
    <PpCard>
      <PpSectionHeading icon={<TrendingUp size={14} />} title="Season totals" />
      {!hasAnyStats ? (
        <p className="text-xs mt-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          No season stats recorded yet. Add match records below to build totals automatically,
          or edit the player profile to enter season totals directly.
        </p>
      ) : (
        <div className={`grid gap-3 mt-3`} style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map(s => (
            <div
              key={s.label}
              className="flex flex-col items-center justify-center rounded-xl py-3 gap-0.5"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <span
                className="text-2xl font-bold leading-none"
                style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}
              >
                {s.value}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </PpCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerStatsTab({
  playerId,
  player,
}: {
  playerId: string;
  player: PlayerStatSummary;
}) {
  const position = player.primaryPosition ?? player.positions[0] ?? null;

  // Increment to trigger SeasonTotalsCard + GameRecordsSection reload after save
  const [refreshKey, setRefreshKey] = useState(0);

  // Game selector → GameDetailsPanel (same panel as Schedule tab)
  const [gameDetailsEvent, setGameDetailsEvent] = useState<GameDetailEvent | null>(null);

  function handleGameSelect(event: ScheduleGameEvent) {
    // ScheduleGameEvent is a subset of GameDetailEvent — cast is safe
    setGameDetailsEvent(event as GameDetailEvent);
  }

  function handleSaved() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="space-y-4">
      {/* Season totals — live from match records */}
      <SeasonTotalsCard player={player} playerId={playerId} refreshKey={refreshKey} />

      {/* Per-game log — full add/edit/delete via GameRecordsSection */}
      <PpCard>
        <PpSectionHeading icon={<BarChart2 size={14} />} title="Match records" />
        <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Log individual match stats. Season totals above update automatically.
        </p>

        {/* Game selector — opens GameDetailsPanel for a scheduled game */}
        <div className="mb-4">
          <GameSelector
            playerId={playerId}
            onSelect={handleGameSelect}
            label="Log stats for a scheduled game"
          />
          <p className="text-[10px] mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Pick a game from your schedule to pre-fill date and opponent, and attach media in the same step.
          </p>
        </div>

        <GameRecordsSection playerId={playerId} position={position} refreshKey={refreshKey} onSaved={handleSaved} />
      </PpCard>

      {/* GameDetailsPanel — opened from the game selector above */}
      {gameDetailsEvent && (
        <GameDetailsPanel
          event={gameDetailsEvent}
          playerId={playerId}
          position={position}
          onClose={() => setGameDetailsEvent(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
