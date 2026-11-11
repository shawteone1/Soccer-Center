/**
 * PpCalendarTab — Calendar tab for the Parent Portal.
 *
 * - Real iCal subscription setup via PpCalendarConnections
 * - Live player schedule events from GET /api/parent/players/:id/schedule
 *   merged across all players passed via the `players` prop
 * - Manual events: real CRUD via /api/parent/manual-events
 * - Player color legend (clickable → player-specific view)
 * - Clickable events in Month, Week, List views → detail panel
 * - Player calendar view: filtered events + back-to-family nav
 * - Persistent player colors: assigned by player index, stable across renders
 * - Working filters: player filter
 * - Deduplication note on import preview
 * - Falls back gracefully when no feeds are connected or no players exist
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Info, ExternalLink, Clock, MapPin,
  Loader2, Trash2, Pencil, Check, X, AlertCircle,
  ArrowLeft, User,
} from 'lucide-react';
import { PpCard, PpButton, PpSectionHeading } from './PpPrimitives';
import PpCalendarConnections from './PpCalendarConnections';
import { MonthView, WeekView } from './CalendarViews';
import { calendarDate, localDateKey } from '@/lib/portal/calendar-display';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  eventType: string;
  source: 'manual' | 'feed' | 'player';
  playerId: string | null;
  playerName: string | null;
  teamName?: string | null;
}

interface PlayerProfile {
  id: string;
  label: string | null;
}

interface ManualEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  eventType: string | null;
  playerId: string | null;
  createdAt: string | null;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatManualDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });
  } catch { return iso; }
}

// Persistent color palette — assigned deterministically by player ID hash,
// not by array index. Removing or reordering players never changes a color.
const PALETTE = [
  'hsl(var(--pp-navy))',
  'hsl(var(--pp-blue))',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
];

/** Deterministic color from player ID — stable regardless of list order. */
function playerColor(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Event list ───────────────────────────────────────────────────────────────

function EventList({ events, onEventClick, colorMap }: {
  events: CalEvent[];
  onEventClick: (ev: CalEvent) => void;
  colorMap: Map<string | null, string>;
}) {
  const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return (
    <div className="space-y-2">
      {sorted.map(ev => {
        const color = colorMap.get(ev.playerId) ?? 'hsl(var(--pp-navy))';
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onEventClick(ev)}
            className="w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
          >
            <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</p>
                <span
                  className="text-[9px] font-semibold rounded-full px-1.5 py-0.5"
                  style={{
                    background: ev.eventType === 'game' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))',
                    color: ev.eventType === 'game' ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))',
                  }}
                >
                  {ev.eventType}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {ev.allDay ? formatDate(ev.startAt.slice(0, 10)) : formatManualDate(ev.startAt)}
                </span>
                {ev.location && <span className="flex items-center gap-1 truncate"><MapPin size={10} />{ev.location}</span>}
              </div>
              {ev.playerName && (
                <p className="text-[10px] mt-0.5" style={{ color }}>
                  {ev.playerName}
                  {ev.source === 'feed' && ev.teamName ? ` · ${ev.teamName}` : ''}
                </p>
              )}
              {ev.source === 'manual' && !ev.playerId && (
                <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>Family event</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpCalendarTab({
  players = [],
  initialPlayerFilter,
}: {
  players?: PlayerProfile[];
  initialPlayerFilter?: string;
}) {
  // Persist view preference in sessionStorage so it survives tab switches
  const [view, setView] = useState<'month' | 'week' | 'list'>(() => {
    try { return (sessionStorage.getItem('pp_cal_view') as 'month' | 'week' | 'list') || 'list'; } catch { return 'list'; }
  });
  const handleSetView = (v: 'month' | 'week' | 'list') => {
    setView(v);
    try { sessionStorage.setItem('pp_cal_view', v); } catch { /* ignore */ }
  };
  const [weekAnchor, setWeekAnchor] = useState(() => new Date(`${calendarDate(new Date().toISOString())}T12:00:00`));

  // Player filter — null = all players (family view)
  const [playerFilter, setPlayerFilter] = useState<string | null>(initialPlayerFilter ?? null);

  // Event-type filter — null = all types
  type EventTypeFilter = 'game' | 'practice' | 'tournament' | 'camp' | 'showcase' | 'other' | null;
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>(null);

  // Selected event detail panel
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  // Live player schedule events
  const [playerEvents, setPlayerEvents] = useState<CalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Manual events state
  const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editEvent, setEditEvent] = useState<ManualEvent | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formType, setFormType] = useState('event');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (playerFilter && !players.some(p => p.id === playerFilter)) setPlayerFilter(null);
  }, [players, playerFilter]);

  // Stable color map: playerId → color, keyed by player ID (deterministic hash)
  const colorMap = new Map<string | null, string>(
    players.map(p => [p.id, playerColor(p.id)])
  );
  colorMap.set(null, 'hsl(var(--pp-text-muted))');

  // Load real player schedule events for all players
  const loadPlayerEvents = useCallback(async () => {
    if (players.length === 0) { setPlayerEvents([]); setEventsLoading(false); return; }
    setEventsLoading(true);
    try {
      const results = await Promise.allSettled(
        players.map(p =>
          fetch(`/api/parent/players/${encodeURIComponent(p.id)}/schedule`, { credentials: 'include' })
            .then(r => r.ok ? r.json() as Promise<{ events: Array<{ id: string; title: string; startAt: string; endAt: string | null; allDay: boolean; location: string | null; notes: string | null; eventType: string; source: 'manual' | 'feed'; teamName?: string | null }> }> : Promise.resolve({ events: [] }))
            .then(data => data.events.map(e => ({
              ...e,
              playerId: p.id,
              playerName: p.label ?? null,
            })))
        )
      );
      const all: CalEvent[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value);
      }
      // Deduplicate by stable event identity: prefer (id + playerId) which is
      // globally unique. Fall back to (startAt + title + playerId) only for
      // events that lack a stable server-assigned id (e.g. feed events with
      // the same uid imported for two different players).
      const seen = new Set<string>();
      const deduped = all.filter(e => {
        // Use the server-assigned id when available — it's globally unique per player
        const key = e.id
          ? `${e.playerId}:id:${e.id}`
          : `${e.playerId}:${e.startAt}:${e.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setPlayerEvents(deduped);
    } catch { /* ignore */ }
    finally { setEventsLoading(false); }
  }, [players]);

  const loadManualEvents = useCallback(async () => {
    setManualLoading(true);
    try {
      const res = await apiFetch('/api/parent/manual-events');
      if (!res.ok) return;
      const data = await res.json() as { events: ManualEvent[] };
      setManualEvents(data.events);
    } finally {
      setManualLoading(false);
    }
  }, []);

  useEffect(() => { void loadPlayerEvents(); void loadManualEvents(); }, [loadPlayerEvents, loadManualEvents]);

  function openAddForm() {
    setEditEvent(null);
    setFormTitle('');
    setFormDate('');
    setFormTime('');
    setFormLocation('');
    setFormNotes('');
    setFormType('event');
    setFormError(null);
    setShowAddForm(true);
  }

  function openEditForm(ev: ManualEvent) {
    setEditEvent(ev);
    const d = new Date(ev.startAt);
    setFormTitle(ev.title);
    setFormDate(ev.allDay ? ev.startAt.slice(0, 10) : localDateKey(d));
    setFormTime(ev.allDay ? '' : d.toTimeString().slice(0, 5));
    setFormLocation(ev.location ?? '');
    setFormNotes(ev.notes ?? '');
    setFormType(ev.eventType ?? 'event');
    setFormError(null);
    setShowAddForm(true);
  }

  async function handleSaveEvent() {
    if (!formTitle.trim()) { setFormError('Title is required.'); return; }
    if (!formDate) { setFormError('Date is required.'); return; }

    const startAt = formTime
      ? new Date(`${formDate}T${formTime}:00`).toISOString()
      : `${formDate}T00:00:00`;

    setFormSaving(true);
    setFormError(null);

    try {
      const body = {
        title: formTitle.trim(),
        startAt,
        location: formLocation.trim() || undefined,
        notes: formNotes.trim() || undefined,
        eventType: formType,
        playerId: editEvent ? editEvent.playerId : playerFilter,
        endAt: editEvent?.endAt ?? undefined,
        allDay: !formTime,
      };

      if (editEvent) {
        const res = await apiFetch(`/api/parent/manual-events/${editEvent.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Update failed');
      } else {
        const res = await apiFetch('/api/parent/manual-events', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Create failed');
      }

      await loadManualEvents();
      setShowAddForm(false);
      setEditEvent(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/parent/manual-events/${id}`, { method: 'DELETE' });
      setManualEvents(prev => prev.filter(e => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  function prevWeek() {
    setWeekAnchor(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
  }
  function nextWeek() {
    setWeekAnchor(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
  }

  // Merge player events + manual events into a unified CalEvent list
  const activeIds = new Set(players.map(p => p.id));
  const visibleManualEvents = manualEvents.filter(e => !e.playerId || activeIds.has(e.playerId));
  const manualCalEvents: CalEvent[] = visibleManualEvents.map(e => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    eventType: e.eventType ?? 'event',
    source: 'manual' as const,
    playerId: e.playerId,
    playerName: e.playerId ? (players.find(p => p.id === e.playerId)?.label ?? null) : null,
  }));

  const allCalEvents: CalEvent[] = [...playerEvents.filter(e => !e.playerId || activeIds.has(e.playerId)), ...manualCalEvents];

  // Apply player filter then event-type filter
  const playerFiltered = playerFilter
    ? allCalEvents.filter(e => e.playerId === playerFilter)
    : allCalEvents;

  const visibleEvents = typeFilter
    ? playerFiltered.filter(e => {
        const t = (e.eventType ?? '').toLowerCase();
        if (typeFilter === 'other') {
          // "other" catches anything not in the named set
          return !['game', 'practice', 'tournament', 'camp', 'showcase'].includes(t);
        }
        return t === typeFilter;
      })
    : playerFiltered;

  const hasRealEvents = allCalEvents.length > 0;

  return (
    <div className="space-y-5">

      {/* Real calendar connections */}
      <PpCalendarConnections players={players} />

      {/* Player legend — clickable to filter */}
      {players.length > 0 && (
        <PpCard>
          <PpSectionHeading>Player legend</PpSectionHeading>
          <div className="flex flex-wrap gap-3">
            {players.map((p) => {
              const color = playerColor(p.id);
              const isActive = playerFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlayerFilter(f => f === p.id ? null : p.id)}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors"
                  style={{
                    background: isActive ? color : 'hsl(var(--pp-blue-light))',
                    color: isActive ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))',
                    border: `1.5px solid ${isActive ? color : 'transparent'}`,
                  }}
                  title={isActive ? 'Show all players' : `Show only ${p.label ?? 'player'}`}
                >
                  <User size={12} />
                  {p.label ?? 'Player'}
                  {isActive && <span className="text-[10px] opacity-80">· only</span>}
                </button>
              );
            })}
            {playerFilter && (
              <button
                type="button"
                onClick={() => setPlayerFilter(null)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors"
                style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-text-muted))' }}
              >
                <X size={11} />
                Show all
              </button>
            )}
          </div>
        </PpCard>
      )}

      {/* Event-type filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { value: null,         label: 'All' },
          { value: 'game',       label: 'Games' },
          { value: 'practice',   label: 'Practices' },
          { value: 'tournament', label: 'Tournaments' },
          { value: 'camp',       label: 'Camps' },
          { value: 'showcase', label: 'Showcases' },
          { value: 'other',      label: 'Other' },
        ] as { value: EventTypeFilter; label: string }[]).map(({ value, label }) => {
          const active = typeFilter === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setTypeFilter(active ? null : value)}
              className="text-xs px-3 py-1 rounded-full transition-colors"
              style={{
                background: active ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))',
                color: active ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))',
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Player calendar view header */}
      {playerFilter && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: `${colorMap.get(playerFilter) ?? 'hsl(var(--pp-navy))'}18`,
            borderLeft: `3px solid ${colorMap.get(playerFilter) ?? 'hsl(var(--pp-navy))'}`,
          }}
        >
          <button
            type="button"
            onClick={() => setPlayerFilter(null)}
            className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: colorMap.get(playerFilter) ?? 'hsl(var(--pp-navy))' }}
          >
            <ArrowLeft size={14} />
            Back to family calendar
          </button>
          <span className="text-xs font-semibold" style={{ color: colorMap.get(playerFilter) ?? 'hsl(var(--pp-navy))' }}>
            · {players.find(p => p.id === playerFilter)?.label ?? 'Player'}&apos;s events
          </span>
        </div>
      )}

      {/* Calendar events */}
      <PpCard>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <PpSectionHeading>
            {playerFilter
              ? `${players.find(p => p.id === playerFilter)?.label ?? 'Player'}'s events`
              : 'Family calendar'}
            <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {eventsLoading ? '…' : `${visibleEvents.length} event${visibleEvents.length !== 1 ? 's' : ''}`}
            </span>
          </PpSectionHeading>
          <div className="flex gap-1">
            {(['month', 'week', 'list'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => handleSetView(v)}
                aria-pressed={view === v}
                className="text-sm min-h-11 px-3 py-2 rounded-full transition-colors capitalize"
                style={{
                  background: view === v ? 'hsl(var(--pp-navy))' : 'transparent',
                  color: view === v ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                }}
              >
                {v === 'list' ? 'Agenda' : v}
              </button>
            ))}
          </div>
        </div>

        {/* Event detail panel */}
        {selectedEvent && (
          <div
            className="rounded-xl border p-4 mb-4 space-y-3"
            style={{
              borderColor: colorMap.get(selectedEvent.playerId) ?? 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-page-bg))',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ background: colorMap.get(selectedEvent.playerId) ?? 'hsl(var(--pp-navy))' }} />
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{selectedEvent.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="p-2 rounded-full shrink-0"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
                aria-label="Close detail"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {selectedEvent.allDay
                  ? formatDate(selectedEvent.startAt.slice(0, 10))
                  : formatManualDate(selectedEvent.startAt)}
              </span>
              {selectedEvent.location && <span className="flex items-center gap-1.5"><MapPin size={11} />{selectedEvent.location}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{
                  background: selectedEvent.eventType === 'game' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))',
                  color: selectedEvent.eventType === 'game' ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))',
                }}
              >
                {selectedEvent.eventType}
              </span>
              {selectedEvent.source === 'feed' && selectedEvent.teamName && (
                <span className="text-[10px] rounded-full px-2 py-0.5 border" style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
                  {selectedEvent.teamName}
                </span>
              )}
              {selectedEvent.playerName && (
                <span className="text-[10px] font-medium" style={{ color: colorMap.get(selectedEvent.playerId) ?? 'hsl(var(--pp-navy))' }}>
                  {selectedEvent.playerName}
                </span>
              )}
            </div>
            {selectedEvent.playerId && (
              <button
                type="button"
                onClick={() => { setPlayerFilter(selectedEvent.playerId); setSelectedEvent(null); }}
                className="text-xs underline"
                style={{ color: colorMap.get(selectedEvent.playerId) ?? 'hsl(var(--pp-navy))' }}
              >
                View all {selectedEvent.playerName ?? 'player'}&apos;s events
              </button>
            )}
          </div>
        )}

        {eventsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
        ) : !hasRealEvents && players.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Add players to your portal to see their schedules here.
            </p>
          </div>
        ) : !hasRealEvents ? (
          <div className="py-6 text-center">
            <p className="text-sm mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No events yet. Connect a calendar feed or add events manually below.
            </p>
          </div>
        ) : view === 'month' ? (
          <MonthView events={visibleEvents} anchor={weekAnchor} onPrev={prevWeek} onNext={nextWeek} onEventClick={setSelectedEvent} colorMap={colorMap} />
        ) : view === 'week' ? (
          <WeekView events={visibleEvents} anchor={weekAnchor} onPrev={prevWeek} onNext={nextWeek} onEventClick={setSelectedEvent} colorMap={colorMap} />
        ) : (
          visibleEvents.length === 0
            ? <p className="text-sm text-center py-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>No events for this filter.</p>
            : <EventList events={visibleEvents} onEventClick={setSelectedEvent} colorMap={colorMap} />
        )}
      </PpCard>

      {/* Manual events — real CRUD */}
      <PpCard>
        <div className="flex items-center justify-between mb-4">
          <PpSectionHeading>My events</PpSectionHeading>
          {!showAddForm && (
            <PpButton size="sm" onClick={openAddForm}>
              <Plus size={12} />
              Add event
            </PpButton>
          )}
        </div>

        {/* Add/edit form */}
        {showAddForm && (
          <div
            className="rounded-xl border p-4 mb-4 space-y-3"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {editEvent ? 'Edit event' : 'Add event'}
            </p>
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="Event title *"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              maxLength={512}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'hsl(var(--pp-text-muted))' }}>Date *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'hsl(var(--pp-text-muted))' }}>Time (optional) · {Intl.DateTimeFormat().resolvedOptions().timeZone}</label>
                <input
                  type="time"
                  value={formTime}
                  onChange={e => setFormTime(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                />
              </div>
            </div>
            <input
              type="text"
              value={formLocation}
              onChange={e => setFormLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              maxLength={512}
            />
            <select
              value={formType}
              onChange={e => setFormType(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            >
              <option value="event">Event</option><option value="showcase">Showcase</option>
              <option value="game">Game</option>
              <option value="practice">Practice</option>
              <option value="tournament">Tournament</option>
              <option value="camp">Camp</option>
              <option value="other">Other</option>
            </select>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            />
            {formError && (
              <p className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
                <AlertCircle size={11} />
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <PpButton size="sm" onClick={handleSaveEvent} disabled={formSaving}>
                {formSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editEvent ? 'Save changes' : 'Add event'}
              </PpButton>
              <PpButton size="sm" variant="outline" onClick={() => { setShowAddForm(false); setEditEvent(null); }}>
                <X size={12} />
                Cancel
              </PpButton>
            </div>
          </div>
        )}

        {/* Event list */}
        {manualLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
        ) : visibleManualEvents.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No events yet. Add your first event above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleManualEvents.map(ev => (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</p>
                    {ev.eventType && ev.eventType !== 'event' && (
                      <span
                        className="text-[9px] font-semibold rounded-full px-1.5 py-0.5 capitalize"
                        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                      >
                        {ev.eventType}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatManualDate(ev.startAt)}
                    </span>
                    {ev.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin size={10} />
                        {ev.location}
                      </span>
                    )}
                  </div>
                  {ev.notes && (
                    <p className="text-[10px] mt-0.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {ev.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(ev)}
                    className="p-1 rounded"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(ev.id)}
                    disabled={deletingId === ev.id}
                    className="p-1 rounded"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                    title="Delete"
                  >
                    {deletingId === ev.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-start gap-2">
          <ExternalLink size={12} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            To manage personal events and calendar connections, visit the{' '}
            <a href="/my-soccer" className="underline" style={{ color: 'hsl(var(--pp-blue))' }}>
              Fan portal Calendar tab
            </a>
            .
          </p>
        </div>
      </PpCard>

      {/* Deduplication note */}
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          When multiple feeds are connected, duplicate events (same date, time, and team name) are automatically deduplicated.
        </span>
      </div>
    </div>
  );
}
