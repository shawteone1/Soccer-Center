/**
 * /admin/settings — Admin Settings page.
 *
 * Sections:
 *   1. Recruiting profile fields — v4
 *      Shows the live status of all six sc_player_profiles v4 columns
 *      (gpa, gpa_scale, gpa_weighted, intended_major, college_goals,
 *      contact_email) fetched from GET /api/parent/admin/schema-status.
 *      Provides a clearly-labelled migration button that calls
 *      POST /api/parent/admin/run-schema-coach-profile-v4.
 *      Displays applied/skipped/error results, then re-fetches schema status.
 *
 * Admin-only. Redirects to / if the session is not an admin.
 * Server-side admin enforcement is on both API endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router';
import { useSession } from '@/lib/auth/auth-client';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColumnResult {
  name: string;
  required: boolean;
  exists: boolean;
  note: string;
}

interface TableStatus {
  table: string;
  columns: ColumnResult[];
  allPresent: boolean;
}

interface SchemaStatusResponse {
  environment: string;
  dbHost: string;
  checkedAt: string;
  playerProfiles?: TableStatus;
  readyToDeploy: boolean;
  blockers: string[];
}

interface MigrationResult {
  added: string[];
  skipped: string[];
  errors: string[];
}

// The six v4 columns this section manages.
const V4_COLUMN_NAMES = [
  'gpa',
  'gpa_scale',
  'gpa_weighted',
  'intended_major',
  'college_goals',
  'contact_email',
] as const;

// ── Column status badge ───────────────────────────────────────────────────────

function ColumnBadge({ col }: { col: ColumnResult }) {
  if (col.exists) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
        <CheckCircle2 className="w-3 h-3" />
        present
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
      <XCircle className="w-3 h-3" />
      missing
    </span>
  );
}

// ── V4 migration section ──────────────────────────────────────────────────────

function V4MigrationSection() {
  const [statusState, setStatusState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatusResponse | null>(null);
  const [statusError, setStatusError] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState('');

  const [showColumnDetail, setShowColumnDetail] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatusState('loading');
    setStatusError('');
    try {
      const res = await fetch('/api/parent/admin/schema-status');
      if (res.status === 403) {
        setStatusError('Access denied. Admin account required.');
        setStatusState('error');
        return;
      }
      if (!res.ok) {
        setStatusError(`Schema status check failed (HTTP ${res.status}).`);
        setStatusState('error');
        return;
      }
      const data = await res.json() as SchemaStatusResponse;
      setSchemaStatus(data);
      setStatusState('ready');
    } catch (err) {
      setStatusError(`Could not reach schema-status endpoint: ${String(err)}`);
      setStatusState('error');
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const runMigration = useCallback(async () => {
    setMigrating(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-coach-profile-v4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 403) {
        setMigrationError('Access denied. Admin account required.');
        setMigrating(false);
        setShowConfirm(false);
        return;
      }
      if (!res.ok) {
        setMigrationError(`Migration request failed (HTTP ${res.status}).`);
        setMigrating(false);
        setShowConfirm(false);
        return;
      }
      const result = await res.json() as MigrationResult;
      setMigrationResult(result);
      setShowConfirm(false);
      // Re-fetch schema status so the column table reflects the new state.
      setStatusState('idle');
      await fetchStatus();
    } catch (err) {
      setMigrationError(`Network error: ${String(err)}`);
    } finally {
      setMigrating(false);
    }
  }, [fetchStatus]);

  // Extract only the v4 columns from the playerProfiles table status.
  const v4Columns: ColumnResult[] = schemaStatus?.playerProfiles?.columns.filter(
    (c) => (V4_COLUMN_NAMES as readonly string[]).includes(c.name)
  ) ?? [];

  const allV4Present = v4Columns.length === V4_COLUMN_NAMES.length &&
    v4Columns.every((c) => c.exists);

  const missingCount = v4Columns.filter((c) => !c.exists).length;

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Recruiting profile fields — v4
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Six columns added to <code className="text-xs bg-muted px-1 py-0.5 rounded">sc_player_profiles</code> by the coach-profile-v4 migration.
              Required before players can save GPA, college goals, or contact email.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Refresh schema status"
          onClick={() => { setStatusState('idle'); void fetchStatus(); }}
          disabled={statusState === 'loading'}
          className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${statusState === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Environment badge */}
      {schemaStatus && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="bg-muted rounded px-2 py-0.5 font-mono">{schemaStatus.environment}</span>
          <span className="bg-muted rounded px-2 py-0.5 font-mono">{schemaStatus.dbHost}</span>
          <span>checked {new Date(schemaStatus.checkedAt).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Status loading / error */}
      {statusState === 'loading' && (
        <p className="text-sm text-muted-foreground">Checking column status…</p>
      )}
      {statusState === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {statusError}
        </div>
      )}

      {/* Column status table */}
      {statusState === 'ready' && v4Columns.length > 0 && (
        <div>
          {/* Summary row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {allV4Present ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  All 6 columns present — migration not needed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <XCircle className="w-4 h-4" />
                  {missingCount} of 6 column{missingCount !== 1 ? 's' : ''} missing — migration required
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowColumnDetail((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showColumnDetail ? (
                <><ChevronUp className="w-3.5 h-3.5" /> Hide detail</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> Show detail</>
              )}
            </button>
          </div>

          {showColumnDetail && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Column</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {v4Columns.map((col) => (
                    <tr key={col.name} className={col.exists ? '' : 'bg-red-50/40'}>
                      <td className="px-3 py-2 font-mono text-xs">{col.name}</td>
                      <td className="px-3 py-2"><ColumnBadge col={col} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{col.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Status ready but no v4 columns returned — schema-status endpoint may be older */}
      {statusState === 'ready' && v4Columns.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Schema status did not return v4 column data. The migration may still be needed — run it to check.
        </div>
      )}

      {/* Migration result */}
      {migrationResult && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm">
          <p className="font-semibold text-foreground">Migration complete</p>
          {migrationResult.added.length > 0 && (
            <p className="text-green-700">
              <span className="font-medium">Added:</span>{' '}
              {migrationResult.added.join(', ')}
            </p>
          )}
          {migrationResult.skipped.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-medium">Already present (skipped):</span>{' '}
              {migrationResult.skipped.join(', ')}
            </p>
          )}
          {migrationResult.errors.length > 0 && (
            <p className="text-red-700">
              <span className="font-medium">Errors:</span>{' '}
              {migrationResult.errors.join('; ')}
            </p>
          )}
          {migrationResult.added.length === 0 && migrationResult.errors.length === 0 && (
            <p className="text-muted-foreground">All columns were already present. No changes made.</p>
          )}
        </div>
      )}

      {migrationError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {migrationError}
        </div>
      )}

      {/* Migration button / confirm */}
      {!allV4Present && statusState === 'ready' && !showConfirm && (
        <Button
          type="button"
          variant="default"
          onClick={() => setShowConfirm(true)}
          disabled={migrating}
        >
          Run v4 migration
        </Button>
      )}

      {showConfirm && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-semibold">Confirm: run coach-profile-v4 migration</p>
              <p>
                This adds up to 6 nullable columns to <code className="text-xs bg-amber-100 px-1 rounded">sc_player_profiles</code>:{' '}
                <code className="text-xs">gpa</code>, <code className="text-xs">gpa_scale</code>,{' '}
                <code className="text-xs">gpa_weighted</code>, <code className="text-xs">intended_major</code>,{' '}
                <code className="text-xs">college_goals</code>, <code className="text-xs">contact_email</code>.
              </p>
              <p>
                Columns that already exist are skipped. Existing player records are not modified.
                The operation is safe to run multiple times.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="default"
              onClick={() => { void runMigration(); }}
              disabled={migrating}
            >
              {migrating ? 'Running…' : 'Confirm — run migration'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={migrating}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Already applied — show a re-run option for completeness */}
      {allV4Present && statusState === 'ready' && !migrationResult && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm text-muted-foreground">
            Migration already applied. Players can save GPA, college goals, and contact email.
          </span>
        </div>
      )}
    </section>
  );
}

// ── UK Education migration section ───────────────────────────────────────────

interface UkMigrationResult {
  added: string[];
  skipped: string[];
  errors: string[];
}

function UkEducationMigrationSection() {
  const [columnExists, setColumnExists] = useState<boolean | null>(null);
  const [statusState, setStatusState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [statusError, setStatusError] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<UkMigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState('');

  const fetchStatus = useCallback(async () => {
    setStatusState('loading');
    setStatusError('');
    try {
      const res = await fetch('/api/parent/admin/schema-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        playerProfiles?: {
          ukEducationColumns?: { allPresent: boolean; columns: ColumnResult[] };
        };
      };
      const present = data.playerProfiles?.ukEducationColumns?.allPresent ?? false;
      setColumnExists(present);
      setStatusState('ready');
    } catch (e) {
      setStatusError(String(e));
      setStatusState('error');
    }
  }, []);

  const runMigration = async () => {
    setMigrating(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-uk-education', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as UkMigrationResult;
      setMigrationResult(data);
      setShowConfirm(false);
      await fetchStatus();
    } catch (e) {
      setMigrationError(String(e));
    } finally {
      setMigrating(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">UK Education pathway</h2>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={statusState === 'loading'}
          aria-label="Refresh UK education column status"
          className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${statusState === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Adds <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">uk_education TEXT NULL</code> to{' '}
        <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sc_player_profiles</code>.
        Safe to run multiple times — skips if the column already exists. Existing data is preserved.
      </p>

      {statusState === 'idle' && (
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          Check column status
        </Button>
      )}
      {statusState === 'loading' && (
        <p className="text-sm text-muted-foreground">Checking column status…</p>
      )}
      {statusState === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {statusError}
        </div>
      )}

      {statusState === 'ready' && (
        <div className="flex items-center gap-2">
          {columnExists ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Column present — migration not needed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
              <XCircle className="w-4 h-4" />
              Column missing — migration required before UK profiles can save
            </span>
          )}
        </div>
      )}

      {statusState === 'ready' && !columnExists && !showConfirm && (
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowConfirm(true)}
          disabled={migrating}
        >
          <ShieldAlert className="w-4 h-4 mr-1.5" />
          Run UK education migration
        </Button>
      )}

      {showConfirm && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            This will run <code className="font-mono text-xs">ALTER TABLE sc_player_profiles ADD COLUMN uk_education TEXT NULL</code>.
            The column is nullable — no existing rows are modified.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={runMigration} disabled={migrating}>
              {migrating ? 'Running…' : 'Confirm — run migration'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={migrating}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {migrationError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {migrationError}
        </div>
      )}

      {migrationResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1 text-sm">
          {migrationResult.added.length > 0 && (
            <p className="text-green-800 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Added: {migrationResult.added.join(', ')}
            </p>
          )}
          {migrationResult.skipped.length > 0 && (
            <p className="text-muted-foreground">Already present (skipped): {migrationResult.skipped.join(', ')}</p>
          )}
          {migrationResult.errors.length > 0 && (
            <p className="text-red-700">Errors: {migrationResult.errors.join('; ')}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const { user, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && (!user || !(user as { isAdmin?: boolean }).isAdmin)) {
      void navigate('/');
    }
  }, [user, isPending, navigate]);

  if (isPending) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!user || !(user as { isAdmin?: boolean }).isAdmin) return null;

  return (
    <>
      <Helmet>
        <title>Admin Settings — Soccer Center</title>
        <meta name="description" content="Admin settings for Soccer Center — manage database migrations and recruiting profile fields." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Database schema management and one-shot migrations.
          </p>
        </div>

        <V4MigrationSection />
        <UkEducationMigrationSection />
      </main>
    </>
  );
}
