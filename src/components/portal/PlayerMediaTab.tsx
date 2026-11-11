/**
 * PlayerMediaTab
 *
 * Media & Highlights tab for /parent-portal/players/:id
 *
 * Features:
 *   - Grid of assigned media (photos + videos)
 *   - Upload new media → auto-assign to this player
 *   - Lightbox viewer for photos and videos
 *   - Remove assignment (does not delete the underlying file)
 *   - Caption editing
 *   - Named highlight collections (create, add/remove items, delete)
 *
 * API:
 *   GET    /api/parent/players/:id/media-assignments
 *   POST   /api/parent/players/:id/media-assignments
 *   DELETE /api/parent/players/:id/media-assignments/:assignId
 *   POST   /api/parent/media/upload
 *   GET    /api/parent/media
 *   GET/POST/DELETE /api/parent/players/:id/collections (+ /items)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Film, Upload, X, Trash2, Loader2, AlertCircle, Plus,
  Play, Image, ChevronLeft, ChevronRight, Pencil, Check,
  FolderOpen, FolderPlus, CalendarDays,
} from 'lucide-react';
import { PpCard, PpButton, PpSectionHeading } from './PpPrimitives';
import VideoThumbnail from './VideoThumbnail';
import { checkMediaUpload, MEDIA_FULL_MESSAGE, MEDIA_ITEM_LIMIT } from '@/lib/portal/media-upload-preflight';
import GameSelector, { type ScheduleGameEvent } from './GameSelector';
import { buildEventRef, eventRefMatches } from '@/lib/portal/event-ref';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaAssignment {
  id: string;
  mediaId: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  originalName: string | null;
  caption: string | null;
  sizeBytes: number | null;
  season: string | null;
  // gameEventRef is the stable event_ref string written by both GameDetailsPanel
  // (upload/library attach from the game panel) and UploadAssignModal (game tag
  // on upload or library assign). Used to filter media by game and to display
  // the game tag badge on each grid item.
  gameEventRef: string | null;
  kind: string;
  title: string | null;
  assignedAt: string | null;
  uploadedAt: string | null;
}

interface LibraryItem {
  id: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  originalName: string | null;
  caption: string | null;
  createdAt: string | null;
}

interface Collection {
  id: string;
  name: string;
  sortOrder: number;
  items: string[]; // assignment IDs
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  items,
  startIndex,
  onClose,
}: {
  items: MediaAssignment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [playbackError,setPlaybackError]=useState(false);
  const [idx, setIdx] = useState(startIndex);
  const item = items[idx];
  if (!item) return null;

  function prev() { setIdx(i => Math.max(0, i - 1)); }
  function next() { setIdx(i => Math.min(items.length - 1, i + 1)); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'hsl(var(--lightbox-bg) / 0.92)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.15)' }}
        aria-label="Close"
      >
        <X size={20} style={{ color: 'hsl(var(--lightbox-text-primary))' }} />
      </button>

      {/* Prev */}
      {idx > 0 && (
        <button
          type="button"
          onClick={prev}
          className="absolute left-4 p-2 rounded-full"
          style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.15)' }}
          aria-label="Previous"
        >
          <ChevronLeft size={24} style={{ color: 'hsl(var(--lightbox-text-primary))' }} />
        </button>
      )}

      {/* Media */}
      <div className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3 px-16">
        {item.mediaType === 'video' ? (
          <video
            key={item.id}
            src={item.publicUrl}
            playsInline
            onLoadStart={()=>setPlaybackError(false)}
            onError={()=>setPlaybackError(true)}
            controls
            className="max-h-[75vh] max-w-full rounded-xl"
            style={{ background: 'hsl(var(--lightbox-video-bg))' }}
          />
        ) : (
          <img
            src={item.publicUrl}
            alt={item.caption ?? item.originalName ?? 'Media'}
            className="max-h-[75vh] max-w-full rounded-xl object-contain"
          />
        )}
        {playbackError && <p role="alert" className="text-sm" style={{color:'hsl(var(--lightbox-text-primary))'}}>This video could not play. The file may be unavailable or its codec unsupported by this browser. <a className="underline" href={item.publicUrl} target="_blank" rel="noopener noreferrer">Open original</a></p>}
        {(item.caption || item.title) && (
          <p className="text-sm text-center" style={{ color: 'hsl(var(--lightbox-text-primary) / 0.8)' }}>
            {item.title ?? item.caption}
          </p>
        )}
        <p className="text-xs" style={{ color: 'hsl(var(--lightbox-text-muted) / 0.4)' }}>
          {idx + 1} / {items.length}
          {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ''}
        </p>
      </div>

      {/* Next */}
      {idx < items.length - 1 && (
        <button
          type="button"
          onClick={next}
          className="absolute right-4 p-2 rounded-full"
          style={{ background: 'hsl(var(--lightbox-ctrl-bg) / 0.15)' }}
          aria-label="Next"
        >
          <ChevronRight size={24} style={{ color: 'hsl(var(--lightbox-text-primary))' }} />
        </button>
      )}
    </div>
  );
}

// ─── Media Grid Item ──────────────────────────────────────────────────────────

function MediaGridItem({
  item,
  onOpen,
  onRemove,
  onCaptionSave,
}: {
  item: MediaAssignment;
  onOpen: () => void;
  onRemove: (id: string) => void;
  onCaptionSave: (assignId: string, mediaId: string, caption: string) => Promise<void>;
}) {
  const [removing, setRemoving]           = useState(false);
  const [editCaption, setEditCaption]     = useState(false);
  const [captionVal, setCaptionVal]       = useState(item.caption ?? '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [captionError,setCaptionError] = useState('');

  async function handleRemove() {
    if (!window.confirm('Remove this item from the player? The file stays in your library.')) return;
    setRemoving(true);
    onRemove(item.id);
  }

  async function saveCaption() {
    setSavingCaption(true);
    setCaptionError('');
    try { await onCaptionSave(item.id, item.mediaId, captionVal); setEditCaption(false); }
    catch(e) { setCaptionError(e instanceof Error ? e.message : 'Caption save failed.'); }
    finally { setSavingCaption(false); }
  }

  return (
    <div className="group relative rounded-xl overflow-hidden" style={{ background: 'hsl(var(--pp-bg))' }}>
      {captionError && <p role="alert" className="p-2 text-sm">{captionError}</p>}
      {/* Thumbnail */}
      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-square relative overflow-hidden focus-visible:outline focus-visible:outline-2"
        aria-label={item.caption ?? item.originalName ?? 'Open media'}
      >
        {item.mediaType === 'video' ? (
          <VideoThumbnail src={item.publicUrl} />
        ) : (
          <img
            src={item.publicUrl}
            alt={item.caption ?? item.originalName ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {/* Hover overlay — pointer-events-none so clicks reach the button */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"
          style={{ background: 'hsl(var(--lightbox-scrim) / 0.4)' }}
        >
          {item.mediaType === 'video'
            ? <Play size={32} style={{ color: 'hsl(var(--pp-white))' }} />
            : <Image size={28} style={{ color: 'hsl(var(--pp-white))' }} />}
        </div>
      </button>

      {/* Caption + actions */}
      <div className="p-2">
        {/* Game tag badge */}
        {item.gameEventRef && (
          <div className="flex items-center gap-1 mb-1">
            <CalendarDays size={9} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />
            <span className="text-[9px] truncate" style={{ color: 'hsl(var(--pp-blue))' }}>
              Tagged to game
            </span>
          </div>
        )}
        {editCaption ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={captionVal}
              onChange={e => setCaptionVal(e.target.value)}
              className="flex-1 text-xs rounded border px-2 py-1 focus:outline-none"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditCaption(false); }}
            />
            <button type="button" onClick={saveCaption} disabled={savingCaption} className="p-1">
              {savingCaption
                ? <Loader2 size={12} className="animate-spin" />
                : <Check size={12} style={{ color: 'hsl(var(--pp-blue))' }} />}
            </button>
            <button type="button" onClick={() => setEditCaption(false)} className="p-1">
              <X size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] truncate flex-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {item.caption || item.title || item.originalName || (item.mediaType === 'video' ? 'Video' : 'Photo')}
            </p>
            <div className="flex gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => { setCaptionVal(item.caption ?? ''); setEditCaption(true); }}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Edit caption"
              >
                <Pencil size={10} style={{ color: 'hsl(var(--pp-text-muted))' }} />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="p-1 rounded hover:bg-red-50"
                aria-label="Remove"
              >
                {removing
                  ? <Loader2 size={10} className="animate-spin" />
                  : <Trash2 size={10} style={{ color: 'hsl(var(--pp-text-muted))' }} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload + Assign Modal ────────────────────────────────────────────────────

export function UploadAssignModal({
  playerId,
  onClose,
  onDone,
  initialGame,
}: {
  playerId: string;
  onClose: () => void;
  onDone: () => void;
  initialGame?: ScheduleGameEvent | null;
}) {
  const [tab, setTab]               = useState<'upload' | 'library'>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [caption, setCaption]       = useState('');
  const [season, setSeason]         = useState('');
  const [gameEvent, setGameEvent]   = useState<ScheduleGameEvent | null>(initialGame ?? null);
  const [uploading, setUploading]   = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [library, setLibrary]       = useState<LibraryItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  // Multi-select: set of mediaIds chosen in the library tab
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [assigning, setAssigning]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadedId = useRef<string | null>(null);
  const busy = useRef(false);
  const [uploaded, setUploaded] = useState(false);
  const [libFilter, setLibFilter] = useState('all');
  const [usage, setUsage] = useState<number | null>(null);
  const [libError, setLibError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const res = await fetch('/api/parent/media?limit=50', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load your library. Please retry.');
      const data = await res.json() as { media: LibraryItem[]; total?: number };
      setLibrary(data.media ?? []);
      setUsage(data.total ?? data.media?.length ?? 0);
      setLibError(null);
    } catch (e) { setLibError(e instanceof Error ? e.message : 'Library unavailable.'); }
    finally { setLibLoading(false); }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [tab, loadLibrary]);

  async function upload() {
    if (!file || busy.current) return;
    busy.current = true;
    setUploading(true);
    setErr(null);
    try {
      let mediaId = uploadedId.current;
      if (!mediaId) {
      await checkMediaUpload(file);
      const form = new FormData();
      form.append('file', file);
      if (caption.trim()) form.append('caption', caption.trim());

      const upRes = await fetch('/api/parent/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!upRes.ok) {
        const d = await upRes.json().catch(() => ({})) as { error?: string };
        // Retain file + caption — do NOT close
        throw new Error(d.error ?? 'Upload failed');
      }
      const data = await upRes.json() as { id?: string };
      if (!data.id) throw new Error('Upload response was incomplete. Check your library before trying another upload.');
      mediaId = data.id;
      uploadedId.current = mediaId;
      setUploaded(true);
      void loadLibrary();
      }

      // Assign to player
      const assignRes = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/media-assignments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId,
            season: season.trim() || null,
            // Use buildEventRef (shared helper) so the stored ref matches exactly
            // what GameDetailsPanel writes and reads. For feed events this is
            // `${feedId}:${uid}`; for manual events it is the row id.
            gameEventRef: gameEvent ? buildEventRef(gameEvent) : null,
            kind: file.type.startsWith('video/') ? 'video' : 'photo',
          }),
        }
      );
      if (!assignRes.ok) {
        // Upload succeeded but assignment failed — show error, keep dialog open
        // so the user can retry or find the item in their library
        const d = await assignRes.json().catch(() => ({})) as { error?: string };
        throw new Error(`File saved in your library. Attachment failed: ${d.error ?? 'Please retry attachment.'}`);
      }
      // Only a successful response confirms the requested game association.
      onDone();
    } catch (e) {
      // Retain file + caption so the user can retry without re-selecting
      setErr(e instanceof TypeError && !uploadedId.current ? 'The upload result could not be confirmed. Check From library before uploading again to avoid a duplicate.' : e instanceof Error ? e.message : 'Upload failed');
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  async function deleteSelectedFromLibrary() {
    if (!selected.size || busy.current || !window.confirm('Delete selected files from your library? They will become unavailable to every player and coach link using them. Removing from a player alone does not delete library files.')) return;
    busy.current = true; setAssigning(true); setErr(null);
    const failed = new Set<string>();
    for (const id of selected) {
      try { const r = await fetch(`/api/parent/media/${encodeURIComponent(id)}`, {method:'DELETE',credentials:'include'}); if(!r.ok) failed.add(id); else if(uploadedId.current === id) {uploadedId.current=null;setUploaded(false);} }
      catch { failed.add(id); }
    }
    setSelected(failed); if(failed.size)setErr('Some files could not be deleted. Those remain selected.');
    await loadLibrary(); busy.current=false;setAssigning(false);
  }

  async function attachSelected() {
    if (selected.size === 0 || busy.current) return;
    busy.current = true;
    setAssigning(true);
    setErr(null);
    const ids = Array.from(selected);
    const failedIds: string[] = [];
    const failureMessages: string[] = [];
    for (const mediaId of ids) {
      try {
        const res = await fetch(
          `/api/parent/players/${encodeURIComponent(playerId)}/media-assignments`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaId,
              season: season.trim() || null,
              gameEventRef: gameEvent ? buildEventRef(gameEvent) : null,
            }),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          failedIds.push(mediaId);
          failureMessages.push(d.error ?? `Failed for ${mediaId}`);
        }
        // A 409 is a different-game conflict, not a successful attachment.
      } catch (e) {
        failedIds.push(mediaId);
        failureMessages.push(e instanceof Error ? e.message : 'Assignment failed');
      }
    }
    busy.current = false;
    setAssigning(false);
    if (failedIds.length > 0) {
      // Retain only the IDs that actually failed so the user can retry just those
      setSelected(new Set(failedIds));
      setErr(`${ids.length - failedIds.length} attached; ${failedIds.length} failed: ${failureMessages[0]}`);
    } else {
      onDone();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-navy) / 0.5)' }}
      onClick={e => {
        // Block backdrop close while uploading or assigning
        if (uploading || assigning) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[92dvh] overflow-y-auto"
        style={{ background: 'hsl(var(--pp-white))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Add media
          </h2>
          <button type="button" onClick={onClose} disabled={uploading || !!assigning} className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-40">
            <X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </button>
        </div>

        {/* Tab toggle */}
        <div
          className="flex rounded-lg p-0.5 gap-0.5 mb-4"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          {(['upload', 'library'] as const).map(t => (
            <button
              key={t}
              type="button"
              disabled={uploading || assigning} onClick={() => { setTab(t); setErr(null); }}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: tab === t ? 'hsl(var(--pp-white))' : 'transparent',
                color: tab === t ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
              }}
            >
              {t === 'upload' ? 'Upload new' : 'From library'}
            </button>
          ))}
        </div>

        {usage !== null && <p className="text-xs mb-3">{usage} / 20 library items used across your account. Removing from a player keeps the library file. Attaching an existing item uses no additional upload space.</p>}
        {tab === 'upload' && usage !== null && usage >= MEDIA_ITEM_LIMIT && !uploaded && (
          <div role="status" className="text-sm mb-3 rounded-lg border p-3">
            <p>{MEDIA_FULL_MESSAGE}</p>
            <PpButton variant="outline" className="mt-2" onClick={() => { setTab('library'); setErr(null); }}>Choose from library / manage space</PpButton>
          </div>
        )}
        {tab === 'upload' && (
          <div className="space-y-3">
            {/* File picker */}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="hidden"
                disabled={uploading} onChange={e => { setFile(e.target.files?.[0] ?? null); uploadedId.current = null; setUploaded(false); setErr(null); }}
              />
              <button
                type="button"
                disabled={uploading} onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed py-6 flex flex-col items-center gap-2 transition-colors"
                style={{ borderColor: 'hsl(var(--pp-border))' }}
              >
                <Upload size={20} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {file ? file.name : 'Click to select photo or video'}
                </span>
                {file && (
                  <span className="text-[10px]" style={{ color: 'hsl(var(--pp-blue))' }}>
                    {formatBytes(file.size)}
                  </span>
                )}
              </button>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Caption (optional)
              </label>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="e.g. Goal vs. Rival FC, Oct 2026"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              />
            </div>

            {/* Season */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Season (optional)
              </label>
              <input
                type="text"
                value={season}
                onChange={e => setSeason(e.target.value)}
                placeholder="e.g. Fall 2026"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              />
            </div>

            {/* Game tag */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Tag to a game (optional)
              </label>
              {gameEvent ? (
                <div
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CalendarDays size={12} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />
                    <span className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--pp-navy))' }}>
                      {gameEvent.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGameEvent(null)}
                    className="shrink-0 p-0.5 rounded"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                    aria-label="Remove game tag"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <GameSelector
                  playerId={playerId}
                  onSelect={setGameEvent}
                  label="Tag to a scheduled game"
                  variant="inline"
                />
              )}
            </div>

            {err && (
              <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
                <AlertCircle size={12} />
                {err}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <PpButton variant="outline" onClick={onClose} className="flex-1">Cancel</PpButton>
              <PpButton onClick={upload} disabled={uploading || !file || (!uploaded && usage !== null && usage >= MEDIA_ITEM_LIMIT)} className="flex-1">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? (uploaded ? 'Attaching…' : 'Uploading…') : uploaded ? 'Retry attachment' : 'Upload & add'}
              </PpButton>
            </div>
          </div>
        )}

        {tab === 'library' && (
          <div>
            {/* Game context reminder when a game is pre-selected */}
            {gameEvent && (
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}
              >
                <CalendarDays size={12} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />
                <span className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--pp-navy))' }}>
                  Attaching to: {gameEvent.title}
                </span>
                <button
                  type="button"
                  onClick={() => setGameEvent(null)}
                  className="ml-auto shrink-0 p-0.5 rounded"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Remove game tag"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Game selector when no game is set */}
            {!gameEvent && (
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Tag to a game (optional)
                </label>
                <GameSelector
                  playerId={playerId}
                  onSelect={setGameEvent}
                  label="Tag to a scheduled game"
                  variant="inline"
                />
              </div>
            )}

            {libLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
              </div>
            ) : libError ? (<p role="alert">{libError} <button type="button" onClick={() => void loadLibrary()}>Retry library</button></p>) : library.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No media in your library yet. Upload something first.
              </p>
            ) : (
              <>
                <p className="text-[11px] mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Tap to select · {selected.size > 0 ? `${selected.size} selected` : 'none selected'}
                </p>
                <div className="flex flex-wrap gap-2 mb-3">{['all','image','video'].map(value => <button type="button" key={value} aria-pressed={libFilter === value} className="px-3 py-2 border rounded-lg" onClick={() => setLibFilter(value)}>{value === 'image' ? 'Photos' : value === 'video' ? 'Videos' : 'All'}</button>)}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto" style={{maxHeight:'42dvh',gridAutoRows:'min-content',alignContent:'start'}}>
                  {library.filter(m => libFilter === 'all' || m.mediaType === libFilter).map(m => {
                    const isSel = selected.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        disabled={assigning === true}
                        className="relative rounded-lg overflow-hidden focus-visible:outline focus-visible:outline-2"
                        style={{
                          height: 144, minHeight: 144, display: 'block',
                          outline: isSel ? '2.5px solid hsl(var(--pp-blue))' : undefined,
                          outlineOffset: isSel ? '2px' : undefined,
                        }}
                        aria-pressed={isSel}
                        aria-label={m.caption ?? m.originalName ?? 'Library item'}
                      >
                        {m.mediaType === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center"
                            style={{ background: 'hsl(var(--pp-navy))' }}>
                            <VideoThumbnail src={m.publicUrl} />
                          </div>
                        ) : (
                          <img src={m.publicUrl} alt={m.caption ?? ''} className="w-full h-full object-cover" loading="lazy" />
                        )}
                        <span className="absolute bottom-0 left-0 right-0 text-xs px-2 py-1 truncate text-left" style={{background:'hsl(var(--pp-navy))',color:'hsl(var(--pp-white))'}}>{m.mediaType === 'video' ? 'Video · ' : ''}{m.caption || m.originalName || 'Untitled'}</span>
                        {/* Selected checkmark overlay */}
                        {isSel && (
                          <div
                            className="absolute inset-0 flex items-end justify-end p-1 pointer-events-none"
                            style={{ background: 'hsl(var(--pp-blue) / 0.18)' }}
                          >
                            <span
                              className="rounded-full flex items-center justify-center"
                              style={{ width: 20, height: 20, background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}
                            >
                              <Check size={12} />
                            </span>
                          </div>
                        )}
                        {/* Spinner while batch-attaching */}
                        {assigning === true && isSel && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ background: 'hsl(var(--lightbox-scrim) / 0.5)' }}>
                            <Loader2 size={16} style={{ color: 'hsl(var(--pp-white))' }} className="animate-spin" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button type="button" className="text-xs underline mt-3" disabled={!selected.size || assigning} onClick={() => void deleteSelectedFromLibrary()}>Delete selected from library</button>
            {err && (
              <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mt-3"
                style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
                <AlertCircle size={12} />
                {err}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <PpButton variant="outline" onClick={onClose} className="flex-1">Cancel</PpButton>
              <PpButton
                onClick={() => void attachSelected()}
                disabled={selected.size === 0 || assigning === true}
                className="flex-1"
              >
                {assigning === true
                  ? <><Loader2 size={12} className="animate-spin" /> Attaching…</>
                  : <><Check size={12} /> Attach selected ({selected.size})</>
                }
              </PpButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Collections Panel ────────────────────────────────────────────────────────

function CollectionsPanel({
  playerId,
  assignments,
}: {
  playerId: string;
  assignments: MediaAssignment[];
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [newName, setNewName]         = useState('');
  const [creating, setCreating]       = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/collections`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error();
      const data = await res.json() as { collections: Collection[] };
      setCollections(data.collections ?? []);
    } catch { /* table may not exist yet — silently hide panel */ }
    finally { setLoading(false); }
  }, [playerId]);

  useEffect(() => { load(); }, [load]);

  async function createCollection() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/collections`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      if (res.ok) { setNewName(''); load(); }
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  async function deleteCollection(id: string) {
    if (!window.confirm('Delete this collection? Media items are not deleted.')) return;
    await fetch(
      `/api/parent/players/${encodeURIComponent(playerId)}/collections/${id}`,
      { method: 'DELETE', credentials: 'include' }
    );
    load();
  }

  async function toggleItem(collectionId: string, assignmentId: string, inCollection: boolean) {
    const method = inCollection ? 'DELETE' : 'POST';
    await fetch(
      `/api/parent/players/${encodeURIComponent(playerId)}/collections/${collectionId}/items`,
      {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      }
    );
    load();
  }

  if (loading) return null;

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-3">
        <PpSectionHeading icon={<FolderOpen size={14} />} title="Highlight collections" />
      </div>

      {/* Create new */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Collection name…"
          className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
          style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
          onKeyDown={e => { if (e.key === 'Enter') createCollection(); }}
        />
        <PpButton size="sm" onClick={createCollection} disabled={creating || !newName.trim()}>
          {creating ? <Loader2 size={12} className="animate-spin" /> : <FolderPlus size={12} />}
          Create
        </PpButton>
      </div>

      {collections.length === 0 ? (
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          No collections yet. Create one to organise highlights.
        </p>
      ) : (
        <div className="space-y-2">
          {collections.map(col => (
            <div key={col.id} className="rounded-xl border" style={{ borderColor: 'hsl(var(--pp-border))' }}>
              <button
                type="button"
                onClick={() => setExpanded(expanded === col.id ? null : col.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold"
                style={{ color: 'hsl(var(--pp-text))' }}
              >
                <span className="flex items-center gap-2">
                  <FolderOpen size={13} style={{ color: 'hsl(var(--pp-blue))' }} />
                  {col.name}
                  <span className="text-[10px] font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {col.items.length} item{col.items.length !== 1 ? 's' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); deleteCollection(col.id); }}
                  className="p-1 rounded hover:bg-red-50"
                  aria-label="Delete collection"
                >
                  <Trash2 size={11} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </button>
              </button>

              {expanded === col.id && (
                <div className="px-3 pb-3 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                  <p className="text-[10px] mt-2 mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Toggle items to add/remove from this collection:
                  </p>
                  {assignments.length === 0 ? (
                    <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Add media to this player first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {assignments.map(a => {
                        const inCol = col.items.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleItem(col.id, a.id, inCol)}
                            className="relative aspect-square rounded-lg overflow-hidden focus-visible:outline focus-visible:outline-2"
                            style={{ outline: inCol ? '2px solid hsl(var(--pp-blue))' : 'none' }}
                            aria-label={inCol ? 'Remove from collection' : 'Add to collection'}
                          >
                            {a.mediaType === 'video' ? (
                              <div className="w-full h-full flex items-center justify-center"
                                style={{ background: 'hsl(var(--pp-navy))' }}>
                                <Play size={12} style={{ color: 'hsl(var(--pp-white))' }} />
                              </div>
                            ) : (
                              <img src={a.publicUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            )}
                            {inCol && (
                              <div className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                                style={{ background: 'hsl(var(--pp-blue))' }}>
                                <Check size={8} style={{ color: 'hsl(var(--pp-white))' }} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PpCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerMediaTab({ playerId }: { playerId: string }) {
  const [assignments, setAssignments]       = useState<MediaAssignment[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [tableAvailable, setTableAvailable] = useState(true);
  const [showUpload, setShowUpload]         = useState(false);
  const [lightboxIdx, setLightboxIdx]       = useState<number | null>(null);
  // Game filter: when set, the grid shows only media tagged to this event.
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [gameFilter, setGameFilter]         = useState<ScheduleGameEvent | null>(null);
  // Incremented after attach or remove — busts GameSelector's internal media-count cache
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/media-assignments`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json() as {
        assignments: MediaAssignment[];
        tableAvailable?: boolean;
      };
      if (data.tableAvailable === false) { setTableAvailable(false); }
      setAssignments(data.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(assignmentId: string) {
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    setMediaRefreshKey(k => k + 1);
    await fetch(
      `/api/parent/players/${encodeURIComponent(playerId)}/media-assignments/${assignmentId}`,
      { method: 'DELETE', credentials: 'include' }
    ).catch(() => { load(); });
  }

  async function handleCaptionSave(assignId: string, mediaId: string, caption: string) {
    const response = await fetch(`/api/parent/media/${mediaId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption }),
    });
    if (!response.ok) throw new Error('Caption could not be saved. Please retry.');
    setAssignments(prev => prev.map(a =>
      a.id === assignId ? { ...a, caption } : a
    ));
  }

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

  if (!tableAvailable) {
    return (
      <PpCard>
        <div className="flex items-center gap-2 text-xs py-4"
          style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <AlertCircle size={13} />
          Media tables not yet created. Run the Player Media Schema migration from the admin panel.
        </div>
      </PpCard>
    );
  }

  // When a game filter is active, show only media tagged to that event.
  // eventRefMatches checks both the composite ref (feedId:uid) and the legacy
  // plain event.id so records saved before the composite scheme are still found.
  const visibleAssignments = assignments.filter(a => (!gameFilter || eventRefMatches(a.gameEventRef, gameFilter)) && (mediaTypeFilter === 'all' || a.mediaType === mediaTypeFilter));

  return (
    <>
      {lightboxIdx !== null && (
        <Lightbox
          items={visibleAssignments}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {showUpload && (
        <UploadAssignModal
          playerId={playerId}
          initialGame={gameFilter ?? null}
          onClose={() => { setShowUpload(false); void load(); }}
          onDone={() => { setShowUpload(false); load(); setMediaRefreshKey(k => k + 1); }}
        />
      )}

      <div className="space-y-4">
        {/* Media grid */}
        <PpCard>
          <div className="flex items-center justify-between mb-3">
            <PpSectionHeading icon={<Film size={14} />} title="Media & highlights" />
            <PpButton size="sm" onClick={() => setShowUpload(true)}>
              <Plus size={13} />
              Add media
            </PpButton>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap" aria-label="Media type">
            {(['all', 'image', 'video'] as const).map(type => (
              <button key={type} type="button" aria-pressed={mediaTypeFilter === type}
                className="min-h-11 px-4 rounded-full text-sm border"
                style={{ background: mediaTypeFilter === type ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-white))', color: mediaTypeFilter === type ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))', borderColor: 'hsl(var(--pp-border))' }}
                onClick={() => { setMediaTypeFilter(type); setLightboxIdx(null); }}>
                {type === 'all' ? 'All media' : type === 'image' ? 'Photos' : 'Videos'}
              </button>
            ))}
          </div>
          {/* Game filter */}
          <div className="mb-4">
            {gameFilter ? (
              <div
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CalendarDays size={12} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />
                  <span className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--pp-navy))' }}>
                    {gameFilter.title}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    · {visibleAssignments.length} item{visibleAssignments.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGameFilter(null)}
                  className="shrink-0 p-0.5 rounded"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Clear game filter"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[11px] mb-1.5 font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Filter by game (optional)
                </p>
                <GameSelector
                  playerId={playerId}
                  onSelect={setGameFilter}
                  label="Show media for a specific game"
                  variant="inline"
                  mediaRefreshKey={mediaRefreshKey}
                />
              </div>
            )}
          </div>

          {visibleAssignments.length === 0 ? (
            gameFilter ? (
              <div className="text-center py-8">
                <CalendarDays size={24} className="mx-auto mb-2 opacity-30" style={{ color: 'hsl(var(--pp-navy))' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                  No matching media for this game
                </p>
                <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Open the game from the Schedule tab to attach photos and videos, or upload here and tag it to this game.
                </p>
                <PpButton size="sm" onClick={() => setShowUpload(true)}>
                  <Upload size={13} />
                  Upload & tag to game
                </PpButton>
              </div>
            ) : (
              <div className="text-center py-10">
                <Film size={28} className="mx-auto mb-3 opacity-30" style={{ color: 'hsl(var(--pp-navy))' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                  {mediaTypeFilter === 'all' ? 'No media yet' : mediaTypeFilter === 'image' ? 'No photos yet' : 'No videos yet'}
                </p>
                <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Upload photos and videos to build this player's highlight reel.
                </p>
                <PpButton size="sm" onClick={() => setShowUpload(true)}>
                  <Upload size={13} />
                  Upload first item
                </PpButton>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleAssignments.map((a, i) => (
                <MediaGridItem
                  key={a.id}
                  item={a}
                  onOpen={() => setLightboxIdx(i)}
                  onRemove={handleRemove}
                  onCaptionSave={handleCaptionSave}
                />
              ))}
            </div>
          )}
        </PpCard>

        {/* Collections */}
        <CollectionsPanel playerId={playerId} assignments={assignments} />
      </div>
    </>
  );
}
