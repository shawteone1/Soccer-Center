/**
 * PpCalendarConnections — iCal subscription setup for the Parent Portal.
 *
 * PlayMetrics and TeamSnap do not have OAuth client IDs configured on this
 * server. The supported integration path is a private iCal subscription URL,
 * which both platforms provide from their team schedule pages.
 *
 * Flow:
 *   1. User picks provider and enters their private calendar URL
 *   2. Server validates the URL (fetches + parses iCal) and returns a preview
 *   3. User assigns the feed to one or more players and saves a label
 *   4. Feed is saved (URL encrypted server-side) and shown in the connections list
 *   5. User can disconnect (delete) any feed
 *
 * Subscription URLs are NEVER returned to the browser after saving.
 * Family access: only the authenticated parent can see/manage their own feeds.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Plus, Trash2, Loader2, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Clock, MapPin, Info, RefreshCw,
} from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton, PpBadge } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalFeed {
  id: string;
  provider: string;
  label: string | null;
  lastFetchedAt: string | null;
  lastFetchStatus: string | null;
  lastFetchError: string | null;
  eventCount: number;
  createdAt: string | null;
  /** null = family-wide (legacy); string[] = scoped to these player IDs */
  playerIds: string[] | null;
}

interface PreviewEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface PlayerProfile {
  id: string;
  label: string | null;
}

type Step = 'list' | 'add-provider' | 'add-url' | 'add-preview' | 'add-assign';

const PROVIDERS = [
  {
    id: 'teamsnap',
    name: 'TeamSnap',
    desc: 'From your TeamSnap team page: Team → Schedule → Export → iCal/webcal link.',
    howTo: 'In TeamSnap, open your team, go to Schedule, click the calendar export icon, and copy the webcal:// or https:// link.',
  },
  {
    id: 'playmetrics',
    name: 'PlayMetrics',
    desc: 'From your PlayMetrics team page: Schedule → Subscribe → Copy iCal link.',
    howTo: 'In PlayMetrics, open your team schedule, click Subscribe to Calendar, and copy the .ics subscription URL.',
  },
  {
    id: 'other',
    name: 'Other (.ics)',
    desc: 'Any standard iCal (.ics) subscription URL from Google Calendar, Apple Calendar, or another provider.',
    howTo: 'Paste any https:// or webcal:// iCal subscription URL.',
  },
  {
    id: 'import',
    name: 'One-time import',
    desc: 'A snapshot of events imported once. New events added later will not appear automatically.',
    howTo: 'Paste any https:// or webcal:// iCal URL. Events are imported once and will not auto-update.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string | null) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Connected feed card ──────────────────────────────────────────────────────

function FeedCard({
  feed,
  players,
  onDisconnect,
  onPreview,
  onPlayerIdsChange,
}: {
  feed: CalFeed;
  players: PlayerProfile[];
  onDisconnect: (id: string) => void;
  onPreview: (id: string) => void;
  onPlayerIdsChange: (feedId: string, playerIds: string[] | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [savingPlayers, setSavingPlayers] = useState(false);
  // Local copy of playerIds for the edit UI
  const [draftPlayerIds, setDraftPlayerIds] = useState<string[]>(feed.playerIds ?? []);

  async function handleDisconnect() {
    if (!confirm(`Disconnect "${feed.label ?? feed.provider}"? Your calendar events from this feed will no longer appear.`)) return;
    setDisconnecting(true);
    await onDisconnect(feed.id);
    setDisconnecting(false);
  }

  async function handleSavePlayers() {
    setSavingPlayers(true);
    try {
      const res = await apiFetch(`/api/parent/calendar/feeds/${feed.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ playerIds: draftPlayerIds.length > 0 ? draftPlayerIds : null }),
      });
      if (res.ok) {
        onPlayerIdsChange(feed.id, draftPlayerIds.length > 0 ? draftPlayerIds : null);
        setEditingPlayers(false);
      }
    } finally {
      setSavingPlayers(false);
    }
  }

  function toggleDraftPlayer(id: string) {
    setDraftPlayerIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  const providerLabel = PROVIDERS.find(p => p.id === feed.provider)?.name ?? feed.provider;

  // Resolve player labels for display
  const assignedLabels = feed.playerIds && feed.playerIds.length > 0
    ? feed.playerIds.map(pid => players.find(p => p.id === pid)?.label ?? 'Unknown player').join(', ')
    : null;

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
    >
      <div className="flex items-center gap-3 p-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Calendar size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {feed.label ?? providerLabel}
            </p>
            <PpBadge variant={feed.lastFetchStatus === 'ok' ? 'success' : feed.lastFetchStatus === 'error' ? 'error' : 'default'}>
              {feed.lastFetchStatus === 'ok' ? 'Connected' : feed.lastFetchStatus === 'error' ? 'Error' : 'Pending'}
            </PpBadge>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {providerLabel} · {feed.eventCount} event{feed.eventCount !== 1 ? 's' : ''} ·{' '}
            {feed.provider === 'import'
              ? 'Imported once — not auto-updating'
              : `synced ${formatRelative(feed.lastFetchedAt)}`}
          </p>
          {/* Player assignment summary */}
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {assignedLabels
              ? <><strong>Players:</strong> {assignedLabels}</>
              : <span className="italic">Shown for all players (family feed)</span>
            }
            {players.length > 0 && (
              <button
                type="button"
                onClick={() => { setDraftPlayerIds(feed.playerIds ?? []); setEditingPlayers(e => !e); }}
                className="ml-2 underline"
                style={{ color: 'hsl(var(--pp-blue))' }}
              >
                {editingPlayers ? 'Cancel' : 'Edit'}
              </button>
            )}
          </p>
          {feed.lastFetchError && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
              <AlertCircle size={10} />
              {feed.lastFetchError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setExpanded(e => !e); if (!expanded) onPreview(feed.id); }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            title="Preview events"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            title="Disconnect"
          >
            {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {/* Player assignment editor */}
      {editingPlayers && players.length > 0 && (
        <div
          className="border-t px-3 pb-3 pt-2 space-y-2"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            Which players does this calendar belong to?
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Leave all unchecked to show events for every player (family feed).
          </p>
          <div className="space-y-1.5">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftPlayerIds.includes(p.id)}
                  onChange={() => toggleDraftPlayer(p.id)}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
                  {p.label ?? 'Unnamed player'}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <PpButton size="sm" onClick={handleSavePlayers} disabled={savingPlayers}>
              {savingPlayers ? <Loader2 size={12} className="animate-spin" /> : null}
              Save
            </PpButton>
            <PpButton size="sm" variant="outline" onClick={() => setEditingPlayers(false)}>
              Cancel
            </PpButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Preview event list ───────────────────────────────────────────────────────

function PreviewEventList({ events, loading, error }: { events: PreviewEvent[]; loading: boolean; error: string | null }) {
  if (loading) return (
    <div className="py-4 flex justify-center">
      <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
    </div>
  );
  if (error) return (
    <p className="text-xs py-3 px-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
  );
  if (events.length === 0) return (
    <p className="text-xs py-3 px-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>No upcoming events found in this feed.</p>
  );

  return (
    <div className="px-3 pb-3 space-y-2">
      {events.map(ev => (
        <div
          key={ev.uid}
          className="flex items-start gap-2 rounded-lg border px-2.5 py-2"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span className="flex items-center gap-1"><Clock size={9} />{formatDate(ev.start)}</span>
              {ev.location && <span className="flex items-center gap-1 truncate"><MapPin size={9} />{ev.location}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpCalendarConnections({ players }: { players: PlayerProfile[] }) {
  const [feeds, setFeeds] = useState<CalFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [step, setStep] = useState<Step>('list');

  // Add flow state
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [urlInput, setUrlInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([]);
  const [calendarName, setCalendarName] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Per-feed preview state
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);
  const [feedPreviewEvents, setFeedPreviewEvents] = useState<PreviewEvent[]>([]);
  const [feedPreviewLoading, setFeedPreviewLoading] = useState(false);
  const [feedPreviewError, setFeedPreviewError] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    try {
      const res = await apiFetch('/api/parent/calendar/feeds');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { feeds: CalFeed[] };
      setFeeds(data.feeds);
    } catch {
      // Non-fatal
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  function resetAddFlow() {
    setStep('list');
    setSelectedProvider('');
    setUrlInput('');
    setLabelInput('');
    setValidateError(null);
    setPreviewEvents([]);
    setCalendarName(null);
    setSelectedPlayerIds([]);
    setSaveError(null);
  }

  async function handleValidate() {
    setValidating(true);
    setValidateError(null);
    try {
      const res = await apiFetch('/api/parent/calendar/feeds/validate', {
        method: 'POST',
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json() as {
        valid?: boolean;
        calendarName?: string | null;
        events?: PreviewEvent[];
        error?: string;
      };
      if (!res.ok || !data.valid) {
        setValidateError(data.error ?? 'Validation failed');
        return;
      }
      setPreviewEvents(data.events ?? []);
      setCalendarName(data.calendarName ?? null);
      if (!labelInput && data.calendarName) setLabelInput(data.calendarName);
      setStep('add-preview');
    } catch (e) {
      setValidateError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch('/api/parent/calendar/feeds', {
        method: 'POST',
        body: JSON.stringify({
          provider: selectedProvider,
          label: labelInput || calendarName || selectedProvider,
          url: urlInput,
          playerIds: selectedPlayerIds,
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save');
        return;
      }
      await loadFeeds();
      resetAddFlow();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(feedId: string) {
    try {
      await apiFetch(`/api/parent/calendar/feeds/${feedId}`, { method: 'DELETE' });
      setFeeds(prev => prev.filter(f => f.id !== feedId));
      if (expandedFeedId === feedId) setExpandedFeedId(null);
    } catch { /* non-fatal */ }
  }

  async function handlePreview(feedId: string) {
    if (expandedFeedId === feedId) {
      setExpandedFeedId(null);
      return;
    }
    setExpandedFeedId(feedId);
    setFeedPreviewLoading(true);
    setFeedPreviewError(null);
    setFeedPreviewEvents([]);
    try {
      const res = await apiFetch(`/api/parent/calendar/feeds/${feedId}/preview`);
      const data = await res.json() as { events?: PreviewEvent[]; error?: string };
      if (!res.ok) {
        setFeedPreviewError(data.error ?? 'Preview failed');
        return;
      }
      setFeedPreviewEvents(data.events ?? []);
    } catch (e) {
      setFeedPreviewError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setFeedPreviewLoading(false);
    }
  }

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function handlePlayerIdsChange(feedId: string, playerIds: string[] | null) {
    setFeeds(prev => prev.map(f => f.id === feedId ? { ...f, playerIds } : f));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>Calendar connections</PpSectionHeading>
        {step === 'list' && (
          <PpButton size="sm" onClick={() => setStep('add-provider')}>
            <Plus size={12} />
            Add feed
          </PpButton>
        )}
        {step !== 'list' && (
          <button
            type="button"
            onClick={resetAddFlow}
            className="text-xs"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* ── Integration notice ── */}
      <div
        className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>
          <strong>Read-only iCal subscription.</strong> TeamSnap and PlayMetrics do not have direct API access configured.
          Use the private iCal/webcal URL from your team's schedule page.
          Your subscription URL is encrypted and never shown again after saving.
        </span>
      </div>

      {/* ── Step: list ── */}
      {step === 'list' && (
        <>
          {feedsLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </div>
          ) : feeds.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <Calendar size={28} className="mx-auto" style={{ color: 'hsl(var(--pp-text-muted))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No calendar feeds connected yet.
              </p>
              <PpButton size="sm" onClick={() => setStep('add-provider')}>
                <Plus size={12} />
                Add your first feed
              </PpButton>
            </div>
          ) : (
            <div className="space-y-2">
              {feeds.map(feed => (
                <div key={feed.id}>
                  <FeedCard
                    feed={feed}
                    players={players}
                    onDisconnect={handleDisconnect}
                    onPreview={handlePreview}
                    onPlayerIdsChange={handlePlayerIdsChange}
                  />
                  {expandedFeedId === feed.id && (
                    <div
                      className="rounded-b-xl border border-t-0 mt-[-1px]"
                      style={{ borderColor: 'hsl(var(--pp-border))' }}
                    >
                      <PreviewEventList
                        events={feedPreviewEvents}
                        loading={feedPreviewLoading}
                        error={feedPreviewError}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-1">
                <PpButton variant="outline" size="sm" onClick={() => setStep('add-provider')}>
                  <Plus size={12} />
                  Add another feed
                </PpButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step: choose provider ── */}
      {step === 'add-provider' && (
        <div className="space-y-3">
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            Choose your calendar provider
          </p>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedProvider(p.id); setStep('add-url'); }}
              className="w-full text-left flex items-start gap-3 rounded-xl border p-3 transition-colors"
              style={{
                borderColor: selectedProvider === p.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                background: 'hsl(var(--pp-card-bg))',
              }}
            >
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'hsl(var(--pp-blue-light))' }}
              >
                <Calendar size={15} style={{ color: 'hsl(var(--pp-navy))' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{p.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Step: enter URL ── */}
      {step === 'add-url' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
              {PROVIDERS.find(p => p.id === selectedProvider)?.name} — subscription URL
            </p>
            <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {PROVIDERS.find(p => p.id === selectedProvider)?.howTo}
            </p>
            <input
              type="url"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setValidateError(null); }}
              placeholder="https:// or webcal://"
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{
                borderColor: validateError ? 'hsl(var(--pp-badge-error-fg))' : 'hsl(var(--pp-border))',
                background: 'hsl(var(--pp-page-bg))',
                color: 'hsl(var(--pp-text))',
              }}
            />
            {validateError && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
                <AlertCircle size={11} />
                {validateError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <PpButton
              onClick={handleValidate}
              disabled={!urlInput.trim() || validating}
            >
              {validating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {validating ? 'Checking…' : 'Validate & preview'}
            </PpButton>
            <PpButton variant="outline" onClick={() => setStep('add-provider')}>
              Back
            </PpButton>
          </div>
        </div>
      )}

      {/* ── Step: preview ── */}
      {step === 'add-preview' && (
        <div className="space-y-4">
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle size={13} className="shrink-0" />
            <span>
              <strong>Valid iCal feed.</strong>{' '}
              {calendarName ? `Calendar name: "${calendarName}". ` : ''}
              {previewEvents.length} upcoming event{previewEvents.length !== 1 ? 's' : ''} found.
            </span>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
              Feed label
            </label>
            <input
              type="text"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder={calendarName ?? `${PROVIDERS.find(p => p.id === selectedProvider)?.name} calendar`}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: 'hsl(var(--pp-border))',
                background: 'hsl(var(--pp-page-bg))',
                color: 'hsl(var(--pp-text))',
              }}
            />
          </div>

          {/* Event preview */}
          {previewEvents.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
                Upcoming events preview
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {previewEvents.map(ev => (
                  <div
                    key={ev.uid}
                    className="flex items-start gap-2 rounded-lg border px-2.5 py-2"
                    style={{ borderColor: 'hsl(var(--pp-border))' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{ev.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        <span className="flex items-center gap-1"><Clock size={9} />{formatDate(ev.start)}</span>
                        {ev.location && <span className="flex items-center gap-1 truncate"><MapPin size={9} />{ev.location}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <PpButton onClick={() => setStep('add-assign')}>
              Next: assign players
            </PpButton>
            <PpButton variant="outline" onClick={() => setStep('add-url')}>
              Back
            </PpButton>
          </div>
        </div>
      )}

      {/* ── Step: assign players ── */}
      {step === 'add-assign' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
              Which players does this calendar belong to?
            </p>
            <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Optional — helps color-code events on the calendar.
            </p>
            {players.length === 0 ? (
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No players added yet. You can assign players later.
              </p>
            ) : (
              <div className="space-y-2">
                {players.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors text-left"
                    style={{
                      borderColor: selectedPlayerIds.includes(p.id) ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                      background: selectedPlayerIds.includes(p.id) ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-card-bg))',
                    }}
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
                    >
                      {(p.label ?? '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
                      {p.label ?? 'Unnamed player'}
                    </span>
                    {selectedPlayerIds.includes(p.id) && (
                      <CheckCircle size={14} className="ml-auto" style={{ color: 'hsl(var(--pp-navy))' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {saveError && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
              <AlertCircle size={11} />
              {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <PpButton onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {saving ? 'Saving…' : 'Save connection'}
            </PpButton>
            <PpButton variant="outline" onClick={() => setStep('add-preview')}>
              Back
            </PpButton>
          </div>
        </div>
      )}
    </PpCard>
  );
}
