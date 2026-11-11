import PodcastAudioPlayer from '@/components/portal/PodcastAudioPlayer';
/**
 * /my-soccer — Private calendar page for registered users.
 *
 * Requires a valid BetterAuth session. Unauthenticated visitors are
 * redirected to /login with a returnTo param.
 *
 * Features:
 *   - Agenda view (default) + Month view toggle
 *   - Provider / feed filter chips
 *   - Event cards with map links, overlap notices, cancelled styling
 *   - Feed management: add / replace / remove iCal subscription URLs
 *   - 15-minute auto-refresh while page is open
 *   - Account panel: change password, sign out, delete account
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSession, LogoutButton } from '@/lib/auth/auth-client';
import { my_soccer, parent_setup_gate, portal_switcher } from 'virtual:content';
import DevContentCard, { type ContentItem } from '@/components/DevContentCard';
import ShareButton from '@/components/ShareButton';
import { type PortalView } from '@/components/portal/PortalSwitcher';
import ParentOnboardingWizard from '@/components/parent/ParentOnboardingWizard';
import FanArenaProfile from '@/components/fan/FanArenaProfile';
import ArenaChooserModal from '@/components/fan/ArenaChooserModal';
import FanSourceBrowser from '@/components/fan/FanSourceBrowser';
import FanNewsstand from '@/components/fan/FanNewsstand';
import FanCommunity from '@/components/fan/FanCommunity';
import FanSectionErrorBoundary from '@/components/fan/FanSectionErrorBoundary';
import ScoresTicker from '@/components/scores/ScoresTicker';
import AmbiguousFeedAssignment, { type AmbiguousFeed } from '@/components/calendar/AmbiguousFeedAssignment';
import PpItunesDiscovery from '@/components/portal/PpItunesDiscovery';
import UnifiedFeedWall from '@/components/portal/UnifiedFeedWall';
import {
  type ScoresMatch,
  type ScoresMatchesResponse,
  type MatchStatus,
  isLive,
  statusLabel,
  scoreDisplay,
} from '@/components/scores/scores-types';
import {
  Calendar,
  List,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  MapPin,
  Clock,
  Users,
  Shield,
  LogOut,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Settings,
  Pencil,
  Tv2,
  Bookmark,
  Bell,
  CalendarPlus,
  LayoutGrid,
  Link2,
  ChevronLeft,
  ChevronRight,
  Star,
  Rss,
  Headphones,
  SlidersHorizontal,
  Radio,
  ExternalLink,
  ArrowLeftRight,
  Trophy,
  HelpCircle,
  Play,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Feed {
  id: string;
  provider: string;
  label: string | null;
  lastFetchedAt: string | null;
  lastFetchStatus: string | null;
  lastFetchError: string | null;
  eventCount: number;
  visible?: boolean;
  color?: string | null;
}

interface CalEvent {
  id: string;
  feedId: string;
  uid: string | null;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  notes: string | null;
  provider: string;
  teamName: string | null;
  eventType: string;
  status: string;
  sequence: number;
  hasOverlap: boolean;
  isPersonal?: boolean;
}

interface PersonalEvent {
  id: string;
  userId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  eventType: string;
}

interface OAuthConnection {
  provider: string;
  connectedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

interface CalConnections {
  oauth: OAuthConnection[];
  feeds: Feed[];
  configured: { google: boolean; outlook: boolean; teamsnap: boolean; playmetrics: boolean };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  teamsnap: 'TeamSnap',
  playmetrics: 'PlayMetrics',
  google: 'Google Calendar',
  google_calendar: 'Google Calendar',
  icloud: 'Apple iCloud',
  outlook: 'Outlook',
  yahoo: 'Yahoo Calendar',
  personal: 'My Events',
  other: 'Other',
};

const PROVIDER_COLORS: Record<string, string> = {
  teamsnap: 'hsl(var(--primary))',
  playmetrics: 'hsl(var(--secondary))',
  google: '#4285F4',
  google_calendar: '#4285F4',
  icloud: 'hsl(var(--muted-foreground))',
  outlook: '#0078D4',
  yahoo: 'hsl(var(--accent))',
  personal: 'hsl(var(--accent))',
  other: 'hsl(var(--muted-foreground))',
};

const FEED_COLOR_PRESETS = [
  '#22c55e','#22c5b0','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316','#06b6d4','#84cc16',
];

const TIMEZONES = [
  'America/Denver','America/Chicago','America/New_York','America/Los_Angeles',
  'America/Phoenix','America/Anchorage','Pacific/Honolulu','UTC',
];

const EVENT_TYPE_ICONS: Record<string, string> = {
  game: '⚽',
  practice: '🏃',
  event: '📅',
  other: '📌',
};

const AUTO_REFRESH_MS = 15 * 60 * 1000;

// ─── API helper ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
      credentials: 'include',
    });
    const json = await res.json() as T & { error?: string };
    if (!res.ok) return { error: (json as { error?: string }).error ?? `HTTP ${res.status}` };
    return { data: json };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}



// ─── Calendar helpers ─────────────────────────────────────────────────────────

function formatDateLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function formatTimeRange(startAt: string, endAt: string | null, allDay: boolean): string {
  if (allDay) return 'All day';
  const start = formatTime(startAt);
  if (!endAt) return start;
  const end = formatTime(endAt);
  return start === end ? start : `${start} – ${end}`;
}

function groupByDate(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = ev.startAt.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(ev);
    map.set(key, arr);
  }
  return map;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getEventColor(event: CalEvent, feedPrefs: Map<string, { color?: string | null }>): string {
  if (event.isPersonal) return PROVIDER_COLORS.personal;
  const pref = feedPrefs.get(event.feedId);
  if (pref?.color) return pref.color;
  return PROVIDER_COLORS[event.provider] ?? 'hsl(var(--muted-foreground))';
}

// ─── Calendar sub-components ──────────────────────────────────────────────────

function FeedStatusBadge({ feed }: { feed: Feed }) {
  if (!feed.lastFetchStatus) return <span className="text-xs text-muted-foreground">Pending first sync…</span>;
  if (feed.lastFetchStatus === 'ok') {
    return (
      <span className="flex items-center gap-1 text-xs text-primary">
        <CheckCircle size={12} />
        {feed.eventCount} event{feed.eventCount !== 1 ? 's' : ''} synced
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-destructive">
      <XCircle size={12} /> Sync error
    </span>
  );
}

function ReminderButton({ event, isPersonal }: { event: CalEvent; isPersonal?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const handleSet = async (minutes: number) => {
    setSaving(true); setErr('');
    const { error } = await apiFetch('/api/my-soccer/reminders', {
      method: 'POST',
      body: JSON.stringify({
        eventId: event.id,
        eventSource: isPersonal ? 'personal' : 'feed',
        eventTitle: event.title,
        eventStartAt: event.startAt,
        minutesBefore: minutes,
        channel: 'in_app',
      }),
    });
    setSaving(false);
    if (error && !error.includes('already set')) { setErr(error); return; }
    setSaved(true); setOpen(false);
    setTimeout(() => setSaved(false), 3000);
  };

  if (saved) return <span className="flex items-center gap-1 text-xs text-primary"><Bell size={11} /> Reminder set</span>;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="p-1 rounded text-muted-foreground hover:text-primary transition-colors" title="Set reminder" aria-label="Set reminder">
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-xl shadow-xl p-3 min-w-[160px]">
          <p className="text-xs font-semibold text-foreground mb-2">Remind me</p>
          {err && <p className="text-xs text-destructive mb-2">{err}</p>}
          {[{ label: '10 min before', val: 10 }, { label: '30 min before', val: 30 }, { label: '1 hour before', val: 60 }, { label: '1 day before', val: 1440 }].map(({ label, val }) => (
            <button key={val} onClick={() => handleSet(val)} className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-muted transition-colors text-foreground">{label}</button>
          ))}
          <button onClick={() => setOpen(false)} className="w-full text-left text-xs py-1 px-2 text-muted-foreground hover:text-foreground mt-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function EventCard({ event, feedLabel, feedPrefs, isPersonal, onEdit, onDelete }: {
  event: CalEvent;
  feedLabel: string;
  feedPrefs: Map<string, { color?: string | null }>;
  isPersonal?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCancelled = event.status === 'cancelled';
  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;
  const color = getEventColor(event, feedPrefs);

  return (
    <div className={`rounded-xl border p-4 transition-all ${isCancelled ? 'border-border opacity-50' : event.hasOverlap ? 'border-accent bg-accent/5' : 'border-border bg-card'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base" aria-hidden="true">{EVENT_TYPE_ICONS[event.eventType] ?? '📌'}</span>
            <span className={`font-semibold text-foreground text-sm leading-snug ${isCancelled ? 'line-through' : ''}`}>{event.title}</span>
            {isCancelled && <span className="text-xs rounded-full px-2 py-0.5 bg-destructive/10 text-destructive font-medium">Cancelled</span>}
            {event.hasOverlap && !isCancelled && (
              <span className="flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-accent/20 text-accent-foreground font-medium">
                <AlertTriangle size={10} /> Overlap
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={11} />{formatTimeRange(event.startAt, event.endAt, event.allDay)}</span>
            {event.teamName && <span className="flex items-center gap-1"><Users size={11} />{event.teamName}</span>}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">{event.location}</a> : event.location}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xs rounded-full px-2 py-0.5 font-medium" style={{ background: `${color}22`, color }}>
              {feedLabel}
            </span>
            {isPersonal && <span className="text-xs rounded-full px-2 py-0.5 bg-accent/15 text-accent-foreground font-medium">My Event</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ReminderButton event={event} isPersonal={isPersonal} />
          {isPersonal && onEdit && (
            <button onClick={onEdit} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit event"><Pencil size={13} /></button>
          )}
          {isPersonal && onDelete && (
            <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete event"><Trash2 size={13} /></button>
          )}
          {(event.description || event.notes) && (
            <button onClick={() => setExpanded((v) => !v)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>
      {expanded && (event.description || event.notes) && (
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border pt-3 whitespace-pre-line">
          {(event.description ?? event.notes ?? '').slice(0, 500)}
        </p>
      )}
    </div>
  );
}

// ─── Personal Event Modal ──────────────────────────────────────────────────────

function PersonalEventModal({ event, onSave, onClose }: {
  event?: PersonalEvent | null;
  onSave: (ev: PersonalEvent) => void;
  onClose: () => void;
}) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title ?? '');
  const [startDate, setStartDate] = useState(event?.startAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(event?.startAt?.slice(11, 16) ?? '09:00');
  const [endDate, setEndDate] = useState(event?.endAt?.slice(0, 10) ?? '');
  const [endTime, setEndTime] = useState(event?.endAt?.slice(11, 16) ?? '10:00');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [timezone, setTimezone] = useState(event?.timezone ?? 'America/Denver');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [eventType, setEventType] = useState(event?.eventType ?? 'event');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Title is required'); return; }
    const startAt = allDay ? `${startDate}T00:00:00` : `${startDate}T${startTime}:00`;
    const endAt = endDate ? (allDay ? `${endDate}T23:59:59` : `${endDate}T${endTime}:00`) : null;
    setLoading(true);
    const body = { title: title.trim(), startAt, endAt, timezone, allDay, location: location.trim() || null, notes: notes.trim() || null, eventType };
    const url = isEdit ? `/api/my-soccer/personal-events/${event!.id}` : '/api/my-soccer/personal-events';
    const method = isEdit ? 'PUT' : 'POST';
    const { data, error: err } = await apiFetch<{ event?: PersonalEvent }>(url, { method, body: JSON.stringify(body) });
    setLoading(false);
    if (err) { setError(err); return; }
    const saved: PersonalEvent = isEdit
      ? { ...event!, ...body, endAt }
      : (data?.event ?? { id: crypto.randomUUID(), userId: '', ...body, endAt });
    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      {/* Sheet slides up from bottom on mobile, centered dialog on sm+ */}
      <div
        className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-border shadow-2xl flex flex-col"
        style={{ maxHeight: 'min(92dvh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — always visible */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            {isEdit ? 'Edit Event' : 'Add Event'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close"><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <form id="add-event-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. U12 Game vs FC Denver"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* All-day + event type — stack on very narrow screens */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer shrink-0 pb-1">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="rounded border-border" />
              All day
            </label>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Event type</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="game">⚽ Game</option>
                <option value="practice">🏃 Practice</option>
                <option value="event">📅 Event</option>
                <option value="other">📌 Other</option>
              </select>
            </div>
          </div>

          {/* Start date + time — each field full-width on mobile, side-by-side when room */}
          <div className={`grid gap-3 ${!allDay ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Start date *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {!allDay && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Start time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
          </div>

          {/* End date + time */}
          <div className={`grid gap-3 ${(!allDay && endDate) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {!allDay && endDate && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dick's Sporting Goods Park"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any additional details…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
        </form>

        {/* Sticky footer — always above keyboard, never scrolls away */}
        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0 bg-card">
          <button type="submit" form="add-event-form" disabled={loading}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add event'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Calendars Modal ────────────────────────────────────────────────────

function ManageCalendarsModal({ connections, feeds, onClose, onRefresh }: {
  connections: CalConnections | null;
  feeds: Feed[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; label: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [colorPickFeedId, setColorPickFeedId] = useState<string | null>(null);
  const [localFeeds, setLocalFeeds] = useState<Feed[]>(feeds);

  useEffect(() => { setLocalFeeds(feeds); }, [feeds]);

  const handleDeleteFeed = async (feedId: string) => {
    setDeletingId(feedId);
    await apiFetch(`/api/my-soccer/feeds/${feedId}`, { method: 'DELETE' });
    setDeletingId(null);
    onRefresh();
  };

  const handleToggleVisible = async (feed: Feed) => {
    const next = !(feed.visible ?? true);
    setLocalFeeds((prev) => prev.map((f) => f.id === feed.id ? { ...f, visible: next } : f));
    await apiFetch('/api/my-soccer/feed-prefs', { method: 'POST', body: JSON.stringify({ feedId: feed.id, visible: next }) });
    onRefresh();
  };

  const handleSetColor = async (feedId: string, color: string | null) => {
    setLocalFeeds((prev) => prev.map((f) => f.id === feedId ? { ...f, color } : f));
    setColorPickFeedId(null);
    await apiFetch('/api/my-soccer/feed-prefs', { method: 'POST', body: JSON.stringify({ feedId, color }) });
    onRefresh();
  };

  const handleDisconnectOAuth = async (provider: string) => {
    await apiFetch(`/api/calendar/${provider}/disconnect`, { method: 'POST' });
    onRefresh();
  };

  const oauthConnected = connections?.oauth ?? [];
  const googleConnected = oauthConnected.some((c) => c.provider === 'google_calendar');
  const outlookConnected = oauthConnected.some((c) => c.provider === 'outlook');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-xl rounded-2xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Manage Calendars</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* OAuth connections */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Connected accounts</h3>
            <div className="space-y-2">
              {/* Google Calendar */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-background">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--brand-google-cal))' }}>G</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Google Calendar</p>
                    <p className="text-xs text-muted-foreground">{googleConnected ? 'Connected — events synced' : 'Not connected'}</p>
                  </div>
                </div>
                {googleConnected ? (
                  <button onClick={() => handleDisconnectOAuth('google')} className="text-xs text-destructive hover:opacity-80 transition border border-destructive/30 rounded-lg px-3 py-1.5">Disconnect</button>
                ) : connections?.configured.google ? (
                  <a href="/api/calendar/google/auth" className="text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 transition">Connect</a>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Not configured</span>
                )}
              </div>

              {/* Outlook */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-background">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--brand-outlook))' }}>O</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Outlook / Microsoft 365</p>
                    <p className="text-xs text-muted-foreground">{outlookConnected ? 'Connected — events synced' : 'Not connected'}</p>
                  </div>
                </div>
                {outlookConnected ? (
                  <button onClick={() => handleDisconnectOAuth('outlook')} className="text-xs text-destructive hover:opacity-80 transition border border-destructive/30 rounded-lg px-3 py-1.5">Disconnect</button>
                ) : connections?.configured.outlook ? (
                  <a href="/api/calendar/outlook/auth" className="text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 transition">Connect</a>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Not configured</span>
                )}
              </div>
            </div>
          </div>

          {/* iCal subscription feeds */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">iCal subscriptions</h3>
              {!showAddFeed && !replaceTarget && (
                <button onClick={() => setShowAddFeed(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition">
                  <Plus size={13} /> Add feed
                </button>
              )}
            </div>

            {showAddFeed && (
              <div className="mb-4 p-3 rounded-xl border border-border bg-background">
                <AddFeedForm
                  onAdded={() => { setShowAddFeed(false); onRefresh(); }}
                  onCancel={() => setShowAddFeed(false)}
                />
              </div>
            )}
            {replaceTarget && (
              <div className="mb-4 p-3 rounded-xl border border-border bg-background">
                <AddFeedForm
                  replaceId={replaceTarget.id}
                  replaceLabel={replaceTarget.label}
                  onAdded={() => { setReplaceTarget(null); onRefresh(); }}
                  onCancel={() => setReplaceTarget(null)}
                />
              </div>
            )}

            {localFeeds.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No subscription feeds yet. Paste a Google Calendar, Apple iCal, or Outlook iCal URL to subscribe.</p>
            ) : (
              <ul className="space-y-2">
                {localFeeds.map((feed) => {
                  const label = feed.label ?? PROVIDER_LABELS[feed.provider] ?? feed.provider;
                  const color = feed.color ?? PROVIDER_COLORS[feed.provider] ?? 'hsl(var(--muted-foreground))';
                  const visible = feed.visible ?? true;
                  return (
                    <li key={feed.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background group">
                      {/* Color swatch + picker */}
                      <div className="relative">
                        <button
                          onClick={() => setColorPickFeedId(colorPickFeedId === feed.id ? null : feed.id)}
                          className="w-5 h-5 rounded-full border-2 border-border hover:scale-110 transition-transform shrink-0"
                          style={{ background: color }}
                          title="Change color"
                          aria-label="Change feed color"
                        />
                        {colorPickFeedId === feed.id && (
                          <div className="absolute left-0 top-7 z-20 bg-card border border-border rounded-xl shadow-xl p-3">
                            <div className="grid grid-cols-5 gap-1.5 mb-2">
                              {FEED_COLOR_PRESETS.map((c) => (
                                <button key={c} onClick={() => handleSetColor(feed.id, c)} className="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform" style={{ background: c, borderColor: feed.color === c ? 'hsl(var(--foreground))' : 'transparent' }} aria-label={c} />
                              ))}
                            </div>
                            <button onClick={() => handleSetColor(feed.id, null)} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">Reset to default</button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${visible ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{label}</p>
                        <FeedStatusBadge feed={feed} />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleToggleVisible(feed)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title={visible ? 'Hide' : 'Show'} aria-label={visible ? 'Hide feed' : 'Show feed'}>
                          {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button onClick={() => setReplaceTarget({ id: feed.id, label })} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Replace URL" aria-label="Replace feed URL"><Link2 size={13} /></button>
                        <button onClick={() => handleDeleteFeed(feed.id)} disabled={deletingId === feed.id} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors" title="Remove" aria-label="Remove feed">
                          {deletingId === feed.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ events, feedPrefs, feedMap, onEditPersonal, onDeletePersonal }: {
  events: CalEvent[];
  feedPrefs: Map<string, { color?: string | null }>;
  feedMap: Map<string, string>;
  onEditPersonal: (ev: CalEvent) => void;
  onDeletePersonal: (ev: CalEvent) => void;
}) {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const prevWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goToday = () => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
  };

  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const eventsByDay = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = ev.startAt.slice(0, 10);
    const arr = eventsByDay.get(key) ?? [];
    arr.push(ev);
    eventsByDay.set(key, arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-1">
          <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Previous week"><ChevronLeft size={16} /></button>
          <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Next week"><ChevronRight size={16} /></button>
        </div>
        <span className="text-sm font-semibold text-foreground flex-1 text-center">{weekLabel}</span>
        <button onClick={goToday} className="text-xs border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">Today</button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = key === today.toISOString().slice(0, 10);
          return (
            <div key={key} className={`bg-background min-h-[120px] p-2 ${isToday ? 'bg-primary/5' : ''}`}>
              <div className={`text-xs font-semibold mb-2 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                <span>{day.getDate()}</span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.map((ev) => {
                  const color = getEventColor(ev, feedPrefs);
                  return (
                    <div key={ev.id} className="text-[10px] rounded px-1 py-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity" style={{ background: `${color}33`, color }} title={ev.title}>
                      {!ev.allDay && <span className="opacity-70 mr-1">{formatTime(ev.startAt)}</span>}
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail rows for days that have events */}
      {days.some((d) => (eventsByDay.get(d.toISOString().slice(0, 10)) ?? []).length > 0) && (
        <div className="mt-6 space-y-6">
          {days.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayEvents = eventsByDay.get(key) ?? [];
            if (dayEvents.length === 0) return null;
            const isToday = key === today.toISOString().slice(0, 10);
            return (
              <div key={key}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`text-xs font-semibold px-3 py-1 rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {dayEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      feedLabel={feedMap.get(ev.feedId) ?? PROVIDER_LABELS[ev.provider] ?? ev.provider}
                      feedPrefs={feedPrefs}
                      isPersonal={ev.isPersonal}
                      onEdit={ev.isPersonal ? () => onEditPersonal(ev) : undefined}
                      onDelete={ev.isPersonal ? () => onDeletePersonal(ev) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── In-app reminder toast ─────────────────────────────────────────────────────

function ReminderToast({ reminders, onDismiss }: { reminders: Array<{ id: string; eventTitle: string; eventStartAt: string; minutesBefore: number }>; onDismiss: (id: string) => void }) {
  if (reminders.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm">
      {reminders.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-xl shadow-xl p-4 flex items-start gap-3">
          <Bell size={16} className="text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{r.eventTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.minutesBefore < 60 ? `${r.minutesBefore} min` : r.minutesBefore === 60 ? '1 hour' : '1 day'} from now · {formatTime(r.eventStartAt)}
            </p>
          </div>
          <button onClick={() => onDismiss(r.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function MonthView({ events, feedPrefs, feedMap, onEditPersonal, onDeletePersonal }: {
  events: CalEvent[];
  feedPrefs: Map<string, { color?: string | null }>;
  feedMap: Map<string, string>;
  onEditPersonal: (ev: CalEvent) => void;
  onDeletePersonal: (ev: CalEvent) => void;
}) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const eventsByDay = new Map<number, CalEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.startAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      const arr = eventsByDay.get(day) ?? [];
      arr.push(ev);
      eventsByDay.set(day, arr);
    }
  }

  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Previous month">‹</button>
        <h3 className="font-semibold text-foreground">{monthLabel}</h3>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Next month">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="bg-background min-h-[60px]" />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const dayEvents = eventsByDay.get(day) ?? [];
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const isSelected = selectedDay === day;
          return (
            <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)} className={`bg-background min-h-[60px] p-1.5 text-left transition-colors hover:bg-muted/50 ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}>
              <span className={`text-xs font-medium block mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>{day}</span>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const evColor = getEventColor(ev, feedPrefs);
                  return (
                    <div key={ev.id} className="text-[10px] truncate rounded px-1 leading-4" style={{ background: `${evColor}33`, color: evColor }}>{ev.title}</div>
                  );
                })}
                {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
      {selectedDay && selectedEvents.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
          {selectedEvents.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              feedLabel={feedMap.get(ev.feedId) ?? PROVIDER_LABELS[ev.provider] ?? ev.provider}
              feedPrefs={feedPrefs}
              isPersonal={ev.isPersonal}
              onEdit={ev.isPersonal ? () => onEditPersonal(ev) : undefined}
              onDelete={ev.isPersonal ? () => onDeletePersonal(ev) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddFeedForm({ onAdded, replaceId, replaceLabel, onCancel }: { onAdded: () => void; replaceId?: string; replaceLabel?: string; onCancel: () => void }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await apiFetch('/api/my-soccer/feeds', { method: 'POST', body: JSON.stringify({ url: url.trim(), label: label.trim() || undefined, replaceId }) });
    setLoading(false);
    if (err) { setError(err); return; }
    setUrl(''); setLabel('');
    onAdded();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {replaceLabel && <p className="text-sm text-muted-foreground">Replacing <strong className="text-foreground">{replaceLabel}</strong> with a new feed URL.</p>}
      <div>
        <label htmlFor="feed-url" className="block text-xs font-medium text-muted-foreground mb-1">Calendar subscription URL</label>
        <input id="feed-url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... or webcal://..." required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        <p className="mt-1 text-xs text-muted-foreground">Supported: Google Calendar, Apple iCloud, Outlook, Yahoo</p>
      </div>
      <div>
        <label htmlFor="feed-label" className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
        <input id="feed-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. U12 Boys Red" maxLength={128} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading || !url.trim()} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin" />}
          {replaceId ? 'Replace feed' : 'Connect feed'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition">Cancel</button>
      </div>
    </form>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) { setError('New password must be at least 8 characters'); return; }
    setLoading(true);
    const { error: err } = await apiFetch('/api/my-soccer/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
    setLoading(false);
    if (err) { setError(err); return; }
    setSuccess(true);
    setTimeout(onDone, 1500);
  };

  if (success) return <p className="text-sm flex items-center gap-2 text-primary"><CheckCircle size={16} /> Password changed successfully.</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="cp-current" className="block text-xs font-medium text-muted-foreground mb-1">Current password</label>
        <div className="relative">
          <input id="cp-current" type={showCurrent ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} required className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showCurrent ? 'Hide' : 'Show'}>{showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        </div>
      </div>
      <div>
        <label htmlFor="cp-new" className="block text-xs font-medium text-muted-foreground mb-1">New password</label>
        <div className="relative">
          <input id="cp-new" type={showNext ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showNext ? 'Hide' : 'Show'}>{showNext ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">{loading && <Loader2 size={14} className="animate-spin" />}Change password</button>
        <button type="button" onClick={onDone} className="px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition">Cancel</button>
      </div>
    </form>
  );
}

function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm !== 'DELETE') { setError('Type DELETE to confirm'); return; }
    setError('');
    setLoading(true);
    const { error: err } = await apiFetch('/api/my-soccer/account', { method: 'DELETE', body: JSON.stringify({ password }) });
    setLoading(false);
    if (err) { setError(err); return; }
    navigate('/');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-destructive font-medium">This permanently deletes your account and all connected feeds. This cannot be undone.</p>
      <div>
        <label htmlFor="da-password" className="block text-xs font-medium text-muted-foreground mb-1">Your password</label>
        <input id="da-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive" />
      </div>
      <div>
        <label htmlFor="da-confirm" className="block text-xs font-medium text-muted-foreground mb-1">Type DELETE to confirm</label>
        <input id="da-confirm" type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive" />
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading || confirm !== 'DELETE'} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">{loading && <Loader2 size={14} className="animate-spin" />}Delete my account</button>
        <button type="button" onClick={onCancel} className="px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition">Cancel</button>
      </div>
    </form>
  );
}

// ─── Profile types ────────────────────────────────────────────────────────────

interface MemberProfile {
  userId: string;
  memberType: 'fan' | 'player' | 'both';
  region: string | null;
  city: string | null;
  interests: string[];
  favLeagues: string[];
  favTeams: string[];
  fanInterests: string[];
  favPublishers: string[];
  onboardingDone: boolean;
  // Fan identity (Step 3d)
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  location: string | null;
}

interface PlayerProfile {
  id: string;
  label: string | null;
  ageBand: string | null;
  ageYears: number | null;
  positions: string[];
  skillLevel: string | null;
  developmentInterests: string[];
  trainingMode: string | null;
  sortOrder: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: 'colorado',   label: 'Colorado' },
  { value: 'arizona',    label: 'Arizona' },
  { value: 'cal-south',  label: 'Southern California' },
  { value: 'cal-north',  label: 'Northern California' },
  { value: 'oregon',     label: 'Oregon' },
  { value: 'washington', label: 'Washington' },
  { value: 'nevada',     label: 'Nevada' },
];

const FAN_INTERESTS = [
  'Premier League','MLS','Champions League','USMNT','USWNT',
  'La Liga','Bundesliga','Serie A','Ligue 1','World Cup',
];

// ─── Chip selector helper ─────────────────────────────────────────────────────
// ─── Onboarding modal ─────────────────────────────────────────────────────────

// ─── Tab definitions ──────────────────────────────────────────────────────────

type DashTab = 'my-feed' | 'newsstand' | 'podcasts' | 'community' | 'calendar' | 'saved' | 'sources' | 'scores';

// ─── Club video types ─────────────────────────────────────────────────────────

interface PlClub {
  slug: string;
  name: string;
  channelSlug: string;
  channelUrl: string | null;
  verified: boolean;
  hasChannel: boolean;
  crest: string | null;
}


// ─── Video card (shared by Fan Content + For You club section) ────────────────

const TAG_LABELS: Record<string, string> = {
  highlights: 'Highlights',
  interviews: 'Interview',
  training: 'Training',
  features: 'Feature',
};

function formatPubDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  } catch { return ''; }
}

interface VideoCardProps {
  video: { id: string; title: string; publishedAt: string; thumbnail: string | null; tags: string[]; embeddable: boolean; watchUrl: string; channelName?: string; clubName?: string; matchReason?: string };
  activeId: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
}

function VideoCard({ video, activeId, onPlay, onStop }: VideoCardProps) {
  const isPlaying = activeId === video.id;
  // embedBlocked: set true when the iframe fires an error or YouTube postMessage
  // returns a non-embeddable error code (100, 101, 150, 153).
  const [embedBlocked, setEmbedBlocked] = useState(false);

  // Reset blocked state when a different video becomes active
  useEffect(() => {
    if (!isPlaying) setEmbedBlocked(false);
  }, [isPlaying]);

  // Listen for YouTube IFrame API postMessage errors
  useEffect(() => {
    if (!isPlaying) return;
    function onMessage(e: MessageEvent) {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as { event?: string; info?: number };
        if (msg.event === 'onError' && typeof msg.info === 'number') {
          // 100 = video not found, 101/150 = embedding disabled by owner, 153 = rights-holder block
          if ([100, 101, 150, 153].includes(msg.info)) {
            setEmbedBlocked(true);
          }
        }
      } catch { /* not a YouTube message */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isPlaying]);

  const canEmbed = video.embeddable && !embedBlocked;

  // Build the embed URL with origin so YouTube can identify the embedding domain.
  // origin must NOT be URL-encoded — YouTube expects a plain URL value.
  // enablejsapi=1 allows the postMessage error channel so we can detect Error 153.
  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://soccercenter.org';
  const embedSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0&enablejsapi=1&origin=${embedOrigin}&modestbranding=1`;

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-muted">
        {isPlaying && canEmbed ? (
          <iframe
            src={embedSrc}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
            onError={() => setEmbedBlocked(true)}
          />
        ) : isPlaying && embedBlocked ? (
          /* Embed blocked — clean Watch on YouTube fallback */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted px-4 text-center">
            {video.thumbnail && (
              <img src={video.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            )}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-muted-foreground opacity-60"><path d="M21.582 6.186a2.506 2.506 0 0 0-1.768-1.768C18.254 4 12 4 12 4s-6.254 0-7.814.418a2.506 2.506 0 0 0-1.768 1.768C2 7.746 2 12 2 12s0 4.254.418 5.814a2.506 2.506 0 0 0 1.768 1.768C5.746 20 12 20 12 20s6.254 0 7.814-.418a2.506 2.506 0 0 0 1.768-1.768C22 16.254 22 12 22 12s0-4.254-.418-5.814z"/><polygon points="10 15 15 12 10 9 10 15" className="fill-muted"/></svg>
              <p className="text-xs font-semibold text-foreground">Embedding disabled by rights holder</p>
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
              >
                Watch on YouTube
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
              <button type="button" onClick={onStop} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { if (activeId) onStop(); onPlay(video.id); }}
            className="absolute inset-0 w-full h-full group"
            aria-label={`Play ${video.title}`}
          >
            {video.thumbnail && (
              <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors pointer-events-none" />
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white ml-0.5"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* Tags */}
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {video.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                {TAG_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug" style={{ fontFamily: 'var(--font-heading)' }}>{video.title}</p>
        {video.matchReason && (
          <p className="text-[10px] text-primary/80 font-medium">{video.matchReason}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-[10px] text-muted-foreground">{video.clubName ?? video.channelName} · {formatPubDate(video.publishedAt)}</span>
          <div className="flex items-center gap-1.5">
            <a href={video.watchUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
              YouTube <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-none stroke-current stroke-2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <ShareButton
              url={video.watchUrl}
              text={`🎬 ${video.title}${video.clubName ? ` — ${video.clubName}` : video.channelName ? ` — ${video.channelName}` : ''}`}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Club video section (used in For You + Fan Content) ───────────────────────


// ─── League → Club → Feed (Team Videos tab) ──────────────────────────────────

// All league/competition channels available for selection.
// Competitions with club sub-channels are marked hasClubs: true.
// hasClubs is derived from channels.json — only competitions with clubs that have
// a channelId in channels.json can show a club dropdown in the video feed.
// Currently: PL (20 clubs) and LaLiga (20 clubs) have channelIds.
// Bundesliga, Ligue 1, and Serie A clubs are link-only (no channelId yet).
const LEAGUE_OPTIONS = [
  { slug: 'premier-league',    name: 'Premier League',        hasClubs: true  },
  { slug: 'laliga',            name: 'LaLiga',                hasClubs: true  },
  { slug: 'bundesliga',        name: 'Bundesliga',            hasClubs: false },
  { slug: 'ligue-1',           name: 'Ligue 1',               hasClubs: false },
  { slug: 'serie-a',           name: 'Serie A',               hasClubs: false },
  { slug: 'champions-league',  name: 'UEFA Champions League', hasClubs: false },
  { slug: 'mls',               name: 'MLS',                   hasClubs: false },
  { slug: 'nwsl',              name: 'NWSL',                  hasClubs: false },
];

// ─── Followed Video Feed ──────────────────────────────────────────────────────
// Shows videos from all followed clubs and leagues using /api/my-soccer/club-feed.
// Placed above "Browse by team" in MyFeedTab.

interface ClubVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  duration: string;
  thumbnail: string | null;
  tags: string[];
  embeddable: boolean;
  watchUrl: string;
  channelSlug: string;
  channelName: string;
  clubSlug: string;
  clubName: string;
  matchReason: string;
}

interface ClubState {
  slug: string;
  name: string;
  channelUrl: string;
  hasVideos: boolean;
  verified: boolean;
  videoCount: number;
}

interface ClubFeedResponse {
  videos: ClubVideoItem[];
  clubStates: ClubState[];
  total: number;
  isLeagueOnly: boolean;
}

function FollowedVideoFeed({
  favTeams,
  favLeagues,
}: {
  favTeams: string[];
  favLeagues: string[];
}) {
  const hasFollows = favTeams.length > 0 || favLeagues.length > 0;
  const [data, setData] = useState<ClubFeedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(9);

  // Reload whenever follows change
  useEffect(() => {
    if (!hasFollows) { setData(null); return; }
    setLoading(true);
    setError(null);
    setVisibleCount(9);
    setFilterSlug('all');
    void (async () => {
      try {
        const r = await fetch('/api/my-soccer/club-feed?limit=100', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json() as ClubFeedResponse);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load videos.');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(favTeams), JSON.stringify(favLeagues)]);

  if (!hasFollows) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Tv2 size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
        <p className="text-sm font-medium text-foreground mb-1">Follow clubs or leagues to build your video feed</p>
        <p className="text-xs text-muted-foreground">Use "Browse by team" below to find and follow clubs and leagues.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-destructive opacity-60" />
        <p className="text-sm text-destructive mb-2">{error}</p>
        <button
          type="button"
          onClick={() => { setError(null); setLoading(true); void fetch('/api/my-soccer/club-feed?limit=100', { credentials: 'include' }).then(r => r.json()).then(d => { setData(d as ClubFeedResponse); setLoading(false); }).catch(e => { setError(String(e)); setLoading(false); }); }}
          className="text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const allVideos = data?.videos ?? [];
  const clubStates = data?.clubStates ?? [];

  // Filter chips: All + one per source that has videos
  const sourcesWithVideos = clubStates.filter(s => s.hasVideos);
  const filtered = filterSlug === 'all' ? allVideos : allVideos.filter(v => v.clubSlug === filterSlug || v.channelSlug === filterSlug);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (allVideos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Tv2 size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
        <p className="text-sm text-muted-foreground">No videos available yet from your followed clubs and leagues.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Videos refresh every 4 hours. Check back soon.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Source filter chips */}
      {sourcesWithVideos.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            onClick={() => { setFilterSlug('all'); setVisibleCount(9); }}
            className="text-xs px-3 py-1.5 rounded-full border transition-colors font-medium"
            style={filterSlug === 'all'
              ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' }
              : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            All followed ({allVideos.length})
          </button>
          {sourcesWithVideos.map(s => (
            <button
              key={s.slug}
              type="button"
              onClick={() => { setFilterSlug(s.slug); setVisibleCount(9); }}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors font-medium"
              style={filterSlug === s.slug
                ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' }
                : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              {s.name} ({s.videoCount})
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((v) => (
          <div key={v.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted overflow-hidden">
              {v.thumbnail ? (
                <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tv2 size={32} className="text-muted-foreground opacity-30" />
                </div>
              )}
              {activeId === v.id && v.embeddable ? (
                <div className="absolute inset-0 bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.id}?autoplay=1`}
                    title={v.title}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveId(v.embeddable ? v.id : null)}
                  className="absolute inset-0 flex items-center justify-center group"
                  aria-label={`Play ${v.title}`}
                >
                  <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white ml-0.5"><polygon points="5,3 19,12 5,21"/></svg>
                  </span>
                </button>
              )}
              {v.duration && (
                <span className="absolute bottom-2 right-2 text-[10px] font-semibold bg-black/70 text-white rounded px-1.5 py-0.5">{v.duration}</span>
              )}
            </div>
            {/* Info */}
            <div className="p-3 flex flex-col gap-1.5 flex-1">
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{v.title}</p>
              <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 truncate max-w-[60%]">{v.clubName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
              {!v.embeddable && (
                <a
                  href={v.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  Watch on YouTube
                  <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-none stroke-current stroke-2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + 9)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-muted text-foreground transition-colors hover:bg-muted/80"
          >
            <ChevronDown size={16} />
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Publisher Video Feed ─────────────────────────────────────────────────────
// Shows videos from publisher channels (NBC Sports, CBS Sports Golazo, ESPN FC)
// that the user follows. Follow/unfollow persists to sc_member_profiles.fav_publishers.

const PUBLISHER_CHANNELS_UI = [
  { slug: 'nbc-sports',       name: 'NBC Sports',         note: 'Soccer-filtered' },
  { slug: 'cbs-sports-golazo', name: 'CBS Sports Golazo', note: null },
  { slug: 'espn-fc',          name: 'ESPN FC',             note: null },
] as const;

interface PublisherVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  channelTitle: string;
  tags: string[];
  duration?: string;
  publisherSlug: string;
  publisherName: string;
  channelUrl: string;
  watchUrl: string;
}

interface PublisherFeedResponse {
  videos: PublisherVideoItem[];
  publisherStates: { slug: string; name: string; channelUrl: string; website: string; hasVideos: boolean; videoCount: number; cachedAt: string | null }[];
  total: number;
  noFollows: boolean;
}

// ── Relative-time formatter ───────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PublisherVideoFeed({
  favPublishers,
  onFavPublishersChange: _onFavPublishersChange,
  onManageChannels,
}: {
  favPublishers: string[];
  onFavPublishersChange: (p: string[]) => void;
  onManageChannels?: () => void;
}) {
  const [data, setData] = useState<PublisherFeedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState('all');
  const [visibleCount, setVisibleCount] = useState(12);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/my-soccer/publisher-feed?limit=100', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json() as PublisherFeedResponse);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const videos = data?.videos ?? [];
  const filtered = filterSlug === 'all' ? videos : videos.filter(v => v.publisherSlug === filterSlug);
  const visible = filtered.slice(0, visibleCount);
  const followedCount = favPublishers.length;

  return (
    <div className="space-y-4">
      {followedCount === 0 && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">No video channels followed yet.</p>
          {onManageChannels && (
            <button type="button" onClick={onManageChannels} className="text-xs text-primary hover:underline shrink-0">
              Manage channels →
            </button>
          )}
        </div>
      )}

      {followedCount > 0 && loading && (
        <p className="text-sm text-muted-foreground">Loading publisher videos…</p>
      )}

      {followedCount > 0 && !loading && error && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Could not load publisher videos.</p>
          <button type="button" onClick={() => { void load(); }} className="text-xs text-primary hover:underline">Retry</button>
        </div>
      )}

      {followedCount > 0 && !loading && !error && videos.length === 0 && (
        <p className="text-sm text-muted-foreground">No videos cached yet — check back in a few minutes.</p>
      )}

      {followedCount > 0 && !loading && !error && videos.length > 0 && (
        <>
          {/* Filter chips */}
          {favPublishers.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilterSlug('all')}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  background: filterSlug === 'all' ? 'hsl(var(--primary))' : 'transparent',
                  color: filterSlug === 'all' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  borderColor: filterSlug === 'all' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                }}
              >
                All ({videos.length})
              </button>
              {PUBLISHER_CHANNELS_UI.filter(p => favPublishers.includes(p.slug)).map(pub => {
                const count = videos.filter(v => v.publisherSlug === pub.slug).length;
                return (
                  <button
                    key={pub.slug}
                    type="button"
                    onClick={() => setFilterSlug(pub.slug)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={{
                      background: filterSlug === pub.slug ? 'hsl(var(--primary))' : 'transparent',
                      color: filterSlug === pub.slug ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                      borderColor: filterSlug === pub.slug ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    }}
                  >
                    {pub.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Video grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(v => (
              <a
                key={v.id}
                href={v.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg overflow-hidden border border-border bg-card hover:border-primary/50 transition-colors"
              >
                <div className="relative aspect-video bg-muted overflow-hidden">
                  {v.thumbnail ? (
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play size={32} className="text-muted-foreground opacity-40" />
                    </div>
                  )}
                  {v.duration && (
                    <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/80 text-white px-1 py-0.5 rounded">
                      {v.duration}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-10 h-10 rounded-full bg-black/70 flex items-center justify-center">
                      <Play size={18} className="text-white ml-0.5" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug mb-1.5">{v.title}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-primary">{v.publisherName}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(v.publishedAt)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {filtered.length > visibleCount && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount(c => c + 12)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-muted text-foreground transition-colors hover:bg-muted/80"
              >
                <ChevronDown size={16} />
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface LeagueClubFeedVideo {
  id: string;
  title: string;
  publishedAt: string;
  duration: string;
  thumbnail: string | null;
  tags: string[];
  embeddable: boolean;
  watchUrl: string;
}

interface LeagueClubFeedResponse {
  videos: LeagueClubFeedVideo[];
  total: number;
  hasMore: boolean;
  channelName: string;
  channelUrl: string;
  status: 'ready' | 'empty' | 'error';
}

interface LeagueClub {
  slug: string;
  name: string;
  channelSlug: string;
  channelUrl: string | null;
  hasChannel: boolean;
}

function LeagueClubFeed({
  favTeams,
  onFavTeamsChange,
  favLeagues,
  onFavLeaguesChange,
}: {
  favTeams: string[];
  onFavTeamsChange: (t: string[]) => void;
  favLeagues: string[];
  onFavLeaguesChange: (l: string[]) => void;
}) {
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedClub, setSelectedClub] = useState('');

  const [clubs, setClubs] = useState<LeagueClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);

  const [feedData, setFeedData] = useState<LeagueClubFeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const [activeId, setActiveId] = useState<string | null>(null);

  const leagueMeta = LEAGUE_OPTIONS.find((l) => l.slug === selectedLeague) ?? null;

  useEffect(() => {
    if (!selectedLeague || !leagueMeta?.hasClubs) { setClubs([]); return; }
    setClubsLoading(true);
    void fetch(`/api/my-soccer/league-clubs?competition=${encodeURIComponent(selectedLeague)}`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ clubs: LeagueClub[] }>)
      .then((d) => { setClubs(d.clubs.filter((c) => c.hasChannel)); setClubsLoading(false); })
      .catch(() => setClubsLoading(false));
  }, [selectedLeague, leagueMeta?.hasClubs]);

  const channelSlug: string = selectedLeague ? (selectedClub || selectedLeague) : '';

  useEffect(() => {
    if (!channelSlug) { setFeedData(null); return; }
    setFeedLoading(true);
    setFeedError(null);
    setVisibleCount(6);
    setActiveId(null);
    void (async () => {
      try {
        const r = await fetch(
          `/api/my-soccer/league-club-feed?slug=${encodeURIComponent(channelSlug)}&limit=50`,
          { credentials: 'include', headers: { Accept: 'application/json' } }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setFeedData(await r.json() as LeagueClubFeedResponse);
      } catch (e) {
        setFeedError(e instanceof Error ? e.message : 'Could not load videos. Please try again.');
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [channelSlug]);

  const handleLeagueChange = (slug: string) => {
    setSelectedLeague(slug); setSelectedClub(''); setFeedData(null); setFeedError(null); setActiveId(null);
  };
  const handleClubChange = (slug: string) => {
    setSelectedClub(slug); setFeedData(null); setFeedError(null); setActiveId(null);
  };

  const showClubSelector = !!(leagueMeta?.hasClubs && clubs.length > 0);
  const isFavClub = (slug: string) => favTeams.includes(slug);
  const toggleFavClub = (slug: string) => {
    onFavTeamsChange(isFavClub(slug) ? favTeams.filter((s) => s !== slug) : [...favTeams, slug]);
  };
  const isFavLeague = (slug: string) => favLeagues.includes(slug);
  const toggleFavLeague = (slug: string) => {
    onFavLeaguesChange(isFavLeague(slug) ? favLeagues.filter((s) => s !== slug) : [...favLeagues, slug]);
  };

  const videos = feedData?.videos ?? [];
  const visible = videos.slice(0, visibleCount);
  const hasMore = visibleCount < videos.length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex flex-col gap-1 w-full sm:w-64">
          <label htmlFor="tv-league" className="text-xs font-medium text-muted-foreground">Choose a league or competition</label>
          <select
            id="tv-league"
            value={selectedLeague}
            onChange={(e) => handleLeagueChange(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Choose a league…</option>
            {LEAGUE_OPTIONS.map((l) => (
              <option key={l.slug} value={l.slug}>{l.name}</option>
            ))}
          </select>
        </div>

        {(showClubSelector || clubsLoading) && (
          <div className="flex flex-col gap-1 w-full sm:w-64">
            <label htmlFor="tv-club" className="text-xs font-medium text-muted-foreground">Choose a club (optional)</label>
            <select
              id="tv-club"
              value={selectedClub}
              onChange={(e) => handleClubChange(e.target.value)}
              disabled={clubsLoading}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">{leagueMeta?.name} official channel</option>
              {clubs.map((c) => (
                <option key={c.slug} value={c.channelSlug}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedLeague && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Tv2 size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Select a league above to see official videos.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Premier League and LaLiga also let you browse individual club channels.</p>
        </div>
      )}

      {feedLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {feedError && !feedLoading && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <AlertTriangle size={28} className="mx-auto mb-3 text-destructive opacity-60" />
          <p className="text-sm text-destructive">{feedError}</p>
          <p className="text-xs text-muted-foreground mt-1">This channel may not have cached videos yet. Videos refresh every 4 hours.</p>
        </div>
      )}

      {!feedLoading && !feedError && feedData && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                {feedData.channelName}
              </h3>
              {/* League follow button — shown when viewing a league channel (no club selected) */}
              {selectedLeague && !selectedClub && (
                <button
                  type="button"
                  onClick={() => toggleFavLeague(selectedLeague)}
                  className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors"
                  style={
                    isFavLeague(selectedLeague)
                      ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' }
                      : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                  }
                >
                  <Bookmark size={11} />
                  {isFavLeague(selectedLeague) ? 'Following ✓' : 'Follow league'}
                </button>
              )}
              {/* Club follow button — shown when a specific club is selected */}
              {selectedClub && (
                <button
                  type="button"
                  onClick={() => toggleFavClub(selectedClub)}
                  className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors"
                  style={
                    isFavClub(selectedClub)
                      ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.1)' }
                      : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                  }
                >
                  <Bookmark size={11} />
                  {isFavClub(selectedClub) ? 'Following ✓' : 'Follow club'}
                </button>
              )}
            </div>
            <a
              href={feedData.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Official YouTube channel
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>

          {feedData.status === 'empty' || videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <Tv2 size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No videos cached yet for this channel.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Videos refresh every 4 hours. Check back soon, or watch directly on YouTube.</p>
              <a href={feedData.channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-4 text-xs text-primary hover:underline">
                Watch on YouTube <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-none stroke-current stroke-2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {visible.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={{ ...v, tags: v.tags as string[] }}
                    activeId={activeId}
                    onPlay={setActiveId}
                    onStop={() => setActiveId(null)}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 6)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-muted text-foreground transition-colors hover:bg-muted/80"
                  >
                    <ChevronDown size={16} />
                    Load more ({videos.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── News Feed Panel ──────────────────────────────────────────────────────────
// Shows followed news sources with follow/unfollow. Clearly distinguishes
// RSS-connected sources from link-only sources.

// ── RSS item type (mirrors server response) ───────────────────────────────────
interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  isoDate: string | null;
  description: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  duration: string | null;
  imageUrl: string | null;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── News source row with inline article list ──────────────────────────────────
// ─── News content wall ────────────────────────────────────────────────────────

// ─── My Feed tab ─────────────────────────────────────────────────────────────

function MyFeedTab({
  favTeams,
  onFavTeamsChange,
  favLeagues,
  onFavLeaguesChange,
  favPublishers,
  onFavPublishersChange,
  onNavigateToControls,
}: {
  favTeams: string[];
  onFavTeamsChange: (t: string[]) => void;
  favLeagues: string[];
  onFavLeaguesChange: (l: string[]) => void;
  favPublishers: string[];
  onFavPublishersChange: (p: string[]) => void;
  onNavigateToControls: () => void;
}) {
  // Track the UnifiedFeedWall's active type filter so we can show/hide
  // the right contextual panel below the feed wall:
  //   '' | 'video'   → league/club highlights browser
  //   'podcast'      → podcast Following/Discover panel
  //   'article'      → nothing extra
  const [feedTypeFilter, setFeedTypeFilter] = useState('');
  const showLeagueClubBrowser = feedTypeFilter === '' || feedTypeFilter === 'video';
  const showPodcastPanel = feedTypeFilter === 'podcast';

  return (
    <div className="space-y-8">
      {/* Unified followed-source feed with All / Videos / Articles / Podcasts chips */}
      <UnifiedFeedWall
        onNavigateToControls={onNavigateToControls}
        onTypeFilterChange={setFeedTypeFilter}
      />

      {/* Personalized video feed from followed clubs and leagues */}
      {showLeagueClubBrowser && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>From your followed teams &amp; leagues</h3>
          </div>
          <FollowedVideoFeed favTeams={favTeams} favLeagues={favLeagues} />
        </div>
      )}

      {/* League → Club → Team video browser — shown for All and Videos filters */}
      {showLeagueClubBrowser && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Browse by team</h3>
            <span className="text-xs text-muted-foreground">Follow clubs and leagues to add them to your feed</span>
          </div>
          <LeagueClubFeed
            favTeams={favTeams}
            onFavTeamsChange={onFavTeamsChange}
            favLeagues={favLeagues}
            onFavLeaguesChange={onFavLeaguesChange}
          />
        </div>
      )}

      {/* Publisher video feed — shown for All and Videos filters */}
      {showLeagueClubBrowser && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Publisher videos</h3>
              <p className="text-xs text-muted-foreground">NBC Sports · CBS Sports Golazo · ESPN FC</p>
            </div>
            {favPublishers.length === 0 && (
              <button
                type="button"
                onClick={onNavigateToControls}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Manage channels →
              </button>
            )}
          </div>
          <PublisherVideoFeed
            favPublishers={favPublishers}
            onFavPublishersChange={onFavPublishersChange}
            onManageChannels={onNavigateToControls}
          />
        </div>
      )}

      {/* Podcast discovery panel — shown when Podcasts chip is active */}
      {showPodcastPanel && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Podcasts</h3>
            <span className="text-xs text-muted-foreground">Follow, discover, and listen</span>
          </div>
          <PodcastsTab />
        </div>
      )}
    </div>
  );
}

// ─── Podcasts & Media tab ─────────────────────────────────────────────────────

interface MediaSource {
  id: string;
  label: string;
  url: string | null;
  format: string | null;
  authority: string | null;
  scope: string | null;
  integrationStatus: string | null;
  connectorEnabled: boolean;
  notes: string | null;
  isFollowing: boolean;
}

// ── Podcast episode player ────────────────────────────────────────────────────
function PodcastSourceCard({ source, onToggleFollow, toggling }: {
  source: MediaSource;
  onToggleFollow: (s: MediaSource) => void;
  toggling: Set<string>;
}) {
  const isRss = source.integrationStatus === 'rss' && source.connectorEnabled;
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<RssItem[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [epError, setEpError] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  async function loadEpisodes() {
    if (!isRss) return;
    setEpLoading(true);
    setEpError(null);
    try {
      const r = await fetch(`/api/my-soccer/rss-feed?sourceId=${encodeURIComponent(source.id)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { items: RssItem[]; warning?: string };
      if (d.warning) setEpError(d.warning);
      setEpisodes(d.items ?? []);
    } catch (e) {
      setEpError(e instanceof Error ? e.message : 'Failed to load');
    }
    setEpLoading(false);
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadEpisodes();
    if (!next) setPlayingUrl(null);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Source header */}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Radio size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{source.label}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                {isRss ? 'RSS' : 'Link only'}
              </span>
              {source.authority && (
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                  source.authority === 'official' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {source.authority === 'official' ? 'Official' : source.authority === 'media' ? 'Media' : 'Fan'}
                </span>
              )}
            </div>
          </div>
        </div>

        {source.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{source.notes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto">
          <button
            type="button"
            onClick={() => onToggleFollow(source)}
            disabled={toggling.has(source.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              source.isFollowing
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-muted text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {toggling.has(source.id) ? <Loader2 size={12} className="animate-spin" />
              : source.isFollowing ? <CheckCircle size={12} /> : <Plus size={12} />}
            {source.isFollowing ? my_soccer.podcasts.followingLabel : my_soccer.podcasts.followLabel}
          </button>
          {isRss && (
            <button
              type="button"
              onClick={handleExpand}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                expanded
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Headphones size={11} />
              {expanded ? 'Hide episodes' : 'Listen / episodes'}
            </button>
          )}
          {!isRss && source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={11} />
              {my_soccer.podcasts.visitLabel}
            </a>
          )}
        </div>
      </div>

      {/* Episode list */}
      {expanded && isRss && (
        <div className="border-t border-border">
          {epLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {epError && (
            <p className="px-4 py-4 text-xs text-muted-foreground">Episode status: {epError} <button type="button" className="min-h-11 underline" onClick={() => void loadEpisodes()}>Retry episodes</button></p>
          )}
          {!epLoading && !epError && episodes.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted-foreground">No episodes found in this feed.</p>
          )}
          {!epLoading && episodes.map((ep, i) => {
            const isPlaying = playingUrl === ep.enclosureUrl;
            const hasAudio = !!ep.enclosureUrl && (ep.enclosureType?.startsWith('audio/') || ep.enclosureUrl.match(/\.(mp3|m4a|ogg|aac|wav)(\?|$)/i));
            return (
              <div key={i} className="border-b border-border/50 last:border-0">
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Play/pause button */}
                  {hasAudio ? (
                    <button
                      type="button"
                      onClick={() => setPlayingUrl(isPlaying ? null : ep.enclosureUrl!)}
                      className={`shrink-0 mt-0.5 min-w-11 min-h-11 px-2 gap-1 rounded-lg flex items-center justify-center transition-colors ${
                        isPlaying ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                      aria-label={isPlaying ? 'Close episode player' : 'Open episode player'}
                    >
                      <span className="text-xs">{isPlaying ? 'Close' : 'Listen'}</span>
                      {isPlaying ? (
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current ml-0.5"><polygon points="5,3 19,12 5,21"/></svg>
                      )}
                    </button>
                  ) : (
                    <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                      <Headphones size={12} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">{ep.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {ep.isoDate && <span className="text-[10px] text-muted-foreground">{formatRelativeDate(ep.isoDate)}</span>}
                      {ep.duration && <span className="text-[10px] text-muted-foreground">{ep.duration}</span>}
                      {!hasAudio && ep.link && (
                        <a href={ep.link} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                          <ExternalLink size={9} /> Listen externally
                        </a>
                      )}
                    </div>
                    {ep.description && !isPlaying && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{ep.description}</p>
                    )}
                  </div>
                </div>
                {/* Inline audio player */}
                {isPlaying && ep.enclosureUrl && (
                  <div className="px-4 pb-3">
                    <PodcastAudioPlayer src={ep.enclosureUrl} title={ep.title} onEnded={() => setPlayingUrl(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PodcastsTab() {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // followingFilter — filters the Following tab only; never sent to iTunes
  const [followingFilter, setFollowingFilter] = useState('');
  // discoveryQuery — drives iTunes search in the Discover tab
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [activeView, setActiveView] = useState<'following' | 'discover'>('following');
  const [showImport, setShowImport] = useState(false);
  const discoveryInputRef = useRef<HTMLInputElement>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const loadSources = async () => {
    try {
      const r = await fetch('/api/my-soccer/media-sources?format=podcast', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { sources: MediaSource[] };
      setSources(d.sources ?? []);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  useEffect(() => { void loadSources(); }, []);

  async function toggleFollow(source: MediaSource) {
    if (toggling.has(source.id)) return;
    setToggling((s) => new Set([...s, source.id]));
    const action = source.isFollowing ? 'unfollow' : 'follow';
    setSources((prev) => prev.map((s) => s.id === source.id ? { ...s, isFollowing: !s.isFollowing } : s));
    try {
      await fetch('/api/my-soccer/following', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: source.id, entityType: 'source', action }),
      });
    } catch { /* revert on error */ }
    setToggling((s) => { const n = new Set(s); n.delete(source.id); return n; });
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true); setImportError(''); setImportSuccess('');
    try {
      const r = await fetch('/api/my-soccer/podcast-import', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: importUrl.trim() }),
      });
      const d = await r.json() as { ok: boolean; error?: string; source?: { id: string; label: string } };
      if (!d.ok) {
        setImportError(d.error ?? 'Import failed');
      } else {
        setImportSuccess(`"${d.source?.label ?? 'Podcast'}" added and followed.`);
        setImportUrl('');
        await loadSources();
        if (d.source?.id) {
          await fetch('/api/my-soccer/following', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityId: d.source.id, entityType: 'source', action: 'follow' }),
          });
          setSources(prev => prev.map(s => s.id === d.source!.id ? { ...s, isFollowing: true } : s));
        }
        setTimeout(() => setImportSuccess(''), 5000);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Network error');
    }
    setImporting(false);
  }

  const filterFollowed = (list: MediaSource[]) => {
    if (!followingFilter.trim()) return list;
    const q = followingFilter.toLowerCase();
    return list.filter(s => (s.label ?? '').toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q));
  };

  const followed = sources.filter(s => s.isFollowing);
  const catalog = sources.filter(s => !s.isFollowing);
  const displayFollowed = filterFollowed(followed);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-muted-foreground" /></div>;

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-14 text-center">
        <AlertTriangle size={40} className="mx-auto mb-4 text-destructive opacity-60" />
        <p className="text-base font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Could not load sources</p>
        <p className="text-sm text-muted-foreground">{fetchError === 'HTTP 401' ? 'Session expired — please sign out and back in.' : `Error: ${fetchError}`}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Action buttons row ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Following filter — only shown in Following view */}
        {activeView === 'following' && (
          <div className="relative flex-1">
            <input
              type="search"
              value={followingFilter}
              onChange={e => setFollowingFilter(e.target.value)}
              placeholder="Search followed podcasts…"
              className="w-full rounded-xl border border-border bg-muted/40 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        )}
        {/* Search iTunes — switches to Discover and focuses its search field */}
        <button
          type="button"
          onClick={() => {
            setActiveView('discover');
            setTimeout(() => discoveryInputRef.current?.focus(), 50);
          }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
          style={{ background: 'hsl(var(--itunes-blue))', color: 'hsl(var(--itunes-blue-foreground))' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13v6l5-3-5-3z"/>
          </svg>
          Search iTunes
        </button>
        <button
          type="button"
          onClick={() => { setShowImport(v => !v); setImportError(''); setImportSuccess(''); }}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors shrink-0 ${
            showImport ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Rss size={14} />
          Add by RSS URL
        </button>
      </div>

      {/* RSS import form */}
      {showImport && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Add podcast by RSS feed URL</p>
            <p className="text-xs text-muted-foreground">Paste any public podcast RSS or Atom feed URL. The show is added to your catalog and auto-followed.</p>
          </div>
          <form onSubmit={e => void handleImport(e)} className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://feeds.example.com/podcast.rss"
              required
              className="flex-1 min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={importing || !importUrl.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 shrink-0"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {importing ? 'Checking…' : 'Add'}
            </button>
          </form>
          {importError && <p className="text-xs text-destructive flex items-center gap-1.5"><XCircle size={12} /> {importError}</p>}
          {importSuccess && <p className="text-xs text-primary flex items-center gap-1.5"><CheckCircle size={12} /> {importSuccess}</p>}
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 rounded-xl bg-muted/50 p-1 w-fit">
        {(['following', 'discover'] as const).map(v => (
          <button key={v} type="button" onClick={() => setActiveView(v)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${activeView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {v === 'following' ? `Following (${followed.length})` : `Discover${discoveryQuery.trim() ? ' · iTunes' : ` (${catalog.length})`}`}
          </button>
        ))}
      </div>

      {/* Following */}
      {activeView === 'following' && (
        displayFollowed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Headphones size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-semibold text-foreground mb-1">
              {followingFilter ? 'No followed podcasts match your search' : my_soccer.podcasts.emptyHeading}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {followingFilter ? 'Try a different search term.' : 'Follow podcasts from the Discover tab, or add one by RSS URL above.'}
            </p>
            {!followingFilter && (
              <button type="button" onClick={() => setActiveView('discover')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                Browse catalog →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayFollowed.map(source => (
              <PodcastSourceCard key={source.id} source={source} onToggleFollow={toggleFollow} toggling={toggling} />
            ))}
          </div>
        )
      )}

      {/* Discover — dedicated iTunes search field + results */}
      {activeView === 'discover' && (
        <div className="space-y-4">
          {/* Dedicated discovery search field */}
          <div className="relative">
            <input
              ref={discoveryInputRef}
              type="search"
              value={discoveryQuery}
              onChange={e => setDiscoveryQuery(e.target.value)}
              placeholder="Search iTunes for any podcast…"
              className="w-full rounded-xl border border-border bg-muted/40 pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          {discoveryQuery.trim() ? (
            <PpItunesDiscovery
              query={discoveryQuery}
              onFollowed={(_sid, label) => {
                void loadSources();
                setImportSuccess(`"${label}" added and followed.`);
                setTimeout(() => setImportSuccess(''), 5000);
              }}
            />
          ) : (
            catalog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Radio size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-semibold text-foreground mb-1">
                  You&apos;re following all available podcasts
                </p>
                <p className="text-xs text-muted-foreground">
                  Search above to find more shows on iTunes, or add a podcast by RSS URL.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map(source => (
                  <PodcastSourceCard key={source.id} source={source} onToggleFollow={toggleFollow} toggling={toggling} />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Controls tab ─────────────────────────────────────────────────────────────

interface ControlsTabProps {
  profile: MemberProfile;
  playerProfiles: PlayerProfile[];
  plClubs: PlClub[];
  onProfileSaved: (p: MemberProfile) => void;
}

// Catalog team entry (from /api/catalog/teams)
interface CatalogClub {
  importKey: string;
  displayName: string;
  competition?: string; // comp slug derived from byCompetition key
}

function ControlsTab({ profile, playerProfiles: _playerProfiles, plClubs: _plClubs, onProfileSaved }: ControlsTabProps) {
  const [region, setRegion] = useState(profile.region ?? '');
  const [fanInterests, setFanInterests] = useState<string[]>(profile.fanInterests ?? []);
  const [favTeams, setFavTeams] = useState<string[]>(profile.favTeams ?? []);
  const [favLeagues, setFavLeagues] = useState<string[]>(profile.favLeagues ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Catalog clubs from /api/catalog/teams
  const [catalogClubs, setCatalogClubs] = useState<CatalogClub[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [clubSearch, setClubSearch] = useState('');

  // Notification prefs — not yet persisted; toggles removed from UI
  // const [notifVideos, setNotifVideos] = useState(false);
  // const [notifRecommended, setNotifRecommended] = useState(false);

  // Load catalog clubs
  useEffect(() => {
    if (catalogLoaded) return;
    setCatalogLoaded(true);
    void fetch('/api/catalog/teams', { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{
        byCompetition: Record<string, Array<{ importKey: string; displayName: string }>>;
        teams: { nationalTeams: Array<{ importKey: string; displayName: string }> };
      }> : Promise.reject(r.status))
      .then(data => {
        const clubs: CatalogClub[] = [];
        const seenKeys = new Set<string>();
        for (const [compKey, teams] of Object.entries(data.byCompetition)) {
          const compSlug = compKey.replace(/^comp:/, '');
          for (const t of teams) {
            // Deduplicate by importKey — a team may appear in multiple competitions
            // (e.g. Arsenal in PL + CL). Only add the first occurrence.
            if (seenKeys.has(t.importKey)) continue;
            seenKeys.add(t.importKey);
            clubs.push({ importKey: t.importKey, displayName: t.displayName, competition: compSlug });
          }
        }
        // Add national teams (already unique by importKey in the catalog)
        for (const t of data.teams.nationalTeams) {
          if (seenKeys.has(t.importKey)) continue;
          seenKeys.add(t.importKey);
          clubs.push({ importKey: t.importKey, displayName: t.displayName });
        }
        setCatalogClubs(clubs.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      })
      .catch(() => { /* non-fatal — catalog may not be seeded yet */ });
  }, [catalogLoaded]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const body = { memberType: 'fan' as const, region: region || null, fanInterests, favTeams, favLeagues };
    const { data } = await apiFetch<MemberProfile>('/api/my-soccer/profile', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (data) {
      onProfileSaved({ ...profile, ...body });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const toggleInterest = (val: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  };  return (
    <div className="space-y-6 max-w-2xl">
      {/* Region */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
          {my_soccer.controls.regionHeading}
        </p>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Select a region…</option>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Fan interests */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
          {my_soccer.controls.interestsHeading}
        </p>
        <p className="text-xs text-muted-foreground mb-3">{my_soccer.controls.interestsBody}</p>
        <div className="flex flex-wrap gap-2">
          {FAN_INTERESTS.map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => toggleInterest(interest, fanInterests, setFanInterests)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                fanInterests.includes(interest)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40'
              }`}
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      {/* Teams — catalog-backed multi-competition picker */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Followed Teams
          </p>
          {favTeams.length > 0 && (
            <span className="text-xs text-muted-foreground">{favTeams.length} followed</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Select teams to follow — their videos will appear in your My Feed.
        </p>
        {/* Currently followed chips */}
        {favTeams.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-border">
            {favTeams.map(key => {
              const club = catalogClubs.find(c => c.importKey === key);
              const label = club?.displayName ?? key.replace(/^(club:|nt:|pro:|comp:)/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFavTeams(favTeams.filter(t => t !== key))}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border bg-primary text-primary-foreground border-primary hover:opacity-80 transition-opacity"
                  title={`Unfollow ${label}`}
                >
                  {label}
                  <X size={10} />
                </button>
              );
            })}
          </div>
        )}
        {/* Search */}
        <input
          type="text"
          value={clubSearch}
          onChange={e => setClubSearch(e.target.value)}
          placeholder="Search clubs and national teams…"
          className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {catalogClubs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Loading catalog…</p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {catalogClubs
              .filter(c => !clubSearch || c.displayName.toLowerCase().includes(clubSearch.toLowerCase()))
              .filter(c => !favTeams.includes(c.importKey)) // only show unfollowed in picker
              .slice(0, 60)
              .map(club => (
                <button
                  key={club.importKey}
                  type="button"
                  onClick={() => setFavTeams([...favTeams, club.importKey])}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold border transition-all bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                >
                  + {club.displayName}
                </button>
              ))}
          </div>
        )}
        {catalogClubs.length > 0 && !clubSearch && (
          <p className="text-[10px] text-muted-foreground mt-2 opacity-70">
            Showing clubs from Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, and national teams.
          </p>
        )}
      </div>

      {/* Leagues — follow official league channels for their video feed */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Followed Leagues
          </p>
          {favLeagues.length > 0 && (
            <span className="text-xs text-muted-foreground">{favLeagues.length} followed</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Follow leagues to add their official channel videos to your feed.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEAGUE_OPTIONS.map(league => {
            const isFollowed = favLeagues.includes(league.slug);
            return (
              <button
                key={league.slug}
                type="button"
                onClick={() => setFavLeagues(isFollowed ? favLeagues.filter(s => s !== league.slug) : [...favLeagues, league.slug])}
                className="rounded-full px-3 py-1.5 text-xs font-semibold border transition-all"
                style={isFollowed
                  ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' }
                  : { background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
              >
                {isFollowed ? '✓ ' : '+ '}{league.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications — coming soon; toggles removed until persistence is wired */}
      <div className="rounded-2xl border border-border bg-card p-5 opacity-60">
        <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
          {my_soccer.controls.notificationsHeading}
        </p>
        <p className="text-xs text-muted-foreground">Notification preferences are not yet available.</p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 px-6 text-sm hover:opacity-90 transition-all disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? my_soccer.controls.savingLabel : my_soccer.controls.saveLabel}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle size={14} />
            {my_soccer.controls.savedConfirm}
          </span>
        )}
      </div>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

/** Minimal profile used when the real profile hasn't loaded yet — lets Controls/Preferences render safely */
const EMPTY_PROFILE: MemberProfile = {
  userId: '',
  memberType: 'fan',
  region: null,
  city: null,
  interests: [],
  favLeagues: [],
  favTeams: [],
  fanInterests: [],
  favPublishers: [],
  onboardingDone: false,
  displayName: null,
  bio: null,
  avatarUrl: null,
  coverImageUrl: null,
  location: null,
};

/** Immediately navigates to /parent-portal. Used when a PARENT user lands on
 *  /my-soccer with portalView='parent' and onboarding is already complete. */
function ParentRedirect() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/parent-portal', { replace: true }); }, [navigate]);
  return null;
}

// ─── FanMobileBottomNav ───────────────────────────────────────────────────────
// Fixed bottom nav for Fan Arena on mobile (< lg).
// Primary 5: Feed | Newsstand | Scores | Community | More
// More sheet exposes remaining tabs.

const FAN_BOTTOM_PRIMARY: { id: DashTab; label: string; icon: React.ReactNode }[] = [
  { id: 'my-feed',    label: 'Feed',      icon: <Rss size={20} /> },
  { id: 'newsstand',  label: 'Newsstand', icon: <Radio size={20} /> },
  { id: 'scores',     label: 'Scores',    icon: <Trophy size={20} /> },
  { id: 'community',  label: 'Community', icon: <Users size={20} /> },
];

const FAN_MORE_TABS: { id: DashTab; label: string; icon: React.ReactNode }[] = [
  { id: 'podcasts',    label: 'Podcasts',           icon: <Headphones size={18} /> },
  { id: 'calendar',   label: 'Calendar',           icon: <Calendar size={18} /> },
  { id: 'saved',      label: 'Saved',              icon: <Bookmark size={18} /> },
  { id: 'sources',    label: 'Sources',            icon: <Rss size={18} /> },
];

function FanMobileBottomNav({ activeTab, onTabChange, savedCount }: {
  activeTab: DashTab;
  onTabChange: (t: DashTab) => void;
  savedCount: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = FAN_MORE_TABS.some(t => t.id === activeTab);

  return (
    <>
      {/* Fixed bottom bar */}
      <nav
        aria-label="Fan Arena mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-stretch h-14">
          {FAN_BOTTOM_PRIMARY.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors"
                style={{ color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
                aria-current={active ? 'page' : undefined}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
          {/* More button */}
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative"
            style={{ color: (moreActive || moreOpen) ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
            aria-expanded={moreOpen}
          >
            <LayoutGrid size={20} />
            More
            {savedCount > 0 && (
              <span className="absolute top-1.5 right-3 text-[9px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                {savedCount > 9 ? '9+' : savedCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* More sheet — slides up from bottom */}
      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            className="lg:hidden fixed bottom-14 inset-x-0 z-40 bg-card border-t rounded-t-2xl shadow-xl"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div className="px-4 pt-3 pb-2">
              <div className="w-8 h-1 rounded-full bg-muted mx-auto mb-3" />
              <p className="text-xs font-semibold text-muted-foreground mb-3 px-1">More sections</p>
              <div className="grid grid-cols-3 gap-2 pb-2">
                {FAN_MORE_TABS.map(tab => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-colors"
                      style={{
                        background: active ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--muted))',
                        color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                      }}
                    >
                      <span style={{ color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>{tab.icon}</span>
                      {tab.label}
                      {tab.id === 'saved' && savedCount > 0 && (
                        <span className="text-[9px] bg-primary text-primary-foreground rounded-full px-1.5 font-bold">{savedCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Help & Support link at bottom of More sheet */}
              <div className="border-t pt-2 mt-1" style={{ borderColor: 'hsl(var(--border))' }}>
                <a
                  href="mailto:info@soccercenter.org?subject=Fan%20Arena%20Support"
                  className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setMoreOpen(false)}
                >
                  <HelpCircle size={14} />
                  Help &amp; Support
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── InlineScoresView ─────────────────────────────────────────────────────────
// Ceefax-style scores rendered inside the Fan Arena Scores tab.
// Auth is guaranteed by the parent page — no redirect here.
// Preserves selected leagues and date across tab switches via component state.

const INLINE_LEAGUES = [
  { slug: 'premier-league',   name: 'Premier League' },
  { slug: 'laliga',           name: 'LaLiga' },
  { slug: 'bundesliga',       name: 'Bundesliga' },
  { slug: 'ligue-1',          name: 'Ligue 1' },
  { slug: 'serie-a',          name: 'Serie A' },
  { slug: 'champions-league', name: 'UEFA Champions League' },
];

function denverToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}
function offsetDate(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}
function formatInlineDateLabel(iso: string): string {
  const today = denverToday();
  if (iso === today) return 'Today';
  if (iso === offsetDate(today, -1)) return 'Yesterday';
  if (iso === offsetDate(today, +1)) return 'Tomorrow';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}
interface InlineLeagueData {
  slug: string; name: string;
  matches: ScoresMatch[]; cachedAt: string | null;
  live: boolean; stale: boolean; loading: boolean; error: string | null;
}

function InlineScoresView() {
  const [selectedDate, setSelectedDate] = useState(denverToday);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(INLINE_LEAGUES.map(l => l.slug));
  const [leagueData, setLeagueData] = useState<Record<string, InlineLeagueData>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchLeague = useCallback(async (slug: string, date: string) => {
    setLeagueData(prev => ({
      ...prev,
      [slug]: { ...(prev[slug] ?? { slug, name: INLINE_LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, error: null }), loading: true },
    }));
    try {
      const res = await fetch(`/api/scores/matches?league=${slug}&date=${date}`, { credentials: 'include' });
      const body = await res.json() as ScoresMatchesResponse & { error?: string; message?: string };
      if (!res.ok) {
        setLeagueData(prev => ({ ...prev, [slug]: { ...(prev[slug] ?? { slug, name: INLINE_LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, loading: false }), loading: false, error: body.message ?? 'Unavailable' } }));
        return;
      }
      setLeagueData(prev => ({ ...prev, [slug]: { slug, name: body.competition?.name ?? INLINE_LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: body.matches ?? [], cachedAt: body.cachedAt, live: body.live ?? false, stale: body.stale ?? false, loading: false, error: null } }));
      setLastUpdated(new Date().toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true }));
    } catch {
      setLeagueData(prev => ({ ...prev, [slug]: { ...(prev[slug] ?? { slug, name: INLINE_LEAGUES.find(l => l.slug === slug)?.name ?? slug, matches: [], cachedAt: null, live: false, stale: false, loading: false }), loading: false, error: 'Network error' } }));
    }
  }, []);

  const fetchAll = useCallback(async () => {
    for (let i = 0; i < selectedLeagues.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 200));
      await fetchLeague(selectedLeagues[i], selectedDate);
    }
  }, [selectedLeagues, selectedDate, fetchLeague]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const hasLive = Object.values(leagueData).some(d => d.live);
    if (!hasLive) return;
    const id = setInterval(() => { void fetchAll(); }, 60_000);
    return () => clearInterval(id);
  }, [leagueData, fetchAll]);

  function toggleLeague(slug: string) {
    setSelectedLeagues(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  const anyLive = Object.values(leagueData).some(d => d.live);

  return (
    <div className="font-mono" style={{ background: 'hsl(var(--ceefax-bg, 0 0% 0%))', color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}>
      {/* SC Fax masthead */}
      <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {/* SC Fax wordmark */}
            <div className="flex items-center gap-1.5">
              <span className="text-2xl sm:text-3xl font-black tracking-tighter leading-none" style={{ color: 'hsl(var(--ceefax-heading, 180 100% 70%))' }}>SC</span>
              <span className="text-2xl sm:text-3xl font-black tracking-tighter leading-none" style={{ color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}>FAX</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>Soccer Center</span>
              <span className="text-[10px] tracking-wide" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>Live scores &amp; results</span>
            </div>
            {anyLive && <span className="text-xs font-bold px-1.5 py-0.5 rounded animate-pulse" style={{ background: 'hsl(var(--status-live-bg))', color: 'hsl(var(--status-live-fg))' }}>LIVE</span>}
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>Updated {lastUpdated}</span>}
            <button type="button" onClick={() => { void fetchAll(); }} aria-label="Refresh scores" className="hover:opacity-70 transition-opacity" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-b" style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}>
        <button type="button" onClick={() => setSelectedDate(d => offsetDate(d, -1))} className="hover:opacity-70 transition-opacity" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <span className="text-sm font-bold tracking-wide" style={{ color: 'hsl(var(--ceefax-heading, 180 100% 70%))' }}>{formatInlineDateLabel(selectedDate)}</span>
        <button type="button" onClick={() => setSelectedDate(d => offsetDate(d, +1))} className="hover:opacity-70 transition-opacity" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }} aria-label="Next day"><ChevronRight size={16} /></button>
        {selectedDate !== denverToday() && (
          <button type="button" onClick={() => setSelectedDate(denverToday())} className="text-xs hover:opacity-70 transition-opacity" style={{ color: 'hsl(var(--primary))' }}>Today</button>
        )}
      </div>

      {/* League filter chips */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}>
        {INLINE_LEAGUES.map(l => {
          const active = selectedLeagues.includes(l.slug);
          return (
            <button key={l.slug} type="button" onClick={() => toggleLeague(l.slug)}
              className="text-xs px-2 py-1 rounded border transition-colors"
              style={{ background: active ? 'hsl(var(--primary))' : 'transparent', color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--ceefax-muted, 0 0% 55%))', borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--ceefax-border, 0 0% 20%))' }}>
              {l.name}
            </button>
          );
        })}
      </div>

      {/* League sections */}
      <div className="px-4 py-4 space-y-8 max-w-3xl mx-auto">
        {selectedLeagues.map(slug => {
          const d = leagueData[slug];
          const leagueName = d?.name ?? INLINE_LEAGUES.find(l => l.slug === slug)?.name ?? slug;
          return (
            <section key={slug}>
              <h2 className="text-sm font-bold tracking-widest uppercase mb-3 pb-1 border-b" style={{ color: 'hsl(var(--ceefax-heading, 180 100% 70%))', borderColor: 'hsl(var(--ceefax-border, 0 0% 20%))' }}>
                {leagueName}
                {d?.stale && <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>(cached)</span>}
              </h2>
              {(!d || d.loading) && <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>Loading…</p>}
              {d && !d.loading && d.error && (
                <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>
                  {d.error === 'This competition is not available on the current plan.' ? 'Not available on free tier' : d.error}
                </p>
              )}
              {d && !d.loading && !d.error && d.matches.length === 0 && (
                <p className="text-xs" style={{ color: 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>No fixtures</p>
              )}
              {d && !d.loading && !d.error && d.matches.map(m => {
                const live = isLive(m.status as MatchStatus);
                return (
                  <div key={m.id} className="mb-1">
                    <div
                      className="w-full text-left flex items-center gap-2 py-1"
                    >
                      <span className="w-2 shrink-0">{live && <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'hsl(var(--status-live-bar))' }} />}</span>
                      <span className="flex-1 text-xs truncate" style={{ color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}>{m.homeTeam.name}</span>
                      <span className="text-xs font-bold tabular-nums w-12 text-center shrink-0" style={{ color: 'hsl(var(--ceefax-score, 60 100% 70%))' }}>{scoreDisplay(m)}</span>
                      <span className="flex-1 text-xs truncate text-right" style={{ color: 'hsl(var(--ceefax-fg, 0 0% 100%))' }}>{m.awayTeam.name}</span>
                      <span className="text-[10px] w-14 text-right shrink-0" style={{ color: live ? 'hsl(var(--status-live-fg))' : 'hsl(var(--ceefax-muted, 0 0% 55%))' }}>{statusLabel(m.status as MatchStatus, m.utcDate)}</span>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function MySoccerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isPending } = useSession();

  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfile[]>([]);
  const [identityColumnsAvailable, setIdentityColumnsAvailable] = useState<boolean | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // ── Reliable follow persistence ──────────────────────────────────────────────
  // Sequence counter prevents out-of-order responses from overwriting newer state.
  // Each call increments the counter; only the response with the highest seq wins.
  const followSeqRef = useRef(0);
  const [followSaveError, setFollowSaveError] = useState<string | null>(null);

  const persistFollows = useCallback(async (fields: { favTeams?: string[]; favLeagues?: string[]; favPublishers?: string[] }) => {
    const seq = ++followSeqRef.current;
    setFollowSaveError(null);
    try {
      const r = await fetch('/api/my-soccer/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (seq < followSeqRef.current) return; // superseded by a newer call
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { detail?: string };
        setFollowSaveError(body.detail ?? 'Could not save follow — please try again.');
      }
    } catch {
      if (seq < followSeqRef.current) return;
      setFollowSaveError('Network error saving follow — please try again.');
    }
  }, []);
  // Arena chooser — shown for first-time users (fanOnboardingDone=false) and on "Switch arena"
  const [showChooser, setShowChooser] = useState(false);
  // Tracks whether the user has completed fan onboarding (from /me). Used to
  // make the chooser dismissible for returning users and to skip re-showing it.
  const [fanOnboardingDoneState, setFanOnboardingDoneState] = useState(false);
  // Guard: /me preference-load runs exactly once per mount. Subsequent effect
  // re-runs (e.g. location.search changes) must NOT overwrite an explicit user choice.
  const meLoadedRef = useRef(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // ── Portal view state ────────────────────────────────────────────────────────
  // Resolved from /api/my-soccer/me after auth. Null until loaded.
  const [accessType, setAccessType] = useState<'FAN' | 'PARENT' | null>(null);
  // True when this account may access parent setup/portal (global flag OR tester allowlist).
  // Not a security control — server enforces the same check on every parent API call.
  const [setupAllowed, setSetupAllowed] = useState(false);
  // True when the parent has completed the onboarding wizard at least once.
  const [parentOnboardingDone, setParentOnboardingDone] = useState(false);
  // True when the user is actively running the onboarding wizard (new or edit).
  const [showParentWizard, setShowParentWizard] = useState(false);
  // 'fan' | 'parent' — which view is currently shown.
  // Defaults to 'fan'; the /me effect sets the correct view on first load
  // based on lastPortalPreference or a one-time ?portal= URL hint (which is
  // then stripped from the URL so it cannot re-apply on reload).
  const [portalView, setPortalView] = useState<PortalView>('fan');
  // True when a FAN account has navigated to the parent view — show setup gate
  const [showSetupGate, setShowSetupGate] = useState(false);
  // Setup gate internal state (inlined here so content fields are page-owned)
  const [setupChecked, setSetupChecked] = useState<Record<string, boolean>>({});
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupEmailError, setSetupEmailError] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  // Portal switcher dropdown state (parent view header)
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSwitching, setSwitcherSwitching] = useState(false);
  // Fan nav account menu state (fan view header — separate from portal switcher)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<DashTab>('my-feed');
  // Track whether the user has visited before (profile loaded + onboardingDone)


  // ── PL clubs (shared between Controls and LeagueClubFeed) ───────────────────
  const [plClubs, setPlClubs] = useState<PlClub[]>([]);
  const [plClubsLoaded, setPlClubsLoaded] = useState(false);

  // ── Saved content state ──────────────────────────────────────────────────────
  const [savedItems, setSavedItems] = useState<ContentItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedContentLoaded, setSavedContentLoaded] = useState(false);

  const [savedTryoutIds, setSavedTryoutIds] = useState<Set<string>>(new Set());
  const [savedActiveId, setSavedActiveId] = useState<string | null>(null);
  const [savedTryoutsLoaded, setSavedTryoutsLoaded] = useState(false);

  // ── Calendar state ───────────────────────────────────────────────────────────
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [, setLoadingFeeds] = useState(true);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  // Set to true when the portal_context column is missing (pre-v4 schema).
  // Shows an explicit migration-required notice instead of an empty calendar.
  const [calendarSchemaMissing, setCalendarSchemaMissing] = useState(false);
  const [viewMode, setViewMode] = useState<'agenda' | 'week' | 'month'>('agenda');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<string | null>(null);
  const [accountPanel, setAccountPanel] = useState<'none' | 'password' | 'delete'>('none');
  const [refreshing, setRefreshing] = useState(false);
  const [_lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // New calendar state
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [editingPersonalEvent, setEditingPersonalEvent] = useState<PersonalEvent | null>(null);
  const [showManageCalendars, setShowManageCalendars] = useState(false);
  const [calConnections, setCalConnections] = useState<CalConnections | null>(null);
  const [feedPrefs, setFeedPrefs] = useState<Map<string, { color?: string | null; visible?: boolean }>>(new Map());
  const [pendingReminders, setPendingReminders] = useState<Array<{ id: string; eventTitle: string; eventStartAt: string; minutesBefore: number }>>([]);
  const reminderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ambiguous feed assignment state
  const [ambiguousFeeds, setAmbiguousFeeds] = useState<AmbiguousFeed[]>([]);
  const [ambiguousChecked, setAmbiguousChecked] = useState(false);
  const [showAmbiguousAssignment, setShowAmbiguousAssignment] = useState(false);
  useEffect(() => {
    if (!isPending && !isAuthenticated) navigate('/login/auth?returnTo=/my-soccer');
  }, [isPending, isAuthenticated, navigate]);

  // Check for ambiguous feeds when calendar tab is first opened
  useEffect(() => {
    if (!isAuthenticated || ambiguousChecked || activeTab !== 'calendar') return;
    setAmbiguousChecked(true);
    void (async () => {
      try {
        const res = await fetch('/api/my-soccer/feeds/ambiguous', { credentials: 'include' });
        if (res.status === 409) {
          // Schema migration has not been run — show migration-required notice.
          // Do NOT treat this as "no ambiguous feeds".
          setCalendarSchemaMissing(true);
          return;
        }
        if (!res.ok) return; // other errors — skip silently, calendar will show its own error
        const data = await res.json() as { feeds: AmbiguousFeed[] };
        if (data.feeds.length > 0) {
          setAmbiguousFeeds(data.feeds);
          setShowAmbiguousAssignment(true);
        }
      } catch {
        // Network error — skip silently
      }
    })();
  }, [isAuthenticated, ambiguousChecked, activeTab]);

  // Load account type + portal preference from server.
  // The preference-from-server block runs ONCE on first authenticated load only.
  // Subsequent re-runs (location.search changes, etc.) update accessType/flags
  // but never overwrite portalView — the user's explicit choice must be preserved.
  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const res = await fetch('/api/my-soccer/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json() as {
          accessType: 'FAN' | 'PARENT';
          parentOnboardingDone: boolean;
          fanOnboardingDone: boolean;
          lastPortalPreference: 'fan' | 'parent' | null;
          setupAllowed: boolean;
        };
        setAccessType(data.accessType);
        setSetupAllowed(data.setupAllowed);
        setParentOnboardingDone(data.parentOnboardingDone);

        // Only apply the saved preference on the very first load.
        // Once meLoadedRef is true the user has already made (or kept) their
        // choice — never stomp it with a stale server value.
        if (!meLoadedRef.current) {
          meLoadedRef.current = true;

          const urlParams = new URLSearchParams(location.search);
          const urlPortal = urlParams.get('portal');

          if (urlPortal === 'fan') {
            // Explicit fan selection — always honour, overrides saved preference
            setPortalView('fan');
            setShowSetupGate(false);
          } else if (urlPortal === 'parent') {
            // URL explicitly requested parent view
            if (data.accessType === 'FAN') {
              setShowSetupGate(true);
            } else {
              setPortalView('parent');
            }
          } else if (data.lastPortalPreference) {
            // No URL hint — restore saved preference, but guard FAN accounts
            if (data.lastPortalPreference === 'parent' && data.accessType === 'FAN') {
              setPortalView('fan'); // FAN can't hold a parent preference
            } else {
              setPortalView(data.lastPortalPreference);
            }
          }
          // else: no saved preference → keep default 'fan' from useState initializer

          // Strip ?portal= from the URL now that we've consumed it.
          if (urlPortal) {
            const clean = new URLSearchParams(location.search);
            clean.delete('portal');
            const newSearch = clean.toString();
            navigate(
              { pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' },
              { replace: true }
            );
          }

          // fanOnboardingDone is the authoritative flag from /me.
          setFanOnboardingDoneState(data.fanOnboardingDone);
          if (!data.fanOnboardingDone) {
            setShowChooser(true);
          } else {
            setShowChooser(false);
          }
        } else {
          // Subsequent runs (location.search changed) — only consume a fresh
          // ?portal= hint. This handles the case where the user is already on
          // /my-soccer and clicks a homepage arena button (which navigates to
          // /my-soccer?portal=fan or /my-soccer?portal=parent).
          const urlParams = new URLSearchParams(location.search);
          const urlPortal = urlParams.get('portal');
          if (urlPortal) {
            if (urlPortal === 'fan') {
              setPortalView('fan');
              setShowSetupGate(false);
            } else if (urlPortal === 'parent') {
              if (data.accessType === 'FAN') {
                setShowSetupGate(true);
              } else {
                setPortalView('parent');
              }
            }
            // Strip the hint
            const clean = new URLSearchParams(location.search);
            clean.delete('portal');
            const newSearch = clean.toString();
            navigate(
              { pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' },
              { replace: true }
            );
          }
        }
      } catch {
        // Non-critical — fall back to fan view
      }
    })();
  }, [isAuthenticated, location.search]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      const [profileResp, playersResp] = await Promise.all([
        apiFetch<{ profile: MemberProfile | null; identityColumnsAvailable?: boolean }>('/api/my-soccer/profile'),
        apiFetch<{ playerProfiles: PlayerProfile[] }>('/api/my-soccer/player-profiles'),
      ]);
      const prof = profileResp.data?.profile ?? null;
      setMemberProfile(prof);
      setIdentityColumnsAvailable(profileResp.data?.identityColumnsAvailable ?? null);
      setPlayerProfiles(playersResp.data?.playerProfiles ?? []);
      setProfileLoaded(true);
      // Chooser visibility is driven by fanOnboardingDone from /me — not here.
    })();
  }, [isAuthenticated]);

  // Add body class so the global CSS can hide the Inbox launcher at body level
  // (the widget mounts outside .fa-shell/.pp-shell so scoped selectors don't reach it)
  useEffect(() => {
    document.body.classList.add('sc-portal-active');
    return () => { document.body.classList.remove('sc-portal-active'); };
  }, []);

  // Load PL clubs once for Controls tab
  useEffect(() => {
    if (!isAuthenticated || plClubsLoaded) return;
    setPlClubsLoaded(true);
    void fetch('/api/my-soccer/pl-clubs', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ clubs: PlClub[] }>)
      .then((d) => setPlClubs(d.clubs.filter((c) => c.hasChannel)))
      .catch(() => { /* non-fatal */ });
  }, [isAuthenticated, plClubsLoaded]);

  const handleSave = useCallback(async (contentId: string) => {
    await apiFetch('/api/my-soccer/saved', { method: 'POST', body: JSON.stringify({ contentId }) });
    setSavedIds((prev) => new Set([...prev, contentId]));
  }, []);

  const handleUnsave = useCallback(async (contentId: string) => {
    await apiFetch(`/api/my-soccer/saved/${contentId}`, { method: 'DELETE' });
    setSavedIds((prev) => { const s = new Set(prev); s.delete(contentId); return s; });
    setSavedItems((prev) => prev.filter((s) => s.contentId !== contentId));
  }, []);

  // Load saved content
  useEffect(() => {
    if (!isAuthenticated || savedContentLoaded) return;
    setSavedContentLoaded(true);
    setSavedLoading(true);
    void apiFetch<{ saved: ContentItem[] }>('/api/my-soccer/saved').then(({ data }) => {
      if (data) {
        setSavedItems(data.saved);
        setSavedIds(new Set(data.saved.map((s) => s.contentId)));
      }
      setSavedLoading(false);
    });
  }, [isAuthenticated, savedContentLoaded]);

  // Load saved tryouts
  useEffect(() => {
    if (!isAuthenticated || savedTryoutsLoaded) return;
    setSavedTryoutsLoaded(true);
    void apiFetch<{ savedTryoutIds: string[] }>('/api/my-soccer/saved-tryouts').then(({ data }) => {
      if (data) setSavedTryoutIds(new Set(data.savedTryoutIds));
    });
  }, [isAuthenticated, savedTryoutsLoaded]);

  // Calendar fetch helpers
  const fetchFeeds = useCallback(async () => {
    try {
      const res = await fetch('/api/my-soccer/feeds', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      if (res.status === 409) {
        setCalendarSchemaMissing(true);
        setLoadingFeeds(false);
        return;
      }
      if (!res.ok) { setLoadingFeeds(false); return; }
      const data = await res.json() as { feeds: Feed[] };
      setFeeds(data.feeds);
      const prefs = new Map<string, { color?: string | null; visible?: boolean }>();
      for (const f of data.feeds) {
        prefs.set(f.id, { color: f.color, visible: f.visible });
      }
      setFeedPrefs(prefs);
    } catch {
      // network error — leave feeds empty
    }
    setLoadingFeeds(false);
  }, []);

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams();
    if (providerFilter) params.set('provider', providerFilter);
    if (feedFilter) params.set('feedId', feedFilter);
    const [feedEventsRes, personalEventsRes] = await Promise.all([
      fetch(`/api/my-soccer/events?${params}`, { credentials: 'include' }),
      apiFetch<{ events: PersonalEvent[] }>('/api/my-soccer/personal-events'),
    ]);
    if (feedEventsRes.status === 409) {
      setCalendarSchemaMissing(true);
    } else if (feedEventsRes.ok) {
      const data = await feedEventsRes.json() as { events: CalEvent[] };
      setEvents(data.events);
    }
    if (personalEventsRes.data) setPersonalEvents(personalEventsRes.data.events);
    setLoadingEvents(false);
  }, [providerFilter, feedFilter]);

  const fetchConnections = useCallback(async () => {
    const { data } = await apiFetch<CalConnections>('/api/calendar/connections');
    if (data) setCalConnections(data);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchFeeds();
    void fetchEvents();
    void fetchConnections();
  }, [isAuthenticated, fetchFeeds, fetchEvents, fetchConnections]);

  useEffect(() => {
    if (!isAuthenticated) return;
    autoRefreshRef.current = setInterval(() => {
      void fetchFeeds();
      void fetchEvents();
      setLastRefreshed(new Date());
    }, AUTO_REFRESH_MS);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [isAuthenticated, fetchFeeds, fetchEvents]);

  // Poll for due in-app reminders every 60 seconds
  useEffect(() => {
    if (!isAuthenticated) return;
    const poll = async () => {
      const { data } = await apiFetch<{ reminders: Array<{ id: string; eventTitle: string; eventStartAt: string; minutesBefore: number }> }>('/api/my-soccer/reminders');
      if (data?.reminders?.length) {
        setPendingReminders((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newOnes = data.reminders.filter((r) => !existingIds.has(r.id));
          return [...prev, ...newOnes];
        });
      }
    };
    void poll();
    reminderPollRef.current = setInterval(poll, 60_000);
    return () => { if (reminderPollRef.current) clearInterval(reminderPollRef.current); };
  }, [isAuthenticated]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await apiFetch('/api/my-soccer/refresh', { method: 'POST', body: JSON.stringify({}) });
    setTimeout(async () => {
      await fetchFeeds();
      await fetchEvents();
      setLastRefreshed(new Date());
      setRefreshing(false);
    }, 3000);
  };

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </main>
    );
  }

  if (!isAuthenticated) return null;

  const feedMap = new Map(feeds.map((f) => [f.id, f.label ?? PROVIDER_LABELS[f.provider] ?? f.provider]));

  // Merge feed events + personal events into one sorted list
  const personalAsCalEvents: CalEvent[] = personalEvents.map((pe) => ({
    id: pe.id,
    feedId: `personal_${pe.id}`,
    uid: null,
    title: pe.title,
    startAt: pe.startAt,
    endAt: pe.endAt,
    allDay: pe.allDay,
    location: pe.location,
    description: pe.notes,
    notes: pe.notes,
    provider: 'personal',
    teamName: null,
    eventType: pe.eventType,
    status: 'confirmed',
    sequence: 0,
    hasOverlap: false,
    isPersonal: true,
  }));

  const allEvents = [...events, ...personalAsCalEvents].sort((a, b) => a.startAt.localeCompare(b.startAt));

  const filteredEvents = allEvents.filter((ev) => {
    // Hide events from hidden feeds
    if (!ev.isPersonal) {
      const pref = feedPrefs.get(ev.feedId);
      if (pref && pref.visible === false) return false;
    }
    if (providerFilter && ev.provider !== providerFilter) return false;
    if (feedFilter && ev.feedId !== feedFilter) return false;
    return true;
  });
  const grouped = groupByDate(filteredEvents);
  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <div className="fa-shell flex-1 flex flex-col">
      {/* Arena chooser — first-time users and "Switch arena" */}
      <ArenaChooserModal
        open={showChooser}
        dismissible={fanOnboardingDoneState}
        onDismiss={() => setShowChooser(false)}
        onSelectFan={async () => {
          // Always persist fanOnboardingDone so returning users skip the chooser
          await apiFetch('/api/my-soccer/profile', {
            method: 'POST',
            body: JSON.stringify({ memberType: 'fan', onboardingDone: true, fanOnboardingDone: true }),
          }).catch(() => {});
          await fetch('/api/my-soccer/portal-preference', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ preference: 'fan' }),
          }).catch(() => {});
          setFanOnboardingDoneState(true);
          setPortalView('fan');
          setShowChooser(false);
        }}
        onSelectParent={() => {
          setShowChooser(false);
          if (accessType === 'FAN') {
            setShowSetupGate(true);
          } else {
            setPortalView('parent');
          }
        }}
      />

      {showPreferences && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowPreferences(false)}
        >
          <div
            className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                My Preferences
              </h2>
              <button
                onClick={() => setShowPreferences(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close preferences"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {/* Gate on profileLoaded so ControlsTab's useState initializers
                  always receive the real saved values, never EMPTY_PROFILE.
                  key={profileLoaded} forces a remount if the profile arrives
                  after the panel opens (race condition guard). */}
              {profileLoaded ? (
                <ControlsTab
                  key="loaded"
                  profile={memberProfile ?? EMPTY_PROFILE}
                  playerProfiles={playerProfiles}
                  plClubs={plClubs}
                  onProfileSaved={(p) => { setMemberProfile(p); }}
                />
              ) : (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Helmet>
        <title>My Soccer — Soccer Center</title>
        <meta name="description" content="Your personal soccer dashboard — development resources, team videos, calendar, and saved content." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>


      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pt-4 pb-24 lg:pb-8">
        {/* ── Page header row — shown outside fan view (setup gate, parent onboarding) ── */}
        {(showSetupGate || (portalView === 'parent')) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6 min-h-[40px]">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            <span>{my_soccer.hero.title}</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {accessType && (
              <div className="relative">
                {accessType === 'FAN' ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                      <Star size={14} /><span>{portal_switcher.fanLabel}</span>
                    </div>
                    {setupAllowed ? (
                      <button onClick={() => setShowSetupGate(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-secondary transition-colors">
                        <Users size={14} /><span>{portal_switcher.setupParentLabel}</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground/60 cursor-default select-none">
                        <Users size={14} /><span>Parent portal — coming soon</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={() => setSwitcherOpen(o => !o)} disabled={switcherSwitching}
                      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      aria-haspopup="listbox" aria-expanded={switcherOpen}>
                      {switcherSwitching
                        ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                        : portalView === 'parent' ? <Users size={14} className="text-primary" /> : <Star size={14} className="text-primary" />}
                      <span>{switcherSwitching
                        ? (portalView === 'parent' ? portal_switcher.switchingToFan : portal_switcher.switchingToParent)
                        : (portalView === 'parent' ? portal_switcher.parentLabel : portal_switcher.fanLabel)}</span>
                      <ChevronDown size={14} className={`text-muted-foreground transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {switcherOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} aria-hidden="true" />
                        <div role="listbox" className="absolute right-0 top-full mt-1.5 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                          {([
                            { view: 'parent' as const, label: portal_switcher.parentLabel, Icon: Users },
                            { view: 'fan' as const, label: portal_switcher.fanLabel, Icon: Star },
                          ]).map((opt, i) => (
                            <div key={opt.view}>
                              {i > 0 && <div className="border-t border-border" />}
                              <button role="option" aria-selected={portalView === opt.view}
                                onClick={async () => {
                                  if (portalView === opt.view) { setSwitcherOpen(false); return; }
                                  setSwitcherSwitching(true); setSwitcherOpen(false);
                                  await fetch('/api/my-soccer/portal-preference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ preference: opt.view }) }).catch(() => {});
                                  setPortalView(opt.view); setSwitcherSwitching(false);
                                }}
                                className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-muted ${portalView === opt.view ? 'text-primary font-semibold' : 'text-foreground'}`}>
                                <opt.Icon size={16} className="flex-shrink-0" />
                                <span>{opt.label}</span>
                                {portalView === opt.view && <svg className="ml-auto h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" /></svg>}
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowChooser(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition-colors"
              title="Switch arena"
            >
              <ArrowLeftRight size={14} /> Switch arena
            </button>
            <button onClick={() => setShowPreferences(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition-colors" title="Preferences">
              <Settings size={14} /> Preferences
            </button>
          </div>
        </div>
        )}

        {/* ── Parent setup gate ─────────────────────────────────────────── */}
        {showSetupGate && accessType === 'FAN' && (
          <div className="rounded-2xl border border-border bg-card shadow-sm mb-8">
            {setupEmailError ? (
              <div className="flex flex-col items-center justify-center min-h-[360px] px-6 py-12 text-center max-w-md mx-auto">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-5"><AlertTriangle size={28} /></div>
                <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{parent_setup_gate.emailNotVerifiedTitle}</h2>
                <p className="text-muted-foreground text-sm mb-6">{parent_setup_gate.emailNotVerifiedBody}</p>
                <button onClick={() => setSetupEmailError(false)} className="text-sm text-primary hover:underline">← Back</button>
              </div>
            ) : setupDone ? (
              <div className="flex flex-col items-center justify-center min-h-[360px] px-6 py-12 text-center max-w-md mx-auto">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 mb-5"><CheckCircle size={28} /></div>
                <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{parent_setup_gate.successTitle}</h2>
                <p className="text-muted-foreground text-sm">{parent_setup_gate.successBody}</p>
              </div>
            ) : (
              <div className="max-w-lg mx-auto px-4 py-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary flex-shrink-0"><Users size={20} /></div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>{parent_setup_gate.headline}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{parent_setup_gate.subheadline}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-5 mb-6">
                  <div className="flex items-center gap-2 mb-2"><Shield size={16} className="text-primary flex-shrink-0" /><span className="text-sm font-semibold text-foreground">{parent_setup_gate.noticeTitle}</span></div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{parent_setup_gate.noticeBody}</p>
                </div>
                <div className="space-y-3 mb-6">
                  {parent_setup_gate.checklistItems.map(item => (
                    <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <input type="checkbox" className="sr-only" checked={!!setupChecked[item.id]} onChange={e => setSetupChecked(prev => ({ ...prev, [item.id]: e.target.checked }))} />
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${setupChecked[item.id] ? 'bg-primary border-primary' : 'border-border bg-background group-hover:border-primary/60'}`}>
                          {setupChecked[item.id] && <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" /></svg>}
                        </div>
                      </div>
                      <span className="text-sm text-foreground leading-snug">{item.text}</span>
                    </label>
                  ))}
                </div>
                {setupError && <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /><span>{setupError}</span></div>}
                <div className="flex flex-col gap-3">
                  <button disabled={!parent_setup_gate.checklistItems.every(i => setupChecked[i.id]) || setupLoading}
                    onClick={async () => {
                      setSetupLoading(true); setSetupError(null); setSetupEmailError(false);
                      try {
                        const res = await fetch('/api/parent/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ack: true, consentVersion: parent_setup_gate.consentVersion }) });
                        if (res.status === 403) { const b = await res.json().catch(() => ({})); if (b?.error === 'email_not_verified') { setSetupEmailError(true); return; } setSetupError('Access denied.'); return; }
                        if (!res.ok) { const b = await res.json().catch(() => ({})); setSetupError(b?.error || 'Setup failed.'); return; }
                        const b = await res.json();
                        if (b.ok || b.alreadyParent) { setSetupDone(true); setTimeout(async () => { setAccessType('PARENT'); setPortalView('parent'); setShowSetupGate(false); setSetupDone(false); setSetupChecked({}); await fetch('/api/my-soccer/portal-preference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ preference: 'parent' }) }).catch(() => {}); }, 1200); }
                      } catch { setSetupError('Network error.'); }
                      finally { setSetupLoading(false); }
                    }}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary text-secondary-foreground font-semibold py-3 px-5 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                    {setupLoading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : <ChevronRight size={16} />}
                    <span>{parent_setup_gate.ctaSetup}</span>
                  </button>
                  <button disabled={setupLoading} onClick={() => { setPortalView('fan'); setShowSetupGate(false); setSetupChecked({}); setSetupError(null); }}
                    className="w-full rounded-xl border border-border bg-background text-foreground font-medium py-3 px-5 text-sm transition-colors hover:bg-muted disabled:opacity-40">
                    {parent_setup_gate.ctaFan}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Parent portal view — redirect directly; no intermediate card ── */}
        {!showSetupGate && portalView === 'parent' && accessType === 'PARENT' && (
          <>
            {(showParentWizard || !parentOnboardingDone) ? (
              <ParentOnboardingWizard editMode={parentOnboardingDone}
                onComplete={() => { setParentOnboardingDone(true); setShowParentWizard(false); navigate('/parent-portal', { replace: true }); }}
                onCancel={parentOnboardingDone ? () => setShowParentWizard(false) : undefined} />
            ) : (
              // Onboarding done — go straight to the parent portal
              <ParentRedirect />
            )}
          </>
        )}

        {/* ── Fan view ─────────────────────────────────────────────────── */}
        {!showSetupGate && portalView === 'fan' && profileLoaded && (
          <div>
            {/* Compact sticky top nav — full-width, no negative margins.
                Uses width:100vw + left offset to bleed to viewport edges
                without causing scrollWidth > clientWidth. Body overflow-x:hidden
                ensures the 100vw doesn't create a horizontal scrollbar. */}
            <nav
              aria-label="Fan Arena navigation"
              className="fa-shell sticky top-0 z-40 mb-4 border-b"
              style={{
                background: 'hsl(var(--fa-bg, var(--background)))',
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
              }}
            >
              <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2 min-w-0">
                {/* Logo / title */}
                <span className="shrink-0 text-sm font-bold tracking-wide truncate" style={{ color: 'hsl(var(--fa-primary, var(--primary)))', fontFamily: 'var(--font-heading)' }}>
                  Fan Arena
                </span>
                {/* Spacer */}
                <div className="flex-1" />
                {/* Arena switch — min 48px height, clear label */}
                {accessType === 'PARENT' && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSwitcherSwitching(true);
                      await fetch('/api/my-soccer/portal-preference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ preference: 'parent' }) }).catch(() => {});
                      setPortalView('parent');
                      setSwitcherSwitching(false);
                    }}
                    disabled={switcherSwitching}
                    className="shrink-0 flex items-center gap-1.5 px-3 min-h-[48px] rounded-lg text-sm font-semibold border transition-colors"
                    style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.06)' }}
                  >
                    <Users size={15} />
                    <span className="hidden sm:inline">Switch to Parent Arena</span>
                  </button>
                )}
                {accessType === 'FAN' && setupAllowed && (
                  <button
                    type="button"
                    onClick={() => setShowSetupGate(true)}
                    className="shrink-0 flex items-center gap-1.5 px-3 min-h-[48px] rounded-lg text-sm font-semibold border transition-colors"
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    <Users size={15} />
                    <span className="hidden sm:inline">Set up Parent Arena</span>
                  </button>
                )}
                {/* Account menu */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap"
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                    aria-haspopup="true"
                    aria-expanded={accountMenuOpen}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                      {(user?.name ?? user?.email ?? 'U').slice(0, 1).toUpperCase()}
                    </span>
                    <ChevronDown size={12} className={`transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {accountMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} aria-hidden="true" />
                      <div className="absolute right-0 top-full mt-1.5 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                          <p className="text-xs font-semibold text-foreground truncate">{user?.name ?? user?.email}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setAccountMenuOpen(false); setActiveTab('sources'); }}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <SlidersHorizontal size={14} className="text-muted-foreground" />
                          Preferences
                        </button>
                        <div className="border-t border-border" />
                        <LogoutButton className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                          <LogOut size={14} className="text-muted-foreground" />
                          Sign out
                        </LogoutButton>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </nav>
            {/* Profile header — always visible, even before onboarding */}
            <div className="mb-6">
              <FanArenaProfile
                profile={{
                  userId: memberProfile?.userId ?? (user?.id ?? ''),
                  displayName: memberProfile?.displayName ?? null,
                  bio: memberProfile?.bio ?? null,
                  avatarUrl: memberProfile?.avatarUrl ?? null,
                  coverImageUrl: memberProfile?.coverImageUrl ?? null,
                  location: memberProfile?.location ?? null,
                  favTeams: memberProfile?.favTeams ?? [],
                  fanInterests: memberProfile?.fanInterests ?? [],
                  region: memberProfile?.region ?? null,
                }}
                userEmail={user?.email ?? ''}
                defaultCoverUrl="/airo-assets/images/pages/my-soccer/fan-profile-cover"
                identityColumnsAvailable={identityColumnsAvailable}
                onProfileSaved={(updated) => { setMemberProfile(prev => prev ? { ...prev, ...updated } : { ...EMPTY_PROFILE, userId: user?.id ?? '', ...updated }); }}
                onManageInterests={() => setActiveTab('sources')}
              />
            </div>

            {/* Scores ticker — below profile header, above tab nav.
                favLeagues slugs are filtered to free-tier-only before passing to the ticker
                (MLS/NWSL are in channels.json for video but return 403 on the free scores plan). */}
            <div
              className="mb-4"
              style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)' }}
            >
              <ScoresTicker
                leagues={(() => {
                  const FREE_TIER = new Set(['premier-league','laliga','bundesliga','ligue-1','serie-a','champions-league']);
                  const saved = memberProfile?.favLeagues?.filter(s => FREE_TIER.has(s)) ?? [];
                  return saved.length ? saved : ['premier-league','laliga','bundesliga','champions-league'];
                })()}
                isAuthenticated={isAuthenticated}
                compact
              />
            </div>

            {/* 3-column layout: sidebar | content | right panels */}
            <div className="flex gap-6 items-start">

              {/* Left sidebar nav — desktop only */}
              <aside className="hidden lg:flex flex-col gap-1 w-44 shrink-0 sticky top-24">
                <p className="text-sm font-semibold text-foreground px-3 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>My profile</p>
                {([
                  { id: 'my-feed' as DashTab,     label: 'My Feed',    icon: <Rss size={15} /> },
                  { id: 'newsstand' as DashTab,   label: 'Newsstand',  icon: <Radio size={15} /> },
                  { id: 'podcasts' as DashTab,    label: 'Podcasts',   icon: <Headphones size={15} /> },
                  { id: 'scores' as DashTab,      label: 'Scores',     icon: <Trophy size={15} /> },
                  { id: 'community' as DashTab,   label: 'Community',  icon: <Users size={15} /> },
                  { id: 'calendar' as DashTab,    label: 'Calendar',   icon: <Calendar size={15} /> },
                  { id: 'saved' as DashTab,       label: 'Saved',      icon: <Bookmark size={15} /> },
                  { id: 'sources' as DashTab,     label: 'Sources',    icon: <Rss size={15} /> },
                ]).map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${activeTab === tab.id ? 'fa-nav-active' : 'text-foreground hover:bg-muted'}`}>
                    <span className={activeTab === tab.id ? '' : 'text-muted-foreground'}>{tab.icon}</span>
                    {tab.label}
                    {tab.id === 'saved' && savedIds.size > 0 && <span className="ml-auto text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 font-semibold">{savedIds.size}</span>}
                  </button>
                ))}
              </aside>

              {/* Main + right column wrapper */}
              <div className="flex-1 min-w-0 flex flex-col gap-4">

                {/* Mobile bottom nav — fixed, 5 primary tabs + More sheet */}
                <FanMobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} savedCount={savedIds.size} />

                {/* Content + right panels row */}
                <div className="flex gap-6 items-start">

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <FanSectionErrorBoundary section={activeTab === 'my-feed' ? 'My Feed' : activeTab === 'newsstand' ? 'Newsstand' : activeTab === 'scores' ? 'Scores' : activeTab === 'sources' ? 'Sources' : activeTab === 'community' ? 'Community' : activeTab === 'calendar' ? 'Calendar' : activeTab === 'podcasts' ? 'Podcasts' : 'This section'}>

                    {activeTab === 'my-feed' && (
                      <div>
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{my_soccer.myFeed.heading}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Your teams. Your sources. Your soccer world.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('sources')}
                            className="text-xs font-medium border border-border rounded-lg px-3 py-1.5 text-foreground hover:bg-muted transition-colors shrink-0"
                          >
                            Manage teams &amp; sources
                          </button>
                        </div>
                        {followSaveError && (
                          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                            <AlertTriangle size={14} className="shrink-0" />
                            <span className="flex-1">{followSaveError}</span>
                            <button type="button" onClick={() => setFollowSaveError(null)} className="shrink-0 text-destructive/60 hover:text-destructive" aria-label="Dismiss"><X size={14} /></button>
                          </div>
                        )}
                        <MyFeedTab
                          favTeams={memberProfile?.favTeams ?? []}
                          onFavTeamsChange={(t) => {
                            setMemberProfile(p => p ? { ...p, favTeams: t } : p);
                            void persistFollows({ favTeams: t });
                          }}
                          favLeagues={memberProfile?.favLeagues ?? []}
                          onFavLeaguesChange={(l) => {
                            setMemberProfile(p => p ? { ...p, favLeagues: l } : p);
                            void persistFollows({ favLeagues: l });
                          }}
                          favPublishers={memberProfile?.favPublishers ?? []}
                          onFavPublishersChange={(publishers) => {
                            setMemberProfile(p => p ? { ...p, favPublishers: publishers } : p);
                            void persistFollows({ favPublishers: publishers });
                          }}
                          onNavigateToControls={() => setActiveTab('sources')}
                        />
                      </div>
                    )}

                    {activeTab === 'newsstand' && (
                      <div>
                        <div className="mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Newsstand</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Written soccer coverage from followed publishers</p>
                        </div>
                        <FanNewsstand onManageSources={() => setActiveTab('sources')} />
                      </div>
                    )}

                    {activeTab === 'podcasts' && (
                      <div>
                        <div className="mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Podcasts</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Soccer podcasts — follow, discover, and listen</p>
                        </div>
                        <PodcastsTab />
                      </div>
                    )}

                    {activeTab === 'community' && (
                      <div>
                        <div className="mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Community</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Supporter groups, watch parties, and how to watch</p>
                        </div>
                        {/* key forces a fresh mount + fetch every time the tab is activated,
                            bypassing any stale error state from a previous 503 response. */}
                        <FanCommunity key="community-tab" userRegion={memberProfile?.region ?? null} />
                      </div>
                    )}

                    {activeTab === 'saved' && (
                      <div>
                        <div className="mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Saved</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Content you've bookmarked for later</p>
                        </div>
                        {savedTryoutIds.size > 0 && (
                          <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-2">
                            <Bookmark size={14} className="text-primary shrink-0" />
                            <span className="text-xs text-foreground">{savedTryoutIds.size} saved tryout{savedTryoutIds.size !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {savedLoading ? (
                          <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-muted-foreground" /></div>
                        ) : savedItems.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                            <Bookmark size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                            <p className="text-muted-foreground text-sm">{savedTryoutIds.size > 0 ? 'No saved videos yet.' : 'Nothing saved yet.'}</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Tap the bookmark icon on any content card to save it here.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {savedItems.map((item) => (
                              <DevContentCard key={item.contentId} item={item} savedIds={savedIds} onSave={handleSave} onUnsave={handleUnsave} activeId={savedActiveId} onPlay={(id) => setSavedActiveId(id)} onStop={() => setSavedActiveId(null)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'sources' && (
                      <div>
                        <div className="mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Manage Your Football World</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Follow clubs, national teams, and media to populate your Feed</p>
                        </div>
                        {/* Interests + followed teams (from Controls) */}
                        {/* Gate on profileLoaded — same race-condition guard as the preferences modal */}
                        {profileLoaded ? (
                          <ControlsTab key="loaded" profile={memberProfile ?? EMPTY_PROFILE} playerProfiles={playerProfiles} plClubs={plClubs} onProfileSaved={(p) => setMemberProfile(p)} />
                        ) : (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {/* Video Channels — YouTube publisher feeds */}
                        <div className="mt-6 mb-6">
                          <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Video Channels</p>
                          <p className="text-xs text-muted-foreground mb-3">Follow YouTube channels to see their videos in your Feed</p>
                          <div className="rounded-xl border border-border bg-card divide-y divide-border">
                            {PUBLISHER_CHANNELS_UI.map(pub => {
                              const followed = (memberProfile?.favPublishers ?? []).includes(pub.slug);
                              return (
                                <div key={pub.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">{pub.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {pub.note && <span className="text-[10px] text-muted-foreground">{pub.note}</span>}
                                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">
                                        <Play size={8} /> YouTube
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = memberProfile?.favPublishers ?? [];
                                      const next = followed ? cur.filter(s => s !== pub.slug) : [...cur, pub.slug];
                                      setMemberProfile(p => p ? { ...p, favPublishers: next } : p);
                                      void persistFollows({ favPublishers: next });
                                    }}
                                    className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors"
                                    style={{
                                      background: followed ? 'hsl(var(--primary))' : 'transparent',
                                      color: followed ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                                      borderColor: followed ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                                    }}
                                  >
                                    {followed ? <><CheckCircle size={12} /> Following</> : <><Plus size={12} /> Follow</>}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Media sources (publishers, podcasts, etc.) */}
                        <div className="mt-6">
                          <p className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Media Sources</p>
                          <FanSourceBrowser />
                        </div>
                      </div>
                    )}

                    {activeTab === 'scores' && (
                      <div className="-mx-4 sm:-mx-6">
                        <InlineScoresView />
                      </div>
                    )}

                    {/* controls tab content is now merged into the sources tab */}

                    {activeTab === 'calendar' && (
                      <div>
                        {/* Schema migration required — shown when portal_context column is missing */}
                        {calendarSchemaMissing && (
                          <div
                            className="rounded-xl border p-5 mb-5 flex items-start gap-3"
                            style={{ borderColor: 'hsl(var(--destructive) / 0.4)', background: 'hsl(var(--destructive) / 0.06)' }}
                          >
                            <span className="mt-0.5 shrink-0 text-destructive">⚠</span>
                            <div>
                              <p className="text-sm font-semibold text-destructive">Calendar setup required</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                The calendar portal isolation feature requires a database migration that has not been run yet.
                                An admin must run <strong>Step 3 — Schema v4</strong> from the admin settings panel before calendar feeds can be used.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Ambiguous feed assignment — shown once when NULL-tagged feeds exist */}
                        {!calendarSchemaMissing && showAmbiguousAssignment && ambiguousFeeds.length > 0 && (
                          <div className="mb-5">
                            <AmbiguousFeedAssignment
                              feeds={ambiguousFeeds}
                              onDone={() => {
                                setShowAmbiguousAssignment(false);
                                void fetchFeeds();
                                void fetchEvents();
                              }}
                              onDismiss={() => setShowAmbiguousAssignment(false)}
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>My Calendar</h2>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-lg border border-border overflow-hidden">
                              {(['agenda', 'week', 'month'] as const).map((mode) => (
                                <button key={mode} onClick={() => setViewMode(mode)} className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                  {mode === 'agenda' ? <List size={13} /> : mode === 'week' ? <LayoutGrid size={13} /> : <Calendar size={13} />}
                                  <span className="hidden sm:inline capitalize">{mode}</span>
                                </button>
                              ))}
                            </div>
                            <button onClick={() => { setEditingPersonalEvent(null); setShowPersonalModal(true); }} className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-2 hover:opacity-90 transition">
                              <CalendarPlus size={13} /> Add event
                            </button>
                            <button onClick={() => setShowManageCalendars(true)} className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground transition">
                              <Settings size={13} /> Manage
                            </button>
                            <button onClick={handleManualRefresh} disabled={refreshing} className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground transition disabled:opacity-50">
                              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                            </button>
                          </div>
                        </div>

                        {(feeds.length > 0 || personalEvents.length > 0) && (
                          <div className="flex flex-wrap gap-2 mb-5">
                            {feeds.map((f) => {
                              const label = f.label ?? PROVIDER_LABELS[f.provider] ?? f.provider;
                              const color = f.color ?? PROVIDER_COLORS[f.provider] ?? 'hsl(var(--muted-foreground))';
                              const active = feedFilter === f.id;
                              const visible = f.visible ?? true;
                              return (
                                <button key={f.id} onClick={() => setFeedFilter(active ? null : f.id)}
                                  className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-medium transition-all border"
                                  style={active ? { background: color, color: 'hsl(var(--primary-foreground))', borderColor: color } : { borderColor: 'hsl(var(--border))', color: visible ? color : 'hsl(var(--muted-foreground))', opacity: visible ? 1 : 0.5 }}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />{label}
                                </button>
                              );
                            })}
                            {personalEvents.length > 0 && (
                              <button onClick={() => setProviderFilter(providerFilter === 'personal' ? null : 'personal')}
                                className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-medium transition-all border"
                                style={providerFilter === 'personal' ? { background: PROVIDER_COLORS.personal, color: 'hsl(var(--primary-foreground))', borderColor: PROVIDER_COLORS.personal } : { borderColor: 'hsl(var(--border))', color: PROVIDER_COLORS.personal }}>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PROVIDER_COLORS.personal }} />My Events
                              </button>
                            )}
                            {(feedFilter || providerFilter) && (
                              <button onClick={() => { setFeedFilter(null); setProviderFilter(null); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <X size={11} /> Clear
                              </button>
                            )}
                          </div>
                        )}

                        {loadingEvents ? (
                          <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-muted-foreground" /></div>
                        ) : feeds.length === 0 && personalEvents.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                            <Calendar size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
                            <p className="text-base font-semibold text-foreground mb-1">Your calendar is empty</p>
                            <p className="text-sm text-muted-foreground mb-5">Add a personal event or connect a calendar to get started.</p>
                            <div className="flex flex-wrap gap-3 justify-center">
                              <button onClick={() => { setEditingPersonalEvent(null); setShowPersonalModal(true); }} className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition">
                                <CalendarPlus size={13} /> Add your first event
                              </button>
                              <button onClick={() => setShowManageCalendars(true)} className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition">
                                <Link2 size={13} /> Connect a calendar
                              </button>
                            </div>
                          </div>
                        ) : filteredEvents.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                            <p className="text-muted-foreground text-sm">
                              {my_soccer.events.noEventsMessage}{' '}
                              {(providerFilter || feedFilter) && <button onClick={() => { setProviderFilter(null); setFeedFilter(null); }} className="underline hover:no-underline">Clear filters</button>}
                            </p>
                          </div>
                        ) : viewMode === 'month' ? (
                          <MonthView events={filteredEvents} feedPrefs={feedPrefs} feedMap={feedMap}
                            onEditPersonal={(ev) => { setEditingPersonalEvent(personalEvents.find((p) => p.id === ev.id) ?? null); setShowPersonalModal(true); }}
                            onDeletePersonal={async (ev) => { await apiFetch(`/api/my-soccer/personal-events/${ev.id}`, { method: 'DELETE' }); setPersonalEvents((prev) => prev.filter((p) => p.id !== ev.id)); }} />
                        ) : viewMode === 'week' ? (
                          <WeekView events={filteredEvents} feedPrefs={feedPrefs} feedMap={feedMap}
                            onEditPersonal={(ev) => { setEditingPersonalEvent(personalEvents.find((p) => p.id === ev.id) ?? null); setShowPersonalModal(true); }}
                            onDeletePersonal={async (ev) => { await apiFetch(`/api/my-soccer/personal-events/${ev.id}`, { method: 'DELETE' }); setPersonalEvents((prev) => prev.filter((p) => p.id !== ev.id)); }} />
                        ) : (
                          <div className="space-y-8">
                            {sortedDates.map((dateKey) => {
                              const dayEvents = grouped.get(dateKey) ?? [];
                              const date = new Date(dateKey + 'T12:00:00');
                              const isToday = dateKey === new Date().toISOString().slice(0, 10);
                              return (
                                <div key={dateKey}>
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className={`text-xs font-semibold px-3 py-1 rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                      {isToday ? 'Today' : formatDateLabel(date.toISOString())}
                                    </div>
                                    <div className="flex-1 h-px bg-border" />
                                    <span className="text-xs text-muted-foreground">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
                                  </div>
                                  <div className="space-y-2">
                                    {dayEvents.map((ev) => (
                                      <EventCard key={ev.id} event={ev}
                                        feedLabel={ev.isPersonal ? 'My Events' : (feedMap.get(ev.feedId) ?? PROVIDER_LABELS[ev.provider] ?? ev.provider)}
                                        feedPrefs={feedPrefs} isPersonal={ev.isPersonal}
                                        onEdit={ev.isPersonal ? () => { setEditingPersonalEvent(personalEvents.find((p) => p.id === ev.id) ?? null); setShowPersonalModal(true); } : undefined}
                                        onDelete={ev.isPersonal ? async () => { await apiFetch(`/api/my-soccer/personal-events/${ev.id}`, { method: 'DELETE' }); setPersonalEvents((prev) => prev.filter((p) => p.id !== ev.id)); } : undefined} />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-6 rounded-2xl border border-dashed border-border p-5 flex items-start gap-4">
                          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0"><Tv2 size={16} className="text-muted-foreground" /></div>
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-0.5">Team schedules not connected yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">Fixtures for followed clubs will appear here once a verified fixture provider is connected.</p>
                          </div>
                        </div>

                        <div className="mt-10 pt-6 border-t border-border">
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield size={14} className="text-muted-foreground" /> <span>{my_soccer.account.sectionTitle}</span></h2>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {accountPanel === 'none' && (
                              <>
                                <button onClick={() => setAccountPanel('password')} className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-2">Change password</button>
                                <LogoutButton className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-2 flex items-center gap-1.5">
                                  <LogOut size={12} /> Sign out
                                </LogoutButton>
                                <button onClick={() => setAccountPanel('delete')} className="text-xs text-destructive hover:opacity-80 transition-colors border border-destructive/30 rounded-lg px-3 py-2">Delete account…</button>
                              </>
                            )}
                          </div>
                          {accountPanel === 'password' && <div className="mt-4 max-w-sm"><ChangePasswordForm onDone={() => setAccountPanel('none')} /></div>}
                          {accountPanel === 'delete' && <div className="mt-4 max-w-sm"><DeleteAccountForm onCancel={() => setAccountPanel('none')} /></div>}
                        </div>
                      </div>
                    )}

                    </FanSectionErrorBoundary>
                  </div>{/* end main content */}

                  {/* Right mini-panels — xl desktop, my-feed only */}
                  {activeTab === 'my-feed' && (
                    <aside className="hidden xl:flex flex-col gap-4 w-56 shrink-0">
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <h3 className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Calendar</h3>
                        <p className="text-xs text-muted-foreground mb-3">Your personal plans and connected calendars.</p>
                        <button onClick={() => setActiveTab('calendar')} className="text-xs font-medium border border-border rounded-lg px-3 py-1.5 text-foreground hover:bg-muted transition-colors w-full text-left">Open Calendar</button>
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-semibold text-foreground mb-0.5">Club schedules</p>
                          <p className="text-xs text-muted-foreground">Team schedules not connected yet.</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <h3 className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Saved</h3>
                        <p className="text-xs text-muted-foreground mb-3">Keep articles, videos and episodes together.</p>
                        <button onClick={() => setActiveTab('saved')} className="text-xs font-medium border border-border rounded-lg px-3 py-1.5 text-foreground hover:bg-muted transition-colors w-full text-left">
                          {savedIds.size > 0 ? `View ${savedIds.size} saved item${savedIds.size !== 1 ? 's' : ''}` : 'View saved content'}
                        </button>
                      </div>
                    </aside>
                  )}

                </div>{/* end content + right panels row */}
              </div>{/* end main + right column wrapper */}
            </div>{/* end 3-column layout */}
          </div>
        )}
      </main>

      {/* Personal event modal */}
      {showPersonalModal && (
        <PersonalEventModal
          event={editingPersonalEvent}
          onSave={(saved) => {
            setPersonalEvents((prev) => {
              const idx = prev.findIndex((p) => p.id === saved.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
              return [...prev, saved];
            });
          }}
          onClose={() => { setShowPersonalModal(false); setEditingPersonalEvent(null); }}
        />
      )}

      {/* Manage calendars modal */}
      {showManageCalendars && (
        <ManageCalendarsModal
          connections={calConnections}
          feeds={feeds}
          onClose={() => setShowManageCalendars(false)}
          onRefresh={async () => { await fetchFeeds(); await fetchEvents(); await fetchConnections(); }}
        />
      )}

      {/* In-app reminder toasts */}
      <ReminderToast
        reminders={pendingReminders}
        onDismiss={(id) => setPendingReminders((prev) => prev.filter((r) => r.id !== id))}
      />
    </div>
  );
}
