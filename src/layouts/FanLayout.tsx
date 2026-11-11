/**
 * FanLayout — dedicated shell for /my-soccer.
 *
 * Suppresses the public site Header and Footer so the Fan Arena can render
 * its own compact top nav strip without a double-header.  Mirrors the pattern
 * used by PortalLayout for /parent-portal.
 *
 * The fa-shell class is NOT applied here — it is applied inside the page
 * component so the arena-chooser modal and setup-gate can still use it.
 */

import { Outlet } from 'react-router';
import '@/styles/member-experience-polish.css';
import { SuppressPublicChrome } from '@/layouts/LayoutContext';

export default function FanLayout() {
  return (
    <div className="sc-fan-polish min-h-screen flex flex-col">
      {/* Suppress the public Header/Footer rendered by RootLayout */}
      <SuppressPublicChrome />
      <Outlet />
    </div>
  );
}
