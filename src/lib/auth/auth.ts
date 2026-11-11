/**
 * BetterAuth Server Configuration
 *
 * Supports both Email/Password and OAuth authentication.
 * Enable/disable methods by uncommenting the relevant sections.
 *
 * Secrets (via getSecret from #airo/secrets):
 * - BETTER_AUTH_SECRET: Session encryption key (auto-generated during install)
 * - OAuth credentials (GOOGLE_CLIENT_ID, etc.) for social login
 *
 * CORS/Trusted Origins:
 * - Only trusts origins matching the server's hostname
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '@/server/db/client';
import { user, session, account, verification } from '@/server/db/schema';
import { getSecret } from '#airo/secrets';

// Lazy singleton — betterAuth() must NOT run at module init time.
//
// The BETTER_AUTH_SECRET is loaded from the alloc config at runtime, so the
// auth instance must be constructed after the secrets are available (i.e. on
// the first HTTP request, not at import time).
//
// Pattern mirrors how db/client.ts defers the actual MySQL connection — the
// pool object is safe to create at init, but anything that reads schema state
// or secrets must be deferred to request time.
let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (_auth) return _auth;

  const authSecret = getSecret('BETTER_AUTH_SECRET');
  if (!authSecret || typeof authSecret !== 'string') {
    throw new Error('BETTER_AUTH_SECRET is not set or invalid — run requestSecrets() first');
  }

  if (!db) {
    throw new Error('Database not configured. Install the database skill first, then configure auth.');
  }

  // Determine the canonical base URL for this environment.
  //
  // BetterAuth uses baseURL to build the OAuth redirect_uri it sends to Google.
  // Without an explicit value it falls back to getOrigin(request.url), which in
  // production resolves to the internal container hostname — not soccercenter.org —
  // causing a redirect_uri_mismatch 400 from Google.
  //
  // Priority:
  //   1. BETTER_AUTH_URL secret (set this to override for any environment)
  //   2. Hard-coded production URL when AIRO_PREVIEW is not set
  //   3. Preview: leave undefined so BetterAuth infers from the request (preview
  //      URLs change per-deploy and are not registered in Google Cloud anyway)
  const betterAuthUrlSecret = getSecret('BETTER_AUTH_URL');
  const explicitBaseUrl =
    (typeof betterAuthUrlSecret === 'string' && betterAuthUrlSecret.startsWith('http'))
      ? betterAuthUrlSecret
      : process.env.AIRO_PREVIEW !== 'true'
        ? 'https://soccercenter.org'
        : undefined;

  const auth = betterAuth({
    // Schema passed explicitly — avoids BetterAuth's runtime schema inference.
    database: drizzleAdapter(db, {
      provider: 'mysql',
      schema: { user, session, account, verification },
    }),

    secret: authSecret,

    // Explicit base URL so BetterAuth sends the correct redirect_uri to Google.
    // Without this, the OAuth callback is built from the internal container
    // hostname rather than the public domain, causing redirect_uri_mismatch.
    ...(explicitBaseUrl ? { baseURL: explicitBaseUrl } : {}),

    // Protect admin status and access type from user input
    user: {
      additionalFields: {
        isAdmin: {
          type: 'boolean',
          defaultValue: false,
          input: false,  // Prevent clients from writing this field
          returned: true,
        },
        accessType: {
          type: 'string',
          defaultValue: null,
          input: false,  // Server-managed only; never accept from client
          returned: true,
        },
      },
    },

    // CORS: Trusts .airoapp.ai subdomains and localhost by default.
    // If your app has a custom domain, add it here or set BETTER_AUTH_TRUSTED_ORIGINS.
    trustedOrigins: (request?: Request) => {
      if (!request) return [];

      const origin = request.headers.get('origin');
      if (!origin) return [];

      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname;

        // Trust all airoapp.ai subdomains
        if (hostname.endsWith('.airoapp.ai') || hostname.endsWith('.test-airoapp.ai')) {
          return [origin];
        }

        // Trust localhost for development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return [origin];
        }

        // Trust custom domain
        if (hostname === 'soccercenter.org' || hostname === 'www.soccercenter.org') {
          return [origin];
        }

        return [];
      } catch {
        return [];
      }
    },

    // In preview mode the site runs in an iframe embedded by the builder on a different
    // origin, so cookies need SameSite=None + Secure + Partitioned (CHIPS) for cross-site
    // access. In publish mode (standalone) we use the safer SameSite=Lax default.
    ...(process.env.AIRO_PREVIEW === 'true' && {
      advanced: {
        defaultCookieAttributes: {
          sameSite: 'none' as const,
          secure: true,
          partitioned: true,
        },
      },
    }),

    // 30-day rolling sessions — persist across browser restarts and deployments.
    // cookieCache reduces DB round-trips: the session is re-validated from the
    // cookie for up to 5 minutes before hitting the database again.
    session: {
      expiresIn: 60 * 60 * 24 * 30,   // 30 days in seconds
      updateAge: 60 * 60 * 24,         // refresh the expiry once per day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,                // 5-minute client-side cache
      },
    },

    socialProviders: {
      google: {
        clientId: getSecret('GOOGLE_CLIENT_ID') as string,
        clientSecret: getSecret('GOOGLE_CLIENT_SECRET') as string,
        // Always show the Google account picker so users can choose between
        // multiple Google accounts (e.g. personal vs. test account) on every
        // sign-in. Without this, Google silently reuses the last-used account
        // and there is no way to switch without going to accounts.google.com.
        prompt: 'select_account',
      },
    },
  });

  _auth = auth as unknown as ReturnType<typeof betterAuth>;
  return auth;
}

export type Session = ReturnType<typeof getAuth>['$Infer']['Session'];
export type User = ReturnType<typeof getAuth>['$Infer']['Session']['user'];
// Exported for inferAdditionalFields on the auth client — type-only, no runtime import.
export type Auth = ReturnType<typeof getAuth>;
