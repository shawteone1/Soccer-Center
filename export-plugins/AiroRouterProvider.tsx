import type { ComponentProps, ReactElement } from 'react';
import { RouterProvider } from 'react-router/dom';

import type { AiroBrowserRouter } from './router-contract';

type AiroRouterProviderProps = Omit<ComponentProps<typeof RouterProvider>, 'router'> & {
  router: AiroBrowserRouter;
};

/** Standalone provider without AAB preview instrumentation. */
export function AiroRouterProvider({
  router,
  ...providerProps
}: AiroRouterProviderProps): ReactElement {
  return <RouterProvider router={router} {...providerProps} />;
}
