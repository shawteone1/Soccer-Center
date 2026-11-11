import { createBrowserRouter, type DOMRouterOpts, type RouteObject } from 'react-router';

type BrowserRouter = ReturnType<typeof createBrowserRouter>;
declare const airoRouterBrand: unique symbol;

export type AiroBrowserRouter = BrowserRouter & {
  readonly [airoRouterBrand]: true;
};

export interface AiroBrowserRouterOptions extends Omit<DOMRouterOpts, 'patchRoutesOnNavigation'> {
  notFoundRouteId: string | null;
  patchRoutesOnNavigation?: never;
}

/** Standalone router factory without AAB preview instrumentation. */
export function createAiroBrowserRouter(
  routes: RouteObject[],
  options: AiroBrowserRouterOptions
): AiroBrowserRouter {
  const { notFoundRouteId: _notFoundRouteId, patchRoutesOnNavigation, ...routerOptions } = options;
  if (patchRoutesOnNavigation !== undefined) {
    throw new Error('createAiroBrowserRouter does not support patchRoutesOnNavigation');
  }
  return createBrowserRouter(routes, routerOptions) as AiroBrowserRouter;
}
