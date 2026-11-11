/**
 * BetterAuth Client + Components
 *
 * BetterAuth handles session context internally via cookies and the useSession hook.
 * No explicit React context provider is needed - the authClient manages session state.
 */

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';

import {
  SESSION_RECOVERY_URL,
  SESSION_RECOVERY_STORAGE_KEY,
  claimSessionRecovery,
  clearSessionRecovery,
} from './session-recovery';
import type { Auth } from './auth';

// Auth client - baseURL must be the full origin for BetterAuth's URL construction.
// window.location.origin works in all environments (local dev, iframe preview, published).
//
// inferAdditionalFields<Auth> requests that BetterAuth include additionalFields
// (isAdmin, accessType) in the /api/auth/get-session response payload.
// The client-side TypeScript type does not automatically widen to include these
// fields, so components access them via the AdminUser cast exported below.
const _authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [inferAdditionalFields<Auth>()],
});

// How long an unsettled session may stay pending before we treat it as a stuck
// stale-cookie state and attempt recovery. 4 s covers slow cold-start DB queries
// while being short enough that a genuinely stuck session self-heals quickly.
// (Previously 8 s — too long; users saw a frozen spinner for the full duration.)
const SESSION_RECOVERY_PENDING_TIMEOUT_MS = 4000;

/**
 * Clear the stale HttpOnly session cookie server-side, then reload into a clean
 * unauthenticated state. One-shot per tab (see `claimSessionRecovery`) so an
 * unfixable session can't reload-loop.
 */
function recoverFromStaleSession(): void {
  if (typeof window === 'undefined') return;
  if (!claimSessionRecovery(window.sessionStorage)) return;

  void fetch(SESSION_RECOVERY_URL, { cache: 'no-store', credentials: 'include' })
    .catch(() => undefined)
    .finally(() => {
      // Logged so a future "preview keeps reloading" report is diagnosable —
      // more than one of these per tab points at a clear that isn't sticking.
      console.info(JSON.stringify({ event: 'auth.session.recovery.reloading' }));
      window.location.reload();
    });
}

/**
 * Self-heal a stale-cookie session. A failed session lookup is a returned
 * `error`, not a thrown one, so no error boundary fires and the app would sit
 * blank. Recover on an explicit error, or when the session never settles within
 * the pending timeout. A healthy session resets the guard so a later genuine
 * failure can recover again in the same tab.
 */
function useStaleSessionRecovery(error: unknown, isPending: boolean, isAuthenticated: boolean): void {
  useEffect(
    function staleSessionRecovery() {
      if (typeof window === 'undefined') return;

      if (error) {
        recoverFromStaleSession();
        return;
      }
      if (isAuthenticated) {
        clearSessionRecovery(window.sessionStorage);
        return;
      }
      if (!isPending) return;

      const timer = setTimeout(recoverFromStaleSession, SESSION_RECOVERY_PENDING_TIMEOUT_MS);
      return () => clearTimeout(timer);
    },
    [error, isPending, isAuthenticated],
  );
}

export const authClient = _authClient;
export const { signIn, signUp, signOut } = _authClient;

/**
 * AdminUser — the session user type extended with server-managed fields.
 *
 * BetterAuth's client-side type does not automatically widen to include
 * additionalFields (isAdmin, accessType) even when inferAdditionalFields is
 * configured. These fields ARE present in the runtime session payload because
 * the server declares them with `returned: true`. This type makes that
 * explicit so components can check isAdmin without an inline cast.
 */
export type AdminUser = ReturnType<typeof _authClient.useSession>['data'] extends
  { user: infer U } | null ? U & { isAdmin?: boolean; accessType?: string | null } : never;

/**
 * useSession — null-safe session hook.
 *
 * Returns `user` as a top-level nullable field and `isAuthenticated` as a
 * boolean so components naturally handle the unauthenticated state:
 *
 *   const { user, isAuthenticated, isPending } = useSession();
 *   if (isPending) return <Spinner />;
 *   return isAuthenticated ? <span>{user.name}</span> : <a href="/login">Sign In</a>;
 */
export function useSession() {
  const { data: session, isPending, error } = _authClient.useSession();
  const isAuthenticated = !isPending && !!session?.user;

  useStaleSessionRecovery(error, isPending, isAuthenticated);

  return {
    session,
    // Cast to AdminUser so isAdmin / accessType are accessible without inline casts.
    // These fields are present at runtime (server declares them returned: true).
    user: (session?.user ?? null) as AdminUser | null,
    isPending,
    error,
    isAuthenticated,
  };
}

// Alias for useSession (common naming convention)
export const useAuth = useSession;

/**
 * SessionProvider - Wrapper for compatibility with common auth patterns.
 *
 * BetterAuth manages session state internally through cookies and the useSession hook,
 * so no React context is needed. This component is provided for API compatibility
 * with apps that expect a provider wrapper pattern (e.g., migrating from NextAuth).
 *
 * You can safely wrap your app with this, but it's optional.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Alias for SessionProvider (common naming convention in auth libraries)
export const AuthProvider = SessionProvider;

// Session timeout for loading state (30 seconds)
const SESSION_TIMEOUT_MS = 30000;

// ProtectedRoute component with timeout handling
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isPending } = useSession();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending) return;

    const timeout = setTimeout(() => setTimedOut(true), SESSION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isPending]);

  if (timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Session check timed out. Please try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve intended destination so AuthPage can redirect back after login
    return <Navigate to="/login/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * LogoutButton - Button to sign out the user
 *
 * Handles the sign-out process and redirects to login page.
 * Can be customized with className prop.
 */
export function LogoutButton({
  className = '',
  children = 'Logout',
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      await signOut();
      // Clear all arena/portal session state so the next sign-in starts fresh.
      // Also clear the stale-session recovery guard so a clean sign-out doesn't
      // burn the one-shot recovery token — the next session load should be able
      // to self-heal if it encounters a genuinely stale cookie.
      try {
        sessionStorage.removeItem('sc_portal_choice');
        sessionStorage.removeItem('sc_portal_preference');
        sessionStorage.removeItem(SESSION_RECOVERY_STORAGE_KEY);
      } catch { /* ignore */ }
      // Redirect to the public homepage, not the chooser
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={className || 'px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50'}
    >
      {isLoading ? 'Logging out...' : children}
    </button>
  );
}
