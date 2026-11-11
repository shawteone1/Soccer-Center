/**
 * GameDetailsPanel
 *
 * Opens from a scheduled game event. Pre-populates opponent, date, venue from
 * the event. Lets the user record stats and attach media. Saves through the
 * existing match-records and media-assignments endpoints.
 *
 * The event's id is used as the event_ref in sc_player_match_records so that
 * stats and media are stably associated with the same game across edits.
 *
 * Design rules:
 *   - Never closes on backdrop click while saving.
 *   - Retains all entered values on failure.
 *   - Does not report success until the server confirms it.
 *   - Saving stats updates the game log and season totals (via reload).
 *   - Attaching media tags it to the game (gameEventRef = event.id).
 *   - Existing stats and media for this event are loaded on open.
 *   - Missing stats (null) are distinct from recorded zero values.
 *   - Scheduled games do not count as appearances without confirmed participation.
 *
 * iCal-feed resilience:
 *   - Stats and media are keyed on event_ref (the event id), not on the
 *     calendar event row itself. If a feed refreshes and the event row is
 *     replaced, the event_ref is preserved in the match record so stats
 *     survive. Media assignments use game_event_ref for the same reason.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Loader2, Check, AlertCircle, Upload, Image, Play,
  BarChart2, Film, ChevronRight, Plus, ChevronLeft, Trash2,
} from 'lucide-react';
import { PpButton } from './PpPrimitives';
import { checkMediaUpload } from '@/lib/portal/media-upload-preflight';
import { buildEventRef, eventRefMatches } from '@/lib/portal/event-ref';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  notes: string | null;
  eventType: string | null;
  source: 'manual' | 'feed';
  // feedId is present for feed events. Combined with id (the iCal UID),
  // it forms the stable composite event_ref: `${feedId}:${id}`.
  // This scopes the UID to its originating feed so two feeds with the same
  // UID (non-standard but possible) don't collide in match records.
  feedId?: string | null;
}

interface MatchRecord {
  id: string;
  match_date: string;
  opponent: string;
  goals: number | null;
  assists: number | null;
  ga: number | null;
  saves: number | null;
  shutouts: number | null;
  notes: string | null;
  season: string | null;
  event_ref: string | null;
}

interface MediaAssignment {
  id: string;
  mediaId: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  caption: string | null;
  originalName: string | null;
  // gameEventRef is returned by GET /media-assignments and used to filter
  // assignments to this specific event. Declared here so the filter below
  // can read it without an unsafe cast.
  gameEventRef: string | null;
}

interface LibraryItem {
  id: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  caption: string | null;
  originalName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

/** Extract opponent from event title — strips "vs ", "@ ", "v " prefixes */
function opponentFromTitle(title: string): string {
  return title
    .replace(/^(vs\.?\s*|@\s*|v\s+)/i, '')
    .replace(/\s*[-–]\s*.*$/, '')
    .trim();
}

/** Extract season from a date string — "2026-10-15" → "2026-27" */
function seasonFromDate(iso: string): string {
  try {
    const year = new Date(iso).getFullYear();
    const month = new Date(iso).getMonth() + 1; // 1-based
    // Soccer season: Aug–Jul
    const startYear = month >= 8 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(2)}`;
  } catch { return ''; }
}

const CURRENT_SEASON = '2026-27';

// ─── NumInput ─────────────────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {label}
      </label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        style={{
          borderColor: 'hsl(var(--pp-border))',
          background: 'hsl(var(--pp-card-bg))',
          color: 'hsl(var(--pp-text))',
        }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameDetailsPanel({
  event,
  playerId,
  position,
  onClose,
  onSaved,
}: {
  event: ScheduleEvent;
  playerId: string;
  position?: string | null;
  onClose: () => void;
  /** Called after stats or media are saved so the parent can refresh. */
  onSaved?: () => void;
}) {
  const isGk = (() => {
    const p = (position ?? '').toLowerCase();
    return p.includes('goalkeeper') || p.includes('keeper') || p === 'gk';
  })();

  // Stable event_ref used in match records and media assignments.
  // Computed via the shared buildEventRef helper so GameDetailsPanel,
  // PlayerMediaTab, and GameSelector all produce the same string for the
  // same event. See src/lib/portal/event-ref.ts for the full contract.
  const eventRef = buildEventRef(event);

  // Ref that always holds the CURRENT eventRef so async callbacks can detect
  // whether the panel has moved to a different event while they were in flight.
  // A closure-captured `eventRef` would always equal `capturedRef` because both
  // are captured at the same render — using a ref breaks that symmetry.
  const currentEventRefRef = useRef(eventRef);
  useEffect(() => { currentEventRefRef.current = eventRef; }, [eventRef]);

  // ── Existing record for this event ──────────────────────────────────────────
  const [existingRecord, setExistingRecord] = useState<MatchRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [tableAvailable, setTableAvailable] = useState<boolean | null>(null);

  // ── Stats form ──────────────────────────────────────────────────────────────
  const [participated, setParticipated] = useState<boolean | null>(null);
  const [formGoals, setFormGoals]     = useState('');
  const [formAssists, setFormAssists] = useState('');
  const [formGa, setFormGa]           = useState('');
  const [formSaves, setFormSaves]     = useState('');
  const [formShutouts, setFormShutouts] = useState('');
  const [formNotes, setFormNotes]     = useState('');
  const [formSeason, setFormSeason]   = useState(seasonFromDate(event.startAt) || CURRENT_SEASON);
  const [statsSaving, setStatsSaving] = useState(false);
  const [statsError, setStatsError]   = useState<string | null>(null);
  const [statsSaved, setStatsSaved]   = useState(false);

  // ── Media ────────────────────────────────────────────────────────────────────
  const [mediaAssignments, setMediaAssignments] = useState<MediaAssignment[]>([]);
  const [loadingMedia, setLoadingMedia]         = useState(true);
  const [showMediaPanel, setShowMediaPanel]     = useState(false);
  const [mediaTab, setMediaTab]                 = useState<'upload' | 'library'>('upload');
  const [mediaFile, setMediaFile]               = useState<File | null>(null);
  const [mediaCaption, setMediaCaption]         = useState('');
  const [library, setLibrary]                   = useState<LibraryItem[]>([]);
  const [libLoading, setLibLoading]             = useState(false);
  const [mediaUploading, setMediaUploading]     = useState(false);
  const [mediaAssigning, setMediaAssigning]     = useState<string | null>(null);
  const [mediaError, setMediaError]             = useState<string | null>(null);
  const [mediaSaved, setMediaSaved]             = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Multi-select for library tab
  const [libSelected, setLibSelected]           = useState<Set<string>>(new Set());
  const [libAttaching, setLibAttaching]         = useState(false);

  // Lightbox / viewer
  const [lightboxIndex, setLightboxIndex]       = useState<number | null>(null);
  const [imgError, setImgError]                 = useState<Record<string, boolean>>({});
  const [removingId, setRemovingId]             = useState<string | null>(null);

  // ── Active panel tab ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'stats' | 'media'>('stats');

  // ── Load existing match record for this event ────────────────────────────────
  const loadRecord = useCallback(async () => {
    setLoadingRecord(true);
    // Reset form to blank before loading so switching games never shows stale values
    setParticipated(null);
    setFormGoals('');
    setFormAssists('');
    setFormGa('');
    setFormSaves('');
    setFormShutouts('');
    setFormNotes('');
    setFormSeason(seasonFromDate(event.startAt) || CURRENT_SEASON);
    setStatsSaved(false);
    setStatsError(null);

    // Capture the eventRef at call time. After the await, compare against
    // currentEventRefRef.current (updated by the useEffect above) rather than
    // the closure-captured `eventRef` — both would be identical in the same
    // render, making the guard a no-op. The ref always reflects the latest prop.
    const capturedRef = eventRef;
    try {
      const res = await fetch(`/api/parent/players/${playerId}/match-records`, {
        credentials: 'include',
      });
      if (!res.ok) { setTableAvailable(false); return; }
      const data = await res.json() as { tableAvailable: boolean; records: MatchRecord[] };
      // Discard stale response if the panel has moved to a different event
      if (capturedRef !== currentEventRefRef.current) return;
      setTableAvailable(data.tableAvailable);
      if (!data.tableAvailable) return;
      // Find the record linked to this event.
      // eventRefMatches checks both the composite form (feedId:uid) and the
      // legacy plain event.id so records saved before the composite scheme
      // was introduced are still found.
      const linked = data.records.find(r =>
        eventRefMatches(r.event_ref, event)
      ) ?? null;
      setExistingRecord(linked);
      if (linked) {
        setParticipated(true);
        setFormGoals(linked.goals    != null ? String(linked.goals)    : '');
        setFormAssists(linked.assists != null ? String(linked.assists)  : '');
        setFormGa(linked.ga           != null ? String(linked.ga)       : '');
        setFormSaves(linked.saves     != null ? String(linked.saves)    : '');
        setFormShutouts(linked.shutouts != null ? String(linked.shutouts) : '');
        setFormNotes(linked.notes ?? '');
        setFormSeason((linked.season ?? seasonFromDate(event.startAt)) || CURRENT_SEASON);
      }
    } catch { /* ignore */ }
    finally { setLoadingRecord(false); }
  }, [playerId, eventRef, event.startAt, event]);

  // ── Load media assigned to this event ────────────────────────────────────────
  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const res = await fetch(
        `/api/parent/players/${playerId}/media-assignments`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = await res.json() as { assignments: MediaAssignment[] };
      // Filter to assignments tagged with this event's ref.
      // eventRefMatches checks both the composite ref (feedId:uid) and the
      // legacy plain event.id so records saved before the composite scheme
      // are still found.
      setMediaAssignments(
        (data.assignments ?? []).filter(a =>
          eventRefMatches(a.gameEventRef, event)
        )
      );
    } catch { /* ignore */ }
    finally { setLoadingMedia(false); }
  }, [playerId, eventRef]);

  useEffect(() => {
    void loadRecord();
    void loadMedia();
  }, [loadRecord, loadMedia]);

  // ── Load library when switching to library tab ────────────────────────────────
  useEffect(() => {
    if (mediaTab !== 'library') return;
    setLibLoading(true);
    fetch('/api/parent/media?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { media?: LibraryItem[] }) => setLibrary(d.media ?? []))
      .catch(() => undefined)
      .finally(() => setLibLoading(false));
  }, [mediaTab]);

  // ── Save stats ────────────────────────────────────────────────────────────────
  async function saveStats() {
    if (participated === null) {
      setStatsError('Confirm whether the player participated before saving.');
      return;
    }
    if (!participated) {
      // Record non-participation — save a record with no stats
      // so the game appears in the log as "did not play"
    }

    setStatsSaving(true);
    setStatsError(null);
    setStatsSaved(false);

    const toNum = (v: string) => v !== '' ? Number(v) : null;
    const opponent = opponentFromTitle(event.title) || event.title;
    const matchDate = event.startAt.slice(0, 10);

    const body = {
      match_date: matchDate,
      opponent,
      goals:    participated ? toNum(formGoals)    : null,
      assists:  participated ? toNum(formAssists)  : null,
      ga:       participated ? toNum(formGa)       : null,
      saves:    participated ? toNum(formSaves)    : null,
      shutouts: participated ? toNum(formShutouts) : null,
      notes:    formNotes.trim() || null,
      season:   formSeason.trim() || null,
      event_ref: eventRef,
      participated,
    };

    try {
      if (existingRecord) {
        const res = await fetch(
          `/api/parent/players/${playerId}/match-records/${existingRecord.id}`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(
          `/api/parent/players/${playerId}/match-records`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        if (res.status === 409) {
          // Already exists — reload and switch to edit mode
          await loadRecord();
          setStatsError('A record for this game already exists. It has been loaded for editing.');
          return;
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
        const { id } = await res.json() as { id: string };
        setExistingRecord({ ...body, id, event_ref: eventRef } as MatchRecord);
      }
      setStatsSaved(true);
      onSaved?.();
      await loadRecord();
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setStatsSaving(false);
    }
  }

  // ── Upload + assign media ─────────────────────────────────────────────────────
  // uploadedMediaId: set after a successful upload but before assignment completes.
  // Retained on assignment failure so the user can retry assignment without re-uploading.
  const [uploadedMediaId, setUploadedMediaId] = useState<string | null>(null);

  async function uploadMedia() {
    if (!mediaFile && !uploadedMediaId) { setMediaError('Select a file first'); return; }
    setMediaUploading(true);
    setMediaError(null);
    try {
      let mediaId = uploadedMediaId;

      if (!mediaId) {
        await checkMediaUpload(mediaFile!);
        // Upload the file — only if we don't already have a successful upload to retry
        const form = new FormData();
        form.append('file', mediaFile!);
        if (mediaCaption.trim()) form.append('caption', mediaCaption.trim());

        const upRes = await fetch('/api/parent/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({})) as { error?: string };
          // Upload failed — file and caption are retained for retry
          throw new Error(d.error ?? 'Upload failed');
        }
        const result = await upRes.json() as { id: string };
        mediaId = result.id;
        // Upload succeeded — stash the ID so assignment failure can retry without re-uploading
        setUploadedMediaId(mediaId);
      }

      // Assign the uploaded media to this game event
      if (!await assignMedia(mediaId)) return;
      // Both steps succeeded — clear the form
      setMediaFile(null);
      setMediaCaption('');
      setUploadedMediaId(null);
    } catch (e) {
      // File and caption are intentionally NOT cleared here so the user can retry
      setMediaError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setMediaUploading(false);
    }
  }

  async function assignMedia(mediaId: string) {
    setMediaAssigning(mediaId);
    setMediaError(null);
    setMediaSaved(false);
    try {
      const res = await fetch(
        `/api/parent/players/${playerId}/media-assignments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId,
            gameEventRef: eventRef,
            season: formSeason || null,
            kind: 'photo',
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        // Assignment failed — uploadedMediaId is retained so retry skips re-upload
        throw new Error(d.error ?? 'Assignment failed');
      }
      setMediaSaved(true);
      onSaved?.();
      await loadMedia();
      return true;
      // Keep panel open so user sees the updated strip immediately.
      // They can close it manually or add more items.
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : 'Assignment failed');
      return false;
    } finally {
      setMediaAssigning(null);
    }
  }

  async function attachLibrarySelected() {
    if (libSelected.size === 0) return;
    setLibAttaching(true);
    setMediaError(null);
    const ids = Array.from(libSelected);
    const failedIds: string[] = [];
    const failureMessages: string[] = [];
    for (const mediaId of ids) {
      try {
        const res = await fetch(
          `/api/parent/players/${playerId}/media-assignments`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaId,
              gameEventRef: eventRef,
              season: formSeason || null,
              kind: 'photo',
            }),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          failedIds.push(mediaId);
          failureMessages.push(d.error ?? `Failed for ${mediaId}`);
        }
        // Only a successful server response confirms the game association.
      } catch (e) {
        failedIds.push(mediaId);
        failureMessages.push(e instanceof Error ? e.message : 'Assignment failed');
      }
    }
    setLibAttaching(false);
    // Always reload so succeeded items appear as alreadyAttached immediately
    onSaved?.();
    await loadMedia();
    if (failedIds.length > 0) {
      // Retain only the IDs that actually failed so the user can retry just those
      setLibSelected(new Set(failedIds));
      setMediaError(
        `${ids.length - failedIds.length} attached; ${failedIds.length} failed: ${failureMessages[0]}`
      );
    } else {
      setLibSelected(new Set());
      // Keep panel open so user sees the updated strip
    }
  }

  async function removeMedia(assignmentId: string) {
    setRemovingId(assignmentId);
    try {
      const res = await fetch(
        `/api/parent/players/${playerId}/media-assignments/${assignmentId}?detachGame=true`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Remove failed');
      }
      // Close lightbox if the removed item was open
      setLightboxIndex(prev => {
        if (prev === null) return null;
        const newLen = mediaAssignments.length - 1;
        if (newLen === 0) return null;
        return Math.min(prev, newLen - 1);
      });
      await loadMedia();
      onSaved?.();
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setRemovingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const isSaving = statsSaving || mediaUploading || !!mediaAssigning;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-modal-backdrop))' }}
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="px-5 py-4 flex items-start justify-between shrink-0 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              {event.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {formatDate(event.startAt)}
              {event.startAt.length > 10 && ` · ${formatTime(event.startAt)}`}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
          <button
            type="button"
            onClick={isSaving ? undefined : onClose}
            disabled={isSaving}
            className="ml-3 p-1 rounded-full shrink-0 disabled:opacity-40"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div
          className="flex border-b shrink-0"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          {([
            { id: 'stats', label: 'Stats', icon: <BarChart2 size={13} /> },
            { id: 'media', label: 'Media', icon: <Film size={13} /> },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors"
              style={{
                borderColor: tab === t.id ? 'hsl(var(--pp-navy))' : 'transparent',
                color: tab === t.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
              }}
            >
              {t.icon}{t.label}
              {t.id === 'media' && mediaAssignments.length > 0 && (
                <span
                  className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                >
                  {mediaAssignments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Stats tab ── */}
          {tab === 'stats' && (
            <div className="space-y-4">
              {loadingRecord ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </div>
              ) : tableAvailable === false ? (
                <div
                  className="rounded-xl border px-4 py-4 text-xs"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}
                >
                  <p className="font-semibold mb-1" style={{ color: 'hsl(var(--pp-navy))' }}>
                    Game records not yet enabled
                  </p>
                  <p style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    An admin must run the match records migration from the admin settings panel.
                  </p>
                </div>
              ) : (
                <>
                  {/* Participation toggle */}
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Did the player participate?
                    </p>
                    <div className="flex gap-2">
                      {([
                        { val: true,  label: 'Yes, played' },
                        { val: false, label: 'Did not play' },
                      ] as const).map(opt => (
                        <button
                          key={String(opt.val)}
                          type="button"
                          onClick={() => setParticipated(opt.val)}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
                          style={{
                            background: participated === opt.val ? 'hsl(var(--pp-navy))' : 'transparent',
                            color: participated === opt.val ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                            borderColor: participated === opt.val ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {participated === null && (
                      <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        Confirm participation before recording stats. Scheduled games don't count as appearances until confirmed.
                      </p>
                    )}
                  </div>

                  {/* Stat fields — only shown when participated */}
                  {participated === true && (
                    <>
                      {!isGk ? (
                        <div className="grid grid-cols-2 gap-3">
                          <NumInput label="Goals"   value={formGoals}   onChange={setFormGoals} />
                          <NumInput label="Assists" value={formAssists} onChange={setFormAssists} />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3">
                          <NumInput label="Goals against (GA)" value={formGa}       onChange={setFormGa} />
                          <NumInput label="Saves (SV)"          value={formSaves}    onChange={setFormSaves} />
                          <NumInput label="Shutout (SO)"         value={formShutouts} onChange={setFormShutouts} />
                        </div>
                      )}
                    </>
                  )}

                  {/* Season */}
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Season
                    </label>
                    <input
                      type="text"
                      value={formSeason}
                      onChange={e => setFormSeason(e.target.value)}
                      placeholder="e.g. 2026-27"
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Notes
                    </label>
                    <textarea
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes about the game"
                      className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                    />
                  </div>

                  {/* Existing record indicator */}
                  {existingRecord && !statsSaved && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                    >
                      <Check size={12} />
                      Stats already recorded for this game — saving will update them.
                    </div>
                  )}

                  {statsSaved && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                    >
                      <Check size={12} />
                      Stats saved for <strong>{event.title}</strong> — visible in the Stats tab and season totals.
                    </div>
                  )}

                  {statsError && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                      style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
                    >
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      {statsError}
                    </div>
                  )}

                  <PpButton
                    onClick={() => void saveStats()}
                    disabled={statsSaving || participated === null}
                    className="w-full"
                  >
                    {statsSaving
                      ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                      : <><Check size={13} /> {existingRecord ? 'Update stats' : 'Save stats'}</>
                    }
                  </PpButton>
                </>
              )}
            </div>
          )}

          {/* ── Media tab ── */}
          {tab === 'media' && (
            <div className="space-y-4">

              {/* ── Thumbnail strip ── */}
              {loadingMedia ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </div>
              ) : mediaAssignments.length > 0 ? (
                <div>
                  {/* Count + add button row */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {mediaAssignments.length} item{mediaAssignments.length !== 1 ? 's' : ''} attached
                    </span>
                    {!showMediaPanel && (
                      <button
                        type="button"
                        onClick={() => setShowMediaPanel(true)}
                        className="flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1"
                        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}
                      >
                        <Plus size={11} /> Add
                      </button>
                    )}
                  </div>

                  {/* Horizontal swipeable strip — overflow contained here, not on page */}
                  <div
                    className="flex gap-2.5 overflow-x-auto pb-1"
                    style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
                  >
                    {mediaAssignments.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="relative shrink-0 rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2"
                        style={{
                          width: 80, height: 80,
                          background: 'hsl(var(--pp-bg))',
                          border: '1.5px solid hsl(var(--pp-border))',
                        }}
                        aria-label={m.caption ?? m.originalName ?? `Media ${idx + 1}`}
                      >
                        {m.mediaType === 'video' ? (
                          <>
                            {/* Video poster: try publicUrl as poster; fall back to navy bg */}
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ background: 'hsl(var(--pp-navy))' }}
                            >
                              <Play size={22} style={{ color: 'hsl(var(--pp-white))' }} />
                            </div>
                            {/* Small video badge */}
                            <span
                              className="absolute bottom-1 right-1 rounded px-1 text-[9px] font-bold"
                              style={{ background: 'hsl(var(--pp-navy) / 0.85)', color: 'hsl(var(--pp-white))' }}
                            >
                              VIDEO
                            </span>
                          </>
                        ) : imgError[m.id] ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image size={20} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                          </div>
                        ) : (
                          <img
                            src={m.publicUrl}
                            alt={m.caption ?? m.originalName ?? ''}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={() => setImgError(prev => ({ ...prev, [m.id]: true }))}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div
                  className="rounded-xl border-2 border-dashed px-4 py-8 text-center"
                  style={{ borderColor: 'hsl(var(--pp-border))' }}
                >
                  <Image size={24} className="mx-auto mb-2 opacity-30" style={{ color: 'hsl(var(--pp-navy))' }} />
                  <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    No photos or videos attached to this game yet.
                  </p>
                  {!showMediaPanel && (
                    <PpButton variant="outline" onClick={() => setShowMediaPanel(true)}>
                      <Plus size={13} /> Add photo or video
                    </PpButton>
                  )}
                </div>
              )}

              {/* Add media button when strip is visible and panel is closed — rendered inline in count row above */}
              {/* Add media button when empty state is NOT shown — rendered inline in count row above */}

              {/* ── Media add panel ── */}
              {showMediaPanel && (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
                >
                  {/* Tab toggle */}
                  <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'hsl(var(--pp-blue-light))' }}>
                    {(['upload', 'library'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        disabled={mediaUploading || libAttaching} onClick={() => {setMediaTab(t);setMediaError(null);}}
                        className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                        style={{
                          background: mediaTab === t ? 'hsl(var(--pp-white))' : 'transparent',
                          color: mediaTab === t ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
                        }}
                      >
                        {t === 'upload' ? 'Upload new' : 'From library'}
                      </button>
                    ))}
                  </div>

                  {mediaTab === 'upload' && (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                        className="hidden"
                        disabled={mediaUploading} onChange={e => {setMediaFile(e.target.files?.[0] ?? null);setUploadedMediaId(null);setMediaError(null);}}
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="w-full rounded-xl border-2 border-dashed py-5 flex flex-col items-center gap-2"
                        style={{ borderColor: 'hsl(var(--pp-border))' }}
                      >
                        <Upload size={18} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                        <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          {mediaFile ? mediaFile.name : 'Click to select photo or video'}
                        </span>
                      </button>
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={e => setMediaCaption(e.target.value)}
                        placeholder="Caption (optional)"
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                        style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
                      />
                      <div className="flex gap-2">
                        <PpButton
                          onClick={() => void uploadMedia()}
                          disabled={!mediaFile || mediaUploading}
                          className="flex-1"
                        >
                          {mediaUploading
                            ? <><Loader2 size={12} className="animate-spin" /> Uploading…</>
                            : <><Upload size={12} /> {uploadedMediaId ? 'Retry attachment' : 'Upload & attach'}</>
                          }
                        </PpButton>
                        <PpButton variant="ghost" onClick={() => setShowMediaPanel(false)}>
                          Cancel
                        </PpButton>
                      </div>
                    </>
                  )}

                  {mediaTab === 'library' && (
                    <>
                      {libLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                        </div>
                      ) : library.length === 0 ? (
                        <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          No media in your library yet.
                        </p>
                      ) : (
                        <>
                          <p className="text-[11px] mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                            Tap to select · {libSelected.size > 0 ? `${libSelected.size} selected` : 'none selected'}
                          </p>
                          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                            {library.map(item => {
                              const isSel = libSelected.has(item.id);
                              const alreadyAttached = mediaAssignments.some(a => a.mediaId === item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    if (alreadyAttached) return;
                                    setLibSelected(prev => {
                                      const next = new Set(prev);
                                      if (next.has(item.id)) next.delete(item.id);
                                      else next.add(item.id);
                                      return next;
                                    });
                                  }}
                                  disabled={libAttaching || alreadyAttached}
                                  className="relative rounded-xl overflow-hidden disabled:opacity-50"
                                  style={{height:144,minHeight:144,
                                    background: 'hsl(var(--pp-bg))',
                                    outline: isSel ? '2.5px solid hsl(var(--pp-blue))' : undefined,
                                    outlineOffset: isSel ? '2px' : undefined,
                                  }}
                                  aria-pressed={isSel}
                                  title={alreadyAttached ? 'Already attached' : isSel ? 'Deselect' : 'Select'}
                                >
                                  {item.mediaType === 'video' ? (
                                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'hsl(var(--pp-navy))' }}>
                                      <Play size={16} style={{ color: 'hsl(var(--pp-white))' }} />
                                    </div>
                                  ) : (
                                    <img src={item.publicUrl} alt={item.caption ?? ''} className="w-full h-full object-cover" loading="lazy" />
                                  )}
                                  {/* Already-attached checkmark */}
                                  {alreadyAttached && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'hsl(var(--pp-navy) / 0.5)' }}>
                                      <Check size={16} style={{ color: 'hsl(var(--pp-white))' }} />
                                    </div>
                                  )}
                                  {/* Selected-for-attach checkmark */}
                                  {isSel && !alreadyAttached && (
                                    <div
                                      className="absolute inset-0 flex items-end justify-end p-1 pointer-events-none"
                                      style={{ background: 'hsl(var(--pp-blue) / 0.18)' }}
                                    >
                                      <span
                                        className="rounded-full flex items-center justify-center"
                                        style={{ width: 18, height: 18, background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}
                                      >
                                        <Check size={10} />
                                      </span>
                                    </div>
                                  )}
                                  {/* Spinner while attaching */}
                                  {libAttaching && isSel && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'hsl(var(--pp-navy) / 0.5)' }}>
                                      <Loader2 size={14} className="animate-spin" style={{ color: 'hsl(var(--pp-white))' }} />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      <div className="flex gap-2 mt-2">
                        <PpButton variant="ghost" onClick={() => setShowMediaPanel(false)} className="flex-1">
                          Cancel
                        </PpButton>
                        <PpButton
                          onClick={() => void attachLibrarySelected()}
                          disabled={libSelected.size === 0 || libAttaching}
                          className="flex-1"
                        >
                          {libAttaching
                            ? <><Loader2 size={12} className="animate-spin" /> Attaching…</>
                            : <><Check size={12} /> Attach selected ({libSelected.size})</>
                          }
                        </PpButton>
                      </div>
                    </>
                  )}

                  {mediaError && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                      style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}
                    >
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      {mediaError}
                    </div>
                  )}
                  {mediaSaved && !mediaError && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                    >
                      <Check size={12} />
                      Attached to <strong>{event.title}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Link to full media tab */}
              <button
                type="button"
                onClick={() => { onClose(); }}
                className="w-full flex items-center justify-center gap-1 text-xs py-2"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
              >
                View all media in Media tab
                <ChevronRight size={12} />
              </button>

              {/* ── Lightbox / viewer overlay ── */}
              {lightboxIndex !== null && mediaAssignments[lightboxIndex] && (() => {
                const item = mediaAssignments[lightboxIndex];
                const hasPrev = lightboxIndex > 0;
                const hasNext = lightboxIndex < mediaAssignments.length - 1;
                return (
                  <div
                    className="fixed inset-0 z-50 flex flex-col"
                    style={{ background: 'hsl(var(--lightbox-bg) / 0.92)' }}
                    onClick={e => { if (e.target === e.currentTarget) setLightboxIndex(null); }}
                  >
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-4 py-3 shrink-0">
                      <span className="text-xs font-semibold" style={{ color: 'hsl(var(--lightbox-text-muted) / 0.7)' }}>
                        {lightboxIndex + 1} / {mediaAssignments.length}
                        {item.caption && (
                          <span className="ml-2" style={{ color: 'hsl(var(--lightbox-text-muted) / 0.55)' }}>
                            {item.caption}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => void removeMedia(item.id)}
                          disabled={removingId === item.id}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                          style={{ background: 'hsl(var(--destructive) / 0.18)', color: 'hsl(var(--destructive))' }}
                          aria-label="Remove from this game"
                        >
                          {removingId === item.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} />}
                          Remove
                        </button>
                        {/* Close */}
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(null)}
                          className="rounded-full p-2"
                          style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.12)', color: 'hsl(var(--lightbox-text-primary))' }}
                          aria-label="Close viewer"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Media area */}
                    <div className="flex-1 flex items-center justify-center min-h-0 px-4 relative">
                      {/* Prev */}
                      {hasPrev && (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i => (i ?? 0) - 1)}
                          className="absolute left-2 rounded-full p-2 z-10"
                          style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.15)', color: 'hsl(var(--lightbox-text-primary))' }}
                          aria-label="Previous"
                        >
                          <ChevronLeft size={22} />
                        </button>
                      )}

                      {item.mediaType === 'video' ? (
                        <video
                          key={item.id}
                          src={item.publicUrl}
                          controls
                          autoPlay
                          playsInline
                          className="max-w-full max-h-full rounded-xl"
                          style={{ maxHeight: 'calc(100vh - 140px)' }}
                        />
                      ) : imgError[item.id] ? (
                        <div className="flex flex-col items-center gap-3">
                          <Image size={40} style={{ color: 'hsl(var(--lightbox-text-muted) / 0.4)' }} />
                          <p className="text-xs" style={{ color: 'hsl(var(--lightbox-text-muted) / 0.5)' }}>
                            Preview unavailable
                          </p>
                        </div>
                      ) : (
                        <img
                          key={item.id}
                          src={item.publicUrl}
                          alt={item.caption ?? item.originalName ?? ''}
                          className="max-w-full max-h-full rounded-xl object-contain"
                          style={{ maxHeight: 'calc(100vh - 140px)' }}
                          onError={() => setImgError(prev => ({ ...prev, [item.id]: true }))}
                        />
                      )}

                      {/* Next */}
                      {hasNext && (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i => (i ?? 0) + 1)}
                          className="absolute right-2 rounded-full p-2 z-10"
                          style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.15)', color: 'hsl(var(--lightbox-text-primary))' }}
                          aria-label="Next"
                        >
                          <ChevronRight size={22} />
                        </button>
                      )}
                    </div>

                    {/* Dot indicators */}
                    {mediaAssignments.length > 1 && (
                      <div className="flex justify-center gap-1.5 py-3 shrink-0">
                        {mediaAssignments.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightboxIndex(i)}
                            className="rounded-full transition-all"
                            style={{
                              width: i === lightboxIndex ? 20 : 6,
                              height: 6,
                              background: i === lightboxIndex
                                ? 'hsl(var(--lightbox-text-primary))'
                                : 'hsl(var(--lightbox-text-muted) / 0.3)',
                            }}
                            aria-label={`Go to item ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
