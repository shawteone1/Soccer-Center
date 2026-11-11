/**
 * Locked In — Registration Demo (v2)
 *
 * Self-contained proof-of-concept at /parent-portal/locked-in-demo.
 * NSID meeting walkthrough plus optional wider registration simulations.
 * All state lives in component memory — no DB writes, no real API calls,
 * no file uploads, no payments, no outbound messages, no account-data writes.
 *
 * Entry: "Locked In" card on parent profile and player profile pages.
 * Exit:  "Back to Parent Portal" button or browser Back.
 * Reset: clears all demo state back to initial values.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, RotateCcw, Lock,
  // Used by rollback sub-components (not rendered in primary view):
  Shield, FolderOpen, CreditCard, CheckCircle2, Circle, Info, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { locked_in_demo } from 'virtual:content';
// Preserved for rollback — not rendered in primary view:
// import LockedInWalkthrough from '../components/portal/LockedInWalkthrough';
import LockedInExperience from '../components/LockedInExperience';

// ─── Types (preserved for rollback) ──────────────────────────────────────────
/*
interface DemoState {
  ageComplete: boolean;
  docsComplete: boolean;
  paymentComplete: boolean;
  previewOpen: boolean;
}

const INITIAL_STATE: DemoState = {
  ageComplete: false,
  docsComplete: false,
  paymentComplete: false,
  previewOpen: false,
};

function completedCount(s: DemoState): number {
  return [s.ageComplete, s.docsComplete, s.paymentComplete].filter(Boolean).length;
}
*/

// ─── Sub-components ───────────────────────────────────────────────────────────

function DemoBanner({ onReset, onExit }: { onReset: () => void; onExit: () => void }) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 text-sm font-medium"
      style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
      role="banner"
      aria-label="Demo mode indicator"
    >
      <div className="flex items-center gap-2">
        <Lock size={13} className="shrink-0" aria-hidden="true" />
        <span>{locked_in_demo.banner.label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded px-2 py-1 min-h-11 text-xs font-semibold transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label="Reset demo to initial state"
        >
          <RotateCcw size={11} aria-hidden="true" />
          <span>{locked_in_demo.banner.resetButton}</span>
        </button>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded px-2 py-1 min-h-11 text-xs font-semibold transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label="Return to Parent Portal"
        >
          <ArrowLeft size={11} aria-hidden="true" />
          <span>{locked_in_demo.banner.backButton}</span>
        </button>
      </div>
    </div>
  );
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${className}`}
      style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
    >
      {children}
    </div>
  );
}

function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="flex items-start gap-1.5 text-xs rounded-lg px-3 py-2.5"
      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
    >
      <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ─── Requirement Card 1: Age Verification ─────────────────────────────────────

function AgeVerificationCard({
  complete,
  onSimulate,
}: {
  complete: boolean;
  onSimulate: () => void;
}) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Shield size={18} style={{ color: 'hsl(var(--pp-navy))' }} aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              aria-hidden="true"
            >
              {locked_in_demo.ageSection.number}
            </span>
            <h2
              className="text-base font-bold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              {locked_in_demo.ageSection.heading}
            </h2>
          </div>
        </div>
        {complete ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={12} aria-hidden="true" />
            {locked_in_demo.ageSection.statusComplete}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0"
            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            <Circle size={12} aria-hidden="true" />
            {locked_in_demo.ageSection.statusPending}
          </span>
        )}
      </div>

      {/* Primary CTA — National Sports ID */}
      <a
        href={locked_in_demo.ageSection.ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-2 gap-3"
        style={{
          background: 'hsl(var(--pp-navy))',
          color: 'hsl(var(--pp-white))',
          minHeight: '52px',
        }}
        aria-label="Open National Sports ID age verification website in a new tab"
      >
        {/* Generic service icon — not a vendor logo */}
        <span
          className="flex items-center justify-center rounded-md shrink-0"
          style={{ background: 'hsl(var(--vendor-logo-bg))', width: '52px', height: '38px', padding: '5px' }}
          aria-hidden="true"
        >
          <Shield size={22} aria-hidden="true" />
        </span>
        <span className="flex-1 text-left leading-tight">{locked_in_demo.ageSection.ctaButton}</span>
        <ExternalLink size={14} className="shrink-0 opacity-80" aria-hidden="true" />
      </a>
      <p className="text-xs text-center mb-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {locked_in_demo.ageSection.ctaSupporting}
      </p>

      <div className="border-t mb-5" style={{ borderColor: 'hsl(var(--pp-border))' }} />

      {complete ? (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          role="status"
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{locked_in_demo.ageSection.statusComplete}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSimulate}
          className="w-full rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all hover:bg-gray-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: 'hsl(var(--pp-blue))',
            color: 'hsl(var(--pp-blue))',
            minHeight: '44px',
          }}
          aria-label="Simulate age verification complete"
        >
          {locked_in_demo.ageSection.simulateButton}
        </button>
      )}
    </SectionCard>
  );
}

// ─── Requirement Card 2: Secure Document Repository ───────────────────────────

function DocumentRepositoryCard({
  complete,
  onSimulate,
}: {
  complete: boolean;
  onSimulate: () => void;
}) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <FolderOpen size={18} style={{ color: 'hsl(var(--pp-navy))' }} aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              aria-hidden="true"
            >
              {locked_in_demo.healthSection.number}
            </span>
            <h2
              className="text-base font-bold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              {locked_in_demo.healthSection.heading}
            </h2>
          </div>
        </div>
        {complete ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={12} aria-hidden="true" />
            {locked_in_demo.healthSection.statusComplete}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0"
            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            <Circle size={12} aria-hidden="true" />
            {locked_in_demo.healthSection.statusPending}
          </span>
        )}
      </div>

      {/* Sample document checklist — no external document access */}
      <div
        className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-2 gap-3"
        style={{
          background: 'hsl(var(--pp-navy))',
          color: 'hsl(var(--pp-white))',
          minHeight: '52px',
        }}
        aria-label="Sample document checklist — no connected storage"
      >
        {/* Generic document service icon */}
        <span
          className="flex items-center justify-center rounded-md shrink-0"
          style={{ background: 'hsl(var(--vendor-logo-bg))', width: '52px', height: '38px', padding: '5px' }}
          aria-hidden="true"
        >
          <Shield size={22} aria-hidden="true" />
        </span>
        <span className="flex-1 text-left leading-tight">Sample document checklist</span>
        
      </div>
      <p className="text-xs text-center mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        No connected repository. Do not use real documents in this demo.
      </p>

      <CardNote>Example requirements: parent consent, medical clearance and club-specific forms. Status only; no files are uploaded or shared.</CardNote>

      <div className="border-t my-5" style={{ borderColor: 'hsl(var(--pp-border))' }} />

      {complete ? (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          role="status"
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{locked_in_demo.healthSection.statusComplete}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSimulate}
          className="w-full rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all hover:bg-gray-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: 'hsl(var(--pp-blue))',
            color: 'hsl(var(--pp-blue))',
            minHeight: '44px',
          }}
          aria-label="Simulate documents complete"
        >
          {locked_in_demo.healthSection.simulateButton}
        </button>
      )}
    </SectionCard>
  );
}

// ─── Requirement Card 3: Payment Method ───────────────────────────────────────

function PaymentMethodCard({
  complete,
  onSimulate,
}: {
  complete: boolean;
  onSimulate: () => void;
}) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <CreditCard size={18} style={{ color: 'hsl(var(--pp-navy))' }} aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              aria-hidden="true"
            >
              {locked_in_demo.paymentSection.number}
            </span>
            <h2
              className="text-base font-bold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              {locked_in_demo.paymentSection.heading}
            </h2>
          </div>
        </div>
        {complete ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={12} aria-hidden="true" />
            {locked_in_demo.paymentSection.statusComplete}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0"
            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            <Circle size={12} aria-hidden="true" />
            {locked_in_demo.paymentSection.statusPending}
          </span>
        )}
      </div>

      {/* Primary CTA — Fiserv orange treatment */}
      {/* Primary CTA — Fiserv */}
      <a
        href={locked_in_demo.paymentSection.ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-2 gap-3"
        style={{
          background: 'hsl(var(--fiserv-orange))',
          color: 'hsl(var(--pp-white))',
          minHeight: '52px',
        }}
        aria-label="Open Fiserv card services article in a new tab"
      >
        {/* Generic service icon — not a vendor logo */}
        <span
          className="flex items-center justify-center rounded-md shrink-0"
          style={{ background: 'hsl(var(--vendor-logo-bg))', width: '52px', height: '38px', padding: '5px' }}
          aria-hidden="true"
        >
          <Shield size={22} aria-hidden="true" />
        </span>
        <span className="flex-1 text-left leading-tight">{locked_in_demo.paymentSection.ctaButton}</span>
        <ExternalLink size={14} className="shrink-0 opacity-80" aria-hidden="true" />
      </a>
      <p className="text-xs text-center mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {locked_in_demo.paymentSection.ctaSupporting}
      </p>

      <CardNote>{locked_in_demo.paymentSection.ctaNote}</CardNote>

      <div className="border-t my-5" style={{ borderColor: 'hsl(var(--pp-border))' }} />

      {complete ? (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          role="status"
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{locked_in_demo.paymentSection.statusComplete}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSimulate}
          className="w-full rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all hover:bg-gray-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: 'hsl(var(--pp-blue))',
            color: 'hsl(var(--pp-blue))',
            minHeight: '44px',
          }}
          aria-label="Simulate payment setup complete"
        >
          {locked_in_demo.paymentSection.simulateButton}
        </button>
      )}
    </SectionCard>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ count }: { count: number }) {
  const c = locked_in_demo.progress;
  const label = count === 3 ? c.completeLabel : c.label.replace('{count}', String(count));
  const pct = Math.round((count / 3) * 100);

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
          {label}
        </span>
        {count === 3 && (
          <CheckCircle2 size={18} style={{ color: 'hsl(var(--pp-blue))' }} aria-hidden="true" />
        )}
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'hsl(var(--pp-border))' }}
        role="progressbar"
        aria-label="Wider registration simulation progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: count === 3 ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-navy))',
          }}
        />
      </div>
    </div>
  );
}

// ─── Completion Section ────────────────────────────────────────────────────────

function CompletionSection() {
  const c = locked_in_demo.completionSection;
  const [handoffOpen, setHandoffOpen] = useState(false);

  const SAMPLE_PAYLOAD = {
    _note: 'Sample payload — no real data. Synthetic reference only.',
    playerRef: 'DEMO-PLAYER-0001',
    ageVerification: 'simulated_complete',
    documentRepository: 'simulated_complete',
    paymentMethod: 'simulated_complete',
    recipient: 'club',
    _excluded: 'Raw identity documents, health details and payment credentials are excluded.',
  };

  return (
    <SectionCard>
      <div className="flex items-center gap-3 mb-5">
        <CheckCircle2 size={22} style={{ color: 'hsl(var(--pp-blue))' }} aria-hidden="true" />
        <h2
          className="text-base font-bold"
          style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
        >
          {c.summaryHeading}
        </h2>
      </div>

      {/* Summary rows */}
      <div
        className="rounded-xl overflow-hidden border mb-5"
        style={{ borderColor: 'hsl(var(--pp-border))' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.samplePlayer}
          </span>
          <span
            className="text-xs rounded-full px-2.5 py-1 font-medium"
            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            Sample
          </span>
        </div>
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.ageLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 font-semibold"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={11} aria-hidden="true" />
            {locked_in_demo.ageSection.statusComplete}
          </span>
        </div>
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.docsLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 font-semibold"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={11} aria-hidden="true" />
            {locked_in_demo.healthSection.statusComplete}
          </span>
        </div>
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.paymentLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 font-semibold"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <CheckCircle2 size={11} aria-hidden="true" />
            {locked_in_demo.paymentSection.statusComplete}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.recipientLabel}
          </span>
          <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {c.recipientValue}
          </span>
        </div>
      </div>

      {/* Club handoff toggle */}
      <button
        type="button"
        onClick={() => setHandoffOpen(v => !v)}
        className="flex items-center justify-center gap-2 w-full rounded-xl border px-5 py-3 text-sm font-medium transition-all hover:bg-gray-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-4"
        style={{
          borderColor: 'hsl(var(--pp-border))',
          color: 'hsl(var(--pp-text))',
          minHeight: '44px',
        }}
        aria-expanded={handoffOpen}
        aria-controls="handoff-panel"
      >
        <span>{c.handoffButton}</span>
        {handoffOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {handoffOpen && (
        <div id="handoff-panel" className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
            {c.handoffHeading}
          </p>
          <pre
            className="rounded-xl p-4 text-[11px] leading-relaxed overflow-x-auto"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            aria-label="Sample club handoff payload"
          >
            {JSON.stringify(SAMPLE_PAYLOAD, null, 2)}
          </pre>
        </div>
      )}

      {/* Disclosure */}
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        role="note"
      >
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{c.disclosure}</span>
      </div>
    </SectionCard>
  );
}

// ─── Error Boundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }

class LockedInErrorBoundary extends React.Component<
  { children: React.ReactNode; section: string },
  EBState
> {
  constructor(props: { children: React.ReactNode; section: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-2xl border px-4 py-4 text-sm"
          style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          role="alert"
        >
          <p className="font-semibold mb-1">Section error — {this.props.section}</p>
          <p className="text-xs">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

// Rollback reference — keeps sub-components reachable so the compiler does not
// flag them as unused. Remove this line and restore the JSX below to roll back.
export const _rollbackComponents = { SectionCard, CardNote, AgeVerificationCard, DocumentRepositoryCard, PaymentMethodCard, ProgressBar, CompletionSection, LockedInErrorBoundary };

export default function LockedInDemoPage() {
  const navigate = useNavigate();

  // resetKey remounts the iframe on reset, clearing all in-module state
  const [resetKey, setResetKey] = useState(0);

  const handleReset = useCallback(() => {
    setResetKey(key => key + 1);
  }, []);

  const handleExit = useCallback(() => {
    navigate('/parent-portal');
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>{locked_in_demo.meta.title}</title>
        <meta name="description" content={locked_in_demo.meta.description} />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Visually hidden h1 — page is noindex; required for SEO validator */}
      <h1 className="sr-only">{locked_in_demo.meta.title}</h1>

      <DemoBanner onReset={handleReset} onExit={handleExit} />

      {/* Older walkthrough and registration sections preserved in source for rollback */}

      {/* Locked In interactive concept — primary view, full width */}
      <LockedInExperience key={resetKey} />

      {/* Footer exit */}
      <div className="flex justify-center py-4">
        <button
          type="button"
          onClick={handleExit}
          className="flex items-center gap-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{locked_in_demo.banner.backButton}</span>
        </button>
      </div>
    </>
  );
}
