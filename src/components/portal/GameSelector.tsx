/**
 * GameSelector
 *
 * Reusable component that fetches a player's scheduled game events and lets
 * the parent select one to open GameDetailsPanel (stats + media entry).
 *
 * Used by:
 *   - PlayerStatsTab  — "Log stats for a scheduled game" button above match records
 *   - PlayerMediaTab  — "Tag to a game" picker in the upload form
 *
 * Props:
 *   playerId          — player whose schedule is fetched
 *   onSelect          — called with the chosen ScheduleEvent; caller opens GameDetailsPanel
 *   label             — button label (default: "Log stats for a game")
 *   variant           — 'button' (full-width trigger) | 'inline' (compact selector)
 *   disabled          — disable the trigger
 *   mediaCountsByRef  — optional Map<gameEventRef, count> — shows a media badge on rows
 *                       that have attached media. Pass the same map used in PlayerScheduleTab.
 *                       Omit (or pass undefined) to show no badges.
 *
 * The component fetches once on mount and caches results for the session.
 * It does NOT open GameDetailsPanel itself — that is the caller's responsibility
 * so the panel can be shared with the Schedule tab's existing flow.
 */

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronDown, Loader2, AlertCircle, X } from 'lucide-react';
import { PpButton } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleGameEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  notes: string | null;
  eventType: string;
  source: 'manual' | 'feed';
  // feedId is present for feed events — used to construct the stable composite
  // event_ref (feedId:uid) in GameDetailsPanel.
  feedId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatEventTime(iso: string): string {
  if (iso.length <= 10) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });
  } catch {
    return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GameSelector({
  playerId,
  onSelect,
  label = 'Log stats for a scheduled game',
  variant = 'button',
  disabled = false,
  mediaCountsByRef: externalMediaCounts,
  mediaRefreshKey,
}: {
  playerId: string;
  onSelect: (event: ScheduleGameEvent) => void;
  label?: string;
  variant?: 'button' | 'inline';
  disabled?: boolean;
  /** Optional map of gameEventRef → attached media count. Shows a badge on rows with media.
   *  When omitted, the component fetches media-assignments itself on open. */
  mediaCountsByRef?: Map<string, number>;
  /** Increment to bust the internal media-count cache after an attach or remove.
   *  Only relevant when mediaCountsByRef is NOT provided (self-fetch mode). */
  mediaRefreshKey?: number;
}) {
  const [open, setOpen]       = useState(false);
  const [games, setGames]     = useState<ScheduleGameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  // Internal media counts — used when no external map is provided
  const [internalMediaCounts, setInternalMediaCounts] = useState<Map<string, number>>(new Map());

  const mediaCountsByRef = externalMediaCounts ?? internalMediaCounts;

  const fetchGames = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      const [schedRes, mediaRes] = await Promise.allSettled([
        // Offer games only; full calendar and general uploads remain available.
        fetch(`/api/parent/players/${playerId}/schedule`, { credentials: 'include' }),
        // Only fetch media counts when no external map was provided
        externalMediaCounts
          ? Promise.resolve(null)
          : fetch(`/api/parent/players/${playerId}/media-assignments`, { credentials: 'include' }),
      ]);

      if (schedRes.status === 'fulfilled' && schedRes.value.ok) {
        const data = await schedRes.value.json() as { events: ScheduleGameEvent[] };
        setGames((data.events ?? []).filter(event => event.eventType === 'game'));
        setFetched(true);
      } else {
        const errMsg = schedRes.status === 'rejected'
          ? schedRes.reason instanceof Error ? schedRes.reason.message : 'Failed to load games'
          : `HTTP ${schedRes.value.status}`;
        throw new Error(errMsg);
      }

      if (mediaRes.status === 'fulfilled' && mediaRes.value && mediaRes.value.ok) {
        const mData = await mediaRes.value.json() as { assignments?: Array<{ gameEventRef: string | null }> };
        const counts = new Map<string, number>();
        for (const a of mData.assignments ?? []) {
          if (a.gameEventRef) counts.set(a.gameEventRef, (counts.get(a.gameEventRef) ?? 0) + 1);
        }
        setInternalMediaCounts(counts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [playerId, fetched, externalMediaCounts]);

  // Pre-fetch when the component mounts so the list is ready when opened
  useEffect(() => { void fetchGames(); }, [fetchGames]);

  // When mediaRefreshKey changes (attach or remove while picker is mounted),
  // clear the fetched guard so the next open re-fetches media counts.
  // Only applies in self-fetch mode (no external mediaCountsByRef).
  useEffect(() => {
    if (externalMediaCounts) return; // external map — caller owns refresh
    if (mediaRefreshKey === undefined || mediaRefreshKey === 0) return;
    setFetched(false);
    setInternalMediaCounts(new Map());
  }, [mediaRefreshKey, externalMediaCounts]);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    void fetchGames();
  }

  function handleSelect(event: ScheduleGameEvent) {
    setOpen(false);
    onSelect(event);
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            color: 'hsl(var(--pp-blue))',
            background: 'hsl(var(--pp-blue-light))',
          }}
        >
          <CalendarDays size={12} />
          {label}
          <ChevronDown size={10} />
        </button>

        {open && (
          <GamePickerDropdown
            games={games}
            loading={loading}
            error={error}
            onSelect={handleSelect}
            onClose={() => setOpen(false)}
            mediaCountsByRef={mediaCountsByRef}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <PpButton
        variant="outline"
        size="sm"
        onClick={handleOpen}
        disabled={disabled}
      >
        <CalendarDays size={13} />
        {label}
      </PpButton>

      {open && (
        <GamePickerDropdown
          games={games}
          loading={loading}
          error={error}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          mediaCountsByRef={mediaCountsByRef}
        />
      )}
    </div>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

// Build the stable event ref used by media-assignments (same logic as PlayerScheduleTab)
function buildEventRef(event: ScheduleGameEvent): string {
  if (event.source === 'feed' && event.feedId) return `${event.feedId}:${event.id}`;
  return event.id;
}

function GamePickerDropdown({
  games,
  loading,
  error,
  onSelect,
  onClose,
  mediaCountsByRef,
}: {
  games: ScheduleGameEvent[];
  loading: boolean;
  error: string | null;
  onSelect: (event: ScheduleGameEvent) => void;
  onClose: () => void;
  mediaCountsByRef?: Map<string, number>;
}) {
  return (
    // Inline dropdown — no fixed/portal so it doesn't shift the page when
    // opened inside an already-fixed modal (UploadAssignModal, GameDetailsPanel).
    <div
      className="relative z-10 w-full rounded-xl shadow-xl overflow-hidden flex flex-col max-h-64 border"
      style={{
        background: 'hsl(var(--pp-card-bg))',
        borderColor: 'hsl(var(--pp-border))',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between shrink-0 border-b"
        style={{ borderColor: 'hsl(var(--pp-border))' }}
      >
        <p className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
          Select a game
        </p>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded-full"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-1.5">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading games…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
            <AlertCircle size={12} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
          </div>
        )}

        {!loading && !error && games.length === 0 && (
          <div className="py-6 text-center">
            <CalendarDays size={20} className="mx-auto mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No scheduled games found.
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Add a game on the Schedule tab. Practices and unclassified events are not shown here.
            </p>
          </div>
        )}

        {!loading && !error && games.map(event => {
          const dateStr = formatEventDate(event.startAt);
          const timeStr = formatEventTime(event.startAt);
          const ref = buildEventRef(event);
          const mediaCount = mediaCountsByRef?.get(ref) ?? 0;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event)}
              className="w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-colors"
              style={{ background: 'hsl(var(--pp-bg))' }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold truncate flex-1" style={{ color: 'hsl(var(--pp-text))' }}>
                  {event.title}
                </span>
                {mediaCount > 0 && (
                  <span
                    className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold rounded-full px-1.5 py-0.5"
                    style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
                    title={`${mediaCount} media item${mediaCount !== 1 ? 's' : ''} attached`}
                  >
                    ★ {mediaCount}
                  </span>
                )}
              </span>
              <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {dateStr}{timeStr ? ` · ${timeStr}` : ''}{event.location ? ` · ${event.location}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      {/* Legend */}
      <div
        className="px-3 py-1.5 shrink-0 border-t"
        style={{ borderColor: 'hsl(var(--pp-border))' }}
      >
        <p className="text-[9px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          ★ Event has attached media
        </p>
      </div>
    </div>
  );
}
