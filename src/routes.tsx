import { RouteObject, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import HomePage from './pages/index';
import SoccerDirectoryPage from './pages/soccer-directory';
import SoccerDirectoryRegionPage from './pages/soccer-directory-region';
import CommunityPage from './pages/community';
import FanZonePage from './pages/fanzone';
import FanzoneHighlightsPage from './pages/fanzone-highlights';
import ProSourcesCoveragePage from './pages/pro-sources-coverage';
import TeamsPage from './pages/teams';
import TryoutsPage from './pages/tryouts';
import MySoccerPage from './pages/my-soccer';
import AdminContentPage from './pages/admin/content';
import AdminSettingsPage from './pages/admin/settings';
import YouthTryoutsFall2026Page from './pages/lp/youth-tryouts-fall-2026';
import ParentPortalPage from './pages/parent-portal';
import PortalLayout from './layouts/PortalLayout';
import FanLayout from './layouts/FanLayout';
import PortalErrorBoundary from './components/portal/PortalErrorBoundary';
import Spinner from './components/Spinner';
import ScoresPage from './pages/scores';
const ColoradoExplorerPage = lazy(() => import('./pages/colorado-explorer'));
// Internal research tool — noindex/nofollow, excluded from sitemap
const COLORADO_EXPLORER_PATH = '/research/colorado';
const CampsPage = lazy(() => import('./pages/camps'));
const PrivacyPage = lazy(() => import('./pages/privacy'));
const TermsPage = lazy(() => import('./pages/terms'));
const ParentPortalPlayerPage = lazy(() => import('./pages/parent-portal-player'));
const CreatePlayerPage = lazy(() => import('./pages/parent-portal-player-create'));
const ParentPortalPilotPage = lazy(() => import('./pages/parent-portal-pilot'));
const LockedInDemoPage = lazy(() => import('./pages/locked-in-demo'));
const ParentPortalDemoPage = lazy(() => import('./pages/demo/parent-portal'));
const CoachProfilePage = lazy(() => import('./pages/coach/profile'));

const PortalSpinner = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

const BlogPage = lazy(() => import('./pages/Blog'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
// Eager import so renderToString doesn't hit a Suspense boundary on 404 routes
// and abort to client rendering. The prod 404 page is tiny; the dev-tools
// variant stays lazy because it pulls in dev-only code we don't want in
// production bundles.
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = ProdNotFoundPage;

const AuthPage = lazy(() => import('./pages/auth/AuthPage'));

export const routes: RouteObject[] = [
  { path: COLORADO_EXPLORER_PATH, element: <Suspense fallback={<PortalSpinner />}><ColoradoExplorerPage /></Suspense> },
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/camps',
    element: <Suspense fallback={<PortalSpinner />}><CampsPage /></Suspense>,
  },
  {
    path: '/soccer-directory',
    element: <SoccerDirectoryPage />,
  },
  {
    path: '/soccer-directory/:slug',
    element: <SoccerDirectoryRegionPage />,
  },
  {
    // /resources is merged into /community — redirect preserves old links
    path: '/resources',
    element: <Navigate to="/community" replace />,
  },
  {
    path: '/community',
    element: <CommunityPage />,
  },
  {
    path: '/fanzone',
    element: <FanZonePage />,
  },
  {
    path: '/fanzone/highlights',
    element: <FanzoneHighlightsPage />,
  },
  {
    path: '/pro-sources-coverage',
    element: <ProSourcesCoveragePage />,
  },
  {
    path: '/teams',
    element: <TeamsPage />,
  },
  {
    path: '/tryouts',
    element: <TryoutsPage />,
  },
  {
    // Fan Arena layout route — suppresses public Header/Footer for /my-soccer
    element: <FanLayout />,
    children: [
      {
        path: '/my-soccer',
        element: <MySoccerPage />,
      },
    ],
  },
  {
    // Portal layout route — replaces public Header/Footer for all portal paths
    element: <PortalLayout />,
    errorElement: <PortalErrorBoundary />,
    children: [
      {
        path: '/parent-portal',
        element: <ParentPortalPage />,
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/parent-portal/players/new',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <CreatePlayerPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/parent-portal/players/:playerId/edit',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <CreatePlayerPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/parent-portal/players/:playerId',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <ParentPortalPlayerPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/parent-portal/pilot',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <ParentPortalPilotPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/parent-portal/locked-in-demo',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <LockedInDemoPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
      {
        path: '/demo/parent-portal',
        element: (
          <Suspense fallback={<PortalSpinner />}>
            <ParentPortalDemoPage />
          </Suspense>
        ),
        errorElement: <PortalErrorBoundary />,
      },
    ],
  },
  {
    // Coach-facing player profile — standalone, no shared header/footer, noindex
    path: '/coach/profile/:token',
    element: (
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
        <CoachProfilePage />
      </Suspense>
    ),
  },
  {
    path: '/admin/content',
    element: <AdminContentPage />,
  },
  {
    path: '/admin/settings',
    element: <AdminSettingsPage />,
  },
  {
    path: '/lp/youth-tryouts-fall-2026',
    element: <YouthTryoutsFall2026Page />,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
  },
  {
    path: '/blog',
    element: <BlogPage />,
  },
  {
    path: '/blog/:slug',
    element: <BlogPostPage />,
  },
  {
    // /login used to show the portal chooser. Now it redirects to the homepage
    // (signed-out) or /my-soccer (signed-in, handled by AuthPage redirect logic).
    // The chooser UI is retired — users sign in directly from the homepage CTA.
    path: '/login',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/login/auth',
    element: <AuthPage providers={['google']} />,
  },
  {
    path: '/scores',
    element: <ScoresPage />,
  },
  {
    id: 'airo-not-found',
    path: '*',
    element: <NotFoundPage />,
  },
];

// Types for type-safe navigation
export type Path = '/' | '/soccer-directory' | '/community' | '/fanzone' | '/teams' | '/tryouts' | '/my-soccer' | '/login';

export type Params = Record<string, string | undefined>;
