/**
 * PlayerScheduleTab
 *
 * Schedule tab for /parent-portal/players/:id
 *
 * Repairs in this version
 * ───────────────────────
 * 1. Field overlap / overflow
 *    - All date + time inputs are stacked (never side-by-side) so they never
 *      overflow on narrow viewports (iPad split-screen, portrait, landscape).
 *    - `min-w-0` on every flex/grid child prevents Safari date inputs from
 *      overflowing their containers.
 *    - The sheet body is `overflow-y-auto` with `pb-8` so Save/Cancel remain
 *      reachable with the keyboard open.
 *
 * 2. Unexpected dismissal
 *    - Backdrop click does NOT close the sheet. Only Cancel/X or confirmed
 *      successful save closes it.
 *    - A dirty-check confirms before discarding unsaved changes.
 *    - Background schedule refreshes (syncFeeds → load) do not reset or close
 *      the open form — `load()` only updates `events` state, which the form
 *      does not read.
 *    - `stopPropagation` on the sheet panel prevents any bubbled pointer events
 *      from reaching the backdrop.
 *
 * 3. Reduced clicks — unified "Add to schedule" entry point
 *    - One button opens a sheet with three direct choices:
 *        Game         → game form (opponent, date, time, venue, home/away)
 *        Practice     → practice form with One / Repeating toggle
 *        Connect feed → FeedSetup from PlayerCalendarSetup
 *    - Player, team and timezone are pre-filled.
 *    - Optional fields (venue, notes) are collapsed until needed.
 *    - "Save and add another" available for individual games.
 *    - After saving, new events appear immediately without navigation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, List, Plus, Trash2, Loader2, AlertCircle,
  MapPin, Clock, X, ChevronLeft, ChevronRight, RefreshCw, Rss,
  BarChart2, ChevronDown, Wifi, Check, Link, Upload,
} from 'lucide-react';
import { PpCard, PpButton, PpSectionHeading, PpChip } from './PpPrimitives';
import AppearanceForm from './AppearanceForm';
import GameDetailsPanel from './GameDetailsPanel';
import type { ScheduleEvent as GameDetailEvent } from './GameDetailsPanel';
import { buildEventRef } from '@/lib/portal/event-ref';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'game' | 'practice' | 'event' | 'other' | 'camp' | 'tournament' | 'showcase';
type FilterType = 'all' | 'game' | 'practice';
type ViewMode = 'list' | 'calendar';
type SheetChoice = 'game' | 'practice' | 'feed' | 'appearance' | null;
type PracticeMode = 'one' | 'repeating';

interface ScheduleEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  eventType: EventType;
  playerId: string | null;
  source: 'manual' | 'feed';
  teamName?: string | null;
  createdAt: string | null;
  // feedId is returned by the schedule GET for feed events and is required by
  // GameDetailsPanel to construct the stable composite event_ref (feedId:uid).
  // Without it, buildEventRef falls back to the plain uid and stats/media saved
  // from the Schedule tab use the wrong ref for TeamSnap-imported games.
  feedId?: string | null;
}

interface ExistingFeed {
  id: string;
  label: string;
  provider: string;
  playerIds: string[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Denver';

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      timeZone: TZ,
    });
  } catch { return iso; }
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: TZ,
    });
  } catch { return ''; }
}

function eventTypeLabel(t: EventType): string {
  return { game: 'Game', practice: 'Practice', event: 'Event', other: 'Other', camp: 'Camp', tournament: 'Tournament', showcase: 'Showcase' }[t] ?? t;
}

function eventTypeColor(t: EventType): { bg: string; text: string } {
  switch (t) {
    case 'game':     return { bg: 'hsl(var(--pp-navy))',       text: 'hsl(var(--pp-white))' };
    case 'practice': return { bg: 'hsl(var(--pp-blue))',       text: 'hsl(var(--pp-white))' };
    default:         return { bg: 'hsl(var(--pp-blue-light))', text: 'hsl(var(--pp-navy))' };
  }
}

/** Returns YYYY-MM-DD in America/Denver */
function localDateKey(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
  } catch { return iso.slice(0, 10); }
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function firstDayOfWeek(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TZ });
}

// ─── Shared form primitives ───────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
      {children}{required && <span className="ml-0.5" style={{ color: 'hsl(var(--destructive))' }}>*</span>}
    </label>
  );
}

const inputCls = 'w-full min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const inputStyle = {
  borderColor: 'hsl(var(--pp-border))',
  color: 'hsl(var(--pp-text))',
  background: 'hsl(var(--pp-white))',
};

// ─── Sheet backdrop + panel ───────────────────────────────────────────────────
// Backdrop click is intentionally a no-op — close only via Cancel/X or success.
// stopPropagation on the panel prevents any bubbled pointer events from
// reaching the backdrop even if a future parent adds a click handler.

function SheetBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'hsl(var(--pp-navy) / 0.5)' }}
      // Intentionally no onClick — backdrop tap must not dismiss the form.
    >
      {children}
    </div>
  );
}

function SheetPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
      style={{
        background: 'hsl(var(--pp-white))',
        maxHeight: '92dvh',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Sticky header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--pp-border))' }}
      >
        <h2
          className="text-base font-bold"
          style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>
      </div>

      {/* Scrollable body — stays scrollable with keyboard open */}
      <div className="overflow-y-auto flex-1 px-5 py-4 pb-8">
        {children}
      </div>
    </div>
  );
}

// ─── Dirty-check confirm ──────────────────────────────────────────────────────

function useDirtyClose(isDirty: boolean, onClose: () => void) {
  return useCallback(() => {
    if (!isDirty) { onClose(); return; }
    if (window.confirm('Discard unsaved changes?')) onClose();
  }, [isDirty, onClose]);
}

// ─── Game form ────────────────────────────────────────────────────────────────

function GameForm({
  playerId,
  onSaved,
  onClose,
}: {
  playerId: string;
  onSaved: (addAnother: boolean) => void;
  onClose: () => void;
}) {
  const [opponent, setOpponent] = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [homeAway, setHomeAway] = useState<'home' | 'away' | ''>('');
  const [venue, setVenue]       = useState('');
  const [notes, setNotes]       = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const isDirty = !!(opponent || date || time || venue || notes);
  const handleClose = useDirtyClose(isDirty, onClose);

  async function save(addAnother: boolean) {
    if (!date) { setErr('Date is required'); return; }
    if (!time) { setErr('Start time is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/schedule/games`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: opponent.trim() ? `vs ${opponent.trim()}` : 'Game',
            opponent: opponent.trim() || null,
            homeAway: homeAway || null,
            venue: venue.trim() || null,
            startDate: `${date}T${time}:00`,
            notes: notes.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `Save failed (${res.status})`);
      }
      onSaved(addAnother);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Opponent */}
      <div>
        <FieldLabel>Opponent</FieldLabel>
        <input
          type="text"
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          placeholder="e.g. FC Denver"
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Date — full width, never side-by-side with time */}
      <div>
        <FieldLabel required>Date</FieldLabel>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Time — full width */}
      <div>
        <FieldLabel required>Start time</FieldLabel>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Home / Away — compact row */}
      <div>
        <FieldLabel>Home / Away</FieldLabel>
        <div className="flex gap-2">
          {(['', 'home', 'away'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setHomeAway(v)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
              style={{
                background: homeAway === v ? 'hsl(var(--pp-navy))' : 'transparent',
                color: homeAway === v ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                borderColor: homeAway === v ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              }}
            >
              {v === '' ? '—' : v === 'home' ? 'Home' : 'Away'}
            </button>
          ))}
        </div>
      </div>

      {/* Optional fields toggle */}
      <button
        type="button"
        onClick={() => setShowOptional(v => !v)}
        className="flex items-center gap-1 text-xs font-medium"
        style={{ color: 'hsl(var(--pp-blue))' }}
      >
        <ChevronDown
          size={13}
          className="transition-transform"
          style={{ transform: showOptional ? 'rotate(180deg)' : 'none' }}
        />
        {showOptional ? 'Hide' : 'Show'} optional fields
      </button>

      {showOptional && (
        <div className="space-y-4">
          <div>
            <FieldLabel>Venue</FieldLabel>
            <input
              type="text"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder="Field name or address"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Uniform color, carpool, etc."
              className={`${inputCls} resize-none`}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {err && (
        <div
          className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} />
          {err}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <PpButton onClick={() => void save(false)} disabled={saving} className="w-full">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Saving…' : 'Save game'}
        </PpButton>
        <PpButton variant="outline" onClick={() => void save(true)} disabled={saving} className="w-full">
          Save and add another
        </PpButton>
        <PpButton variant="outline" onClick={handleClose} disabled={saving} className="w-full">
          Cancel
        </PpButton>
      </div>
    </div>
  );
}

// ─── Practice form ────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function PracticeForm({
  playerId,
  onSaved,
  onClose,
}: {
  playerId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [mode, setMode]         = useState<PracticeMode>('one');
  // One-off
  const [date, setDate]         = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime]   = useState('');
  const [location, setLocation] = useState('');
  // Repeating
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [seriesStart, setSeriesStart] = useState('');
  const [seriesEnd, setSeriesEnd]     = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const isDirty = mode === 'one'
    ? !!(date || startTime)
    : !!(weekdays.length || seriesStart || seriesEnd);
  const handleClose = useDirtyClose(isDirty, onClose);

  function toggleWeekday(day: number) {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  async function save() {
    setErr(null);
    if (mode === 'one') {
      if (!date)      { setErr('Date is required'); return; }
      if (!startTime) { setErr('Start time is required'); return; }
      setSaving(true);
      try {
        // Single practice → general manual-events endpoint (event_type='practice')
        const startAt = new Date(`${date}T${startTime}:00`).toISOString();
        const endAt   = endTime ? new Date(`${date}T${endTime}:00`).toISOString() : null;
        const res = await fetch('/api/parent/manual-events', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: location.trim() ? `Practice — ${location.trim()}` : 'Practice',
            startAt,
            endAt,
            allDay: false,
            location: location.trim() || null,
            eventType: 'practice',
            playerId,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
        onSaved();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    } else {
      // Repeating
      if (weekdays.length === 0) { setErr('Select at least one day of the week'); return; }
      if (!startTime)            { setErr('Start time is required'); return; }
      if (!endTime)              { setErr('End time is required'); return; }
      if (!seriesStart)          { setErr('Series start date is required'); return; }
      if (!seriesEnd)            { setErr('Series end date is required'); return; }
      if (seriesEnd < seriesStart) { setErr('End date must be after start date'); return; }
      setSaving(true);
      try {
        const res = await fetch(
          `/api/parent/players/${encodeURIComponent(playerId)}/schedule/practices`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekdays,
              startTime,
              endTime,
              startDate: seriesStart,
              endDate: seriesEnd,
              location: location.trim() || null,
              timezone: tz,
            }),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
        const result = await res.json() as { inserted?: number; skipped?: number };
        if ((result.inserted ?? 0) === 0 && (result.skipped ?? 0) > 0) {
          setErr('All occurrences already exist — no new practices were added.');
          return;
        }
        onSaved();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* One / Repeating toggle */}
      <div className="flex gap-2">
        {(['one', 'repeating'] as PracticeMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              background: mode === m ? 'hsl(var(--pp-navy))' : 'transparent',
              color: mode === m ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
              borderColor: mode === m ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            }}
          >
            {m === 'one' ? 'One practice' : 'Repeating series'}
          </button>
        ))}
      </div>

      {mode === 'one' ? (
        <>
          <div>
            <FieldLabel required>Date</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel required>Start time</FieldLabel>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>End time (optional)</FieldLabel>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </>
      ) : (
        <>
          {/* Days of week */}
          <div>
            <FieldLabel required>Days of week</FieldLabel>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className="h-9 w-11 rounded-lg text-xs font-semibold border transition-colors"
                  style={{
                    background: weekdays.includes(day) ? 'hsl(var(--pp-navy))' : 'transparent',
                    color: weekdays.includes(day) ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                    borderColor: weekdays.includes(day) ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Start / end time — stacked, never side-by-side */}
          <div>
            <FieldLabel required>Start time</FieldLabel>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel required>End time</FieldLabel>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>

          {/* Series dates — stacked */}
          <div>
            <FieldLabel required>Series start date</FieldLabel>
            <input
              type="date"
              value={seriesStart}
              onChange={e => setSeriesStart(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel required>Series end date</FieldLabel>
            <input
              type="date"
              value={seriesEnd}
              onChange={e => setSeriesEnd(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* Location — optional, shared between both modes */}
      <button
        type="button"
        onClick={() => setShowOptional(v => !v)}
        className="flex items-center gap-1 text-xs font-medium"
        style={{ color: 'hsl(var(--pp-blue))' }}
      >
        <ChevronDown
          size={13}
          className="transition-transform"
          style={{ transform: showOptional ? 'rotate(180deg)' : 'none' }}
        />
        {showOptional ? 'Hide' : 'Add'} location
      </button>

      {showOptional && (
        <div>
          <FieldLabel>Location</FieldLabel>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Practice field or address"
            className={inputCls}
            style={inputStyle}
          />
        </div>
      )}

      {err && (
        <div
          className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} />
          {err}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <PpButton onClick={() => void save()} disabled={saving} className="w-full">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Saving…' : mode === 'one' ? 'Save practice' : 'Save practice series'}
        </PpButton>
        <PpButton variant="outline" onClick={handleClose} disabled={saving} className="w-full">
          Cancel
        </PpButton>
      </div>
    </div>
  );
}

// ─── Feed setup (inline, no nested modal) ────────────────────────────────────

const PROVIDER_OPTIONS = [
  {
    value: 'teamsnap',
    label: 'TeamSnap',
    // Source: TeamSnap Help Center — "Export your TeamSnap calendar to another calendar app"
    // https://helpme.teamsnap.com/article/1012-export-your-teamsnap-calendar-to-another-calendar-app
    hint: 'In TeamSnap: open your team → Schedule → Export → "Subscribe to Calendar" → copy the webcal:// URL.',
  },
  {
    value: 'playmetrics',
    label: 'PlayMetrics',
    // Source: PlayMetrics Help Center — "How do I subscribe to my team calendar?"
    // https://help.playmetrics.com/en/articles/subscribe-to-team-calendar
    hint: 'In PlayMetrics: open your team → Schedule → Export Calendar → copy the iCal subscription URL.',
  },
  {
    value: 'other',
    label: 'Other iCal',
    hint: 'Any https:// or webcal:// iCal subscription URL (Google Calendar, Apple Calendar, Outlook, etc.).',
  },
];

interface FeedPreviewEvent {
  uid: string;
  /** Validate endpoint returns "title" not "summary" */
  title: string;
  start: string;
  location: string | null;
}

function FeedForm({
  playerId,
  onSaved,
  onClose,
}: {
  playerId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [provider, setProvider]     = useState('teamsnap');
  const [label, setLabel]           = useState('');
  const [url, setUrl]               = useState('');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated]   = useState(false);
  const [previewEvents, setPreviewEvents] = useState<FeedPreviewEvent[]>([]);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [existingFeeds, setExistingFeeds] = useState<ExistingFeed[]>([]);
  const [loadingFeeds, setLoadingFeeds]   = useState(true);
  const [reuseMode, setReuseMode]   = useState(false);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  // Subscribe = live subscription that auto-refreshes; import = one-time snapshot
  const [importMode, setImportMode] = useState<'subscribe' | 'import'>('subscribe');
  // File import state — two-step: preview then confirm
  const [importFile, setImportFile] = useState<File | null>(null);
  const [fileValidated, setFileValidated] = useState(false);
  // importPreviewEvents: populated after /import/preview; user must confirm before /import saves
  const [importPreviewEvents, setImportPreviewEvents] = useState<FeedPreviewEvent[]>([]);
  const [importPreviewCount, setImportPreviewCount] = useState<number | null>(null);
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importConfirmed, setImportConfirmed] = useState(false);

  useEffect(() => {
    fetch('/api/parent/calendar/feeds', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { feeds?: ExistingFeed[] }) => {
        const feeds = d.feeds ?? [];
        setExistingFeeds(feeds);
        const reusable = feeds.filter(f => !f.playerIds?.includes(playerId));
        if (reusable.length > 0) setReuseMode(true);
      })
      .catch(() => undefined)
      .finally(() => setLoadingFeeds(false));
  }, [playerId]);

  const isDirty = !!(url || label);
  const handleClose = useDirtyClose(isDirty, onClose);

  const selectedProvider = PROVIDER_OPTIONS.find(p => p.value === provider);
  const reusableFeeds    = existingFeeds.filter(f => !f.playerIds?.includes(playerId));
  const alreadyLinked    = existingFeeds.filter(f => f.playerIds?.includes(playerId));

  async function handleValidate() {
    if (!url.trim()) { setErr('Paste a subscription URL first.'); return; }
    setValidating(true);
    setErr(null);
    setValidated(false);
    setPreviewEvents([]);
    try {
      const res = await fetch('/api/parent/calendar/feeds/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json() as { valid?: boolean; events?: FeedPreviewEvent[]; error?: string };
      if (!res.ok || !data.valid) throw new Error(data.error ?? 'Feed validation failed.');
      setValidated(true);
      setPreviewEvents(data.events ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  }

  async function handleSaveNew() {
    if (!validated)      { setErr('Validate the feed first.'); return; }
    if (!label.trim())   { setErr('Give this feed a name.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/parent/calendar/feeds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: importMode === 'import' ? 'import' : provider, label: label.trim(), url: url.trim(), playerIds: [playerId] }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      if (data.id) {
        await fetch(`/api/parent/calendar/feeds/${data.id}/sync`, {
          method: 'POST', credentials: 'include',
        }).catch(() => undefined);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFile() {
    if (!importFile) { setErr('Select a .ics file first.'); return; }
    if (!label.trim()) { setErr('Give this import a name.'); return; }
    // Step 1: preview (no DB writes)
    if (!importConfirmed) {
      setImportPreviewing(true);
      setErr(null);
      try {
        const form = new FormData();
        form.append('file', importFile);
        const res = await fetch('/api/parent/calendar/feeds/import/preview', {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        const data = await res.json() as { eventCount?: number; events?: FeedPreviewEvent[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Preview failed');
        setImportPreviewEvents(data.events ?? []);
        setImportPreviewCount(data.eventCount ?? 0);
        setImportConfirmed(true); // show confirm step
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setImportPreviewing(false);
      }
      return;
    }
    // Step 2: confirmed — commit to DB
    setSaving(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', importFile);
      form.append('label', label.trim());
      form.append('playerIds', JSON.stringify([playerId]));
      const res = await fetch('/api/parent/calendar/feeds/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json() as { id?: string; error?: string; eventCount?: number };
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleReuseExisting() {
    if (!selectedFeedId) { setErr('Select a feed to reuse.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/parent/calendar/feeds/${encodeURIComponent(selectedFeedId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addPlayerId: playerId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to associate feed');
      await fetch(`/api/parent/calendar/feeds/${encodeURIComponent(selectedFeedId)}/sync`, {
        method: 'POST', credentials: 'include',
      }).catch(() => undefined);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to reuse feed');
    } finally {
      setSaving(false);
    }
  }

  if (loadingFeeds) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Privacy notice */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Wifi size={12} className="mt-0.5 shrink-0" />
        <p>Imports your schedule — does not connect a vendor account or sync a roster. The URL is stored encrypted.</p>
      </div>

      {/* Already linked */}
      {alreadyLinked.length > 0 && (
        <div
          className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: 'hsl(var(--pp-page-bg))', border: '1px solid hsl(var(--pp-border))' }}
        >
          <Check size={12} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-green))' }} />
          <div>
            <p className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Feed already connected</p>
            {alreadyLinked.map(f => (
              <p key={f.id} style={{ color: 'hsl(var(--pp-text-muted))' }}>{f.label}</p>
            ))}
          </div>
        </div>
      )}

      {/* Reuse / new toggle */}
      {reusableFeeds.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setReuseMode(true)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              background: reuseMode ? 'hsl(var(--pp-navy))' : 'transparent',
              color: reuseMode ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
              borderColor: reuseMode ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            }}
          >
            <Link size={11} className="inline mr-1" />
            Use existing
          </button>
          <button
            type="button"
            onClick={() => setReuseMode(false)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              background: !reuseMode ? 'hsl(var(--pp-navy))' : 'transparent',
              color: !reuseMode ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
              borderColor: !reuseMode ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            }}
          >
            <Plus size={11} className="inline mr-1" />
            Connect new
          </button>
        </div>
      )}

      {reuseMode && reusableFeeds.length > 0 ? (
        <div className="space-y-3">
          <FieldLabel>Select a feed to link to this player</FieldLabel>
          <div className="space-y-2">
            {reusableFeeds.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFeedId(f.id)}
                className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
                style={{
                  borderColor: selectedFeedId === f.id ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: selectedFeedId === f.id ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                }}
              >
                <Wifi size={14} style={{ color: 'hsl(var(--pp-navy))' }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{f.label}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{f.provider}</p>
                </div>
                {selectedFeedId === f.id && <Check size={14} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />}
              </button>
            ))}
          </div>
          {err && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
              style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />{err}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <PpButton
              onClick={() => void handleReuseExisting()}
              disabled={!selectedFeedId || saving}
              className="w-full"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Linking…</> : 'Link feed to player'}
            </PpButton>
            <PpButton variant="outline" onClick={handleClose} disabled={saving} className="w-full">
              Cancel
            </PpButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Subscribe vs import toggle */}
          <div
            className="flex rounded-xl p-0.5 gap-0.5"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <button
              type="button"
              onClick={() => { setImportMode('subscribe'); setValidated(false); setPreviewEvents([]); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: importMode === 'subscribe' ? 'hsl(var(--pp-white))' : 'transparent',
                color: importMode === 'subscribe' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
              }}
            >
              Subscribe
            </button>
            <button
              type="button"
              onClick={() => { setImportMode('import'); setValidated(false); setPreviewEvents([]); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: importMode === 'import' ? 'hsl(var(--pp-white))' : 'transparent',
                color: importMode === 'import' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
              }}
            >
              Import once
            </button>
          </div>
          <p className="text-[11px] -mt-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {importMode === 'subscribe'
              ? 'Subscribe: events update automatically each time you sync.'
              : 'Import once: takes a snapshot now. New events added later will not appear.'}
          </p>

          {/* Provider */}
          <div>
            <FieldLabel>Calendar source</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_OPTIONS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    background: provider === p.value ? 'hsl(var(--pp-navy))' : 'transparent',
                    color: provider === p.value ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                    borderColor: provider === p.value ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {selectedProvider && (
              <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {selectedProvider.hint}
              </p>
            )}
          </div>

          {/* Feed name */}
          <div>
            <FieldLabel required>Feed name</FieldLabel>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={provider === 'teamsnap' ? 'TeamSnap — Avery' : provider === 'playmetrics' ? 'PlayMetrics — Avery' : 'My iCal feed'}
              className={inputCls}
              style={inputStyle}
            />
          </div>

          {/* URL (subscribe) or file picker (import) */}
          {importMode === 'subscribe' ? (
            <div>
              <FieldLabel required>Subscription URL</FieldLabel>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setValidated(false); setPreviewEvents([]); }}
                  placeholder="https:// or webcal://"
                  className={`${inputCls} flex-1`}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => void handleValidate()}
                  disabled={validating || !url.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors disabled:opacity-50 shrink-0"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
                >
                  {validating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {validating ? 'Checking…' : 'Validate'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <FieldLabel required>Select .ics file</FieldLabel>
              <label
                className="flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors"
                style={{
                  borderColor: importFile ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: importFile ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                }}
              >
                <Upload size={14} style={{ color: 'hsl(var(--pp-navy))' }} className="shrink-0" />
                <span className="text-xs flex-1 truncate" style={{ color: importFile ? 'hsl(var(--pp-text))' : 'hsl(var(--pp-text-muted))' }}>
                  {importFile ? importFile.name : 'Choose a .ics calendar file…'}
                </span>
                <input
                  type="file"
                  accept=".ics,text/calendar,application/ics"
                  className="sr-only"
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null;
                    setImportFile(f);
                    setFileValidated(!!f);
                    setImportConfirmed(false);
                    setImportPreviewEvents([]);
                    setImportPreviewCount(null);
                    setErr(null);
                  }}
                />
              </label>
              {importFile && !importConfirmed && (
                <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {(importFile.size / 1024).toFixed(0)} KB — preview events before confirming.
                </p>
              )}
            </div>
          )}

          {/* Import preview — shown after /import/preview succeeds, before user confirms */}
          {importMode === 'import' && importConfirmed && importPreviewCount !== null && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            >
              <div className="flex items-center gap-2">
                <Check size={13} style={{ color: 'hsl(var(--pp-green))' }} />
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                  {importPreviewCount} event{importPreviewCount !== 1 ? 's' : ''} found — confirm to save
                </p>
              </div>
              {importPreviewEvents.slice(0, 5).map(ev => (
                <div key={ev.uid} className="text-xs pl-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span className="font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</span>
                  {' · '}{new Date(ev.start).toLocaleDateString()}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              ))}
              {importPreviewCount > 5 && (
                <p className="text-[11px] pl-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  +{importPreviewCount - 5} more (not shown in preview)
                </p>
              )}
              <button
                type="button"
                className="text-[11px] pl-5 underline"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
                onClick={() => { setImportConfirmed(false); setImportPreviewEvents([]); setImportPreviewCount(null); }}
              >
                Choose a different file
              </button>
            </div>
          )}

          {validated && importMode === 'subscribe' && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            >
              <div className="flex items-center gap-2">
                <Check size={13} style={{ color: 'hsl(var(--pp-green))' }} />
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                  Feed validated — {previewEvents.length} upcoming event{previewEvents.length !== 1 ? 's' : ''} found
                </p>
              </div>
              {previewEvents.slice(0, 5).map(ev => (
                <div key={ev.uid} className="text-xs pl-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span className="font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</span>
                  {' · '}{ev.start}
                  {ev.location ? ` · ${ev.location}` : ''}
                </div>
              ))}
              {previewEvents.length > 5 && (
                <p className="text-[11px] pl-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  +{previewEvents.length - 5} more
                </p>
              )}
            </div>
          )}

          {err && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
              style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />{err}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {importMode === 'subscribe' ? (
              <PpButton
                onClick={() => void handleSaveNew()}
                disabled={!validated || !label.trim() || saving}
                className="w-full"
              >
                {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Connect feed'}
              </PpButton>
            ) : (
              <PpButton
                onClick={() => void handleImportFile()}
                disabled={!fileValidated || !importFile || !label.trim() || saving || importPreviewing}
                className="w-full"
              >
                {importPreviewing
                  ? <><Loader2 size={13} className="animate-spin" /> Previewing…</>
                  : saving
                    ? <><Loader2 size={13} className="animate-spin" /> Importing…</>
                    : importConfirmed
                      ? 'Confirm import'
                      : 'Preview events'
                }
              </PpButton>
            )}
            <PpButton variant="outline" onClick={handleClose} disabled={saving} className="w-full">
              Cancel
            </PpButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unified "Add to schedule" sheet ─────────────────────────────────────────

function AddScheduleSheet({
  playerId,
  onClose,
  onSaved,
  initialChoice = null,
}: {
  playerId: string;
  onClose: () => void;
  onSaved: () => void;
  initialChoice?: SheetChoice;
}) {
  const [choice, setChoice] = useState<SheetChoice>(initialChoice);

  // When a game is saved with "add another", reset to game form (keep choice)
  function handleGameSaved(addAnother: boolean) {
    if (addAnother) {
      // Re-mount the game form by briefly clearing and restoring choice
      setChoice(null);
      requestAnimationFrame(() => setChoice('game'));
    } else {
      onSaved();
    }
  }

  const sheetTitle =
    choice === 'game'     ? 'Add game' :
    choice === 'practice' ? 'Add practice' :
    choice === 'appearance' ? 'Add upcoming event' :
    choice === 'feed'     ? 'Connect calendar feed' :
    'Add to schedule';

  // When no choice is made yet, close is always clean
  const handleClose = choice === null ? onClose : onClose;

  return (
    <SheetBackdrop>
      <SheetPanel title={sheetTitle} onClose={handleClose}>
        {choice === null && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Choose what to add to this player's schedule.
            </p>

            <button type="button" onClick={() => setChoice('appearance')} className="w-full rounded-xl border p-4 text-left" style={{borderColor:'hsl(var(--pp-border))', background:'hsl(var(--pp-card-bg))', color:'hsl(var(--pp-text))'}}>
              <strong className="block text-sm">Camp, tournament or showcase</strong><span className="block text-xs mt-1">Add an appearance, then choose whether to share it with coaches.</span>
            </button>
            {/* Game */}
            <button
              type="button"
              onClick={() => setChoice('game')}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--pp-navy))' }}
              >
                <BarChart2 size={18} style={{ color: 'hsl(var(--pp-white))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Game</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Add a single game — links to Stats &amp; Media
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </button>

            {/* Practice */}
            <button
              type="button"
              onClick={() => setChoice('practice')}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--pp-blue))' }}
              >
                <Calendar size={18} style={{ color: 'hsl(var(--pp-white))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Practice</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  One practice or a repeating weekly series
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </button>

            {/* Connect feed */}
            <button
              type="button"
              onClick={() => setChoice('feed')}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--pp-blue-light))' }}
              >
                <Wifi size={18} style={{ color: 'hsl(var(--pp-navy))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Connect calendar feed</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Import from TeamSnap, PlayMetrics, or any iCal URL
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </button>

            <PpButton variant="outline" onClick={onClose} className="w-full mt-2">
              Cancel
            </PpButton>
          </div>
        )}

        {choice === 'appearance' && <AppearanceForm playerId={playerId} onSaved={onSaved} onClose={() => setChoice(null)} />}
        {choice === 'game' && (
          <>
            <button
              type="button"
              onClick={() => setChoice(null)}
              className="flex items-center gap-1 text-xs font-medium mb-4"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              <ChevronLeft size={13} /> Back
            </button>
            <GameForm
              playerId={playerId}
              onSaved={handleGameSaved}
              onClose={() => setChoice(null)}
            />
          </>
        )}

        {choice === 'practice' && (
          <>
            <button
              type="button"
              onClick={() => setChoice(null)}
              className="flex items-center gap-1 text-xs font-medium mb-4"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              <ChevronLeft size={13} /> Back
            </button>
            <PracticeForm
              playerId={playerId}
              onSaved={onSaved}
              onClose={() => setChoice(null)}
            />
          </>
        )}

        {choice === 'feed' && (
          <>
            <button
              type="button"
              onClick={() => setChoice(null)}
              className="flex items-center gap-1 text-xs font-medium mb-4"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              <ChevronLeft size={13} /> Back
            </button>
            <FeedForm
              playerId={playerId}
              onSaved={onSaved}
              onClose={() => setChoice(null)}
            />
          </>
        )}
      </SheetPanel>
    </SheetBackdrop>
  );
}

// ─── Calendar Grid View ───────────────────────────────────────────────────────

function CalendarGrid({
  events,
  onSelectDate,
}: {
  events: ScheduleEvent[];
  onSelectDate: (dateKey: string) => void;
}) {
  const [cursor, setCursor] = useState(() => monthStart(new Date()));

  const eventsByDate = events.reduce<Record<string, ScheduleEvent[]>>((acc, e) => {
    const key = localDateKey(e.startAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const days = daysInMonth(cursor);
  const startDow = firstDayOfWeek(cursor);
  const todayKey = localDateKey(new Date().toISOString());

  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  function cellKey(day: number): string {
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${cursor.getFullYear()}-${m}-${d}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>
        <span className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
          {monthLabel(cursor)}
        </span>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100"
        >
          <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold py-1"
            style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px" style={{ background: 'hsl(var(--pp-border))' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} style={{ background: 'hsl(var(--pp-bg))' }} className="h-10" />;
          const key = cellKey(day);
          const dayEvents = eventsByDate[key] ?? [];
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => dayEvents.length > 0 && onSelectDate(key)}
              className="h-10 flex flex-col items-center justify-start pt-1 gap-0.5 transition-colors"
              style={{
                background: isToday ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                cursor: dayEvents.length > 0 ? 'pointer' : 'default',
              }}
            >
              <span
                className="text-xs font-semibold leading-none"
                style={{
                  color: isToday ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text))',
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {day}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map(e => (
                    <div
                      key={e.id}
                      className="h-1 w-1 rounded-full"
                      style={{ background: eventTypeColor(e.eventType).bg }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({
  event,
  onDelete,
  onGameDetails,
  mediaCount,
}: {
  event: ScheduleEvent;
  onDelete: (id: string) => void;
  onGameDetails?: (event: ScheduleEvent) => void;
  mediaCount?: number;
}) {
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const colors = eventTypeColor(event.eventType);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/parent/manual-events/${event.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      onDelete(event.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{ background: 'hsl(var(--pp-bg))' }}
    >
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5"
        style={{ background: colors.bg, color: colors.text }}
      >
        {eventTypeLabel(event.eventType)}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
          {event.title}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <Clock size={10} />
            {event.allDay
              ? formatEventDate(event.startAt)
              : `${formatEventDate(event.startAt)} · ${formatEventTime(event.startAt)}`}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <MapPin size={10} />
              {event.location}
            </span>
          )}
        </div>
        {event.notes && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {event.notes}
          </p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {event.source === 'feed' && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <Rss size={9} />
              {event.teamName ?? 'Calendar feed'}
            </span>
          )}
          {event.source === 'manual' && event.playerId === null && (
            <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Family event
            </span>
          )}
          {event.eventType === 'game' && onGameDetails && (
            <button
              type="button"
              onClick={() => onGameDetails(event)}
              className="flex items-center gap-0.5 text-[10px] font-semibold"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              <BarChart2 size={9} />
              Stats &amp; media
              {mediaCount != null && mediaCount > 0 && (
                <>
                  {/* Asterisk marker — visible in the event row title area */}
                  <span
                    className="ml-0.5 text-[10px] font-bold"
                    style={{ color: 'hsl(var(--pp-blue))' }}
                    aria-label={`${mediaCount} media item${mediaCount !== 1 ? 's' : ''} attached`}
                  >
                    *
                  </span>
                  {/* Count badge */}
                  <span
                    className="ml-0.5 rounded-full px-1 text-[9px] font-bold"
                    style={{ background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}
                  >
                    {mediaCount}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {event.source === 'manual' && (
        confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>Delete?</span>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
            >
              {deleting ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold border"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            aria-label="Delete event"
          >
            {deleting
              ? <Loader2 size={13} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
              : <Trash2 size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />}
          </button>
        )
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerScheduleTab({
  playerId,
  position,
}: {
  playerId: string;
  position?: string | null;
}) {
  const [events, setEvents]                   = useState<ScheduleEvent[]>([]);
  const [feedCount, setFeedCount]             = useState(0);
  const [feedEventCount, setFeedEventCount]   = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [filter, setFilter]                   = useState<FilterType>('all');
  const [view, setView]                       = useState<ViewMode>('list');
  const [showSheet, setShowSheet]             = useState(false);
  const [sheetInitialChoice, setSheetInitialChoice] = useState<SheetChoice>(null);
  const [selectedDate, setSelectedDate]       = useState<string | null>(null);
  const [syncing, setSyncing]                 = useState(false);
  const [syncMessage, setSyncMessage]         = useState<string | null>(null);
  const [gameDetailsEvent, setGameDetailsEvent] = useState<GameDetailEvent | null>(null);
  // Map from gameEventRef → count of attached media items
  const [mediaCountsByRef, setMediaCountsByRef] = useState<Map<string, number>>(new Map());

  // Track whether the sheet is open so background load() calls don't close it.
  // load() only updates events/feedCount state — it never touches showSheet.
  const sheetOpenRef = useRef(false);
  useEffect(() => { sheetOpenRef.current = showSheet; }, [showSheet]);

  const loadMediaCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/media-assignments`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { assignments?: Array<{ gameEventRef: string | null }> };
      const counts = new Map<string, number>();
      for (const a of data.assignments ?? []) {
        if (a.gameEventRef) {
          counts.set(a.gameEventRef, (counts.get(a.gameEventRef) ?? 0) + 1);
        }
      }
      setMediaCountsByRef(counts);
    } catch { /* ignore — asterisks are cosmetic */ }
  }, [playerId]);

  const load = useCallback(async () => {
    // Never set loading=true while the sheet is open — it would unmount the
    // sheet and lose unsaved form state. Only show the spinner on initial load.
    if (!sheetOpenRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/schedule`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load schedule');
      const data = await res.json() as { events: ScheduleEvent[]; feedCount: number; feedEventCount?: number };
      setEvents(data.events);
      setFeedCount(data.feedCount);
      setFeedEventCount(data.feedEventCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { load(); void loadMediaCounts(); }, [load, loadMediaCounts]);

  const syncFeeds = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const feedsRes = await fetch('/api/parent/calendar/feeds', { credentials: 'include' });
      if (!feedsRes.ok) throw new Error('Could not load feeds');
      const feedsData = await feedsRes.json() as { feeds?: Array<{ id: string; provider?: string; portalContext?: string }> };
      // Exclude import feeds — they are one-time snapshots and must not be re-synced
      const parentFeeds = (feedsData.feeds ?? []).filter(
        f => f.portalContext === 'parent' && f.provider !== 'import'
      );

      if (parentFeeds.length === 0) {
        setSyncMessage('No subscription feeds connected yet. Add a feed using "Add to schedule".');
        setSyncing(false);
        return;
      }

      let totalSynced = 0;
      let errors = 0;
      for (const feed of parentFeeds) {
        try {
          const syncRes = await fetch(`/api/parent/calendar/feeds/${feed.id}/sync`, {
            method: 'POST',
            credentials: 'include',
          });
          if (syncRes.ok) {
            const d = await syncRes.json() as { synced?: number };
            totalSynced += d.synced ?? 0;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }

      setSyncMessage(
        errors > 0
          ? `Synced ${totalSynced} events (${errors} feed${errors !== 1 ? 's' : ''} failed)`
          : `Synced ${totalSynced} event${totalSynced !== 1 ? 's' : ''} from ${parentFeeds.length} feed${parentFeeds.length !== 1 ? 's' : ''}`
      );
      // load() is safe here — sheet is not open during a manual sync
      await load();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const filtered = filter === 'all'
    ? events
    : events.filter(e => e.eventType === filter);

  const calendarFiltered = selectedDate
    ? filtered.filter(e => localDateKey(e.startAt) === selectedDate)
    : filtered;

  function handleDelete(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  const nowIso = new Date().toISOString();
  const upcoming = filtered.filter(e => e.startAt >= nowIso);
  const past     = filtered.filter(e => e.startAt < nowIso).reverse();

  if (loading) {
    return (
      <PpCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
        </div>
      </PpCard>
    );
  }

  if (error) {
    return (
      <PpCard>
        <div className="flex items-center gap-2 text-sm py-8 justify-center"
          style={{ color: 'hsl(var(--destructive))' }}>
          <AlertCircle size={16} />
          {error}
        </div>
      </PpCard>
    );
  }

  return (
    <>
      {/* Game details panel */}
      {gameDetailsEvent && (
        <GameDetailsPanel
          event={gameDetailsEvent}
          playerId={playerId}
          position={position}
          onClose={() => setGameDetailsEvent(null)}
          onSaved={() => { void load(); void loadMediaCounts(); }}
        />
      )}

      {/* Unified add-to-schedule sheet */}
      {showSheet && (
        <AddScheduleSheet
          playerId={playerId}
          onClose={() => { setShowSheet(false); setSheetInitialChoice(null); }}
          onSaved={() => { setShowSheet(false); setSheetInitialChoice(null); void load(); }}
          initialChoice={sheetInitialChoice}
        />
      )}

      <PpCard>
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <PpSectionHeading icon={<Calendar size={14} />} title="Schedule" />
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div
              className="flex rounded-lg p-0.5 gap-0.5"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <button
                type="button"
                onClick={() => { setView('list'); setSelectedDate(null); }}
                className="p-1.5 rounded-md transition-all"
                style={{
                  background: view === 'list' ? 'hsl(var(--pp-white))' : 'transparent',
                  color: view === 'list' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
                }}
                aria-label="List view"
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView('calendar')}
                className="p-1.5 rounded-md transition-all"
                style={{
                  background: view === 'calendar' ? 'hsl(var(--pp-white))' : 'transparent',
                  color: view === 'calendar' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
                }}
                aria-label="Calendar view"
              >
                <Calendar size={14} />
              </button>
            </div>

            {/* Single unified entry point */}
            <PpButton size="sm" onClick={() => setShowSheet(true)}>
              <Plus size={13} />
              Add to schedule
            </PpButton>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-4">
          <PpChip label="All"       active={filter === 'all'}      onClick={() => setFilter('all')} />
          <PpChip label="Games"     active={filter === 'game'}     onClick={() => setFilter('game')} />
          <PpChip label="Practices" active={filter === 'practice'} onClick={() => setFilter('practice')} />
        </div>

        {/* Connect team calendar prompt — shown when no feeds are connected */}
        {feedCount === 0 && events.length > 0 && (
          <div
            className="rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between gap-3"
            style={{ background: 'hsl(var(--pp-blue-light))', border: '1px solid hsl(var(--pp-border))' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Wifi size={13} style={{ color: 'hsl(var(--pp-navy))', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: 'hsl(var(--pp-navy))' }}>
                Connect a team calendar to import games and practices automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setSheetInitialChoice('feed'); setShowSheet(true); }}
              className="text-xs font-semibold shrink-0 px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              Connect
            </button>
          </div>
        )}

        {/* Feed info banner */}
        {feedCount > 0 && (
          <div
            className="rounded-xl px-3 py-2 mb-4 text-xs"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Rss size={11} />
                <span>
                  {feedCount} iCal feed{feedCount !== 1 ? 's' : ''} connected
                  {feedEventCount > 0 ? ` · ${feedEventCount} event${feedEventCount !== 1 ? 's' : ''} synced` : ' · not yet synced'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void syncFeeds()}
                disabled={syncing}
                className="flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {syncing
                  ? <Loader2 size={10} className="animate-spin" />
                  : <RefreshCw size={10} />}
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            {syncMessage && (
              <p className="mt-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {syncMessage}
              </p>
            )}
          </div>
        )}

        {/* Calendar grid */}
        {view === 'calendar' && (
          <div className="mb-4">
            <CalendarGrid events={filtered} onSelectDate={setSelectedDate} />
            {selectedDate && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-xs underline"
                  style={{ color: 'hsl(var(--pp-blue))' }}
                >
                  Show all
                </button>
              </div>
            )}
          </div>
        )}

        {/* Event list */}
        {view === 'list' ? (
          filtered.length === 0 ? (
            <div className="text-center py-10">
              <Calendar size={28} className="mx-auto mb-3 opacity-30" style={{ color: 'hsl(var(--pp-navy))' }} />
              <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                No events yet
              </p>
              <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Connect your team calendar to import games and practices automatically, or add events manually.
              </p>
              <div className="flex flex-col gap-2 items-center">
                <PpButton size="sm" onClick={() => { setSheetInitialChoice('feed'); setShowSheet(true); }}>
                  <Wifi size={13} />
                  Connect team calendar
                </PpButton>
                <button
                  type="button"
                  onClick={() => { setSheetInitialChoice(null); setShowSheet(true); }}
                  className="text-xs"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                >
                  or add events manually
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.length > 0 && (
                <>
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Upcoming ({upcoming.length})
                  </p>
                  {upcoming.map(e => (
                    <EventRow
                      key={e.id}
                      event={e}
                      onDelete={handleDelete}
                      onGameDetails={e.eventType === 'game' ? setGameDetailsEvent : undefined}
                      mediaCount={mediaCountsByRef.get(buildEventRef(e))}
                    />
                  ))}
                </>
              )}
              {past.length > 0 && (
                <>
                  <p className="text-xs font-semibold mt-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Past ({past.length})
                  </p>
                  {past.map(e => (
                    <EventRow
                      key={e.id}
                      event={e}
                      onDelete={handleDelete}
                      onGameDetails={e.eventType === 'game' ? setGameDetailsEvent : undefined}
                      mediaCount={mediaCountsByRef.get(buildEventRef(e))}
                    />
                  ))}
                </>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3 mt-2">
            {calendarFiltered.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {selectedDate ? 'No events on this day.' : 'No events match this filter.'}
              </p>
            ) : (
              calendarFiltered.map(e => (
                <EventRow
                  key={e.id}
                  event={e}
                  onDelete={handleDelete}
                  onGameDetails={e.eventType === 'game' ? setGameDetailsEvent : undefined}
                  mediaCount={mediaCountsByRef.get(buildEventRef(e))}
                />
              ))
            )}
          </div>
        )}

        {/* Media legend — only shown when at least one game has attached media */}
        {mediaCountsByRef.size > 0 && (
          <p className="text-[10px] mt-3 pt-2 border-t flex items-center gap-1" style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
            <span style={{ color: 'hsl(var(--pp-blue))' }}>*</span>
            Game has attached media — click &ldquo;Stats &amp; media&rdquo; to view or add more.
          </p>
        )}
      </PpCard>
    </>
  );
}
