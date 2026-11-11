/**
 * PortalLayout — dedicated shell for /parent-portal and /parent-portal/*.
 *
 * Replaces the public site header with:
 *   - Compact Soccer Center wordmark (links back to /)
 *   - "Parent Portal" label
 *   - Account controls: avatar chip + email + sign-out
 *   - Fan experience switcher button
 *
 * The public site Header and Footer are NOT rendered here.
 * The pp-shell class is applied at this level so every portal sub-page
 * inherits the blue/white/grey palette without each page needing to wrap itself.
 *
 * LAYOUT RULES:
 *   - Header is h-14 (56px) on all breakpoints — never taller
 *   - All controls stay inside the viewport at 375px width
 *   - No overflow-hidden on the header — avatar chip must not be clipped
 *   - No CSS variable opacity modifiers (hsl(var(--x) / 0.4)) — use dedicated tokens
 *   - Fan view button hidden on xs (<sm) — accessible via account menu instead
 */

import { type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import '@/styles/member-experience-polish.css';
import { LogOut, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { useSession, LogoutButton } from '@/lib/auth/auth-client';
import { useState, useRef, useEffect } from 'react';
import { SuppressPublicChrome } from '@/layouts/LayoutContext';

interface PortalLayoutProps {
  children?: ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const { user, isAuthenticated } = useSession();
  const { pathname } = useLocation();
  const polish = !pathname.includes('demo') && !pathname.includes('pilot');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (menuOpen && e.key === 'Escape') {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  // Derive initials from display name stored in profile, falling back to email
  const initials = user?.name
    ? user.name.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'ME';

  async function handleSwitchToFan() {
    // Save the preference BEFORE navigating. The /my-soccer page reads
    // lastPortalPreference from /api/my-soccer/me on mount; if we navigate
    // before the save completes, /me still returns 'parent' and ParentRedirect
    // fires, bouncing the user straight back here.
    try {
      await fetch('/api/my-soccer/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastPortalPreference: 'fan' }),
      });
    } catch {
      // non-fatal — navigate anyway; worst case the preference isn't persisted
    }
    // Hard navigation resets all React state in my-soccer.tsx so meLoadedRef
    // starts fresh and reads the newly saved 'fan' preference from /me.
    window.location.href = '/my-soccer';
  }

  return (
    <div className={`pp-shell min-h-screen flex flex-col${polish ? ' sc-member-polish' : ''}`}>
      {/* Suppress the public Header/Footer rendered by RootLayout */}
      <SuppressPublicChrome />
      {/* ── Portal header bar ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'hsl(var(--pp-navy))',
          borderColor: 'hsl(var(--pp-navy-border, var(--pp-navy)))',
        }}
      >
        {/*
          px-3 on xs, px-4 on sm+.
          gap-2 keeps controls from touching on narrow screens.
          overflow-visible is intentional — avatar chip must not be clipped.
        */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">

          {/* Left: branding — shrinks but never disappears */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <Link
              to="/"
              className="shrink-0 flex items-center gap-1.5"
              aria-label="Soccer Center home"
            >
              {/* White pill wrapping the dark-surface logo variant */}
              <span className="inline-flex items-center justify-center rounded bg-white px-1.5 py-0.5 shrink-0">
                <img
                  src="/airo-assets/images/logo/horizontal/dark"
                  alt="Soccer Center"
                  className="block h-auto max-h-5 w-auto max-w-[80px] object-contain"
                />
              </span>
            </Link>
            {/* "Parent Portal" label — hidden on xs to save space */}
            <span
              className="hidden sm:block text-xs font-semibold tracking-wide uppercase select-none whitespace-nowrap"
              style={{ color: 'hsl(var(--pp-blue-light))' }}
            >
              Parent Portal
            </span>
          </div>

          {/* Right: account controls — shrink-0 so they never collapse */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* Fan experience switcher — always visible; label hidden on xs to save space */}
            <button
              type="button"
              onClick={handleSwitchToFan}
              className="flex items-center gap-1.5 text-sm font-semibold px-2 sm:px-3 min-h-[48px] rounded-lg border transition-colors whitespace-nowrap"
              style={{
                borderColor: 'hsl(var(--pp-header-btn-border))',
                color: 'hsl(var(--pp-blue-light))',
                background: 'hsl(var(--pp-header-btn-border) / 0.15)',
              }}
              title="Switch to Fan Arena"
              aria-label="Switch to Fan Arena"
            >
              <ArrowLeftRight size={14} />
              <span className="hidden sm:inline">Switch to Fan Arena</span>
            </button>

            {/* Account menu */}
            {isAuthenticated && (
              <div className="relative" ref={menuRef}>
                {/*
                  overflow-visible is critical — the avatar chip is a circle that
                  extends slightly beyond the button's padding box. overflow-hidden
                  would clip the top/bottom of the circle on some browsers.
                */}
                <button
                  type="button"
                  onClick={() => setMenuOpen(v => !v)}
                  className="flex items-center gap-1 rounded-full pl-0.5 pr-1.5 py-0.5 transition-colors"
                  style={{ background: 'hsl(var(--pp-header-chip-bg))' }}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  {/* Avatar chip — fixed 28×28 circle, never clipped */}
                  <span className="pp-portal-avatar-chip" aria-hidden="true">
                    {initials}
                  </span>
                  {/* Email — only on md+ where there's room */}
                  <span
                    className="hidden md:block text-xs font-medium max-w-[100px] truncate ml-1"
                    style={{ color: 'hsl(var(--pp-blue-light))' }}
                  >
                    {user?.email ?? ''}
                  </span>
                  <ChevronDown
                    size={11}
                    style={{ color: 'hsl(var(--pp-blue-light))' }}
                    className={`transition-transform ml-0.5 ${menuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown — right-aligned, z-50 so it clears the tab nav */}
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-lg border overflow-hidden z-50"
                    style={{
                      background: 'hsl(var(--pp-card-bg))',
                      borderColor: 'hsl(var(--pp-border))',
                    }}
                  >
                    {/* Email header */}
                    <div
                      className="px-4 py-3 border-b"
                      style={{ borderColor: 'hsl(var(--pp-border))' }}
                    >
                      <p className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                        {user?.email ?? ''}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        Parent account
                      </p>
                    </div>

                    {/* Fan switcher — in menu for completeness on all screen sizes */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); void handleSwitchToFan(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                      style={{ color: 'hsl(var(--pp-text))' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--pp-blue-light))')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <ArrowLeftRight size={14} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      Switch to Fan view
                    </button>

                    {/* Sign out */}
                    <LogoutButton
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors border-t pp-logout-btn"
                    >
                      <LogOut size={14} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      Sign out
                    </LogoutButton>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div className="sc-member-content flex-1">
        {children ?? <Outlet />}
      </div>
    </div>
  );
}
