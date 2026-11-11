import FeedShareButton from '@/components/FeedShareButton';
/**
 * PpActivityFeed — Post composer + activity feed for the Parent Portal.
 *
 * Features:
 *  - "Share an update" composer: text + Add photos + Add video + audience selector
 *  - Audience: Only me / Family / Connections (default: Only me)
 *  - Real file uploads via POST /api/parent/media/upload (multipart)
 *  - Upload progress, size/type validation, previews, captions
 *  - Stable file IDs (uuid) so XHR callbacks always target the right slot
 *  - XHR abort on remove — in-flight uploads are cancelled when the tile is removed
 *  - Retry: failed tiles show a Retry button; error overlay is pointer-events-none
 *    so the × Remove button is always reachable
 *  - Activity feed: posts with author, timestamp, audience chip, text, media, edit/delete
 *  - Filter tabs: All / My posts / Followed Sources
 *
 * Upload error diagnosis:
 *  - xhr.onerror fires only on network-level failures (no response at all).
 *  - Non-2xx HTTP responses reach xhr.onload — the actual error message is
 *    parsed from the JSON body and shown on the tile.
 *  - The 20-item soft cap (MAX_MEDIA_PER_USER) returns HTTP 400 with a clear
 *    message; the tile shows it verbatim.
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import {
  Pencil, Trash2, Users, Lock, ChevronDown, Loader2, X,
  Image, Video, CheckCircle, AlertCircle, Upload, RotateCcw,
  Share2, Download, Copy, Check,
} from 'lucide-react';
import { PpCard, PpButton, PpSectionHeading } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

type Audience = 'only_me' | 'family' | 'connections';

interface MediaItem {
  url: string;
  type: string;
  caption?: string;
}

interface Post {
  id: string;
  audience: Audience;
  body: string | null;
  mediaUrls: MediaItem[];
  sharedSourceUrl: string | null;
  sharedSourceTitle: string | null;
  sharedSourceAttribution: string | null;
  editedAt: string | null;
  createdAt: string | null;
}

/**
 * Normalize a raw API response into a safe Post object.
 *
 * Guards against every known failure mode:
 *   - POST response omitting mediaUrls (the confirmed production crash)
 *   - Legacy DB rows where media_urls was never set (null → [])
 *   - Corrupt JSON stored in media_urls (parse error → [])
 *   - mediaUrls arriving as a string instead of an array (old client bug)
 *   - Individual items missing url or type fields
 *
 * Does NOT silently drop valid attachments — only items that are structurally
 * invalid (no url string) are filtered out.
 */
function normalizePost(raw: Record<string, unknown>): Post {
  let mediaUrls: MediaItem[] = [];
  const rawMedia = raw.mediaUrls;
  if (Array.isArray(rawMedia)) {
    mediaUrls = rawMedia
      .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
      .filter(m => typeof m.url === 'string' && m.url.length > 0)
      .map(m => ({
        url: m.url as string,
        type: typeof m.type === 'string' ? m.type : 'image',
        caption: typeof m.caption === 'string' ? m.caption : undefined,
      }));
  } else if (typeof rawMedia === 'string' && rawMedia.trim().startsWith('[')) {
    // Defensive: server accidentally double-serialised the array
    try {
      const parsed = JSON.parse(rawMedia) as unknown[];
      mediaUrls = parsed
        .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
        .filter(m => typeof (m as Record<string, unknown>).url === 'string')
        .map(m => ({
          url: (m as Record<string, unknown>).url as string,
          type: typeof (m as Record<string, unknown>).type === 'string' ? (m as Record<string, unknown>).type as string : 'image',
          caption: typeof (m as Record<string, unknown>).caption === 'string' ? (m as Record<string, unknown>).caption as string : undefined,
        }));
    } catch { /* corrupt — leave as [] */ }
  }
  // null / undefined / any other shape → []

  return {
    id: String(raw.id ?? ''),
    audience: (['only_me', 'family', 'connections'].includes(raw.audience as string)
      ? raw.audience as Audience
      : 'only_me'),
    body: typeof raw.body === 'string' ? raw.body : null,
    mediaUrls,
    sharedSourceUrl: typeof raw.sharedSourceUrl === 'string' ? raw.sharedSourceUrl : null,
    sharedSourceTitle: typeof raw.sharedSourceTitle === 'string' ? raw.sharedSourceTitle : null,
    sharedSourceAttribution: typeof raw.sharedSourceAttribution === 'string' ? raw.sharedSourceAttribution : null,
    editedAt: typeof raw.editedAt === 'string' ? raw.editedAt : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  };
}

interface UploadedFile {
  /** Stable client-side UUID assigned at selection time — never changes. */
  uid: string;
  /** Server-assigned media ID — empty string until upload succeeds. */
  id: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  localPreview: string;
  uploading: boolean;
  error: string | null;
  progress: number;
  /** Original File object retained so Retry can re-upload without user re-selecting. */
  _file: File;
}

type FeedFilter = 'all' | 'mine' | 'sources';

// ─── Limits ───────────────────────────────────────────────────────────────────

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_FILES_PER_POST = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

// ─── Audience options ─────────────────────────────────────────────────────────

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'only_me',     label: 'Only me',     icon: <Lock size={13} />,  description: 'Private — only you can see this' },
  { value: 'family',      label: 'Family',      icon: <Users size={13} />, description: 'Visible to authorized family members' },
  { value: 'connections', label: 'Connections', icon: <Users size={13} />, description: 'Visible to accepted connections' },
];

function audienceIcon(audience: string) {
  if (audience === 'family' || audience === 'connections') return <Users size={11} />;
  return <Lock size={11} />;
}

function audienceLabel(audience: string) {
  if (audience === 'family') return 'Family';
  if (audience === 'connections') return 'Connections';
  return 'Only me';
}

// ─── Audience picker ──────────────────────────────────────────────────────────

function AudiencePicker({ value, onChange }: { value: Audience; onChange: (v: Audience) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = AUDIENCE_OPTIONS.find(o => o.value === value) ?? AUDIENCE_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors"
        style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
      >
        {current.icon}
        {current.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-lg border overflow-hidden z-30"
          style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
        >
          {AUDIENCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors"
              style={{
                background: value === opt.value ? 'hsl(var(--pp-blue-light))' : 'transparent',
                color: 'hsl(var(--pp-text))',
              }}
            >
              <span className="mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{opt.icon}</span>
              <div>
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

// ─── File preview tile ────────────────────────────────────────────────────────

function FileTile({
  file,
  onRemove,
  onRetry,
  onCaptionChange,
}: {
  file: UploadedFile;
  onRemove: () => void;
  onRetry: () => void;
  onCaptionChange: (caption: string) => void;
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden border"
      style={{ borderColor: 'hsl(var(--pp-border))' }}
    >
      <div className="relative h-28" style={{ background: 'hsl(var(--pp-blue-light))' }}>
        {file.mediaType === 'image' ? (
          <img src={file.localPreview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video size={28} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
        )}
        {/* Remove button — always on top, always clickable */}
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center z-10"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          aria-label="Remove file"
        >
          <X size={10} />
        </button>
        {/* Uploading overlay — pointer-events-none so Remove button stays clickable */}
        {file.uploading && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'hsl(var(--pp-overlay-dark) / 0.4)' }}
          >
            <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-white))' }} />
          </div>
        )}
        {/* Error overlay — pointer-events-none; Retry button is below the image */}
        {file.error && (
          <div
            className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none"
            style={{ background: 'hsl(var(--pp-overlay-dark) / 0.6)' }}
          >
            <p className="text-[10px] text-center" style={{ color: 'hsl(var(--pp-white))' }}>{file.error}</p>
          </div>
        )}
        {/* Success indicator */}
        {!file.uploading && !file.error && file.id && (
          <div className="absolute bottom-1 right-1 pointer-events-none">
            <CheckCircle size={14} className="text-green-400" />
          </div>
        )}
      </div>
      {file.uploading && <UploadProgress progress={file.progress} />}
      {/* Retry row — shown below the image so it's never obscured by the overlay */}
      {file.error && (
        <div className="flex items-center gap-1.5 px-2 py-1 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <AlertCircle size={11} style={{ color: 'hsl(var(--destructive))' }} />
          <span className="flex-1 text-[10px] truncate" style={{ color: 'hsl(var(--destructive))' }}>
            {file.error}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-0.5 text-[10px] font-semibold shrink-0"
            style={{ color: 'hsl(var(--pp-blue))' }}
          >
            <RotateCcw size={9} /> Retry
          </button>
        </div>
      )}
      <div className="px-2 py-1.5">
        <input
          type="text"
          value={file.caption}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder="Add a caption…"
          className="w-full text-xs outline-none bg-transparent"
          style={{ color: 'hsl(var(--pp-text))' }}
          maxLength={200}
        />
      </div>
    </div>
  );
}

// ─── Share sheet ──────────────────────────────────────────────────────────────

/**
 * ShareSheet — device-native share for a single media item or a text post.
 *
 * Privacy rules:
 *   - Only the parent can open this sheet (it lives inside their private feed).
 *   - The parent explicitly chooses what to share by clicking "Share…" on a
 *     specific item. Nothing is shared automatically.
 *   - Private media URLs (/airo-assets/uploads/…) are fetched client-side and
 *     passed as File objects to navigator.share — they are never exposed as
 *     public links.
 *   - "Copy link" is NOT offered because there is no public shareable URL for
 *     private parent-portal media.
 *   - Cancelling the share sheet leaves the post unchanged.
 *
 * Capabilities (detected at runtime):
 *   - navigator.share with files → native share sheet with the actual file
 *   - navigator.share without files → native share sheet with title + caption
 *   - Neither → Download + Copy caption fallback
 *
 * This is device sharing only. It does NOT post to Facebook, Instagram, or any
 * other platform. Direct publishing to social accounts requires a separate
 * integration that is not currently implemented.
 */
interface ShareTarget {
  url: string;
  type: 'image' | 'video' | 'text';
  caption?: string;
  postBody?: string;
}

function ShareSheet({
  target,
  onClose,
}: {
  target: ShareTarget;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'fetching' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const caption = target.caption ?? target.postBody ?? '';
  const isMedia = target.type === 'image' || target.type === 'video';
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const canShareFiles = canShare && typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([], 'test.jpg', { type: 'image/jpeg' })] });

  async function handleNativeShare() {
    setStatus('fetching');
    setErrorMsg('');
    try {
      if (isMedia && canShareFiles) {
        // Fetch the private media URL client-side and pass as a File object.
        // The URL is never exposed publicly — it stays within the share sheet.
        const resp = await fetch(target.url, { credentials: 'include' });
        if (!resp.ok) throw new Error('Could not fetch media');
        const blob = await resp.blob();
        const ext = blob.type.split('/')[1] ?? 'bin';
        const file = new File([blob], `photo.${ext}`, { type: blob.type });
        await navigator.share({ title: 'Soccer update', text: caption, files: [file] });
      } else if (canShare) {
        await navigator.share({ title: 'Soccer update', text: caption });
      }
      setStatus('done');
      setTimeout(onClose, 800);
    } catch (e) {
      // AbortError = user cancelled — close silently without marking error
      if (e instanceof Error && e.name === 'AbortError') {
        onClose();
        return;
      }
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Share failed');
    }
  }

  async function handleDownload() {
    if (!isMedia) return;
    setStatus('fetching');
    try {
      const resp = await fetch(target.url, { credentials: 'include' });
      if (!resp.ok) throw new Error('Could not fetch media');
      const blob = await resp.blob();
      const ext = blob.type.split('/')[1] ?? 'bin';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `soccer-photo.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Download failed');
    }
  }

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(caption || 'Soccer update');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-overlay-dark) / 0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            Share
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview */}
        {isMedia && target.type === 'image' && (
          <img
            src={target.url}
            alt={caption || 'Photo'}
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 180 }}
          />
        )}
        {isMedia && target.type === 'video' && (
          <video
            src={target.url}
            className="w-full rounded-xl"
            style={{ maxHeight: 180 }}
            controls={false}
            muted
          />
        )}
        {caption && (
          <p className="text-xs italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {caption}
          </p>
        )}

        {/* Disclaimer */}
        <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          This shares content from your private feed using your device&apos;s share sheet.
          It does not post to Facebook, Instagram, or any other platform.
        </p>

        {/* Error */}
        {status === 'error' && (
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{errorMsg}</p>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {canShare && (
            <button
              type="button"
              onClick={() => void handleNativeShare()}
              disabled={status === 'fetching'}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              {status === 'fetching' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : status === 'done' ? (
                <Check size={15} />
              ) : (
                <Share2 size={15} />
              )}
              {status === 'fetching' ? 'Preparing…' : status === 'done' ? 'Shared' : 'Share…'}
            </button>
          )}

          {isMedia && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={status === 'fetching'}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            >
              <Download size={15} />
              Download media
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopyCaption()}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy caption'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onEdit,
  onDelete,
}: {
  post: Post;
  onEdit: (post: Post) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  async function handleDelete() {
    if (!confirm('Delete this post?')) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/parent/posts/${post.id}`, { method: 'DELETE' });
      onDelete(post.id);
    } finally {
      setDeleting(false);
    }
  }

  const images = post.mediaUrls.filter(m => m.type === 'image');
  const videos = post.mediaUrls.filter(m => m.type === 'video');

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            {audienceIcon(post.audience)}
            {audienceLabel(post.audience)}
          </span>
          <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {formatRelativeTime(post.createdAt)}
            {post.editedAt && ' · edited'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Share post (text + first media if any) */}
          <button
            type="button"
            onClick={() => setShareTarget({
              url: post.mediaUrls[0]?.url ?? '',
              type: (post.mediaUrls[0]?.type === 'video' ? 'video' : post.mediaUrls.length > 0 ? 'image' : 'text'),
              caption: post.mediaUrls[0]?.caption,
              postBody: post.body ?? undefined,
            })}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            title="Share"
            aria-label="Share post"
          >
            <Share2 size={12} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(post)}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            title="Edit"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 rounded"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            title="Delete"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      {post.body && (
        <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'hsl(var(--pp-text))' }}>
          {post.body}
        </p>
      )}

      {images.length > 0 && (
        <div className={`grid gap-1.5 mb-3 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((m, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden group" style={{ aspectRatio: '16/9' }}>
              <button
                type="button"
                onClick={() => setLightboxIdx(i)}
                className="absolute inset-0 w-full h-full"
                aria-label={m.caption ?? 'View photo'}
              >
                <img src={m.url} alt={m.caption ?? ''} className="w-full h-full object-cover" />
              </button>
              {m.caption && (
                <div
                  className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] pointer-events-none"
                  style={{ background: 'hsl(var(--pp-overlay-dark) / 0.5)', color: 'hsl(var(--pp-white))' }}
                >
                  {m.caption}
                </div>
              )}
              {/* Per-image share button — always visible on touch; fades on mouse hover (see globals.css .pp-media-share-btn) */}
              <button
                type="button"
                onClick={() => setShareTarget({ url: m.url, type: 'image', caption: m.caption, postBody: post.body ?? undefined })}
                className="pp-media-share-btn absolute top-1.5 right-1.5 p-1 rounded-full"
                style={{ background: 'hsl(var(--pp-overlay-dark) / 0.6)', color: 'hsl(var(--pp-white))' }}
                aria-label="Share photo"
              >
                <Share2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {videos.map((m, i) => (
            <div key={i} className="relative group">
              <video src={m.url} controls className="w-full rounded-lg" style={{ maxHeight: 240 }} />
              {/* Per-video share button — always visible on touch; fades on mouse hover (see globals.css .pp-media-share-btn) */}
              <button
                type="button"
                onClick={() => setShareTarget({ url: m.url, type: 'video', caption: m.caption, postBody: post.body ?? undefined })}
                className="pp-media-share-btn absolute top-1.5 right-1.5 p-1 rounded-full"
                style={{ background: 'hsl(var(--pp-overlay-dark) / 0.6)', color: 'hsl(var(--pp-white))' }}
                aria-label="Share video"
              >
                <Share2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {post.sharedSourceUrl && (
        <div>
        <a
          href={post.sharedSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-blue))' }}
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{post.sharedSourceTitle ?? post.sharedSourceUrl}</p>
            {post.sharedSourceAttribution && (
              <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                via {post.sharedSourceAttribution}
              </p>
            )}
          </div>
        </a>
        <FeedShareButton url={post.sharedSourceUrl} title={post.sharedSourceTitle ?? "Source"} />
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'hsl(var(--pp-overlay-dark) / 0.85)' }}
          onClick={() => setLightboxIdx(null)}
        >
          <img
            src={images[lightboxIdx]?.url}
            alt={images[lightboxIdx]?.caption ?? ''}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4"
            style={{ color: 'hsl(var(--pp-white))' }}
            onClick={() => setLightboxIdx(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Share sheet — opened by the Share button in the header or per-media buttons */}
      {shareTarget && (
        <ShareSheet
          target={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({
  onPosted,
  editPost,
  onCancelEdit,
}: {
  onPosted: (post: Post) => void;
  editPost: Post | null;
  onCancelEdit: () => void;
}) {
  const [body, setBody] = useState(editPost?.body ?? '');
  const [audience, setAudience] = useState<Audience>(editPost?.audience ?? 'only_me');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // Map from file uid → XHR so we can abort on remove
  const xhrMap = useRef<Map<string, XMLHttpRequest>>(new Map());

  useEffect(() => {
    if (editPost) {
      setBody(editPost.body ?? '');
      setAudience(editPost.audience);
      setFiles([]);
    }
  }, [editPost]);

  // Revoke object URLs and abort in-flight XHRs on unmount
  useEffect(() => {
    return () => {
      xhrMap.current.forEach(xhr => xhr.abort());
    };
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'video') {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';

    const remaining = MAX_FILES_PER_POST - files.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_FILES_PER_POST} files per post.`);
      return;
    }

    const toAdd = selected.slice(0, remaining);

    const newFiles: UploadedFile[] = toAdd.map(f => {
      const validationError = validateFile(f);
      return {
        uid: crypto.randomUUID(),
        id: '',
        publicUrl: '',
        mediaType,
        caption: '',
        localPreview: URL.createObjectURL(f),
        uploading: !validationError,
        error: validationError,
        progress: 0,
        _file: f,
      };
    });

    setFiles(prev => [...prev, ...newFiles]);

    newFiles.forEach(uf => {
      if (uf.error) return;
      uploadFile(uf._file, uf.uid);
    });
  }

  function uploadFile(file: File, uid: string) {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhrMap.current.set(uid, xhr);
    xhr.open('POST', '/api/parent/media/upload');
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setFiles(prev => prev.map(f => f.uid === uid ? { ...f, progress: pct } : f));
      }
    };

    xhr.onload = () => {
      xhrMap.current.delete(uid);
      if (xhr.status === 201) {
        const data = JSON.parse(xhr.responseText) as { id: string; publicUrl: string };
        setFiles(prev => prev.map(f =>
          f.uid === uid ? { ...f, id: data.id, publicUrl: data.publicUrl, uploading: false, progress: 100 } : f
        ));
      } else {
        // Non-2xx reaches onload — parse the actual error message
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch { /* keep default */ }
        setFiles(prev => prev.map(f =>
          f.uid === uid ? { ...f, uploading: false, error: msg } : f
        ));
      }
    };

    xhr.onerror = () => {
      xhrMap.current.delete(uid);
      setFiles(prev => prev.map(f =>
        f.uid === uid ? { ...f, uploading: false, error: 'Network error — check your connection and retry' } : f
      ));
    };

    xhr.onabort = () => {
      xhrMap.current.delete(uid);
    };

    xhr.send(formData);
  }

  function removeFile(uid: string) {
    // Abort any in-flight XHR for this file
    const xhr = xhrMap.current.get(uid);
    if (xhr) { xhr.abort(); xhrMap.current.delete(uid); }
    setFiles(prev => {
      const f = prev.find(x => x.uid === uid);
      if (f?.localPreview) URL.revokeObjectURL(f.localPreview);
      return prev.filter(x => x.uid !== uid);
    });
  }

  function retryFile(uid: string) {
    // Re-upload using the original File object retained in _file.
    const target = files.find(f => f.uid === uid);
    if (!target) return;
    // Reset to uploading state, then kick off a fresh XHR.
    setFiles(prev => prev.map(f =>
      f.uid === uid ? { ...f, uploading: true, error: null, progress: 0, id: '', publicUrl: '' } : f
    ));
    uploadFile(target._file, uid);
  }

  async function handleSubmit() {
    const successFiles = files.filter(f => f.id && f.publicUrl && !f.error);
    const uploadingFiles = files.filter(f => f.uploading);
    const failedFiles = files.filter(f => f.error && !f.uploading);

    if (!body.trim() && successFiles.length === 0 && uploadingFiles.length === 0 && failedFiles.length === 0) {
      setError('Write something or add a photo/video before posting.');
      return;
    }
    if (uploadingFiles.length > 0) {
      setError('Please wait for uploads to finish.');
      return;
    }
    // Do not silently drop failed attachments — require the user to retry or remove them.
    if (failedFiles.length > 0) {
      setError(
        `${failedFiles.length} attachment${failedFiles.length > 1 ? 's' : ''} failed to upload. ` +
        'Retry or remove them before posting.'
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    const mediaUrls = successFiles
      .map(f => ({ url: f.publicUrl, type: f.mediaType, caption: f.caption || undefined }));

    try {
      if (editPost) {
        const res = await apiFetch(`/api/parent/posts/${editPost.id}`, {
          method: 'PUT',
          body: JSON.stringify({ body: body.trim() || null, audience }),
        });
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Update failed');
        // Spread the existing post (preserving mediaUrls and all other fields)
        // then normalize so the result is always a safe Post object.
        onPosted(normalizePost({
          ...editPost as unknown as Record<string, unknown>,
          body: body.trim() || null,
          audience,
          editedAt: new Date().toISOString(),
        }));
        onCancelEdit();
      } else {
        const res = await apiFetch('/api/parent/posts', {
          method: 'POST',
          body: JSON.stringify({ body: body.trim() || null, audience, mediaUrls }),
        });
        // Read the body once — it can only be consumed once from a Response stream.
        let resJson: Record<string, unknown>;
        try {
          resJson = await res.json() as Record<string, unknown>;
        } catch {
          throw new Error(res.ok ? 'Server returned an unreadable response' : `Post failed (HTTP ${res.status})`);
        }
        if (!res.ok) {
          throw new Error(
            typeof resJson.error === 'string' ? resJson.error : `Post failed (HTTP ${res.status})`
          );
        }
        // Normalize the create response — the server returns the full Post shape,
        // but normalizePost guards against any future regression where a field is
        // accidentally omitted (which caused the production crash).
        const data = normalizePost(resJson);
        onPosted(data);
        setBody('');
        setAudience('only_me');
        // Revoke object URLs for successfully posted files
        files.forEach(f => { if (f.localPreview) URL.revokeObjectURL(f.localPreview); });
        setFiles([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const isEditing = !!editPost;

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
    >
      <p className="text-sm font-semibold mb-3" style={{ color: 'hsl(var(--pp-text))' }}>
        {isEditing ? 'Edit post' : 'Share an update'}
      </p>

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 mb-3"
        style={{
          borderColor: 'hsl(var(--pp-border))',
          background: 'hsl(var(--pp-page-bg))',
          color: 'hsl(var(--pp-text))',
        }}
        maxLength={2000}
      />

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {files.map(f => (
            <FileTile
              key={f.uid}
              file={f}
              onRemove={() => removeFile(f.uid)}
              onRetry={() => retryFile(f.uid)}
              onCaptionChange={cap => setFiles(prev => prev.map(ff => ff.uid === f.uid ? { ...ff, caption: cap } : ff))}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs mb-3 flex items-center gap-1" style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>
          <AlertCircle size={11} />
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {!isEditing && (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={e => handleFileSelect(e, 'image')}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={e => handleFileSelect(e, 'video')}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={files.length >= MAX_FILES_PER_POST}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                title="Add photos"
              >
                <Image size={12} />
                <span className="hidden sm:inline">Photos</span>
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={files.length >= MAX_FILES_PER_POST}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                title="Add video"
              >
                <Video size={12} />
                <span className="hidden sm:inline">Video</span>
              </button>
            </>
          )}
          <AudiencePicker value={audience} onChange={setAudience} />
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <PpButton variant="outline" size="sm" onClick={onCancelEdit}>
              Cancel
            </PpButton>
          )}
          <PpButton
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || files.some(f => f.uploading)}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {isEditing ? 'Save' : 'Post'}
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * PostCardBoundary — isolates a single malformed post so it cannot crash the
 * entire feed. Shows a minimal fallback row instead of propagating the error.
 */
class PostCardBoundary extends Component<
  { postId: string; children: ReactNode },
  { crashed: boolean; message: string }
> {
  constructor(props: { postId: string; children: ReactNode }) {
    super(props);
    this.state = { crashed: false, message: '' };
  }
  static getDerivedStateFromError(err: unknown) {
    return {
      crashed: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[PostCardBoundary] post', this.props.postId, err, info);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div
          className="rounded-xl border px-4 py-3 text-xs"
          style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
        >
          This post could not be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PpActivityFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [editPost, setEditPost] = useState<Post | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/parent/posts');
      if (!res.ok) throw new Error('Failed to load posts');
      const data = await res.json() as { posts: Record<string, unknown>[] };
      // Normalize every record so legacy rows with null/missing mediaUrls
      // never crash PostCard. normalizePost is the single source of truth
      // for the Post shape — do not cast raw API data directly to Post.
      setPosts((data.posts ?? []).map(normalizePost));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  function handlePosted(post: Post) {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === post.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = post;
        return next;
      }
      return [post, ...prev];
    });
  }

  function handleDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  const FILTER_TABS: { id: FeedFilter; label: string }[] = [
    { id: 'all',     label: 'All' },
    { id: 'mine',    label: 'My posts' },
    { id: 'sources', label: 'Sources' },
  ];

  const filteredPosts = posts.filter(p => {
    if (filter === 'sources') return !!p.sharedSourceUrl;
    return true;
  });

  return (
    <PpCard>
      <PpSectionHeading>Activity</PpSectionHeading>

      <Composer
        onPosted={handlePosted}
        editPost={editPost}
        onCancelEdit={() => setEditPost(null)}
      />

      <div className="flex gap-1 mb-4">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{
              background: filter === tab.id ? 'hsl(var(--pp-navy))' : 'transparent',
              color: filter === tab.id ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      )}

      {/* Error — only shown when not loading AND no posts are already displayed.
          If posts loaded successfully before and a background refresh fails, we
          keep showing the existing posts rather than replacing them with an error. */}
      {!loading && error && filteredPosts.length === 0 && (
        <div className="py-6 text-center rounded-xl border border-dashed" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <p className="text-sm mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
          <button
            type="button"
            onClick={() => void loadPosts()}
            className="text-xs font-semibold"
            style={{ color: 'hsl(var(--pp-navy))' }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filteredPosts.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {filter === 'sources' ? 'No shared sources yet.' : 'No posts yet. Share your first update above.'}
          </p>
        </div>
      )}

      {!loading && filteredPosts.length > 0 && (
        <div className="space-y-3">
          {filteredPosts.map(post => (
            <PostCardBoundary key={post.id} postId={post.id}>
              <PostCard
                post={post}
                onEdit={setEditPost}
                onDelete={handleDelete}
              />
            </PostCardBoundary>
          ))}
        </div>
      )}
    </PpCard>
  );
}
