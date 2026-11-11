/**
 * UpcomingEventsWidget
 *
 * Replaces the fictional Avery/Casey demo events in the Parent Portal
 * right sidebar and mobile quick-nav panel.
 *
 * Data source: GET /api/parent/upcoming-events
 *   - sc_parent_manual_events (parent-created)
 *   - sc_calendar_events (iCal feed-synced, cancelled excluded)
 *
 * Features:
 *   - Chronological order, timezone-aware (uses the browser's local time for
 *     display; the server cutoff uses UTC which is correct for ISO comparisons)
 *   - Player name + persistent color dot for manual events linked to a player
 *   - Clicking an event calls onEventClick(event) — caller decides navigation
 *   - "Family calendar →" link calls onCalendarClick
 *   - Refreshes when refreshKey changes (caller increments after save/edit/delete/sync)
 *   - Honest loading / empty / error states — never substitutes demo data
 *
 * Does NOT expose private media URLs or create public links.
 * Does NOT connect to social accounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import type { UpcomingEvent } from '@/server/api/parent/upcoming-events/GET';

// Re-export so callers can type the event without importing the server module
export type { UpcomingEvent };

// ─── Deterministic player color (same algorithm as PpCalendarTab) ─────────────

const PALETTE = [
  '#2563eb', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#be185d', '#ca8a04', '#dc2626',
];

function playerColor(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(isoStart: string, allDay: boolean): string {
  try {
    const d = new Date(isoStart);
    if (allDay) {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return isoStart.slice(0, 10);
  }
}

function formatEventTime(isoStart: string, allDay: boolean): string {
  if (allDay) return 'All day';
  try {
    return new Date(isoStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Map of playerId → player name, for labelling manual events */
  playerNames: Map<string, string>;
  /** Increment to trigger a refresh (after save/edit/delete/sync) */
  refreshKey?: number;
  /** Called when the user clicks an event row */
  onEventClick?: (event: UpcomingEvent) => void;
  /** Called when the user clicks "Family calendar" */
  onCalendarClick: () => void;
  /** Compact mode for the mobile quick-nav panel (fewer lines) */
  compact?: boolean;
}

export default function UpcomingEventsWidget({
  playerNames,
  refreshKey = 0,
  onEventClick,
  onCalendarClick,
  compact = false,
}: Props) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/parent/upcoming-events?limit=5', { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ events: UpcomingEvent[] }> : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => setEvents(data.events ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Loading events…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-2">
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Could not load events.{' '}
          <button
            type="button"
            onClick={load}
            className="underline"
            style={{ color: 'hsl(var(--pp-blue))' }}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={14} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>No upcoming events.</p>
        </div>
        <button
          type="button"
          onClick={onCalendarClick}
          className="text-xs font-medium transition-colors"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          Family calendar →
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
        {events.map(ev => {
          const playerName = ev.playerId ? (playerNames.get(ev.playerId) ?? null) : null;
          const color = ev.playerId ? playerColor(ev.playerId) : null;
          const dateStr = formatEventDate(ev.startAt, ev.allDay);
          const timeStr = formatEventTime(ev.startAt, ev.allDay);

          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => onEventClick?.(ev)}
              className="w-full text-left flex items-start gap-2 rounded-lg transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2 -mx-1 px-1 py-0.5"
              style={{ outline: 'none' }}
            >
              {/* Date column */}
              <div
                className="text-xs font-semibold shrink-0 w-12 pt-0.5"
                style={{ color: 'hsl(var(--pp-navy))' }}
              >
                {dateStr}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Player dot + name */}
                {playerName && color && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] font-medium truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {playerName}
                    </span>
                  </div>
                )}
                {/* Team name for feed events */}
                {!playerName && ev.teamName && (
                  <p className="text-[10px] truncate mb-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {ev.teamName}
                  </p>
                )}
                <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                  {ev.title}
                </p>
                {!compact && (
                  <p className="text-[10px] truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {timeStr}{ev.location ? ` · ${ev.location}` : ''}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onCalendarClick}
          className="text-xs font-medium transition-colors"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          Family calendar →
        </button>
      </div>
    </div>
  );
}
