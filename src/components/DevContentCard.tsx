/**
 * DevContentCard
 * Simple card for a curated development video.
 * Shows: thumbnail, title, creator, play button, save button.
 * One active player at a time — caller passes activeId / onPlay / onStop.
 */
import { useState } from 'react';
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react';

export interface ContentItem {
  contentId: string;
  title: string | null;
  description: string | null;
  source: string | null;
  contentType: string | null;
  devCategory: string | null;
  youtubeVideoId: string | null;
  embedVerified?: boolean | null;
  playbackStatus?: string | null;
  url: string;
  editorialPriority?: number | null;
}

interface DevContentCardProps {
  item: ContentItem;
  savedIds: Set<string>;
  onSave: (contentId: string) => Promise<void>;
  onUnsave: (contentId: string) => Promise<void>;
  /** ID of the currently playing video across the whole grid */
  activeId: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
}

export default function DevContentCard({
  item,
  savedIds,
  onSave,
  onUnsave,
  activeId,
  onPlay,
  onStop,
}: DevContentCardProps) {
  const isSaved = savedIds.has(item.contentId);
  const [saving, setSaving] = useState(false);

  const videoId = item.youtubeVideoId;
  const isPlaying = !!videoId && activeId === videoId;

  // Embed is allowed when: video ID exists AND playbackStatus doesn't flag it
  const embedBlocked = (item.playbackStatus ?? '').includes('embed-check-required');
  const canEmbed = !!videoId && !embedBlocked;
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.url;
  const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

  const handleSaveToggle = async () => {
    setSaving(true);
    try {
      if (isSaved) await onUnsave(item.contentId);
      else await onSave(item.contentId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-shadow hover:shadow-md hover:shadow-black/20">
      {/* Thumbnail / player */}
      <div className="relative aspect-video bg-muted">
        {isPlaying && canEmbed ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId!)}?autoplay=1&rel=0`}
            title={item.title ?? 'Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!canEmbed) return; // fallback — handled below
              if (isPlaying) { onStop(); return; }
              if (activeId) onStop();
              onPlay(videoId!);
            }}
            className="absolute inset-0 w-full h-full group"
            aria-label={`Play ${item.title ?? 'video'}`}
            disabled={!canEmbed}
          >
            {thumbnail && (
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors pointer-events-none" />
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        {/* Title + save */}
        <div className="flex items-start gap-2">
          <p
            className="flex-1 text-xs font-semibold text-foreground leading-snug line-clamp-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {item.title ?? 'Untitled'}
          </p>
          <button
            type="button"
            onClick={handleSaveToggle}
            disabled={saving}
            aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
            className={`shrink-0 mt-0.5 transition-colors disabled:opacity-50 ${
              isSaved ? 'text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>

        {/* Creator */}
        {item.source && (
          <p className="text-[10px] text-muted-foreground">{item.source}</p>
        )}

        {/* Watch on YouTube — always shown as secondary link; primary when embed blocked */}
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-auto flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
            canEmbed
              ? 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
        >
          {canEmbed ? (
            <>
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              YouTube
            </>
          ) : (
            <>
              <ExternalLink size={12} />
              Watch on YouTube
            </>
          )}
        </a>
      </div>
    </article>
  );
}
