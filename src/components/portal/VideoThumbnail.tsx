import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

/** Decode a first frame only near the viewport; no autoplay or canvas copy of private media. */
export default function VideoThumbnail({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setFailed(false); setReady(false);
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [src]);
  return <div ref={container} className="relative w-full h-full grid place-items-center" style={{ background: 'hsl(var(--video-thumb-bg))', color: 'hsl(var(--pp-white))' }}>
    {visible && !failed && <video key={src} src={src} muted playsInline preload="metadata" aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover" style={{ opacity: ready ? 1 : 0 }}
      onLoadedMetadata={e => {
        const video = e.currentTarget;
        if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
      }}
      onSeeked={() => setReady(true)} onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />}
    <span className="relative flex flex-col items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'hsl(var(--video-thumb-overlay) / 0.79)' }}>
      <Play size={26} aria-hidden="true" />
      <span className="text-xs font-semibold">{failed ? 'Open video' : 'Play video'}</span>
    </span>
  </div>;
}
