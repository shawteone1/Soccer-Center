/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import { type RouteObject } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

// Swap createBrowserRouter for createMemoryRouter so we can navigate in tests.
// The capture happens when App.tsx is imported (module-level router init).
let testRouter: { navigate: (path: string) => Promise<void> };
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    createBrowserRouter: (routes: RouteObject[]) => {
      const r = actual.createMemoryRouter(routes);
      testRouter = r;
      return r;
    },
  };
});

// Stub layout/UI dependencies so the test is fast and focused.
vi.mock('../layouts/RootLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('../components/Spinner', () => ({ default: () => null }));
vi.mock('@/components/CookieBannerErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('../routes', () => ({
  routes: [{ path: '*', element: React.createElement('span') }] as RouteObject[],
}));
vi.mock('../../export-plugins/AiroErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/CookieBanner', () => ({ default: () => null }));

type DataLayerEntry = { schema: string; version: string; data: { virtualPath: string } };

beforeEach(() => {
  vi.resetModules();
  window._signalsDataLayer = [];
  window._allowCT = true;
});

it('pushes add_virtual_page_view with the new pathname when the route changes', async () => {
  const { default: App } = await import('../App');
  render(<App />);

  await act(async () => {
    await testRouter.navigate('/contact');
  });

  const views = (window._signalsDataLayer as DataLayerEntry[]).filter(
    (e) => e.schema === 'add_virtual_page_view',
  );
  // Length assertion also covers the non-idle guard: without it, the subscriber
  // fires twice per navigation (once while loading, once when idle).
  expect(views).toHaveLength(1);
  expect(views[0]).toEqual({
    schema: 'add_virtual_page_view',
    version: 'v1',
    data: { virtualPath: '/contact' },
  });
});

it('does not push when analytics consent is not given', async () => {
  window._allowCT = false;
  const { default: App } = await import('../App');
  render(<App />);

  await act(async () => {
    await testRouter.navigate('/contact');
  });

  const views = (window._signalsDataLayer as DataLayerEntry[]).filter(
    (e) => e.schema === 'add_virtual_page_view',
  );
  expect(views).toHaveLength(0);
});

it('stops pushing after consent is revoked', async () => {
  const { default: App } = await import('../App');
  render(<App />);

  await act(async () => {
    await testRouter.navigate('/contact');
  });

  window._allowCT = false;

  await act(async () => {
    await testRouter.navigate('/about');
  });

  const views = (window._signalsDataLayer as DataLayerEntry[]).filter(
    (e) => e.schema === 'add_virtual_page_view',
  );
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ data: { virtualPath: '/contact' } });
});

it('does not push a duplicate when navigating to the same pathname twice', async () => {
  const { default: App } = await import('../App');
  render(<App />);

  await act(async () => {
    await testRouter.navigate('/about');
  });
  await act(async () => {
    await testRouter.navigate('/about');
  });

  const views = (window._signalsDataLayer as DataLayerEntry[]).filter(
    (e) => e.schema === 'add_virtual_page_view' && e.data.virtualPath === '/about',
  );
  expect(views).toHaveLength(1);
});
