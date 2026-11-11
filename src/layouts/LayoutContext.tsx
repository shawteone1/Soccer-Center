/**
 * LayoutContext — lets nested layouts suppress the public Header/Footer.
 *
 * FanLayout and PortalLayout set suppressPublicChrome=true so RootLayout
 * does not render the public Header and Footer alongside the portal's own nav.
 *
 * Usage:
 *   In a layout component:
 *     <SuppressPublicChrome />   ← renders nothing, just sets the flag
 *   In RootLayout:
 *     const { suppressPublicChrome } = useLayoutContext();
 */

import { createContext, useContext, useState, type ReactNode } from 'react';

interface LayoutContextValue {
  suppressPublicChrome: boolean;
  setSuppressPublicChrome: (v: boolean) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  suppressPublicChrome: false,
  setSuppressPublicChrome: () => undefined,
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [suppressPublicChrome, setSuppressPublicChrome] = useState(false);
  return (
    <LayoutContext.Provider value={{ suppressPublicChrome, setSuppressPublicChrome }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayoutContext() {
  return useContext(LayoutContext);
}

/**
 * Drop this component anywhere inside a layout to suppress the public Header/Footer.
 * It renders nothing — it only sets the context flag on mount and clears it on unmount.
 */
import { useEffect } from 'react';

export function SuppressPublicChrome() {
  const { setSuppressPublicChrome } = useLayoutContext();
  useEffect(() => {
    setSuppressPublicChrome(true);
    return () => setSuppressPublicChrome(false);
  }, [setSuppressPublicChrome]);
  return null;
}
