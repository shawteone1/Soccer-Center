/**
 * /coach/profile/:token
 *
 * Public coach-facing player profile card.
 * No authentication required — the token is the credential.
 *
 * DEMO TOKEN SUPPORT
 * ──────────────────
 * Tokens starting with "demo-token-" are resolved from localStorage
 * (key: sc_demo_coach_links) instead of the application API.
 * This lets the parent open the demo link in a new tab and see the
 * same card the coach would see — without any database access.
 *
 * Expired, revoked, and unknown tokens all render the same "unavailable"
 * state. The page does not distinguish between these cases to avoid
 * information leakage.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AlertCircle, Loader2 } from 'lucide-react';
import { coachCardStyle } from '@/lib/portal/coach-card-style';
import { CoachProfileCard, type CoachProfile } from '@/components/portal/CoachProfileCard';
import { resolveDemoToken as resolveDemoTokenFromStore } from '@/components/portal/coach-demo-store';
import { coach_profile } from 'virtual:content';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachViewResponse {
  profile: CoachProfile;
  linkId: string;
  expiresAt: string | null;
}

// ─── Demo resolution ──────────────────────────────────────────────────────────

/**
 * Thin wrapper that casts the generic Record return to CoachProfile.
 * The actual resolver lives in coach-demo-store.ts and is shared with unit tests.
 */
function resolveDemoToken(token: string): { profile: CoachProfile; expiresAt: string | null } | null {
  const result = resolveDemoTokenFromStore(token);
  if (!result) return null;
  return { profile: result.profile as CoachProfile, expiresAt: result.expiresAt };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoachProfilePage() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const layout = coachCardStyle(params.get('style'));
  const [data, setData] = useState<CoachViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [isDemoLink, setIsDemoLink] = useState(false);

  useEffect(() => {
    if (!token) { setUnavailable(true); setLoading(false); return; }

    // Demo token — resolve from sessionStorage, no API call
    if (token.startsWith('demo-token-')) {
      const resolved = resolveDemoToken(token);
      if (resolved) {
        setData({ profile: resolved.profile, linkId: 'demo', expiresAt: resolved.expiresAt });
        setIsDemoLink(true);
      } else {
        setUnavailable(true);
      }
      setLoading(false);
      return;
    }

    // Real token — fetch from application API
    void (async () => {
      try {
        const res = await fetch(`/api/coach/profile/${token}`);
        if (!res.ok) { setUnavailable(true); return; }
        const json = await res.json() as CoachViewResponse;
        setData(json);
      } catch {
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <>
      <Helmet>
        <title>{coach_profile.pageTitle}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content={coach_profile.pageDescription} />
      </Helmet>

      {/* Standalone shell — no shared header/footer */}
        <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4"
        style={{ background: 'hsl(var(--pp-page-bg))' }}>
        <h1 className="sr-only">{coach_profile.srHeading}</h1>
        <div className={`w-full ${layout === 'editorial' ? 'max-w-3xl' : layout === 'trading' ? 'max-w-lg' : 'max-w-sm'}`}>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--pp-blue))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>{coach_profile.loadingText}</p>
            </div>
          )}

          {!loading && unavailable && (
            <div
              data-testid="coach-card-unavailable"
              className="flex flex-col items-center text-center gap-4 py-16"
            >
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
                <AlertCircle size={28} style={{ color: 'hsl(var(--pp-text-muted))' }} />
              </div>
              <div>
                <p className="text-base font-bold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
                  {coach_profile.unavailableHeading}
                </p>
                <p className="text-sm max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {coach_profile.unavailableBody}
                </p>
              </div>
            </div>
          )}

          {!loading && !unavailable && data?.profile && (
            <CoachProfileCard
              profile={data.profile}
              layout={layout}
              expiresAt={data.expiresAt}
              isDemoLink={isDemoLink}
              token={token ?? ''}
            />
          )}
        </div>
      </div>
    </>
  );
}
