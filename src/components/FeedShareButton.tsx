import { useState } from 'react';
import { Share2, Copy, X } from 'lucide-react';

// Only public source URLs belong here. Never pass private media or coach links.
export function publicFeedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (/^\/(api|coach|parent-portal|my-soccer)(\/|$)/i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(k => /^(token|access_token|signature|auth|key)$/i.test(k))) return null;
    return url.href;
  } catch { return null; }
}

export default function FeedShareButton({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const safeUrl = publicFeedUrl(url);
  async function share() {
    setMessage('');
    if (!safeUrl) return;
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title, url: safeUrl }); return; }
      catch (error) { if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return; }
    }
    setOpen(true);
  }
  async function copy() {
    if (!safeUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(safeUrl);
      setMessage('Link copied');
    } catch { setMessage('Select and copy the link below.'); }
  }
  return <div className="px-3 py-2 border-t border-border" onClick={e => e.stopPropagation()}>
    <button type="button" onClick={() => void share()} disabled={!safeUrl}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-60"
      aria-label={`Share ${title}`}><Share2 size={16} />Share</button>
    {!safeUrl && <span className="text-xs">Sharing unavailable for this item</span>}
    {open && <div className="space-y-2" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void copy()} className="min-h-11 inline-flex items-center gap-2 px-3"><Copy size={16} />Copy link</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 min-w-11" aria-label="Close sharing"><X size={16} /></button>
      </div>
      <input aria-label="Public source link" readOnly value={safeUrl ?? ''} onFocus={e => e.target.select()} className="w-full min-w-0 rounded border bg-background p-2 text-sm" />
    </div>}
    <span role="status" className="text-sm">{message}</span>
  </div>;
}
