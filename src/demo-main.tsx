/**
 * src/demo-main.tsx
 *
 * Dedicated entry point for the isolated coach-sharing demo.
 *
 * ISOLATION GUARANTEES
 * ────────────────────
 * This file does NOT import:
 *   - App.tsx (which imports authentication session logic)
 *   - RootLayout (which imports Header/Footer and auth-aware nav)
 *   - server/entry.ts (backend, migrations, database)
 *   - analytics scripts
 *   - any authentication service
 *
 * It mounts only the two routes needed for the demo:
 *   /demo/parent-portal  — parent demo page (CoachShareTab in isDemoMode)
 *   /coach/profile/:token — coach card page (demo token resolution)
 *
 * Providers: React 19 root, React Router, TanStack Query, HelmetProvider.
 * Styles: globals.css (Tailwind + CSS variables — no auth-specific styles).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import './styles/globals.css';

// ─── Lazy-loaded demo pages ───────────────────────────────────────────────────
// Lazy imports keep the bundle lean and ensure no transitive auth imports
// are pulled in at startup.

import { lazy, Suspense } from 'react';

const DemoParentPortal = lazy(() => import('./pages/demo/parent-portal'));
const CoachProfilePage = lazy(() => import('./pages/coach/profile'));

// ─── Loading fallback ─────────────────────────────────────────────────────────

function DemoLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'hsl(var(--pp-page-bg, 220 20% 97%))',
        color: 'hsl(var(--pp-text-muted, 220 10% 50%))',
        fontSize: '0.875rem',
      }}
    >
      Loading…
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  {
    path: '/demo/parent-portal',
    element: (
      <Suspense fallback={<DemoLoader />}>
        <DemoParentPortal />
      </Suspense>
    ),
  },
  {
    path: '/coach/profile/:token',
    element: (
      <Suspense fallback={<DemoLoader />}>
        <CoachProfilePage />
      </Suspense>
    ),
  },
  {
    // Redirect root to the demo page so the demo server has a useful default
    path: '/',
    element: <Navigate to="/demo/parent-portal" replace />,
  },
  {
    // Catch-all: redirect unknown paths to the demo page
    path: '*',
    element: <Navigate to="/demo/parent-portal" replace />,
  },
]);

// ─── Query client ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 60_000,
    },
  },
});

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
