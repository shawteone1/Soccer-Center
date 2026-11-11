/**
 * ParentSetupGate
 *
 * Shown when a FAN account navigates to the parent portal.
 * Presents the data-sharing notice and required acknowledgements.
 * On confirmation, calls POST /api/parent/setup to upgrade the account.
 *
 * SECURITY: The server verifies email, ack, and consentVersion.
 * This component never sets accessType — it only calls the API.
 *
 * All user-visible copy is passed in via `content` props so the page
 * (which imports virtual:content) owns the content layer binding.
 */

import { useState } from 'react';
import { ShieldCheck, Users, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface SetupChecklistItem {
  id: string;
  text: string;
}

export interface ParentSetupGateContent {
  headline: string;
  subheadline: string;
  noticeTitle: string;
  noticeBody: string;
  checklistItems: SetupChecklistItem[];
  ctaSetup: string;
  ctaFan: string;
  emailNotVerifiedTitle: string;
  emailNotVerifiedBody: string;
  successTitle: string;
  successBody: string;
  consentVersion: string;
}

interface ParentSetupGateProps {
  content: ParentSetupGateContent;
  onSetupComplete: () => void;
  onContinueAsFan: () => void;
}

export default function ParentSetupGate({ content, onSetupComplete, onContinueAsFan }: ParentSetupGateProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [done, setDone] = useState(false);

  const allChecked = content.checklistItems.every(item => checked[item.id]);

  async function handleSetup() {
    if (!allChecked) return;
    setLoading(true);
    setError(null);
    setEmailError(false);

    try {
      const res = await fetch('/api/parent/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ack: true,
          consentVersion: content.consentVersion,
        }),
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === 'email_not_verified') {
          setEmailError(true);
          return;
        }
        setError('Access denied. Please try again or contact support.');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Setup failed. Please try again.');
        return;
      }

      const body = await res.json();
      if (body.ok || body.alreadyParent) {
        setDone(true);
        // Brief pause so the success state is visible before transitioning
        setTimeout(() => onSetupComplete(), 1200);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Email not verified state ──────────────────────────────────────────────────
  if (emailError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-6 py-12 text-center max-w-md mx-auto">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-5">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          {content.emailNotVerifiedTitle}
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          {content.emailNotVerifiedBody}
        </p>
        <button
          onClick={() => setEmailError(false)}
          className="text-sm text-primary hover:underline"
        >
          ← Back
        </button>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-6 py-12 text-center max-w-md mx-auto">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 mb-5">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          {content.successTitle}
        </h2>
        <p className="text-muted-foreground text-sm">
          {content.successBody}
        </p>
      </div>
    );
  }

  // ── Main gate ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary flex-shrink-0">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            {content.headline}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {content.subheadline}
          </p>
        </div>
      </div>

      {/* Notice card */}
      <div className="rounded-xl border border-border bg-muted/40 p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            {content.noticeTitle}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {content.noticeBody}
        </p>
      </div>

      {/* Acknowledgement checklist */}
      <div className="space-y-3 mb-6">
        {content.checklistItems.map(item => (
          <label
            key={item.id}
            className="flex items-start gap-3 cursor-pointer group"
          >
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={!!checked[item.id]}
                onChange={e =>
                  setChecked(prev => ({ ...prev, [item.id]: e.target.checked }))
                }
              />
              <div
                className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                  checked[item.id]
                    ? 'bg-primary border-primary'
                    : 'border-border bg-background group-hover:border-primary/60'
                }`}
              >
                {checked[item.id] && (
                  <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-foreground leading-snug">
              {item.text}
            </span>
          </label>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleSetup}
          disabled={!allChecked || loading}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary text-secondary-foreground font-semibold py-3 px-5 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          <span>{content.ctaSetup}</span>
        </button>

        <button
          onClick={onContinueAsFan}
          disabled={loading}
          className="w-full rounded-xl border border-border bg-background text-foreground font-medium py-3 px-5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
        >
          {content.ctaFan}
        </button>
      </div>
    </div>
  );
}
