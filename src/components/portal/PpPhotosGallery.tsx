/**
 * PpPhotosGallery — Photos & Videos gallery for the Parent Portal.
 *
 * Sources:
 *   1. Media uploaded directly via POST /api/parent/media/upload (sc_parent_media)
 *   2. Media attached to posts (sc_parent_posts.media_urls)
 *
 * Features:
 *   - "Add media" button opens file picker (same upload flow as activity feed)
 *   - Thumbnail grid with captions and a lightbox viewer
 *   - Caption editing (PATCH /api/parent/media/:id)
 *   - Deletion (DELETE /api/parent/media/:id — soft delete)
 *   - Upload progress, size/type limits, useful errors
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, X, ChevronLeft, ChevronRight, Trash2, Play,
  Image, Video, Upload, AlertCircle, Pencil, Check,
} from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  postId: string | null;
  publicUrl: string;
  mediaType: 'image' | 'video';
  caption: string | null;
  originalName: string | null;
  createdAt: string | null;
}

// ─── Limits ───────────────────────────────────────────────────────────────────

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

function validateFile(file: File): string | null {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    if (file.size > IMAGE_MAX_BYTES) return `Image too large (max ${IMAGE_MAX_BYTES / 1024 / 1024} MB)`;
    return null;
  }
  if (ALLOWED_VIDEO_TYPES.has(file.type)) {
    if (file.size > VIDEO_MAX_BYTES) return `Video too large (max ${VIDEO_MAX_BYTES / 1024 / 1024} MB)`;
    return null;
  }
  return `Unsupported type: ${file.type}. Use JPEG, PNG, WebP, GIF, MP4, MOV, or WebM.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

// ─── Upload progress bar ──────────────────────────────────────────────────────

function UploadProgress({ progress }: { progress: number }) {
  return (
    <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--pp-border))' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${progress}%`, background: 'hsl(var(--pp-navy))' }}
      />
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  items,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-overlay-dark) / 0.9)' }}
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full"
        onClick={e => e.stopPropagation()}
      >
        {item.mediaType === 'image' ? (
          <img
            src={item.publicUrl}
            alt={item.caption ?? ''}
            className="w-full rounded-xl object-contain max-h-[80vh]"
          />
        ) : (
          <video
            src={item.publicUrl}
            controls
            autoPlay
            className="w-full rounded-xl max-h-[80vh]"
          />
        )}
        {item.caption && (
          <p
            className="mt-2 text-sm text-center"
            style={{ color: 'hsl(var(--pp-white))' }}
          >
            {item.caption}
          </p>
        )}
      </div>

      <button
        type="button"
        className="absolute top-4 right-4"
        style={{ color: 'hsl(var(--pp-white))' }}
        onClick={onClose}
      >
        <X size={24} />
      </button>

      {index > 0 && (
        <button
          type="button"
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
          style={{ background: 'hsl(var(--pp-overlay-dark) / 0.5)', color: 'hsl(var(--pp-white))' }}
          onClick={e => { e.stopPropagation(); onPrev(); }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {index < items.length - 1 && (
        <button
          type="button"
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
          style={{ background: 'hsl(var(--pp-overlay-dark) / 0.5)', color: 'hsl(var(--pp-white))' }}
          onClick={e => { e.stopPropagation(); onNext(); }}
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

// ─── Thumbnail tile ───────────────────────────────────────────────────────────

function Thumbnail({
  item,
  onClick,
  onDelete,
  onCaptionSave,
}: {
  item: MediaItem;
  onClick: () => void;
  onDelete: () => void;
  onCaptionSave: (caption: string) => void;
}) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(item.caption ?? '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveCaption() {
    setSavingCaption(true);
    try {
      const res = await apiFetch(`/api/parent/media/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ caption: captionDraft }),
      });
      if (res.ok) {
        onCaptionSave(captionDraft);
        setEditingCaption(false);
      }
    } finally {
      setSavingCaption(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Remove this media?')) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/parent/media/${item.id}`, { method: 'DELETE' });
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden border group"
      style={{ borderColor: 'hsl(var(--pp-border))', aspectRatio: '1' }}
    >
      {/* Thumbnail */}
      <button
        type="button"
        className="w-full h-full"
        onClick={onClick}
        aria-label={item.caption ?? 'View media'}
      >
        {item.mediaType === 'image' ? (
          <img
            src={item.publicUrl}
            alt={item.caption ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Play size={28} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
        )}
      </button>

      {/* Hover controls */}
      <div
        className="absolute inset-0 flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'hsl(var(--pp-overlay-dark) / 0.4)' }}
      >
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditingCaption(true)}
            className="h-6 w-6 rounded-full flex items-center justify-center"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            title="Edit caption"
          >
            <Pencil size={10} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="h-6 w-6 rounded-full flex items-center justify-center"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            title="Remove"
          >
            {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
          </button>
        </div>
        {item.caption && !editingCaption && (
          <p
            className="text-[10px] truncate px-1"
            style={{ color: 'hsl(var(--pp-white))' }}
          >
            {item.caption}
          </p>
        )}
      </div>

      {/* Caption editor */}
      {editingCaption && (
        <div
          className="absolute inset-0 flex items-end p-2"
          style={{ background: 'hsl(var(--pp-overlay-dark) / 0.7)' }}
        >
          <div className="w-full flex items-center gap-1">
            <input
              type="text"
              value={captionDraft}
              onChange={e => setCaptionDraft(e.target.value)}
              placeholder="Caption…"
              className="flex-1 text-xs rounded px-2 py-1 outline-none"
              style={{
                background: 'hsl(var(--pp-card-bg))',
                color: 'hsl(var(--pp-text))',
              }}
              maxLength={200}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditingCaption(false); }}
            />
            <button
              type="button"
              onClick={saveCaption}
              disabled={savingCaption}
              className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              {savingCaption ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            </button>
            <button
              type="button"
              onClick={() => setEditingCaption(false)}
              className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-text-muted))', color: 'hsl(var(--pp-white))' }}
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpPhotosGallery() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/parent/media');
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json() as { media: MediaItem[] };
      setMedia(data.media);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMedia(); }, [loadMedia]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/parent/media/upload');
    xhr.withCredentials = true;

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201) {
        const item = JSON.parse(xhr.responseText) as MediaItem;
        setMedia(prev => [item, ...prev]);
      } else {
        let msg = 'Upload failed';
        try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch { /* */ }
        setUploadError(msg);
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadError('Network error during upload');
    };

    xhr.send(formData);
  }

  function handleDelete(id: string) {
    setMedia(prev => prev.filter(m => m.id !== id));
    if (lightboxIdx !== null) setLightboxIdx(null);
  }

  function handleCaptionSave(id: string, caption: string) {
    setMedia(prev => prev.map(m => m.id === id ? { ...m, caption } : m));
  }

  const images = media.filter(m => m.mediaType === 'image');
  const videos = media.filter(m => m.mediaType === 'video');

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>Photos &amp; Videos</PpSectionHeading>
        <div className="flex items-center gap-2">
          {uploading && <UploadProgress progress={uploadProgress} />}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={handleFileSelect}
          />
          <PpButton
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Add media
          </PpButton>
        </div>
      </div>

      {uploadError && (
        <p className="text-xs mb-3 flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
          <AlertCircle size={11} />
          {uploadError}
        </p>
      )}

      {loading && (
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      )}

      {error && (
        <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
      )}

      {!loading && !error && media.length === 0 && (
        <div className="py-8 text-center space-y-3">
          <div className="flex justify-center gap-3">
            <Image size={28} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <Video size={28} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            No photos or videos yet.
          </p>
          <PpButton size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={12} />
            Upload your first photo or video
          </PpButton>
        </div>
      )}

      {!loading && !error && media.length > 0 && (
        <>
          {images.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Photos ({images.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((item, i) => (
                  <Thumbnail
                    key={item.id}
                    item={item}
                    onClick={() => setLightboxIdx(media.indexOf(item))}
                    onDelete={() => handleDelete(item.id)}
                    onCaptionSave={cap => handleCaptionSave(item.id, cap)}
                  />
                ))}
              </div>
            </div>
          )}

          {videos.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Videos ({videos.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {videos.map((item) => (
                  <Thumbnail
                    key={item.id}
                    item={item}
                    onClick={() => setLightboxIdx(media.indexOf(item))}
                    onDelete={() => handleDelete(item.id)}
                    onCaptionSave={cap => handleCaptionSave(item.id, cap)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          items={media}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(i => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIdx(i => Math.min(media.length - 1, (i ?? 0) + 1))}
        />
      )}
    </PpCard>
  );
}
