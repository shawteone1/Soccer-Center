import { useEffect, useRef, useState } from 'react';

/** Native controls remain usable when Safari declines automatic playback. */
export default function PodcastAudioPlayer({ src, title, onEnded }: {
  src: string; title: string; onEnded?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  let safe = false;
  try { const u = new URL(src); safe = u.protocol === 'https:' && !u.username && !u.password; } catch { /* unsupported URL */ }
  if (!safe) return <p role="status">This episode has no supported secure audio link. Open its publisher page to listen.</p>;
  return <div className="space-y-2 py-2">
    <audio ref={audio} src={src} controls autoPlay preload="metadata" aria-label={`Listen: ${title}`}
      className="w-full" onError={() => setFailed(true)} onCanPlay={() => setFailed(false)} onEnded={onEnded} />
    <div className="flex flex-wrap gap-3 items-center">
      <a href={src} target="_blank" rel="noopener noreferrer" onClick={() => audio.current?.pause()}
        className="inline-flex items-center min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
        Open audio in new tab ↗
      </a>
      {failed && <button type="button" className="min-h-11 underline" onClick={() => {
        setFailed(false); audio.current?.load();
        void audio.current?.play().catch(() => setFailed(true));
      }}>Retry playback</button>}
    </div>
    <p className="text-xs text-muted-foreground">On iPad or iPhone, this opens a browser tab—not a floating window. Tap Play if playback does not start.</p>
    {failed && <p role="alert" className="text-sm">Audio could not play. The publisher link or format may be unavailable; retry or open audio in a new tab.</p>}
  </div>;
}
