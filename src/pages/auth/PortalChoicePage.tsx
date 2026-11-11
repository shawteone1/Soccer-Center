/**
 * PortalChoicePage — "How would you like to use Soccer Center?"
 *
 * Step 1 of the two-step sign-in flow. Presents Fan and Parent cards.
 * The user's choice is a DESTINATION HINT only — it is stored in
 * sessionStorage and used for post-login routing. It never assigns
 * an account role or grants elevated permissions.
 *
 * Routing after sign-in (enforced in AuthPage):
 *   Fan card chosen:
 *     - Any account type  → /my-soccer (fan home)
 *   Parent card chosen:
 *     - PARENT account    → /my-soccer?portal=parent (parent home)
 *     - FAN account       → /my-soccer?setup=parent  (setup gate)
 *     - No account yet    → /my-soccer?setup=parent  (after signup)
 *
 * The server enforces access type on every API request regardless of
 * which card was chosen.
 */

import { useNavigate, useLocation, Navigate } from 'react-router';
import { useSession } from '@/lib/auth/auth-client';
import { Users, Star } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { portal_choice } from 'virtual:content';

/** sessionStorage key for the portal destination hint. */
export const PORTAL_CHOICE_KEY = 'sc_portal_choice';
export type PortalChoice = 'fan' | 'parent';

export default function PortalChoicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isPending } = useSession();

  // If already signed in, skip the choice screen and go to my-soccer
  if (isAuthenticated) {
    return <Navigate to="/my-soccer" replace />;
  }

  // Preserve any ?from= redirect intent across the two-step flow
  const searchParams = new URLSearchParams(location.search);
  const from = searchParams.get('from') || '';

  function choose(portal: PortalChoice) {
    // Store the destination hint — survives the OAuth redirect
    try {
      sessionStorage.setItem(PORTAL_CHOICE_KEY, portal);
    } catch {
      // sessionStorage unavailable (private mode, etc.) — proceed without it
    }

    // Navigate to the auth step, carrying the portal hint and any ?from= param
    const params = new URLSearchParams();
    params.set('portal', portal);
    if (from) params.set('from', from);
    navigate(`/login/auth?${params.toString()}`);
  }

  // NOTE: No isPending full-screen spinner. Cards render immediately and are
  // disabled while isPending is true. Same reasoning as AuthPage — a full-screen
  // spinner here would also freeze on slow cold-starts.

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-16">
      <Helmet>
        <title>Sign In — Soccer Center</title>
        <meta name="description" content="Sign in to Soccer Center as a fan or parent to access your personalized soccer experience." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <img
          src="/airo-assets/images/logo/horizontal"
          alt="Soccer Center"
          className="h-auto max-h-10 w-auto max-w-[200px] object-contain"
          loading="eager"
        />
      </div>

      {/* Headline */}
      <div className="text-center mb-10 max-w-md">
        <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
          {portal_choice.headline}
        </h1>
        <p className="text-muted-foreground text-base">
          {portal_choice.subheadline}
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {/* Fan card */}
        <button
          onClick={() => choose('fan')}
          disabled={isPending}
          className="group relative flex flex-col items-start gap-4 rounded-2xl border-2 border-border bg-card p-7 text-left transition-all duration-200 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Continue as a fan"
        >
          {/* Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Star className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
              {portal_choice.fanCard.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {portal_choice.fanCard.description}
            </p>
          </div>

          {/* Feature list */}
          <ul className="mt-1 space-y-1.5 text-sm text-muted-foreground">
            {portal_choice.fanCard.features.map(f => (
              <li key={f.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:underline">
            {portal_choice.fanCard.cta}
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </button>

        {/* Parent card */}
        <button
          onClick={() => choose('parent')}
          disabled={isPending}
          className="group relative flex flex-col items-start gap-4 rounded-2xl border-2 border-border bg-card p-7 text-left transition-all duration-200 hover:border-secondary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Continue as a parent"
        >
          {/* Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary transition-colors group-hover:bg-secondary group-hover:text-secondary-foreground">
            <Users className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
              {portal_choice.parentCard.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {portal_choice.parentCard.description}
            </p>
          </div>

          {/* Feature list */}
          <ul className="mt-1 space-y-1.5 text-sm text-muted-foreground">
            {portal_choice.parentCard.features.map(f => (
              <li key={f.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary flex-shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-secondary group-hover:underline">
            {portal_choice.parentCard.cta}
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </button>
      </div>

      {/* Skip / already have account */}
      <p className="mt-8 text-sm text-muted-foreground text-center">
        <span>{portal_choice.alreadyHaveAccount}</span>{' '}
        <button
          onClick={() => choose('fan')}
          disabled={isPending}
          className="font-medium text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {portal_choice.signInLink}
        </button>
      </p>

      <p className="mt-4 text-xs text-muted-foreground text-center max-w-sm">
        {portal_choice.disclaimer}
      </p>
    </div>
  );
}
