/**
 * PlayerCalendarSetup — optional Step 7 of the Add/Edit Player wizard.
 *
 * Offers three choices:
 *   1. Connect a calendar feed (TeamSnap, PlayMetrics, or other iCal URL)
 *   2. Build a schedule manually (games + recurring practices)
 *   3. Skip for now
 *
 * Saving a player must not require a calendar — this step is always skippable.
 * Calendar failure must not lose the player or create duplicates.
 * The same options are available later from the player's Schedule tab.
 *
 * Feed URLs are treated as sensitive: validated and fetched server-side only.
 * They are never logged or returned to the browser after saving.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Wifi, Calendar, ChevronRight, Loader2, Check, AlertCircle,
  Plus, Trash2, RefreshCw, X, Link, Upload,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SetupChoice = 'feed' | 'manual' | 'skip';

interface FeedPreviewEvent {
  uid: string;
  /** Validate endpoint returns "title" not "summary" */
  title: string;
  start: string;
  end: string | null;
  location: string | null;
}

interface ExistingFeed {
  id: string;
  label: string;
  provider: string;
  playerIds: string[] | null;
}

interface ManualGame {
  id: string;
  opponent: string;
  homeAway: 'home' | 'away' | '';
  venue: string;
  date: string;
  time: string;
  notes: string;
}

interface RecurringPractice {
  id: string;
  weekdays: number[]; // 0=Sun … 6=Sat
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  location: string;
  timezone: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  { value: 'other',       label: 'Other iCal',  hint: 'Any iCal subscription URL (https:// or webcal://)' },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text', required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      style={{
        borderColor: 'hsl(var(--pp-border))',
        background: 'hsl(var(--pp-white))',
        color: 'hsl(var(--pp-text))',
      }}
    />
  );
}

// ─── Feed setup ───────────────────────────────────────────────────────────────

function FeedSetup({ playerId, onSaved, onSkip }: {
  playerId: string;
  onSaved: () => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState('teamsnap');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<FeedPreviewEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Existing feeds — offer reuse
  const [existingFeeds, setExistingFeeds] = useState<ExistingFeed[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const [reuseMode, setReuseMode] = useState(false);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parent/calendar/feeds', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { feeds?: ExistingFeed[] }) => {
        const feeds = d.feeds ?? [];
        setExistingFeeds(feeds);
        // Auto-switch to reuse mode if feeds exist that don't already include this player
        const reusable = feeds.filter(f => !f.playerIds?.includes(playerId));
        if (reusable.length > 0) setReuseMode(true);
      })
      .catch(() => undefined)
      .finally(() => setLoadingFeeds(false));
  }, [playerId]);

  const selectedProvider = PROVIDER_OPTIONS.find(p => p.value === provider);

  const handleValidate = useCallback(async () => {
    if (!url.trim()) { setError('Paste a subscription URL first.'); return; }
    setValidating(true);
    setError(null);
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
      if (!res.ok || !data.valid) {
        throw new Error(data.error ?? 'Feed validation failed. Check the URL and try again.');
      }
      setValidated(true);
      setPreviewEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, [url]);

  const handleImportFile = useCallback(async () => {
    if (!importFile) { setError('Select a .ics file first.'); return; }
    if (!label.trim()) { setError('Give this import a name.'); return; }
    // Step 1: preview (no DB writes)
    if (!importConfirmed) {
      setImportPreviewing(true);
      setError(null);
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
        setImportConfirmed(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setImportPreviewing(false);
      }
      return;
    }
    // Step 2: confirmed — commit to DB
    setSaving(true);
    setError(null);
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
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }, [importFile, importConfirmed, label, playerId, onSaved]);

  const handleSaveNew = useCallback(async () => {
    if (!validated) { setError('Validate the feed first.'); return; }
    if (!label.trim()) { setError('Give this feed a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/parent/calendar/feeds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: importMode === 'import' ? 'import' : provider,
          label: label.trim(),
          url: url.trim(),
          playerIds: [playerId],
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      // Trigger an initial sync for the new feed
      if (data.id) {
        await fetch(`/api/parent/calendar/feeds/${data.id}/sync`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => undefined); // non-fatal
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [validated, label, provider, url, playerId, onSaved]);

  const handleReuseExisting = useCallback(async () => {
    if (!selectedFeedId) { setError('Select a feed to reuse.'); return; }
    setSaving(true);
    setError(null);
    try {
      // PATCH the feed to add this player to its playerIds list
      const res = await fetch(`/api/parent/calendar/feeds/${encodeURIComponent(selectedFeedId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addPlayerId: playerId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to associate feed');

      // Trigger a sync so the player sees events immediately
      await fetch(`/api/parent/calendar/feeds/${encodeURIComponent(selectedFeedId)}/sync`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => undefined);

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reuse feed');
    } finally {
      setSaving(false);
    }
  }, [selectedFeedId, playerId, onSaved]);

  const reusableFeeds = existingFeeds.filter(f => !f.playerIds?.includes(playerId));
  const alreadyLinkedFeeds = existingFeeds.filter(f => f.playerIds?.includes(playerId));

  return (
    <div className="space-y-5">
      {/* Privacy notice */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Wifi size={12} className="mt-0.5 shrink-0" />
        <p>
          This imports your schedule — it does not connect a vendor account or sync a player roster.
          The subscription URL is stored encrypted and never shared.
        </p>
      </div>

      {/* Already linked */}
      {alreadyLinkedFeeds.length > 0 && (
        <div
          className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: 'hsl(var(--pp-page-bg))', border: '1px solid hsl(var(--pp-border))' }}
        >
          <Check size={12} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-green))' }} />
          <div>
            <p className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              Feed already connected
            </p>
            {alreadyLinkedFeeds.map(f => (
              <p key={f.id} style={{ color: 'hsl(var(--pp-text-muted))' }}>{f.label}</p>
            ))}
          </div>
        </div>
      )}

      {/* Mode toggle: reuse vs new */}
      {!loadingFeeds && reusableFeeds.length > 0 && (
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
            Use existing feed
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
            Connect new feed
          </button>
        </div>
      )}

      {/* Reuse existing feed */}
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

          {error && (
            <div
              className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
              style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={() => void handleReuseExisting()}
              disabled={!selectedFeedId || saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Linking…</> : 'Link feed to player'}
            </button>
          </div>
        </div>
      ) : !reuseMode || reusableFeeds.length === 0 ? (
        /* New feed form */
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
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
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
            <FieldLabel>Feed name</FieldLabel>
            <TextInput
              value={label}
              onChange={setLabel}
              placeholder={`e.g. ${provider === 'teamsnap' ? 'TeamSnap — Avery' : provider === 'playmetrics' ? 'PlayMetrics — Avery' : 'My iCal feed'}`}
            />
          </div>

          {/* URL (subscribe) or file picker (import) */}
          {importMode === 'subscribe' ? (
            <div>
              <FieldLabel>Subscription URL</FieldLabel>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setValidated(false); setPreviewEvents([]); }}
                  placeholder="https:// or webcal://"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{
                    borderColor: 'hsl(var(--pp-border))',
                    background: 'hsl(var(--pp-white))',
                    color: 'hsl(var(--pp-text))',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleValidate()}
                  disabled={validating || !url.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors disabled:opacity-50 shrink-0"
                  style={{
                    borderColor: 'hsl(var(--pp-border))',
                    color: 'hsl(var(--pp-navy))',
                    background: 'transparent',
                  }}
                >
                  {validating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {validating ? 'Checking…' : 'Validate'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <FieldLabel>Select .ics file</FieldLabel>
              <label
                className="flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors"
                style={{
                  borderColor: importFile ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: importFile ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                }}
              >
                <Upload size={14} style={{ color: 'hsl(var(--pp-navy))' }} className="shrink-0" />
                <span className="text-sm flex-1 truncate" style={{ color: importFile ? 'hsl(var(--pp-text))' : 'hsl(var(--pp-text-muted))' }}>
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
                    setError(null);
                  }}
                />
              </label>
              {importFile && !importConfirmed && (
                <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
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

          {/* Validation result (subscribe mode only) */}
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

          {error && (
            <div
              className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
              style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              Skip for now
            </button>
            {importMode === 'subscribe' ? (
              <button
                type="button"
                onClick={() => void handleSaveNew()}
                disabled={!validated || !label.trim() || saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Connect feed'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleImportFile()}
                disabled={!fileValidated || !importFile || !label.trim() || saving || importPreviewing}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {importPreviewing
                  ? <><Loader2 size={14} className="animate-spin" /> Previewing…</>
                  : saving
                    ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                    : importConfirmed
                      ? 'Confirm import'
                      : 'Preview events'
                }
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Manual schedule builder ──────────────────────────────────────────────────

function newGame(): ManualGame {
  return { id: crypto.randomUUID(), opponent: '', homeAway: '', venue: '', date: '', time: '', notes: '' };
}

function newPractice(): RecurringPractice {
  return {
    id: crypto.randomUUID(),
    weekdays: [],
    startTime: '17:00',
    endTime: '18:30',
    startDate: '',
    endDate: '',
    location: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function ManualScheduleBuilder({ playerId, onSaved, onSkip }: {
  playerId: string;
  onSaved: () => void;
  onSkip: () => void;
}) {
  const [games, setGames] = useState<ManualGame[]>([newGame()]);
  const [practices, setPractices] = useState<RecurringPractice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPractice, setPreviewPractice] = useState<string | null>(null);

  function updateGame(id: string, patch: Partial<ManualGame>) {
    setGames(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }

  function updatePractice(id: string, patch: Partial<RecurringPractice>) {
    setPractices(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function toggleWeekday(practiceId: string, day: number) {
    setPractices(prev => prev.map(p => {
      if (p.id !== practiceId) return p;
      const days = p.weekdays.includes(day)
        ? p.weekdays.filter(d => d !== day)
        : [...p.weekdays, day].sort();
      return { ...p, weekdays: days };
    }));
  }

  // Generate a human-readable preview of recurring practice occurrences
  function previewOccurrences(p: RecurringPractice): string[] {
    if (!p.startDate || !p.endDate || p.weekdays.length === 0) return [];
    const results: string[] = [];
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    const cur = new Date(start);
    while (cur <= end && results.length < 5) {
      if (p.weekdays.includes(cur.getDay())) {
        results.push(cur.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      }
      cur.setDate(cur.getDate() + 1);
    }
    return results;
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Save games
      const validGames = games.filter(g => g.date && g.time);
      for (const g of validGames) {
        await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/schedule/games`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: g.opponent ? `vs ${g.opponent}` : 'Game',
            opponent: g.opponent || null,
            homeAway: g.homeAway || null,
            venue: g.venue || null,
            startDate: `${g.date}T${g.time}:00`,
            notes: g.notes || null,
          }),
        });
      }

      // Save recurring practices
      for (const p of practices) {
        if (!p.startDate || !p.endDate || p.weekdays.length === 0) continue;
        await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/schedule/practices`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekdays: p.weekdays,
            startTime: p.startTime,
            endTime: p.endTime,
            startDate: p.startDate,
            endDate: p.endDate,
            location: p.location || null,
            timezone: p.timezone,
          }),
        });
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Your player has already been saved — you can add the schedule later from the Schedule tab.');
    } finally {
      setSaving(false);
    }
  }, [games, practices, playerId, onSaved]);

  const hasAnything = games.some(g => g.date && g.time) || practices.some(p => p.startDate && p.endDate && p.weekdays.length > 0);

  return (
    <div className="space-y-6">
      {/* Games */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Games
          </p>
          <button
            type="button"
            onClick={() => setGames(prev => [...prev, newGame()])}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: 'hsl(var(--pp-blue))' }}
          >
            <Plus size={12} /> Add game
          </button>
        </div>

        <div className="space-y-4">
          {games.map((g, idx) => (
            <div
              key={g.id}
              className="rounded-xl border p-3 space-y-3"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Game {idx + 1}
                </p>
                {games.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGames(prev => prev.filter(x => x.id !== g.id))}
                    className="p-1 rounded"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                    aria-label="Remove game"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldLabel>Opponent</FieldLabel>
                  <TextInput value={g.opponent} onChange={v => updateGame(g.id, { opponent: v })} placeholder="e.g. FC Denver" />
                </div>
                <div>
                  <FieldLabel>Date *</FieldLabel>
                  <TextInput type="date" value={g.date} onChange={v => updateGame(g.id, { date: v })} required />
                </div>
                <div>
                  <FieldLabel>Time *</FieldLabel>
                  <TextInput type="time" value={g.time} onChange={v => updateGame(g.id, { time: v })} required />
                </div>
                <div>
                  <FieldLabel>Home / Away</FieldLabel>
                  <select
                    value={g.homeAway}
                    onChange={e => updateGame(g.id, { homeAway: e.target.value as ManualGame['homeAway'] })}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  >
                    <option value="">—</option>
                    <option value="home">Home</option>
                    <option value="away">Away</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Venue</FieldLabel>
                  <TextInput value={g.venue} onChange={v => updateGame(g.id, { venue: v })} placeholder="Field name" />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput value={g.notes} onChange={v => updateGame(g.id, { notes: v })} placeholder="Optional" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recurring practices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Recurring practices
          </p>
          <button
            type="button"
            onClick={() => setPractices(prev => [...prev, newPractice()])}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: 'hsl(var(--pp-blue))' }}
          >
            <Plus size={12} /> Add practice series
          </button>
        </div>

        {practices.length === 0 && (
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            No recurring practices added. Click "Add practice series" to set up weekly practices.
          </p>
        )}

        <div className="space-y-4">
          {practices.map((p, idx) => {
            const occurrences = previewOccurrences(p);
            return (
              <div
                key={p.id}
                className="rounded-xl border p-3 space-y-3"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Practice series {idx + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPractices(prev => prev.filter(x => x.id !== p.id))}
                    className="p-1 rounded"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                    aria-label="Remove practice series"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Weekdays */}
                <div>
                  <FieldLabel>Days of week</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(p.id, day)}
                        className="h-8 w-10 rounded-lg text-xs font-semibold border transition-colors"
                        style={{
                          background: p.weekdays.includes(day) ? 'hsl(var(--pp-navy))' : 'transparent',
                          color: p.weekdays.includes(day) ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                          borderColor: p.weekdays.includes(day) ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Start time</FieldLabel>
                    <TextInput type="time" value={p.startTime} onChange={v => updatePractice(p.id, { startTime: v })} />
                  </div>
                  <div>
                    <FieldLabel>End time</FieldLabel>
                    <TextInput type="time" value={p.endTime} onChange={v => updatePractice(p.id, { endTime: v })} />
                  </div>
                  <div>
                    <FieldLabel>Series start date</FieldLabel>
                    <TextInput type="date" value={p.startDate} onChange={v => updatePractice(p.id, { startDate: v })} />
                  </div>
                  <div>
                    <FieldLabel>Series end date</FieldLabel>
                    <TextInput type="date" value={p.endDate} onChange={v => updatePractice(p.id, { endDate: v })} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Location</FieldLabel>
                    <TextInput value={p.location} onChange={v => updatePractice(p.id, { location: v })} placeholder="Practice field" />
                  </div>
                </div>

                {/* Preview occurrences */}
                {occurrences.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setPreviewPractice(previewPractice === p.id ? null : p.id)}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{ color: 'hsl(var(--pp-blue))' }}
                    >
                      <Calendar size={11} />
                      {previewPractice === p.id ? 'Hide' : 'Preview'} occurrences
                    </button>
                    {previewPractice === p.id && (
                      <div className="mt-2 space-y-1">
                        {occurrences.map((o, i) => (
                          <p key={i} className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                            {o} · {p.startTime}–{p.endTime}
                            {p.location ? ` · ${p.location}` : ''}
                          </p>
                        ))}
                        <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          Showing first 5 occurrences
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
          style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasAnything || saving}
          className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save schedule'}
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * PlayerCalendarSetup
 *
 * Renders the optional "Add a schedule" step after a player has been saved.
 * playerId must be the ID of the already-saved player.
 * onComplete is called when the user finishes (feed saved, manual saved, or skipped).
 */
export default function PlayerCalendarSetup({
  playerId,
  onComplete,
}: {
  playerId: string;
  onComplete: () => void;
}) {
  const [choice, setChoice] = useState<SetupChoice | null>(null);

  if (choice === 'feed') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChoice(null)}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Back"
          >
            <X size={14} />
          </button>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Connect a calendar feed
          </p>
        </div>
        <FeedSetup playerId={playerId} onSaved={onComplete} onSkip={onComplete} />
      </div>
    );
  }

  if (choice === 'manual') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChoice(null)}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Back"
          >
            <X size={14} />
          </button>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Build a schedule
          </p>
        </div>
        <ManualScheduleBuilder playerId={playerId} onSaved={onComplete} onSkip={onComplete} />
      </div>
    );
  }

  // Choice picker
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
          Add a schedule — optional
        </p>
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          You can also do this later from the player's Schedule tab.
        </p>
      </div>

      <div className="space-y-2">
        {/* Connect a feed */}
        <button
          type="button"
          onClick={() => setChoice('feed')}
          className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-pp-navy focus-visible:outline focus-visible:outline-2"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Wifi size={18} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              Connect a calendar feed
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Import from TeamSnap, PlayMetrics, or any iCal URL
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>

        {/* Build manually */}
        <button
          type="button"
          onClick={() => setChoice('manual')}
          className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-pp-navy focus-visible:outline focus-visible:outline-2"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Calendar size={18} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              Build a schedule manually
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Add individual games and recurring practices
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>

        {/* Skip */}
        <button
          type="button"
          onClick={onComplete}
          className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'transparent' }}
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-page-bg))' }}
          >
            <X size={18} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Skip for now
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Add a schedule later from the player's Schedule tab
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </button>
      </div>
    </div>
  );
}
