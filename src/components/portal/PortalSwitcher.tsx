/**
 * PortalSwitcher
 *
 * Header-level toggle that lets users switch between Fan and Parent views.
 *
 * PARENT accounts see: [Parent portal] [Fan experience] toggle
 * FAN accounts see:    current fan view + a separate "Set up parent access" action
 *
 * Switching views:
 *   - Saves preference to /api/my-soccer/portal-preference (fire-and-forget)
 *   - Calls onSwitch(newView) — the page re-renders with the new view
 *   - Does NOT change accessType — server enforces that on every API call
 *
 * All copy is passed in via `content` props (page owns virtual:content binding).
 */

import { useState } from 'react';
import { Users, Star, ChevronDown } from 'lucide-react';

export type PortalView = 'fan' | 'parent';

export interface PortalSwitcherContent {
  parentLabel: string;
  fanLabel: string;
  setupParentLabel: string;
  switchingToFan: string;
  switchingToParent: string;
}

interface PortalSwitcherProps {
  content: PortalSwitcherContent;
  accessType: 'FAN' | 'PARENT';
  currentView: PortalView;
  onSwitch: (view: PortalView) => void;
  onSetupParent?: () => void;
}

export default function PortalSwitcher({
  content,
  accessType,
  currentView,
  onSwitch,
  onSetupParent,
}: PortalSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function savePreference(view: PortalView) {
    // Fire-and-forget — preference is a convenience, not a security control
    try {
      await fetch('/api/my-soccer/portal-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preference: view }),
      });
    } catch {
      // Non-critical — ignore
    }
  }

  async function handleSwitch(view: PortalView) {
    if (view === currentView) { setOpen(false); return; }
    setSwitching(true);
    setOpen(false);
    await savePreference(view);
    onSwitch(view);
    setSwitching(false);
  }

  // ── FAN account: show current view label + "Set up parent access" link ────────
  if (accessType === 'FAN') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
          <Star className="h-3.5 w-3.5" />
          <span>{content.fanLabel}</span>
        </div>
        {onSetupParent && (
          <button
            onClick={onSetupParent}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-secondary transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            <span>{content.setupParentLabel}</span>
          </button>
        )}
      </div>
    );
  }

  // ── PARENT account: dropdown toggle between Parent portal and Fan experience ──
  const isParentView = currentView === 'parent';
  const currentLabel = isParentView ? content.parentLabel : content.fanLabel;
  const CurrentIcon = isParentView ? Users : Star;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {switching ? (
          <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
        ) : (
          <CurrentIcon className="h-3.5 w-3.5 text-primary" />
        )}
        <span>{switching ? (isParentView ? content.switchingToFan : content.switchingToParent) : currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Dropdown */}
          <div
            role="listbox"
            className="absolute right-0 top-full mt-1.5 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden"
          >
            <button
              role="option"
              aria-selected={currentView === 'parent'}
              onClick={() => handleSwitch('parent')}
              className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-muted ${
                currentView === 'parent' ? 'text-primary font-semibold' : 'text-foreground'
              }`}
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              <span>{content.parentLabel}</span>
              {currentView === 'parent' && (
                <svg className="ml-auto h-3.5 w-3.5 text-primary" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <div className="border-t border-border" />
            <button
              role="option"
              aria-selected={currentView === 'fan'}
              onClick={() => handleSwitch('fan')}
              className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-muted ${
                currentView === 'fan' ? 'text-primary font-semibold' : 'text-foreground'
              }`}
            >
              <Star className="h-4 w-4 flex-shrink-0" />
              <span>{content.fanLabel}</span>
              {currentView === 'fan' && (
                <svg className="ml-auto h-3.5 w-3.5 text-primary" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
