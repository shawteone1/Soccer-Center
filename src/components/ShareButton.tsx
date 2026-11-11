/**
 * ShareButton — reusable social sharing popover.
 *
 * Platforms:
 *   Facebook  — web share dialog (URL only)
 *   X/Twitter — tweet with pre-filled text + URL
 *   Instagram — copy-link (Instagram has no web share API)
 *   Copy link — clipboard fallback
 *
 * Usage:
 *   <ShareButton url="https://soccercenter.org/tryouts" text="Check out this tryout!" />
 */

import { useState, useRef, useEffect } from 'react';
import { Share2, Facebook, Copy, Check } from 'lucide-react';

interface ShareButtonProps {
  /** Canonical URL to share */
  url: string;
  /** Pre-filled share text (used by X/Twitter) */
  text: string;
  /** Optional label shown on the button (defaults to icon-only) */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

// X (Twitter) SVG — inline because lucide's Twitter icon is the old bird glyph
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

// Instagram SVG
function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ShareButton({ url, text, label, size = 'sm' }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${text} ${url}`);

  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const xHref = `https://x.com/intent/tweet?text=${encodedText}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      document.body.removeChild(inp);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btnBase =
    size === 'sm'
      ? 'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors'
      : 'inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors';

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Share"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={btnBase}
        style={{
          background: 'hsl(var(--muted))',
          color: 'hsl(var(--foreground))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <Share2 className={iconSize} />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1.5 right-0 rounded-xl shadow-xl border p-2 min-w-[188px]"
          style={{
            background: 'hsl(var(--card))',
            borderColor: 'hsl(var(--border))',
          }}
          role="menu"
          aria-label="Share options"
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-widest px-2 pb-1.5 pt-0.5"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Share
          </p>

          {/* Facebook */}
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            <Facebook
              className="w-4 h-4 shrink-0"
              style={{ color: 'hsl(var(--brand-facebook))' }}
            />
            Facebook
          </a>

          {/* X / Twitter */}
          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            <XIcon className="w-4 h-4 shrink-0" />
            X (Twitter)
          </a>

          {/* Instagram — copy link with label */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { void copyLink(); }}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted text-left"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            <InstagramIcon
              className="w-4 h-4 shrink-0"
              style={{ color: 'hsl(var(--brand-instagram))' }}
            />
            Instagram (copy link)
          </button>

          {/* Divider */}
          <div className="my-1 border-t" style={{ borderColor: 'hsl(var(--border))' }} />

          {/* Copy link */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { void copyLink(); }}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted text-left"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                <span style={{ color: 'hsl(var(--primary))' }}>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                Copy link
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
