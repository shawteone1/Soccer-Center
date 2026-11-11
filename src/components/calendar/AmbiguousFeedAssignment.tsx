/**
 * AmbiguousFeedAssignment
 *
 * Shown once when the user opens a calendar tab and has feeds with
 * portalContext = NULL (created before the portal-separation migration).
 *
 * The user assigns each feed to "Fan" or "Parent" before the strict
 * portal filter is applied. No feed is auto-classified.
 *
 * Props:
 *   feeds     — ambiguous feeds returned by GET /api/my-soccer/feeds/ambiguous
 *   onDone    — called after successful PATCH; parent re-fetches feeds
 *   onDismiss — called if user explicitly skips (feeds remain NULL; modal
 *               will reappear next session)
 */

import { useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

export interface AmbiguousFeed {
  id: string;
  provider: string;
  label: string | null;
  createdAt: string | null;
}

interface Props {
  feeds: AmbiguousFeed[];
  onDone: () => void;
  onDismiss: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  google:      'Google Calendar',
  outlook:     'Outlook',
  teamsnap:    'TeamSnap',
  playmetrics: 'PlayMetrics',
  ical:        'iCal subscription',
  manual:      'Manual',
};

function providerLabel(provider: string, label: string | null): string {
  return label ?? PROVIDER_LABELS[provider] ?? provider;
}

export default function AmbiguousFeedAssignment({ feeds, onDone, onDismiss }: Props) {
  // Map feedId → 'fan' | 'parent' | null (unassigned)
  const [assignments, setAssignments] = useState<Record<string, 'fan' | 'parent' | null>>(
    () => Object.fromEntries(feeds.map(f => [f.id, null]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const allAssigned = feeds.every(f => assignments[f.id] !== null);

  function toggle(feedId: string, portal: 'fan' | 'parent') {
    setAssignments(prev => ({ ...prev, [feedId]: portal }));
  }

  async function handleConfirm() {
    if (!allAssigned) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        assignments: feeds.map(f => ({ feedId: f.id, portal: assignments[f.id] as 'fan' | 'parent' })),
      };
      const res = await fetch('/api/my-soccer/feeds/assign-portal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? `Server error ${res.status}`);
      }
      setDone(true);
      setTimeout(onDone, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div
        className="rounded-xl border p-5 flex items-center gap-3"
        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
      >
        <CheckCircle size={20} className="text-primary shrink-0" />
        <p className="text-sm font-medium text-foreground">
          Calendar feeds assigned. Reloading your calendars…
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden"
      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b flex items-start gap-3"
        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted))' }}
      >
        <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Assign calendar feeds to a portal
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {feeds.length === 1
              ? 'This feed was added before Fan and Parent calendars were separated.'
              : `These ${feeds.length} feeds were added before Fan and Parent calendars were separated.`}
            {' '}Tell us which portal each one belongs to so your calendars stay accurate.
          </p>
        </div>
      </div>

      {/* Feed list */}
      <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
        {feeds.map(feed => (
          <div key={feed.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {providerLabel(feed.provider, feed.label)}
              </p>
              {feed.createdAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Added {new Date(feed.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              )}
            </div>

            {/* Fan / Parent toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggle(feed.id, 'fan')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={
                  assignments[feed.id] === 'fan'
                    ? {
                        background: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                        borderColor: 'hsl(var(--primary))',
                      }
                    : {
                        background: 'transparent',
                        color: 'hsl(var(--muted-foreground))',
                        borderColor: 'hsl(var(--border))',
                      }
                }
              >
                Fan
              </button>
              <button
                type="button"
                onClick={() => toggle(feed.id, 'parent')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={
                  assignments[feed.id] === 'parent'
                    ? {
                        background: 'hsl(var(--secondary))',
                        color: 'hsl(var(--secondary-foreground))',
                        borderColor: 'hsl(var(--secondary))',
                      }
                    : {
                        background: 'transparent',
                        color: 'hsl(var(--muted-foreground))',
                        borderColor: 'hsl(var(--border))',
                      }
                }
              >
                Parent
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-4 border-t flex items-center justify-between gap-3"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Remind me later
        </button>

        <div className="flex items-center gap-3">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {!allAssigned && (
            <p className="text-xs text-muted-foreground">
              Assign all feeds to continue
            </p>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allAssigned || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Confirm assignments'}
          </button>
        </div>
      </div>
    </div>
  );
}
