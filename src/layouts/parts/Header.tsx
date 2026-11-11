import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X, LogOut, ChevronDown } from 'lucide-react';
import { useSession, LogoutButton, authClient } from '@/lib/auth/auth-client';

/**
 * Navigation design:
 *
 * All 6 primary links are always first-level — no link is ever hidden behind
 * a "More" dropdown. Blog is excluded (drafts preserved in src/content/data/blog/).
 *
 * Breakpoint strategy (measured against actual link text widths):
 *   < 1024px  → hamburger menu (mobile-style overlay)
 *   ≥ 1024px  → full inline desktop nav
 *
 * At 1024px the row budget is:
 *   logo ~180px + 6 links ~390px + My Soccer ~80px + auth ~120px + gaps ~90px ≈ 860px
 *   fits comfortably inside max-w-7xl with px-6 padding.
 *
 * At 768–1023px the row is too narrow for all links inline, so the hamburger
 * takes over — no partial hiding, no More dropdown.
 *
 * MORE_NAV is kept as an extension point (e.g. Blog when re-enabled).
 * It is rendered in the mobile overlay and, if non-empty, as a dropdown on desktop.
 */
const PRIMARY_NAV = [
  { label: 'Directory',   to: '/soccer-directory' },
  { label: 'Youth Tryouts', to: '/tryouts' },
  { label: 'Camps',       to: '/camps' },
  { label: 'Community',   to: '/community' },
  { label: 'Teams',       to: '/teams' },
  { label: 'Highlights',  to: '/fanzone/highlights' },
  { label: 'Fanzone',     to: '/fanzone' },
];

// Blog excluded until publishing is ready. Add entries here to restore.
const MORE_NAV: { label: string; to: string }[] = [];

export default function Header() {
  const [scrolled,     setScrolled]     = useState(false);
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const location    = useLocation();
  const { user, isAuthenticated, isPending } = useSession();
  const moreRef     = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Scroll shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current     && !moreRef.current.contains(e.target as Node))     setMoreOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google', callbackURL: '/' });
  };

  const isActive = (to: string) => location.pathname === to;
  const moreActive = MORE_NAV.some(l => isActive(l.to));

  const linkCls = (active: boolean) =>
    `text-sm font-medium transition-colors hover:text-primary ${active ? 'text-primary' : scrolled || mobileOpen ? 'text-foreground/80' : 'text-white/90'}`;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'bg-background/95 backdrop-blur-md border-b border-border shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16 lg:h-20">

        {/* Logo */}
        <Link to="/" className="shrink-0 flex items-center">
          <span className="inline-flex items-center justify-center rounded-lg bg-white px-2 py-1">
            <img
              src="/airo-assets/images/logo/horizontal?v=2"
              alt="Soccer Center — Find the Game."
              className="block h-auto max-h-9 lg:max-h-12 w-auto max-w-[160px] object-contain"
            />
          </span>
        </Link>

        {/* ── Desktop Nav — visible at lg (1024px+) only ───────────────── */}
        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-5 xl:gap-7">

          {/* All 6 primary links — always first-level, never hidden */}
          {PRIMARY_NAV.map(link => (
            <Link key={link.to} to={link.to} className={linkCls(isActive(link.to))}>
              {link.label}
            </Link>
          ))}

          {/* My Soccer — signed-in: go to dashboard; signed-out: go to portal choice */}
          {isAuthenticated ? (
            <Link to="/my-soccer" className={linkCls(isActive('/my-soccer'))}>
              My Soccer
            </Link>
          ) : (
            <Link to="/login/auth" className={linkCls(isActive('/login/auth'))}>
              My Soccer
            </Link>
          )}

          {/* More dropdown — only rendered when MORE_NAV has items (e.g. Blog re-enabled) */}
          {MORE_NAV.length > 0 && (
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary ${moreActive ? 'text-primary' : 'text-foreground/80'}`}
                aria-expanded={moreOpen}
                aria-haspopup="true"
              >
                More
                <ChevronDown size={14} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreOpen && (
                <div className="absolute left-0 top-full mt-2 w-44 rounded-xl border border-border bg-card shadow-xl py-1 z-50">
                  {MORE_NAV.map(link => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center px-4 py-2.5 text-sm transition-colors hover:bg-muted ${isActive(link.to) ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auth area */}
          {!isPending && (
            isAuthenticated && user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 hover:border-primary transition-colors"
                  aria-label="User menu"
                >
                  {user.image ? (
                    <img src={user.image} alt={user.name ?? 'User'} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                      {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground max-w-[100px] truncate">
                    {user.name ?? user.email}
                  </span>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card shadow-xl py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-border">
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/my-soccer"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      My Soccer
                    </Link>
                    <LogoutButton className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                      <LogOut size={15} className="text-muted-foreground" />
                      Sign Out
                    </LogoutButton>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="rounded-full bg-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 hover:opacity-90 transition flex items-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in
              </button>
            )
          )}

          <Link
            to="/#contact"
            className="rounded-full bg-accent text-accent-foreground font-semibold text-sm px-5 py-2.5 hover:opacity-90 transition"
          >
            Join the Game
          </Link>
        </nav>

        {/* Hamburger — visible below lg (< 1024px): 768, 820, 900px all use this */}
        <button
          className={`lg:hidden p-2 transition-colors ${scrolled || mobileOpen ? 'text-foreground' : 'text-white'}`}
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* ── Mobile / tablet menu overlay (< 1024px) ─────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden bg-background/98 backdrop-blur-md border-t border-border px-6 py-6 flex flex-col gap-1">

          {/* All nav links flat — no submenus, no More */}
          {[...PRIMARY_NAV, ...MORE_NAV].map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`py-2.5 text-base font-medium transition-colors hover:text-primary border-b border-border/40 last:border-0 ${isActive(link.to) ? 'text-primary' : 'text-foreground'}`}
            >
              {link.label}
            </Link>
          ))}

          {/* My Soccer — always visible in mobile menu */}
          <Link
            to={isAuthenticated ? '/my-soccer' : '/login/auth'}
            className={`py-2.5 text-base font-medium transition-colors hover:text-primary border-b border-border/40 ${isActive('/my-soccer') || isActive('/login/auth') ? 'text-primary' : 'text-foreground'}`}
          >
            My Soccer
          </Link>

          <div className="pt-4 flex flex-col gap-3">
            <Link
              to="/#contact"
              className="rounded-full bg-accent text-accent-foreground font-semibold text-sm px-5 py-3 text-center hover:opacity-90 transition"
            >
              Join the Game
            </Link>

            {!isPending && (
              isAuthenticated && user ? (
                <div className="border-t border-border pt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      <img src={user.image} alt={user.name ?? 'User'} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                        {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-foreground">{user.name ?? user.email}</span>
                  </div>
                  <LogoutButton className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <LogOut size={15} />
                    Sign Out
                  </LogoutButton>
                </div>
              ) : (
                <button
                  onClick={handleSignIn}
                  className="rounded-full bg-primary text-primary-foreground font-semibold text-sm px-5 py-3 text-center hover:opacity-90 transition flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign in with Google
                </button>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}
