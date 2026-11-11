import { lazy, Suspense } from 'react';
import { Outlet, type RouteObject } from 'react-router';

import AiroErrorBoundary from '../export-plugins/AiroErrorBoundary';
import { AiroRouterProvider } from '../export-plugins/AiroRouterProvider';
import { createAiroBrowserRouter } from '../export-plugins/router-contract';
import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import InboxChatWidget from './components/InboxChatWidget';
import RootLayout from './layouts/RootLayout';
import Spinner from './components/Spinner';
import { routes } from './routes';

const CookieBanner = lazy(() =>
  import('@/components/CookieBanner').catch((error) => {
    console.warn('Failed to load CookieBanner:', error);
    return { default: () => null };
  })
);

const SpinnerFallback = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

const rootElement = (
  <Suspense fallback={<SpinnerFallback />}>
    <RootLayout>
      <Outlet />
    </RootLayout>
  </Suspense>
);

// Wrap the agent-editable flat `routes` array in a layout route so ScrollRestoration
// + shared chrome live once above every page. Keeping the wrap here (instead of
// in routes.tsx) preserves the agent's simple flat-route contract. The dev
// boundary must live inside the route element so React Router doesn't replace it
// with its default route error UI before our boundary can catch render errors.
//
// `captureGlobalErrors={false}`: the ROOT boundary in main.tsx owns the global
// window.onerror/unhandledrejection handlers. This inner boundary only catches
// route render errors via componentDidCatch — installing window handlers here
// too would double-forward async errors and stack a second overlay.
const routeTree: RouteObject[] = [
  {
    element:
      import.meta.env.MODE === 'development' ? (
        <AiroErrorBoundary captureGlobalErrors={false}>{rootElement}</AiroErrorBoundary>
      ) : (
        rootElement
      ),
    children: routes,
  },
];

const router = createAiroBrowserRouter(routeTree, { notFoundRouteId: 'airo-not-found' });

const _virtualPageState = { lastPath: null as string | null };
router.subscribe((state) => {
  if (state.navigation.state !== 'idle') return;
  if (!window._allowCT) return;
  const { pathname } = state.location;
  if (pathname === _virtualPageState.lastPath) return;
  _virtualPageState.lastPath = pathname;
  window._signalsDataLayer = window._signalsDataLayer || [];
  window._signalsDataLayer.push({
    schema: 'add_virtual_page_view',
    version: 'v1',
    data: { virtualPath: pathname },
  });
});

export default function App() {
  return (
    <>
      <AiroRouterProvider router={router} />
      {/*
        CookieBanner reads document.cookie and subscribes to browser events.
        App.tsx is client-only (entry-server.tsx renders the route tree
        directly without importing App), so no SSR gate is needed here.
      */}
      <CookieBannerErrorBoundary>
        <Suspense fallback={null}>
          <CookieBanner />
        </Suspense>
      </CookieBannerErrorBoundary>
      <InboxChatWidget />
    </>
  );
}
