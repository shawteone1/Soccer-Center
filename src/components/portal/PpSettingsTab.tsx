/**
 * PpSettingsTab — Settings tab for the Parent Portal.
 *
 * Sections:
 * - Guardian sharing: invite dialog, accepted/pending cards, revoke
 * - Notifications: all default OFF, digest, email/push, quiet hours 9pm–7am MT
 * - Training consent: independent of notifications
 * - Privacy: private by default
 * - Account: verified email (read-only), calendar disconnect flow
 *
 * All settings persist server-side via /api/parent/settings/*
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Shield, Bell, CheckCircle,
  Trash2, Loader2, Info, X, Check, Clock,
  Database, AlertCircle, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';
import { PpCard, PpButton, PpBadge, PpSectionHeading } from './PpPrimitives';
import { useSession } from '@/lib/auth/auth-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  digestEnabled: boolean;
  quietHoursEnabled: boolean;
  trainingConsentEnabled: boolean;
}

interface GuardianInvite {
  id: string;
  recipientEmail: string;
  playerScope: string[];
  permissions: string[];
  status: 'pending' | 'active';
  invitedAt: string;
  acceptedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
        style={{ background: value ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
      >
        <span
          className="pointer-events-none inline-block h-5 w-5 rounded-full shadow transform transition-transform"
          style={{
            background: 'hsl(var(--pp-white))',
            transform: value ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

// ─── Guardian invite dialog ───────────────────────────────────────────────────

function GuardianInviteDialog({
  players,
  onClose,
  onInvite,
}: {
  players: string[];
  onClose: () => void;
  onInvite: (email: string, scope: string[], permissions: string[]) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<string[]>(players);
  const [calendarRead, setCalendarRead] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleScope(player: string) {
    setScope(prev => prev.includes(player) ? prev.filter(p => p !== player) : [...prev, player]);
  }

  async function handleSubmit() {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (scope.length === 0) {
      setError('Select at least one player to share.');
      return;
    }
    setError('');
    setSubmitting(true);
    const permissions = ['view_profiles', ...(calendarRead ? ['calendar_read'] : [])];
    try {
      await onInvite(email.trim(), scope, permissions);
      onClose();
    } catch {
      setError('Failed to send invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-modal-backdrop))' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: 'hsl(var(--pp-card-bg))' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Invite a guardian
          </h3>
          <button type="button" onClick={onClose} style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <X size={18} />
          </button>
        </div>

        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            The recipient must have a Soccer Center account. They will receive an email invitation and must accept before gaining access.
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            Guardian email <span style={{ color: 'hsl(var(--pp-blue))' }}>*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="guardian@example.com"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
          />
        </div>

        <div>
          <p className="text-sm font-medium mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
            Players to share <span style={{ color: 'hsl(var(--pp-blue))' }}>*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {players.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => toggleScope(p)}
                className="text-sm rounded-full px-3 py-1.5 border transition-colors"
                style={{
                  borderColor: scope.includes(p) ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  background: scope.includes(p) ? 'hsl(var(--pp-navy))' : 'transparent',
                  color: scope.includes(p) ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2" style={{ color: 'hsl(var(--pp-text))' }}>Permissions</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="h-5 w-5 rounded border-2 flex items-center justify-center"
                style={{ borderColor: 'hsl(var(--pp-navy))', background: 'hsl(var(--pp-navy))' }}
              >
                <Check size={11} style={{ color: 'hsl(var(--pp-white))' }} />
              </div>
              <span className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>View player profiles</span>
              <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>(always included)</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  borderColor: calendarRead ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  background: calendarRead ? 'hsl(var(--pp-navy))' : 'transparent',
                }}
                onClick={() => setCalendarRead(v => !v)}
              >
                {calendarRead && <Check size={11} style={{ color: 'hsl(var(--pp-white))' }} />}
              </div>
              <span className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>Calendar read</span>
            </label>
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <PpButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Send invitation
          </PpButton>
          <PpButton variant="outline" onClick={onClose}>Cancel</PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── V4 Migration card (admin only) ─────────────────────────────────────────
// Real response shape from GET /api/parent/admin/schema-status:
//   playerProfiles.v4CoachProfileColumns.columns  — ColumnResult[]
//   playerProfiles.v4CoachProfileColumns.allPresent — boolean
// (NOT playerProfiles.columns — that key does not exist)

type V4StatusState = 'idle' | 'loading' | 'ready' | 'error' | 'unauthorized';

interface V4ColumnResult { name: string; required: boolean; exists: boolean; note: string; }
interface V4CoachProfileColumns { columns: V4ColumnResult[]; allPresent: boolean; note: string; }
interface V4SchemaStatus {
  environment: string;
  dbHost: string;
  checkedAt: string;
  playerProfiles?: {
    table?: string;
    v4CoachProfileColumns?: V4CoachProfileColumns;
  };
}
interface V4MigrationResult { added: string[]; skipped: string[]; errors: string[] }


// ─── Coach config diagnostic card (admin-only) ───────────────────────────────

interface CoachConfigResult {
  COACH_PROFILE_LINKS_ENABLED: {
    present: boolean;
    type: string;
    length: number | null;
    hasLeadingTrailingSpace: boolean;
    equalsTrue: boolean;
    equalsTrueTrimmed: boolean;
  };
  COACH_PROFILE_TESTERS: {
    present: boolean;
    type: string;
    length: number | null;
    hasLeadingTrailingSpace: boolean;
    equalsTrue: boolean;
    equalsTrueTrimmed: boolean;
  };
  drizzleStoreRegistered: boolean | null;
  userId: string;
  userEmail: string;
  isAdmin: boolean;
  testerGatePasses?: boolean;
  buildHash?: string;
}

function CoachConfigDiagnosticCard({ playerIds }: { playerIds: string[] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachConfigResult | null>(null);
  const [fieldsStatus, setFieldsStatus] = useState<number | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFieldsStatus(null);
    setFieldsError(null);
    try {
      const res = await apiFetch('/api/parent/admin/coach-config-debug');
      if (!res.ok) {
        setError(`Config debug returned HTTP ${res.status}. Are you signed in as admin?`);
        setLoading(false);
        return;
      }
      const data = await res.json() as CoachConfigResult;
      setResult(data);

      // Probe the actual coach-fields endpoint for the first available player
      const pid = playerIds[0];
      if (pid) {
        const fr = await apiFetch(`/api/parent/players/${pid}/coach-fields`);
        setFieldsStatus(fr.status);
        if (!fr.ok) {
          try {
            const body = await fr.json() as { error?: string };
            setFieldsError(body.error ?? null);
          } catch { /* non-JSON */ }
        }
      } else {
        setFieldsStatus(-1);
      }
    } catch (err) {
      setError(`Network error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [playerIds]);

  useEffect(() => { void run(); }, [run]);

  function Row({ label, pass, detail }: { label: string; pass: boolean | null; detail?: string }) {
    return (
      <div className="flex items-start gap-2 py-1.5" style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
        <span className="shrink-0 mt-0.5">
          {pass === null
            ? <AlertCircle size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            : pass
              ? <CheckCircle2 size={13} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={13} style={{ color: 'hsl(var(--destructive))' }} />}
        </span>
        <span className="text-xs flex-1" style={{ color: 'hsl(var(--pp-text))' }}>
          <span className="font-medium">{label}</span>
          {detail && <span style={{ color: 'hsl(var(--pp-text-muted))' }}> — {detail}</span>}
        </span>
      </div>
    );
  }

  const flag = result?.COACH_PROFILE_LINKS_ENABLED;
  const testers = result?.COACH_PROFILE_TESTERS;

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={15} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <PpSectionHeading>Coach sharing — config diagnostic</PpSectionHeading>
        </div>
        <button
          type="button"
          aria-label="Re-run diagnostic"
          onClick={() => { void run(); }}
          disabled={loading}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
          <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Running…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
          {error}
        </div>
      )}

      {result && !loading && (
        <div className="space-y-0">
          <Row
            label="Running build"
            pass={null}
            detail={result.buildHash ?? 'not reported by server'}
          />
          <Row
            label="COACH_PROFILE_LINKS_ENABLED present"
            pass={flag?.present ?? false}
            detail={flag ? `type=${flag.type} len=${flag.length ?? 'null'}` : 'missing'}
          />
          <Row
            label="Flag equals 'true' (strict)"
            pass={flag?.equalsTrue ?? false}
            detail={flag?.equalsTrue ? 'ok' : flag?.equalsTrueTrimmed ? "passes after trim — value has whitespace" : `len=${flag?.length ?? '?'} (expected 4)`}
          />
          <Row
            label="Flag passes trim check"
            pass={flag?.equalsTrueTrimmed ?? false}
            detail={flag?.hasLeadingTrailingSpace ? 'leading/trailing whitespace detected' : undefined}
          />
          <Row
            label="Drizzle store initialized"
            pass={result.drizzleStoreRegistered === true}
            detail={
              result.drizzleStoreRegistered === null
                ? 'import failed'
                : result.drizzleStoreRegistered
                  ? 'registered at startup'
                  : 'not registered — flag was false at startup'
            }
          />
          <Row
            label="COACH_PROFILE_TESTERS present"
            pass={testers?.present ?? false}
            detail={testers ? `present, len=${testers.length ?? 'null'}` : 'secret missing'}
          />
          <Row
            label={`Coach-fields HTTP (${playerIds[0] ? playerIds[0].slice(0, 8) + '…' : 'no player'})`}
            pass={fieldsStatus === 200}
            detail={
              fieldsStatus === null ? 'pending' :
              fieldsStatus === -1 ? 'no player ID available in this session' :
              fieldsStatus === 200 ? '200 OK — feature enabled' :
              fieldsStatus === 403 ? `403 ${fieldsError ?? ''}` :
              `HTTP ${fieldsStatus}`
            }
          />
        </div>
      )}

      {result && !loading && (
        <p className="text-xs mt-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Signed in as {result.userEmail} · isAdmin={String(result.isAdmin)}
        </p>
      )}
    </PpCard>
  );
}

function V4MigrationCard() {
  const [statusState, setStatusState] = useState<V4StatusState>('idle');
  const [schemaStatus, setSchemaStatus] = useState<V4SchemaStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<V4MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState('');

  const fetchStatus = useCallback(async () => {
    setStatusState('loading');
    setStatusError('');
    try {
      const res = await apiFetch('/api/parent/admin/schema-status');
      if (res.status === 403) { setStatusState('unauthorized'); return; }
      if (!res.ok) { setStatusError(`Schema check failed (HTTP ${res.status}).`); setStatusState('error'); return; }
      let data: unknown;
      try { data = await res.json(); } catch { setStatusError('Schema-status returned invalid JSON.'); setStatusState('error'); return; }
      // Validate the response has the expected nested shape before storing
      const typed = data as V4SchemaStatus;
      if (!typed || typeof typed !== 'object') { setStatusError('Unexpected response shape from schema-status.'); setStatusState('error'); return; }
      setSchemaStatus(typed);
      setStatusState('ready');
    } catch (err) {
      setStatusError(`Could not reach schema-status: ${String(err)}`);
      setStatusState('error');
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const runMigration = useCallback(async () => {
    setMigrating(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      const res = await apiFetch('/api/parent/admin/run-schema-coach-profile-v4', { method: 'POST' });
      if (!res.ok) { setMigrationError(`Migration failed (HTTP ${res.status}).`); setShowConfirm(false); setMigrating(false); return; }
      let result: unknown;
      try { result = await res.json(); } catch { setMigrationError('Migration returned invalid JSON.'); setMigrating(false); return; }
      setMigrationResult(result as V4MigrationResult);
      setShowConfirm(false);
      setStatusState('idle');
      await fetchStatus();
    } catch (err) {
      setMigrationError(`Network error: ${String(err)}`);
    } finally {
      setMigrating(false);
    }
  }, [fetchStatus]);

  // Safe access: use the correct nested path v4CoachProfileColumns, never playerProfiles.columns
  const v4Section: V4CoachProfileColumns | undefined = schemaStatus?.playerProfiles?.v4CoachProfileColumns;
  // Only treat status as known-good when the section is present AND is a valid object with a columns array
  const v4SectionValid = v4Section != null && Array.isArray(v4Section.columns);
  const v4Columns: V4ColumnResult[] = v4SectionValid ? v4Section!.columns : [];
  // allPresent uses the server-computed flag when available; falls back to local check
  const allV4Present = v4SectionValid
    ? (v4Section!.allPresent === true && v4Columns.every((c) => c.exists))
    : false;
  const missingCount = v4Columns.filter((c) => !c.exists).length;
  // statusUnknown: ready response arrived but the v4 section was absent or malformed
  const statusUnknown = statusState === 'ready' && !v4SectionValid;

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database size={15} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <PpSectionHeading>Recruiting profile fields — v4</PpSectionHeading>
        </div>
        <button
          type="button"
          aria-label="Refresh schema status"
          onClick={() => { setStatusState('idle'); void fetchStatus(); }}
          disabled={statusState === 'loading'}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
        >
          <RefreshCw size={13} className={statusState === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Six columns on <code className="font-mono">sc_player_profiles</code> required for GPA, college goals, and contact email.
      </p>

      {/* Loading */}
      {statusState === 'loading' && (
        <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Loader2 size={12} className="animate-spin" />Checking…
        </div>
      )}

      {/* Unauthorized */}
      {statusState === 'unauthorized' && (
        <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5"
          style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}>
          <AlertCircle size={12} className="shrink-0" />Admin access required to check schema status.
        </div>
      )}

      {/* Network / HTTP error */}
      {statusState === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5"
            style={{ background: 'hsl(var(--pp-badge-error-bg))', color: 'hsl(var(--pp-badge-error-fg))' }}>
            <AlertCircle size={12} className="shrink-0" />{statusError}
          </div>
          <PpButton variant="outline" size="sm" onClick={() => { setStatusState('idle'); void fetchStatus(); }}>
            <RefreshCw size={11} />Retry
          </PpButton>
        </div>
      )}

      {/* Response arrived but v4 section missing or malformed — do NOT enable migration */}
      {statusUnknown && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5"
            style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}>
            <AlertCircle size={12} className="shrink-0" />Unable to determine schema status — v4 column data was not returned. Migration disabled until status is confirmed.
          </div>
          <PpButton variant="outline" size="sm" onClick={() => { setStatusState('idle'); void fetchStatus(); }}>
            <RefreshCw size={11} />Retry
          </PpButton>
        </div>
      )}

      {/* Status known — show column summary */}
      {statusState === 'ready' && v4SectionValid && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          {allV4Present ? (
            <><CheckCircle2 size={14} style={{ color: 'hsl(var(--pp-badge-success-fg))' }} />
            <span style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>All 6 columns present — migration not needed</span></>
          ) : (
            <><XCircle size={14} style={{ color: 'hsl(var(--pp-badge-error-fg))' }} />
            <span style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>{missingCount} of 6 column{missingCount !== 1 ? 's' : ''} missing — migration required</span></>
          )}
        </div>
      )}

      {/* Migration result */}
      {migrationResult && (
        <div className="rounded-xl border px-3 py-2.5 mb-3 text-xs space-y-1"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}>
          <p className="font-semibold text-sm" style={{ color: 'hsl(var(--pp-text))' }}>Migration complete</p>
          {migrationResult.added.length > 0 && <p style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>Added: {migrationResult.added.join(', ')}</p>}
          {migrationResult.skipped.length > 0 && <p style={{ color: 'hsl(var(--pp-text-muted))' }}>Already present: {migrationResult.skipped.join(', ')}</p>}
          {migrationResult.errors.length > 0 && <p style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>Errors: {migrationResult.errors.join('; ')}</p>}
        </div>
      )}

      {/* Migration network error */}
      {migrationError && (
        <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 mb-3"
          style={{ background: 'hsl(var(--pp-badge-error-bg))', color: 'hsl(var(--pp-badge-error-fg))' }}>
          <AlertCircle size={12} className="shrink-0" />{migrationError}
        </div>
      )}

      {/* Migration button — only when status is confirmed and columns are missing */}
      {!allV4Present && statusState === 'ready' && v4SectionValid && !showConfirm && (
        <PpButton variant="primary" size="sm" onClick={() => setShowConfirm(true)} disabled={migrating}>
          Run v4 migration
        </PpButton>
      )}

      {/* Confirm panel */}
      {showConfirm && (
        <div className="rounded-xl border px-3 py-3 space-y-3"
          style={{ borderColor: 'hsl(var(--pp-amber))', background: 'hsl(var(--pp-badge-warning-bg))' }}>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-badge-warning-fg))' }}>Confirm: run coach-profile-v4 migration</p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-badge-warning-fg))' }}>
            Adds up to 6 nullable columns to <code className="font-mono">sc_player_profiles</code>. Existing records are not modified. Safe to re-run.
          </p>
          <div className="flex gap-2">
            <PpButton variant="primary" size="sm" onClick={() => { void runMigration(); }} disabled={migrating}>
              {migrating ? 'Running…' : 'Confirm — run migration'}
            </PpButton>
            <PpButton variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={migrating}>
              Cancel
            </PpButton>
          </div>
        </div>
      )}

      {/* Already applied */}
      {allV4Present && statusState === 'ready' && v4SectionValid && !migrationResult && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>
          <CheckCircle2 size={12} />Migration already applied.
        </p>
      )}
    </PpCard>
  );
}

function UkEducationMigrationCard() {
  const [statusState, setStatusState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unauthorized'>('idle');
  const [columnPresent, setColumnPresent] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ added: string[]; skipped: string[]; errors: string[] } | null>(null);
  const [migrationError, setMigrationError] = useState('');

  const fetchStatus = useCallback(async () => {
    setStatusState('loading');
    setStatusError('');
    try {
      const res = await apiFetch('/api/parent/admin/schema-status');
      if (res.status === 403 || res.status === 401) { setStatusState('unauthorized'); return; }
      if (!res.ok) { setStatusError(`Schema check failed (HTTP ${res.status}).`); setStatusState('error'); return; }
      let data: unknown;
      try { data = await res.json(); } catch { setStatusError('Schema-status returned invalid JSON.'); setStatusState('error'); return; }
      const typed = data as { playerProfiles?: { ukEducationColumns?: { allPresent: boolean } } };
      const present = typed?.playerProfiles?.ukEducationColumns?.allPresent ?? null;
      setColumnPresent(present);
      setStatusState('ready');
    } catch (err) {
      setStatusError(`Could not reach schema-status: ${String(err)}`);
      setStatusState('error');
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const runMigration = useCallback(async () => {
    setMigrating(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      const res = await apiFetch('/api/parent/admin/run-schema-uk-education', { method: 'POST' });
      if (!res.ok) { setMigrationError(`Migration failed (HTTP ${res.status}).`); setShowConfirm(false); setMigrating(false); return; }
      let result: unknown;
      try { result = await res.json(); } catch { setMigrationError('Migration returned invalid JSON.'); setMigrating(false); return; }
      setMigrationResult(result as { added: string[]; skipped: string[]; errors: string[] });
      setShowConfirm(false);
      setStatusState('idle');
      await fetchStatus();
    } catch (err) {
      setMigrationError(`Network error: ${String(err)}`);
    } finally {
      setMigrating(false);
    }
  }, [fetchStatus]);

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database size={15} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <PpSectionHeading>UK Education pathway</PpSectionHeading>
        </div>
        <button
          type="button"
          aria-label="Refresh UK education column status"
          onClick={() => { setStatusState('idle'); void fetchStatus(); }}
          disabled={statusState === 'loading'}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
        >
          <RefreshCw size={13} className={statusState === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code className="font-mono">uk_education TEXT NULL</code> to{' '}
        <code className="font-mono">sc_player_profiles</code>. Safe to re-run — skips if already present.
      </p>

      {statusState === 'loading' && (
        <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Loader2 size={12} className="animate-spin" />Checking…
        </div>
      )}

      {statusState === 'unauthorized' && (
        <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5"
          style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}>
          <AlertCircle size={12} className="shrink-0" />Admin access required to check schema status.
        </div>
      )}

      {statusState === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5"
            style={{ background: 'hsl(var(--pp-badge-error-bg))', color: 'hsl(var(--pp-badge-error-fg))' }}>
            <AlertCircle size={12} className="shrink-0" />{statusError}
          </div>
          <PpButton variant="outline" size="sm" onClick={() => { setStatusState('idle'); void fetchStatus(); }}>
            <RefreshCw size={11} />Retry
          </PpButton>
        </div>
      )}

      {statusState === 'ready' && columnPresent !== null && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          {columnPresent ? (
            <><CheckCircle2 size={14} style={{ color: 'hsl(var(--pp-badge-success-fg))' }} />
            <span style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>Column present — migration not needed</span></>
          ) : (
            <><XCircle size={14} style={{ color: 'hsl(var(--pp-badge-error-fg))' }} />
            <span style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>Column missing — migration required</span></>
          )}
        </div>
      )}

      {migrationResult && (
        <div className="rounded-xl border px-3 py-2.5 mb-3 text-xs space-y-1"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}>
          <p className="font-semibold text-sm" style={{ color: 'hsl(var(--pp-text))' }}>Migration complete</p>
          {migrationResult.added.length > 0 && <p style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>Added: {migrationResult.added.join(', ')}</p>}
          {migrationResult.skipped.length > 0 && <p style={{ color: 'hsl(var(--pp-text-muted))' }}>Already present: {migrationResult.skipped.join(', ')}</p>}
          {migrationResult.errors.length > 0 && <p style={{ color: 'hsl(var(--pp-badge-error-fg))' }}>Errors: {migrationResult.errors.join('; ')}</p>}
        </div>
      )}

      {migrationError && (
        <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 mb-3"
          style={{ background: 'hsl(var(--pp-badge-error-bg))', color: 'hsl(var(--pp-badge-error-fg))' }}>
          <AlertCircle size={12} className="shrink-0" />{migrationError}
        </div>
      )}

      {statusState === 'ready' && columnPresent === false && !showConfirm && (
        <PpButton variant="primary" size="sm" onClick={() => setShowConfirm(true)} disabled={migrating}>
          Run UK education migration
        </PpButton>
      )}

      {showConfirm && (
        <div className="rounded-xl border px-3 py-3 space-y-3"
          style={{ borderColor: 'hsl(var(--pp-amber))', background: 'hsl(var(--pp-badge-warning-bg))' }}>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-badge-warning-fg))' }}>Confirm: run UK education migration</p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-badge-warning-fg))' }}>
            Adds <code className="font-mono">uk_education TEXT NULL</code> to <code className="font-mono">sc_player_profiles</code>. Existing records are not modified. Safe to re-run.
          </p>
          <div className="flex gap-2">
            <PpButton variant="primary" size="sm" onClick={() => { void runMigration(); }} disabled={migrating}>
              {migrating ? 'Running…' : 'Confirm — run migration'}
            </PpButton>
            <PpButton variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={migrating}>
              Cancel
            </PpButton>
          </div>
        </div>
      )}

      {statusState === 'ready' && columnPresent === true && !migrationResult && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--pp-badge-success-fg))' }}>
          <CheckCircle2 size={12} />Migration already applied.
        </p>
      )}
    </PpCard>
  );
}

interface PpSettingsTabProps {
  playerNames: string[];
  playerIds?: string[];
  userEmail: string;
  profilePrivate: boolean;
  onPrivacyChange: (v: boolean) => void;
}

export default function PpSettingsTab({
  playerNames,
  playerIds = [],
  userEmail,
  profilePrivate,
  onPrivacyChange,
}: PpSettingsTabProps) {
  const { user } = useSession();
  const isAdmin = Boolean((user as { isAdmin?: boolean } | null)?.isAdmin);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailEnabled: false,
    pushEnabled: false,
    digestEnabled: false,
    quietHoursEnabled: true,
    trainingConsentEnabled: false,
  });
  const [guardians, setGuardians] = useState<GuardianInvite[]>([]);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [loadingGuardians, setLoadingGuardians] = useState(true);

  const loadGuardians = useCallback(async () => {
    setLoadingGuardians(true);
    try {
      const res = await apiFetch('/api/parent/settings/guardians');
      if (res.ok) {
        const data = await res.json() as { guardians: GuardianInvite[] };
        setGuardians(data.guardians ?? []);
      }
    } finally {
      setLoadingGuardians(false);
    }
  }, []);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const res = await apiFetch('/api/parent/settings/notifications');
        if (res.ok) {
          const data = await res.json() as { settings: NotificationSettings };
          if (data.settings) setNotifications(data.settings);
        }
      } catch { /* use defaults */ }
    }
    loadNotifications();
    loadGuardians();
  }, [loadGuardians]);

  async function saveNotifications(patch: Partial<NotificationSettings>) {
    const updated = { ...notifications, ...patch };
    setNotifications(updated);
    setSavingNotifications(true);
    try {
      await apiFetch('/api/parent/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
    } finally {
      setSavingNotifications(false);
    }
  }

  async function handleInvite(email: string, scope: string[], permissions: string[]) {
    await apiFetch('/api/parent/settings/guardians', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: email, playerScope: scope, permissions }),
    });
    await loadGuardians();
  }

  async function handleRevoke(id: string) {
    await apiFetch(`/api/parent/settings/guardians/${id}`, { method: 'DELETE' });
    setGuardians(prev => prev.filter(g => g.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Guardian sharing */}
      <PpCard>
        <div className="flex items-center justify-between mb-4">
          <PpSectionHeading>Guardian sharing</PpSectionHeading>
          <PpButton variant="outline" size="sm" onClick={() => setShowInviteDialog(true)}>
            <UserPlus size={12} />
            Invite
          </PpButton>
        </div>

        {loadingGuardians ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
        ) : guardians.length === 0 ? (
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <UserPlus size={20} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-navy))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--pp-navy))' }}>
              No guardians yet. Invite a co-parent or family member to view your players' profiles.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {guardians.map(g => (
              <div
                key={g.id}
                className="flex items-start justify-between gap-3 rounded-xl border px-3 py-3"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
                      {g.recipientEmail}
                    </p>
                    {g.status === 'active' ? (
                      <PpBadge variant="success"><CheckCircle size={9} className="mr-1" />Active</PpBadge>
                    ) : (
                      <PpBadge variant="warning"><Clock size={9} className="mr-1" />Pending</PpBadge>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Players: {g.playerScope.join(', ')} · {g.permissions.join(', ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(g.id)}
                  className="p-1.5 rounded-full transition-colors shrink-0"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Revoke access"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PpCard>

      {/* Notifications */}
      <PpCard>
        <div className="flex items-center justify-between mb-1">
          <PpSectionHeading>Notifications</PpSectionHeading>
          {savingNotifications && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <Loader2 size={11} className="animate-spin" />
              Saving…
            </span>
          )}
        </div>

        <ToggleRow
          label="Email notifications"
          description="Receive email updates about your players and portal activity."
          value={notifications.emailEnabled}
          onChange={v => saveNotifications({ emailEnabled: v })}
        />
        <ToggleRow
          label="Push notifications"
          description="Browser push notifications for time-sensitive updates."
          value={notifications.pushEnabled}
          onChange={v => saveNotifications({ pushEnabled: v })}
        />
        <ToggleRow
          label="Weekly digest"
          description="A weekly summary of upcoming events and tryout opportunities."
          value={notifications.digestEnabled}
          onChange={v => saveNotifications({ digestEnabled: v })}
        />
        <ToggleRow
          label="Quiet hours (9 PM – 7 AM MT)"
          description="Suppress notifications during overnight hours."
          value={notifications.quietHoursEnabled}
          onChange={v => saveNotifications({ quietHoursEnabled: v })}
        />

        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mt-4 text-xs"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <Bell size={12} className="mt-0.5 shrink-0" />
          <span>All notifications are off by default. You can turn them on at any time.</span>
        </div>
      </PpCard>

      {/* Training consent */}
      <PpCard>
        <PpSectionHeading>Training resources</PpSectionHeading>
        <ToggleRow
          label="Training content recommendations"
          description="Allow Soccer Center to suggest development videos and training resources based on your players' positions and goals. This is independent of notification settings."
          value={notifications.trainingConsentEnabled}
          onChange={v => saveNotifications({ trainingConsentEnabled: v })}
        />
      </PpCard>

      {/* Privacy */}
      <PpCard>
        <PpSectionHeading>Privacy</PpSectionHeading>
        <ToggleRow
          label="Private profile"
          description="Your parent profile and player profiles are private by default. Only you and accepted guardians can view them. Player profiles are never publicly discoverable."
          value={profilePrivate}
          onChange={onPrivacyChange}
        />
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mt-3 text-xs"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <Shield size={12} className="mt-0.5 shrink-0" />
          <span>
            Profiles are private by default. Turning this off makes your parent profile visible to other Soccer Center members. Player profiles remain private regardless of this setting.
          </span>
        </div>
      </PpCard>

      {/* Account */}
      <PpCard>
        <PpSectionHeading>Account</PpSectionHeading>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Verified email
            </p>
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>{userEmail}</p>
              <PpBadge variant="success"><CheckCircle size={9} className="mr-1" />Verified</PpBadge>
            </div>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Email address is managed through your Soccer Center account settings.
            </p>
          </div>

          <div style={{ borderTop: '1px solid hsl(var(--pp-border))', paddingTop: '12px' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Calendar connections
            </p>
            <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Manage calendar connections (Google, Outlook, PlayMetrics, TeamSnap) from the Fan portal's Calendar tab. Disconnecting a calendar will prompt you to choose whether to retain or remove synced events.
            </p>
            <a
              href="/my-soccer"
              className="text-xs font-medium"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              Go to Calendar settings →
            </a>
          </div>
        </div>
      </PpCard>

      {isAdmin && <V4MigrationCard />}
      {isAdmin && <UkEducationMigrationCard />}
      {isAdmin && <CoachConfigDiagnosticCard playerIds={playerIds} />}

      {showInviteDialog && (
        <GuardianInviteDialog
          players={playerNames.length > 0 ? playerNames : ['Player 1']}
          onClose={() => setShowInviteDialog(false)}
          onInvite={handleInvite}
        />
      )}
    </div>
  );
}
