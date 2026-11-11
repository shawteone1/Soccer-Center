/**
 * PpAdminMigrationPanel — Admin-only DB migration + YouTube cache panel.
 *
 * Visible only when the session user has isAdmin = true.
 * Sections:
 *   1. DB state check  — GET  /api/parent/admin/migrate-check
 *   2. Schema-v3 run   — POST /api/parent/admin/run-schema-v3
 *   3. YouTube cache   — GET  /api/parent/admin/youtube-cache
 *   4. Force-fetch     — POST /api/parent/admin/youtube-cache/force-fetch
 *
 * All endpoints enforce requireAdmin() server-side.
 */

import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, Database, AlertTriangle, ChevronDown, ChevronUp, Youtube, RefreshCw } from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnCheck { table: string; column: string; exists: boolean }
interface TableCheck  { table: string; exists: boolean }
interface MigrationCheckResult {
  ready: boolean;
  v3Done: boolean;
  columns: ColumnCheck[];
  tables: TableCheck[];
  v3Tables: TableCheck[];
  fanTables: TableCheck[];
  proposedMappings: {
    total: number; fan: number; parent: number; flagged: number; skipped: number;
    flaggedAccounts: { email: string; memberType: string }[];
  } | null;
}
interface MigrationRunResult {
  ok: boolean;
  results: { table: string; status: string }[];
}

interface FoundationRunResult {
  success: boolean;
  summary: { total: number; ok: number; skipped: number; errors: number };
  steps: { step: string; status: 'ok' | 'skipped' | 'error'; detail?: string }[];
  next?: string;
}

// ─── YouTube cache types ──────────────────────────────────────────────────────

interface YtChannelStatus {
  slug: string;
  name: string;
  kind: string;
  channelId: string | null;
  handle: string | null;
  dbRow: {
    exists: boolean;
    fetchedAt: string | null;
    lastAttempt: string | null;
    syncError: string | null;
    videoCount: number;
  } | null;
  status: 'ready' | 'not-ready' | 'stale' | 'expired' | 'error' | 'no-row';
}

interface YtCacheResult {
  verified: boolean;
  schedulerRunning: boolean;
  totalChannels: number;
  readyCount: number;
  notReadyCount: number;
  channels: YtChannelStatus[];
  notReady: YtChannelStatus[];
}

interface ForceFetchResult {
  ok: boolean;
  cleared: string[];
  schedulerTriggered: boolean;
  note: string;
}

function apiFetch<T>(path: string, opts?: RequestInit): Promise<{ data: T; status: number }> {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  }).then(async (r) => ({ data: await r.json() as T, status: r.status }));
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle size={14} style={{ color: 'hsl(var(--pp-badge-success-fg, 142 76% 25%))' }} />
    : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />;
}

// ─── Schema v4 panel ─────────────────────────────────────────────────────────

function SchemaV4Panel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; results: { column: string; status: string }[] } | null>(null);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (!window.confirm('Run schema-v4 migration?\n\nAdds to sc_calendar_feeds:\n  • portal_context (fan/parent isolation)\n  • color (feed chip color)\n  • visible (show/hide toggle)\n\nAdds to sc_parent_profiles:\n  • avatar_url (persisted photo URL)\n\nNo existing data is modified. Safe to re-run.')) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-v4', { method: 'POST', credentials: 'include' });
      const data = await res.json() as { ok: boolean; results: { column: string; status: string }[] };
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 pt-4"
      style={{ borderTop: '1px solid hsl(var(--pp-border))' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Step 2b — Schema-v4 (calendar feed context)</span>
      </div>
      <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code>portal_context</code>, <code>color</code>, and <code>visible</code> to <code>sc_calendar_feeds</code> (fan/parent feed isolation).
        Also adds <code>avatar_url</code> to <code>sc_parent_profiles</code> (persisted photo URL).
        No existing data is modified. Safe to re-run.
      </p>
      <PpButton variant="outline" size="sm" onClick={() => void handleRun()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Running…</> : 'Run schema-v4 migration'}
      </PpButton>
      {error && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
      {result && (
        <div className="rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          {result.results.map(r => (
            <div key={r.column} className="flex items-center gap-2">
              {r.status === 'ok' || r.status.startsWith('skipped') ? (
                <CheckCircle size={12} style={{ color: 'hsl(var(--primary))' }} />
              ) : (
                <XCircle size={12} style={{ color: 'hsl(var(--destructive))' }} />
              )}
              <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{r.column}</code>
              <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpAdminMigrationPanel() {
  const [expanded, setExpanded] = useState(false);

  // Check state
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<MigrationCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Run state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<MigrationRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Foundation state
  const [foundationRunning, setFoundationRunning] = useState(false);
  const [foundationResult, setFoundationResult] = useState<FoundationRunResult | null>(null);
  const [foundationError, setFoundationError] = useState<string | null>(null);

  // DB tables state
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesResult, setTablesResult] = useState<{ count: number; tables: { name: string; rows: number }[]; scTables: string[] } | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);

  // YouTube cache state
  const [ytLoading, setYtLoading] = useState(false);
  const [ytResult, setYtResult] = useState<YtCacheResult | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytShowAll, setYtShowAll] = useState(false);

  // Force-fetch state
  const [ffSlugs, setFfSlugs] = useState('champions-league, nwsl');
  const [ffLoading, setFfLoading] = useState(false);
  const [ffResult, setFfResult] = useState<ForceFetchResult | null>(null);
  const [ffError, setFfError] = useState<string | null>(null);

  async function handleListTables() {
    setTablesLoading(true);
    setTablesError(null);
    setTablesResult(null);
    try {
      const { data, status } = await apiFetch<{ count: number; tables: { name: string; rows: number }[]; scTables: string[] }>('/api/parent/admin/db-tables');
      if (status === 200) {
        setTablesResult(data);
      } else {
        setTablesError(`Server returned ${status}: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      setTablesError(e instanceof Error ? e.message : String(e));
    } finally {
      setTablesLoading(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const { data, status } = await apiFetch<MigrationCheckResult>('/api/parent/admin/migrate-check');
      if (status === 200) {
        setCheckResult(data);
      } else {
        setCheckError(`Server returned ${status}`);
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  async function handleRunFoundation() {
    if (!window.confirm('Run foundation schema migration?\n\nThis creates all prerequisite tables and columns (sc_sources, sc_user_following, sc_parent_follows, sc_parent_posts, sc_families, sc_family_sharing, sc_account_migration_log, user.access_type, and sc_member_profiles phase-2 columns).\n\nAll operations use IF NOT EXISTS — safe to re-run. No existing data is modified.')) return;
    setFoundationRunning(true);
    setFoundationError(null);
    setFoundationResult(null);
    try {
      const { data, status } = await apiFetch<FoundationRunResult>('/api/parent/admin/run-schema-foundation', { method: 'POST' });
      if (status === 200 || status === 207) {
        setFoundationResult(data);
      } else {
        setFoundationError(`Server returned ${status}`);
      }
    } catch (e) {
      setFoundationError(e instanceof Error ? e.message : String(e));
    } finally {
      setFoundationRunning(false);
    }
  }

  async function handleRun() {
    if (!window.confirm('Run schema-v3 migration on the live database?\n\nThis creates sc_parent_media, sc_parent_connections, and sc_parent_manual_events using CREATE TABLE IF NOT EXISTS. It is safe to re-run.')) return;
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const { data, status } = await apiFetch<MigrationRunResult>('/api/parent/admin/run-schema-v3', { method: 'POST' });
      if (status === 200 || status === 207) {
        setRunResult(data);
      } else {
        setRunError(`Server returned ${status}`);
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleYtCheck() {
    setYtLoading(true);
    setYtError(null);
    setYtResult(null);
    try {
      const { data, status } = await apiFetch<YtCacheResult>('/api/parent/admin/youtube-cache');
      if (status === 200) {
        setYtResult(data);
      } else {
        setYtError(`Server returned ${status}`);
      }
    } catch (e) {
      setYtError(e instanceof Error ? e.message : String(e));
    } finally {
      setYtLoading(false);
    }
  }

  async function handleForceFetch() {
    const slugs = ffSlugs.split(',').map((s) => s.trim()).filter(Boolean);
    if (slugs.length === 0) return;
    setFfLoading(true);
    setFfError(null);
    setFfResult(null);
    try {
      const { data, status } = await apiFetch<ForceFetchResult>('/api/parent/admin/youtube-cache/force-fetch', {
        method: 'POST',
        body: JSON.stringify({ slugs }),
      });
      if (status === 200) {
        setFfResult(data);
        // Auto-refresh cache status after 35s
        setTimeout(() => { void handleYtCheck(); }, 35_000);
      } else {
        setFfError(`Server returned ${status}`);
      }
    } catch (e) {
      setFfError(e instanceof Error ? e.message : String(e));
    } finally {
      setFfLoading(false);
    }
  }

  return (
    <PpCard className="border-2 border-destructive/40">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Database size={16} style={{ color: 'hsl(var(--destructive))' }} />
          <PpSectionHeading>Admin — DB Migration</PpSectionHeading>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
          >
            ADMIN ONLY
          </span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-5">
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Schema-v3 creates three tables needed by the Parent Portal: <code>sc_parent_media</code>, <code>sc_parent_connections</code>, and <code>sc_parent_manual_events</code>. Uses <code>CREATE TABLE IF NOT EXISTS</code> — safe to re-run.
          </p>

          {/* Diagnostic — List DB Tables */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Diagnostic — List all DB tables</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'hsl(var(--pp-blue, 217 91% 60%) / 0.12)', color: 'hsl(var(--pp-blue, 217 91% 60%))' }}>RUN FIRST</span>
            </div>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Shows every table in the database. Run this before anything else to confirm the DB connection is working and which tables already exist.
            </p>
            <PpButton variant="outline" size="sm" onClick={() => void handleListTables()} disabled={tablesLoading}>
              {tablesLoading ? <><Loader2 size={12} className="animate-spin" /> Loading…</> : 'List DB tables'}
            </PpButton>
            {tablesError && (
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                <p className="text-xs break-all" style={{ color: 'hsl(var(--destructive))' }}>{tablesError}</p>
              </div>
            )}
            {tablesResult && (
              <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{tablesResult.count} tables in database</p>
                {tablesResult.scTables.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>SC_ TABLES ({tablesResult.scTables.length})</p>
                    {tablesResult.scTables.map(t => (
                      <p key={t} className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{t}</p>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>ALL TABLES</p>
                  <div className="flex flex-wrap gap-1">
                    {tablesResult.tables.map(t => (
                      <code key={t.name} className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--pp-text))' }}>{t.name}</code>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 1 — Check */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Step 1 — Check DB state</span>
            </div>
            <PpButton variant="outline" size="sm" onClick={() => void handleCheck()} disabled={checking}>
              {checking ? <><Loader2 size={12} className="animate-spin" /> Checking…</> : 'Check DB state'}
            </PpButton>

            {checkError && (
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{checkError}</p>
              </div>
            )}

            {checkResult && (
              <div className="rounded-lg border p-3 flex flex-col gap-3" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                <div className="flex items-center gap-2">
                  <StatusIcon ok={checkResult.ready} />
                  <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                    {checkResult.ready ? 'Schema prerequisites met — safe to run migration' : 'Prerequisites missing — do not run migration yet'}
                  </span>
                </div>

                {/* V3 tables (post-migration state) */}
                <div>
                  <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    SCHEMA-V3 TABLES {checkResult.v3Done ? '✓ ALL PRESENT' : '— MIGRATION NEEDED'}
                  </p>
                  <div className="flex flex-col gap-1">
                    {checkResult.v3Tables.map(t => (
                      <div key={t.table} className="flex items-center gap-2">
                        <StatusIcon ok={t.exists} />
                        <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{t.table}</code>
                        <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{t.exists ? 'exists' : 'MISSING — run migration'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fan system tables */}
                <div>
                  <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>FAN SYSTEM TABLES</p>
                  <div className="flex flex-col gap-1">
                    {checkResult.fanTables.map(t => (
                      <div key={t.table} className="flex items-center gap-2">
                        <StatusIcon ok={t.exists} />
                        <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{t.table}</code>
                        <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{t.exists ? 'exists' : 'MISSING'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Required tables */}
                <div>
                  <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>MIGRATION PREREQUISITES</p>
                  <div className="flex flex-col gap-1">
                    {checkResult.tables.map(t => (
                      <div key={t.table} className="flex items-center gap-2">
                        <StatusIcon ok={t.exists} />
                        <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{t.table}</code>
                        <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{t.exists ? 'exists' : 'MISSING'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Columns */}
                <div>
                  <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>REQUIRED COLUMNS</p>
                  <div className="flex flex-col gap-1">
                    {checkResult.columns.map(c => (
                      <div key={`${c.table}.${c.column}`} className="flex items-center gap-2">
                        <StatusIcon ok={c.exists} />
                        <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{c.table}.{c.column}</code>
                        <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{c.exists ? 'exists' : 'MISSING'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Proposed mappings */}
                {checkResult.proposedMappings && (
                  <div>
                    <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>PROPOSED ACCESS_TYPE MAPPINGS (dry run)</p>
                    <div className="grid grid-cols-2 gap-1 text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>
                      <span>Total users</span><span className="font-semibold">{checkResult.proposedMappings.total}</span>
                      <span>→ FAN</span><span className="font-semibold">{checkResult.proposedMappings.fan}</span>
                      <span>→ PARENT</span><span className="font-semibold">{checkResult.proposedMappings.parent}</span>
                      <span>Flagged</span><span className="font-semibold" style={{ color: checkResult.proposedMappings.flagged > 0 ? 'hsl(var(--destructive))' : undefined }}>{checkResult.proposedMappings.flagged}</span>
                      <span>Already set (skip)</span><span className="font-semibold">{checkResult.proposedMappings.skipped}</span>
                    </div>
                    {checkResult.proposedMappings.flaggedAccounts.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--destructive))' }}>FLAGGED ACCOUNTS</p>
                        {checkResult.proposedMappings.flaggedAccounts.map(a => (
                          <p key={a.email} className="text-[11px]" style={{ color: 'hsl(var(--destructive))' }}>{a.email} ({a.memberType})</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 1.5 — Foundation migration */}
          <div className="flex flex-col gap-3" style={{ borderTop: '1px solid hsl(var(--pp-border))', paddingTop: '1rem' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Step 1.5 — Run foundation schema</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}>RUN FIRST</span>
            </div>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Creates all prerequisite tables and columns that Check DB state requires before schema-v3 can run.
              Covers: <code>user.access_type</code>, <code>sc_member_profiles</code> phase-2 columns,
              <code>sc_sources</code>, <code>sc_user_following</code>, <code>sc_parent_follows</code>,
              <code>sc_parent_posts</code>, <code>sc_families</code>, <code>sc_family_sharing</code>,
              <code>sc_account_migration_log</code>. All <code>IF NOT EXISTS</code> — safe to re-run.
            </p>
            <PpButton variant="primary" size="sm" onClick={() => void handleRunFoundation()} disabled={foundationRunning}>
              {foundationRunning ? <><Loader2 size={12} className="animate-spin" /> Running…</> : 'Run foundation schema'}
            </PpButton>

            {foundationError && (
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{foundationError}</p>
              </div>
            )}

            {foundationResult && (
              <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                <div className="flex items-center gap-2">
                  <StatusIcon ok={foundationResult.success} />
                  <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                    {foundationResult.summary.ok} ok · {foundationResult.summary.skipped} skipped · {foundationResult.summary.errors} errors
                  </span>
                </div>
                {foundationResult.next && (
                  <p className="text-xs" style={{ color: 'hsl(var(--primary))' }}>{foundationResult.next}</p>
                )}
                <div className="flex flex-col gap-1 mt-1">
                  {foundationResult.steps.map(s => (
                    <div key={s.step} className="flex items-start gap-2">
                      <StatusIcon ok={s.status !== 'error'} />
                      <div>
                        <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{s.step}</code>
                        <span className="ml-2 text-[10px]" style={{ color: s.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                          {s.status}{s.status === 'error' && s.detail ? ` — ${s.detail}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Run schema-v3 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Step 2 — Run schema-v3 migration</span>
            </div>
            <PpButton variant="primary" size="sm" onClick={() => void handleRun()} disabled={running}>
              {running ? <><Loader2 size={12} className="animate-spin" /> Running migration…</> : 'Run schema-v3 migration'}
            </PpButton>

            {runError && (
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{runError}</p>
              </div>
            )}

            {runResult && (
              <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                <div className="flex items-center gap-2">
                  <StatusIcon ok={runResult.ok} />
                  <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                    {runResult.ok ? 'Migration complete — all tables created' : 'Migration finished with errors'}
                  </span>
                </div>
                {runResult.results.map(r => (
                  <div key={r.table} className="flex items-center gap-2">
                    <StatusIcon ok={r.status === 'ok'} />
                    <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{r.table}</code>
                    <span className="text-[10px]" style={{ color: r.status === 'ok' ? 'hsl(var(--pp-text-muted))' : 'hsl(var(--destructive))' }}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Schema v4 ── */}
          <SchemaV4Panel />

          {/* ── YouTube Cache ── */}
          <div
            className="flex flex-col gap-3 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}
          >
            <div className="flex items-center gap-2">
              <Youtube size={14} style={{ color: 'hsl(var(--destructive))' }} />
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>YouTube cache status</span>
            </div>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Shows actual <code>sc_youtube_cache</code> DB rows. "not-ready" means <code>fetched_at</code> is NULL — the scheduler hasn't fetched yet or the fetch failed. "no-row" means the row doesn't exist at all.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <PpButton variant="outline" size="sm" onClick={() => void handleYtCheck()} disabled={ytLoading}>
                {ytLoading ? <><Loader2 size={12} className="animate-spin" /> Loading…</> : 'Check cache status'}
              </PpButton>
              {ytResult && (
                <button
                  type="button"
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: 'hsl(var(--pp-blue))' }}
                  onClick={() => setYtShowAll(v => !v)}
                >
                  {ytShowAll ? 'Show not-ready only' : `Show all ${ytResult.totalChannels} channels`}
                </button>
              )}
            </div>

            {ytError && (
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{ytError}</p>
              </div>
            )}

            {ytResult && (
              <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 text-center mb-1">
                  {[
                    { label: 'Total', value: ytResult.totalChannels },
                    { label: 'Ready', value: ytResult.readyCount },
                    { label: 'Not ready', value: ytResult.notReadyCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg p-2" style={{ background: 'hsl(var(--muted))' }}>
                      <p className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--pp-text))' }}>{value}</p>
                      <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  CHANNELS_VERIFIED: <strong>{ytResult.verified ? 'true' : 'false'}</strong>
                  {!ytResult.verified && ' — scheduler will not fetch until this is set to "true"'}
                </p>

                {/* Channel rows */}
                {(ytShowAll ? ytResult.channels : ytResult.notReady).map((ch) => (
                  <div key={ch.slug} className="flex items-start gap-2 py-1" style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                      style={{
                        background: ch.status === 'ready' ? 'hsl(142 76% 25% / 0.12)' : 'hsl(var(--destructive) / 0.12)',
                        color: ch.status === 'ready' ? 'hsl(142 76% 25%)' : 'hsl(var(--destructive))',
                      }}
                    >
                      {ch.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{ch.name}</p>
                      {ch.dbRow ? (
                        <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          {ch.dbRow.fetchedAt
                            ? `fetched ${new Date(ch.dbRow.fetchedAt).toLocaleString()} · ${ch.dbRow.videoCount} videos`
                            : 'fetched_at: NULL'}
                          {ch.dbRow.lastAttempt && ` · last_attempt: ${new Date(ch.dbRow.lastAttempt).toLocaleString()}`}
                          {ch.dbRow.syncError && <span style={{ color: 'hsl(var(--destructive))' }}> · error: {ch.dbRow.syncError}</span>}
                        </p>
                      ) : (
                        <p className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>No DB row</p>
                      )}
                    </div>
                  </div>
                ))}
                {!ytShowAll && ytResult.notReady.length === 0 && (
                  <p className="text-xs text-center py-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>All channels are ready ✓</p>
                )}
              </div>
            )}

            {/* Force-fetch */}
            <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
              <div className="flex items-center gap-2">
                <RefreshCw size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>Force-fetch specific channels</span>
              </div>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Clears <code>last_attempt</code> for the listed slugs and triggers an immediate scheduler run. The fetch runs in the background — poll "Check cache status" after ~35s to see results. CHANNELS_VERIFIED must be true.
              </p>
              <p className="text-[10px] font-semibold" style={{ color: 'hsl(var(--destructive))' }}>
                ⚠ YouTube Error 153 (embedding disabled by rights holder) is a known unresolved issue. Force-fetching will not fix it — the video will still show as embed-blocked. Retest the original failing video after fetching.
              </p>
              <input
                type="text"
                value={ffSlugs}
                onChange={(e) => setFfSlugs(e.target.value)}
                placeholder="champions-league, nwsl"
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))', color: 'hsl(var(--pp-text))' }}
              />
              <PpButton variant="primary" size="sm" onClick={() => void handleForceFetch()} disabled={ffLoading}>
                {ffLoading ? <><Loader2 size={12} className="animate-spin" /> Triggering…</> : 'Force-fetch'}
              </PpButton>

              {ffError && (
                <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
                  <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{ffError}</p>
                </div>
              )}

              {ffResult && (
                <div className="rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
                  <div className="flex items-center gap-2">
                    <StatusIcon ok={ffResult.ok} />
                    <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                      {ffResult.schedulerTriggered ? 'Fetch triggered' : 'last_attempt cleared (scheduler will pick up within 60s)'}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{ffResult.note}</p>
                  <p className="text-[10px] font-semibold mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Cache status will auto-refresh in ~35s. Or click "Check cache status" manually.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PpCard>
  );
}

// ─── Seed Sources Panel ───────────────────────────────────────────────────────

interface SeedResult {
  ok: boolean;
  inserted: number;
  updated: number;
  errors: number;
  results: { importKey: string; action: string }[];
}

// ─── Schema v5 panel (team catalog tables) ────────────────────────────────────

export function PpAdminSchemaV5Panel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; summary: { created: number; skipped: number; errors: number }; results: { table: string; status: string; detail?: string }[] } | null>(null);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (!window.confirm(
      'Run schema-v5 migration?\n\nCreates:\n  • sc_teams\n  • sc_competitions\n  • sc_team_competitions\n  • sc_team_sources\n  • sc_import_log\n\nUses CREATE TABLE IF NOT EXISTS — safe to re-run.'
    )) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-v5', { method: 'POST', credentials: 'include' });
      const data = await res.json() as typeof result;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 2c — Schema-v5 (team catalog tables)" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Creates <code>sc_teams</code>, <code>sc_competitions</code>, <code>sc_team_competitions</code>,{' '}
        <code>sc_team_sources</code>, and <code>sc_import_log</code>.{' '}
        <strong>Must run before Step 3b (seed teams) and Step 4 (seed team sources).</strong>{' '}
        Safe to re-run.
      </p>
      <PpButton variant="primary" size="sm" onClick={() => void handleRun()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Running…</> : 'Run schema-v5 migration'}
      </PpButton>
      {error && <p className="text-xs mt-2" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.created} created · {result.summary.skipped} already exist · {result.summary.errors} errors
            </span>
          </div>
          {result.results.map(r => (
            <div key={r.table} className="flex items-center gap-2">
              {r.status === 'error'
                ? <XCircle size={12} style={{ color: 'hsl(var(--destructive))' }} />
                : <CheckCircle size={12} style={{ color: 'hsl(var(--primary))' }} />}
              <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{r.table}</code>
              <span className="text-[10px]" style={{ color: r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                {r.status}{r.detail ? ` — ${r.detail}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </PpCard>
  );
}

// ─── Team catalog seeding panel ───────────────────────────────────────────────

interface TeamSeedResult {
  ok: boolean;
  summary: { inserted: number; updated: number; errors: number; total: number };
  results: { importKey: string; status: string; detail?: string }[];
}

export function PpAdminSeedTeamsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TeamSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!window.confirm('Seed sc_teams with legacy rows (Colorado Rapids, USMNT/USWNT, US Youth Soccer, US Club Soccer, 8 Colorado youth clubs)?\n\nIdempotent — safe to re-run. For the full pro club catalog use Step 3c.')) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-teams', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json() as TeamSeedResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3b — Seed legacy team rows (sc_teams)" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Inserts the original 19 legacy rows: Colorado Rapids, USMNT, USWNT, US Youth Soccer, US Club Soccer,
        8 Colorado youth clubs, and 6 league/competition rows (Premier League, La Liga, Bundesliga, Serie A, MLS, UCL).
        These are preserved for backward compatibility with existing sc_team_sources references.
        For the full 113-entry pro club catalog, run <strong>Step 3c</strong> instead.
        Idempotent.
      </p>

      <PpButton variant="outline" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Seeding…</> : 'Seed legacy rows'}
      </PpButton>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.inserted} inserted · {result.summary.updated} updated · {result.summary.errors} errors
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.results.map((r) => (
              <li key={r.importKey} className="text-[10px]" style={{ color: r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                {r.importKey} — {r.status}{r.detail ? `: ${r.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PpCard>
  );
}

// ─── Seed competitions panel ──────────────────────────────────────────────────

interface CompSeedResult {
  ok: boolean;
  summary: { inserted: number; updated: number; errors: number; total: number };
  results: { importKey: string; status: string; detail?: string }[];
}

export function PpAdminSeedCompetitionsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CompSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!window.confirm('Seed sc_competitions with 12 canonical competition rows?\n\nCovers: Premier League, LaLiga, Bundesliga, Ligue 1, Serie A, MLS, NWSL, UCL, UEL, Nations League, World Cup, Copa América.\nIdempotent — safe to re-run.')) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-competitions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      setResult(await r.json() as CompSeedResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3c-i — Seed competitions (sc_competitions)" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Upserts 12 competition rows (7 domestic leagues + 5 continental/cup competitions) into <code>sc_competitions</code>.
        importKey format: <code>comp:&lt;slug&gt;</code>.
        <strong> Must run before Step 3c-ii (catalog teams) and Step 3c-iii (memberships).</strong> Idempotent.
      </p>
      <PpButton variant="primary" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Seeding…</> : 'Seed competitions'}
      </PpButton>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}
      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} /> : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.inserted} inserted · {result.summary.updated} updated · {result.summary.errors} errors
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.results.map(r => (
              <li key={r.importKey} className="text-[10px]" style={{ color: r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                {r.importKey} — {r.status}{r.detail ? `: ${r.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PpCard>
  );
}

// ─── Seed catalog teams panel ─────────────────────────────────────────────────

interface CatalogTeamSeedResult {
  ok: boolean;
  summary: { inserted: number; updated: number; errors: number; total: number; clubs: number; nationalTeams: number };
  legacyCorrections: { importKey: string; status: string; detail?: string }[];
  results: { importKey: string; status: string; detail?: string }[];
}

export function PpAdminSeedCatalogTeamsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CatalogTeamSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function handleSeed() {
    if (!window.confirm(
      'Seed sc_teams with the full pro club and national team catalog?\n\n' +
      '• 20 Premier League clubs\n• 20 LaLiga clubs\n• 18 Bundesliga clubs\n' +
      '• 18 Ligue 1 clubs\n• 20 Serie A clubs\n• 16 national teams\n' +
      '• Colorado Rapids (deduped)\n\n' +
      'Also corrects entityType on 6 legacy league rows (no deletes).\n\n' +
      'Idempotent — safe to re-run. Requires Step 3c-i (competitions) first.'
    )) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-catalog-teams', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      setResult(await r.json() as CatalogTeamSeedResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3c-ii — Seed full club catalog (sc_teams)" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Upserts 113 rows into <code>sc_teams</code>: 96 pro clubs (PL, LaLiga, Bundesliga, Ligue 1, Serie A)
        + 16 national teams + Colorado Rapids. importKey format: <code>club:&lt;slug&gt;</code> / <code>nt:&lt;id&gt;</code>.
        Also corrects <code>entityType</code> on 6 legacy league rows — no deletes, FK references preserved.
        <strong> Requires Step 3c-i first.</strong> Idempotent.
      </p>
      <PpButton variant="primary" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Seeding…</> : 'Seed catalog teams'}
      </PpButton>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}
      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} /> : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.inserted} inserted · {result.summary.updated} updated · {result.summary.errors} errors
              <span className="ml-2 font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                ({result.summary.clubs} clubs · {result.summary.nationalTeams} national teams)
              </span>
            </span>
          </div>
          {result.legacyCorrections.length > 0 && (
            <div>
              <p className="text-[10px] font-bold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>LEGACY CORRECTIONS</p>
              {result.legacyCorrections.map(c => (
                <p key={c.importKey} className="text-[10px]" style={{ color: c.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                  {c.importKey} — {c.status}
                </p>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-[11px] font-medium text-left hover:underline"
            style={{ color: 'hsl(var(--pp-blue, 217 91% 60%))' }}
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Hide row details' : `Show all ${result.results.length} row results`}
          </button>
          {showAll && (
            <ul className="space-y-0.5 max-h-64 overflow-y-auto">
              {result.results.map(r => (
                <li key={r.importKey} className="text-[10px]" style={{ color: r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                  {r.importKey} — {r.status}{r.detail ? `: ${r.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PpCard>
  );
}

// ─── Seed team-competition memberships panel ──────────────────────────────────

interface TeamCompSeedResult {
  ok: boolean;
  summary: { inserted: number; skipped: number; errors: number; total: number };
  missing: string[];
  results: { teamImportKey: string; compImportKey: string; status: string; detail?: string }[];
}

export function PpAdminSeedTeamCompetitionsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TeamCompSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!window.confirm('Seed sc_team_competitions membership rows?\n\nLinks all 96 catalog clubs to their competition. Requires Steps 3c-i and 3c-ii. Idempotent.')) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-team-competitions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      setResult(await r.json() as TeamCompSeedResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3c-iii — Seed team-competition memberships" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Populates <code>sc_team_competitions</code> join rows linking each catalog club to its competition.
        Season: 2026/27. <strong>Requires Steps 3c-i and 3c-ii.</strong> Idempotent.
      </p>
      <PpButton variant="primary" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Seeding…</> : 'Seed memberships'}
      </PpButton>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}
      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} /> : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.inserted} inserted · {result.summary.skipped} skipped · {result.summary.errors} errors
            </span>
          </div>
          {result.missing.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] font-semibold" style={{ color: 'hsl(var(--destructive))' }}>Missing keys (run 3c-i and 3c-ii first):</p>
              {result.missing.map(k => (
                <p key={k} className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>{k}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </PpCard>
  );
}

// ─── Team-source seeding panel ────────────────────────────────────────────────

interface TeamSourceSeedResult {
  ok: boolean;
  summary: { inserted: number; skipped: number; errors: number; coveredTeams: number; totalTeams: number };
  unresolved: string[];
  results: { teamKey: string; sourceKey: string; status: string; detail?: string }[];
}

export function PpAdminSeedTeamSourcesPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TeamSourceSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!window.confirm('Populate sc_team_sources join table?\n\nMaps teams to their matching source catalog entries. Idempotent — safe to re-run.')) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-team-sources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json() as TeamSourceSeedResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 4 — Map teams to sources" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Populates sc_team_sources join rows connecting sc_teams to sc_sources by stable importKey.
        Covers pro teams, national teams, and Colorado youth clubs. Idempotent — safe to re-run.
      </p>

      <PpButton variant="primary" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Mapping…</> : 'Seed team sources'}
      </PpButton>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.summary.inserted} inserted · {result.summary.skipped} skipped · {result.summary.errors} errors
            </span>
          </div>
          <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {result.summary.coveredTeams}/{result.summary.totalTeams} teams covered
          </p>
          {result.unresolved.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>Unresolved keys:</p>
              {result.unresolved.map(k => (
                <p key={k} className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>{k}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </PpCard>
  );
}

export function PpAdminSeedSourcesPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!window.confirm('Seed / update sc_sources with news and podcast catalog rows?\n\nThis is idempotent — safe to re-run.')) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/parent/admin/seed-sources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json() as SeedResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3 — Seed news &amp; podcast sources" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Inserts or updates the canonical sc_sources rows for Sky Sports, BBC Football, CBS Golazo, ESPN FC, NBC Sports, The Athletic, and four podcast sources. Idempotent — safe to re-run after schema-v3 is applied.
      </p>

      <PpButton variant="primary" size="sm" onClick={() => void handleSeed()} disabled={running}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Seeding…</> : 'Seed sources'}
      </PpButton>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.inserted} inserted · {result.updated} updated · {result.errors} errors
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.results.map((r) => (
              <li key={r.importKey} className="text-[10px]" style={{ color: r.action.startsWith('error') ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                {r.importKey} — {r.action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PpCard>
  );
}

// ─── Step 3d — Fan profile schema migration ───────────────────────────────────

const FAN_PROFILE_COLUMNS = ['display_name', 'bio', 'avatar_url', 'cover_image_url', 'location'] as const;

interface SchemaStatusColumn {
  name: string;
  required: boolean;
  exists: boolean;
  note: string;
}
interface SchemaStatusMemberProfiles {
  table: string;
  columns: SchemaStatusColumn[];
  allPresent: boolean;
}
interface SchemaStatusResponse {
  environment: string;
  dbHost: string;
  checkedAt: string;
  memberProfiles: SchemaStatusMemberProfiles;
}

export function PpAdminFanProfileSchemaPanel() {
  const [running, setRunning]     = useState(false);
  const [checking, setChecking]   = useState(false);
  const [status, setStatus]       = useState<SchemaStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [result, setResult]       = useState<{ ok: boolean; steps: Array<{ column: string; status: string; detail?: string }> } | null>(null);
  const [runError, setRunError]   = useState<string | null>(null);

  async function checkStatus() {
    setChecking(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/parent/admin/schema-status', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SchemaStatusResponse;
      setStatus(data);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Status check failed');
    } finally {
      setChecking(false);
    }
  }

  async function run() {
    if (!window.confirm(
      'Add fan identity columns (display_name, bio, avatar_url, cover_image_url, location) to sc_member_profiles?\n\n' +
      'Idempotent — safe to re-run. Existing data is preserved. No rows are modified.'
    )) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-fan-profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok: boolean; steps: Array<{ column: string; status: string; detail?: string }> };
      setResult(data);
      // Refresh status after migration so the column indicators update
      void checkStatus();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  // Derive per-column existence from status probe (if available)
  const colMap = new Map<string, boolean>(
    status?.memberProfiles.columns
      .filter(c => (FAN_PROFILE_COLUMNS as readonly string[]).includes(c.name))
      .map(c => [c.name, c.exists]) ?? []
  );
  const allPresent = FAN_PROFILE_COLUMNS.every(c => colMap.get(c) === true);
  const hasStatusData = status !== null;

  return (
    <PpCard>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <PpSectionHeading icon={<Database size={14} />} title="P0 — Run Fan Profile Migration" />
        {/* Prominent badge showing migration need */}
        {hasStatusData && (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: allPresent ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--destructive) / 0.12)',
              color: allPresent ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
            }}
          >
            {allPresent ? '✓ All columns present' : '⚠ Migration required'}
          </span>
        )}
      </div>

      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code>display_name</code>, <code>bio</code>, <code>avatar_url</code>, <code>cover_image_url</code>, and{' '}
        <code>location</code> to <code>sc_member_profiles</code>.{' '}
        <strong>Required before the Fan Arena profile can persist identity edits.</strong>{' '}
        Idempotent — safe to re-run. No existing rows are modified.
      </p>

      {/* ── Step 1: Check current column state ── */}
      <div className="mb-3">
        <PpButton onClick={() => void checkStatus()} disabled={checking} variant="outline">
          {checking
            ? <><Loader2 size={13} className="animate-spin" /> Checking…</>
            : <><RefreshCw size={13} /> Check production columns</>}
        </PpButton>
      </div>

      {statusError && (
        <div className="mb-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>Status check failed: {statusError}</p>
        </div>
      )}

      {hasStatusData && (
        <div className="mb-4 rounded-lg border p-3" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {status.environment} · {status.dbHost} · sc_member_profiles
            </span>
          </div>
          <ul className="space-y-1">
            {FAN_PROFILE_COLUMNS.map(col => {
              const exists = colMap.get(col);
              const known  = exists !== undefined;
              return (
                <li key={col} className="flex items-center gap-2 text-xs">
                  {!known
                    ? <span style={{ color: 'hsl(var(--pp-text-muted))' }}>—</span>
                    : exists
                      ? <CheckCircle size={13} style={{ color: 'hsl(var(--primary))' }} />
                      : <XCircle    size={13} style={{ color: 'hsl(var(--destructive))' }} />}
                  <code style={{ color: 'hsl(var(--pp-text))' }}>{col}</code>
                  {known && (
                    <span style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {exists ? 'present' : 'MISSING — migration needed'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Step 2: Run migration ── */}
      <PpButton onClick={() => void run()} disabled={running || (hasStatusData && allPresent)} variant="primary">
        {running
          ? <><Loader2 size={13} className="animate-spin" /> Running migration…</>
          : hasStatusData && allPresent
            ? <><CheckCircle size={13} /> Migration already complete</>
            : 'Run Fan Profile Migration'}
      </PpButton>
      {hasStatusData && allPresent && (
        <p className="mt-2 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          All five columns are present. No action needed.
        </p>
      )}

      {runError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{runError}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle     size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.steps.filter(s => s.status === 'added').length} added ·{' '}
              {result.steps.filter(s => s.status === 'already_exists').length} already existed ·{' '}
              {result.steps.filter(s => s.status === 'error').length} errors
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.steps.map((s) => (
              <li key={s.column} className="text-[10px]" style={{ color: s.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                <code>{s.column}</code> — {s.status}{s.detail ? `: ${s.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PpCard>
  );
}

// ─── Schema Stats Panel ───────────────────────────────────────────────────────

export function PpAdminSchemaStatsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: Array<{ column: string; status: string; detail?: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(
      'Add season-statistics columns (stat_gp, stat_goals, stat_assists, stat_shots, stat_ga, stat_saves, stat_so) to sc_player_profiles?\n\nIdempotent — safe to re-run. Existing data is preserved.'
    )) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-stats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok: boolean; steps: Array<{ column: string; status: string; detail?: string }> };
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <PpCard>
      <PpSectionHeading icon={<Database size={14} />} title="Step 3e — Player stats schema (sc_player_profiles)" />
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code>stat_gp</code>, <code>stat_goals</code>, <code>stat_assists</code>, <code>stat_shots</code>, <code>stat_ga</code>, <code>stat_saves</code>, and <code>stat_so</code> columns to <code>sc_player_profiles</code>.{' '}
        <strong>Required before season statistics can persist on player profiles.</strong> Idempotent.
      </p>
      <PpButton onClick={() => void run()} disabled={running} variant="primary">
        {running ? <><Loader2 size={13} className="animate-spin" /> Running…</> : 'Run Step 3e'}
      </PpButton>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border p-3 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle size={14} style={{ color: 'hsl(var(--primary))' }} />
              : <XCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />}
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {result.steps.filter(s => s.status === 'added').length} added ·{' '}
              {result.steps.filter(s => s.status === 'already_exists').length} already exist ·{' '}
              {result.steps.filter(s => s.status === 'error').length} errors
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.steps.map((s) => (
              <li key={s.column} className="text-[10px]" style={{ color: s.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
                {s.column} — {s.status}{s.detail ? `: ${s.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PpCard>
  );
}

// ─── Schema Status Panel ──────────────────────────────────────────────────────

interface SchemaStatusColumn {
  name: string;
  required: boolean;
  exists: boolean;
  note: string;
}

interface SchemaStatusResult {
  environment: string;
  dbHost: string;
  checkedAt: string;
  calendarFeeds: { table: string; columns: SchemaStatusColumn[]; allPresent: boolean };
  memberProfiles: { table: string; columns: SchemaStatusColumn[]; allPresent: boolean };
  readyToDeploy: boolean;
  blockers: string[];
}

export function PpAdminSchemaStatusPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SchemaStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parent/admin/schema-status', { credentials: 'include' });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setResult(await res.json() as SchemaStatusResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PpCard className="mt-4">
      <PpSectionHeading>Schema Status Check</PpSectionHeading>
      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Read-only. Checks whether calendar isolation and fan profile columns exist in the
        currently connected database. Use this to confirm production schema state before deploying.
      </p>

      <PpButton size="sm" onClick={check} disabled={loading}>
        {loading ? <><Loader2 size={12} className="animate-spin mr-1" />Checking…</> : 'Check schema now'}
      </PpButton>

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: result.readyToDeploy ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--destructive) / 0.1)',
              color: result.readyToDeploy ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
            }}
          >
            {result.readyToDeploy ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            <span>
              {result.readyToDeploy
                ? 'All required columns present — safe to deploy'
                : `${result.blockers.length} required column${result.blockers.length !== 1 ? 's' : ''} missing`}
            </span>
            <span className="ml-auto font-normal opacity-70">
              DB: {result.dbHost} · env: {result.environment} · {new Date(result.checkedAt).toLocaleTimeString()}
            </span>
          </div>

          {result.blockers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--destructive))' }}>
                Missing required columns
              </p>
              <ul className="space-y-1">
                {result.blockers.map((b, i) => (
                  <li key={i} className="text-[10px] flex items-start gap-1.5" style={{ color: 'hsl(var(--destructive))' }}>
                    <XCircle size={10} className="mt-0.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              sc_calendar_feeds
            </p>
            <ul className="space-y-0.5">
              {result.calendarFeeds.columns.map(c => (
                <li key={c.name} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'hsl(var(--pp-text))' }}>
                  <StatusIcon ok={c.exists} />
                  <code>{c.name}</code>
                  {c.required && <span className="text-[9px] opacity-60">(required)</span>}
                  <span className="opacity-50 truncate">{c.note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              sc_member_profiles
            </p>
            <ul className="space-y-0.5">
              {result.memberProfiles.columns.map(c => (
                <li key={c.name} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'hsl(var(--pp-text))' }}>
                  <StatusIcon ok={c.exists} />
                  <code>{c.name}</code>
                  {c.required && <span className="text-[9px] opacity-60">(required)</span>}
                  <span className="opacity-50 truncate">{c.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </PpCard>
  );
}

// ─── Step 3e — Match records schema migration ──────────────────────────────────

export function PpAdminMatchRecordsSchemaPanel() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(
      'Create sc_player_match_records table?\n\n' +
      'Stores per-player match performance (goals, assists, minutes, result, notes, season).\n' +
      'Uses CREATE TABLE IF NOT EXISTS — safe to re-run. No existing data is modified.'
    )) return;
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-match-records', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDone(true);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <PpCard>
      <PpSectionHeading>Step 3e — Match records schema</PpSectionHeading>
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Creates <code>sc_player_match_records</code> — required for game records on player detail pages.
        Idempotent; safe to re-run.
      </p>
      {done && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 mb-3 text-xs" style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
          <CheckCircle size={13} />
          Migration complete — sc_player_match_records is ready.
        </div>
      )}
      {runError && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 mb-3 text-xs" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
          <XCircle size={13} />
          {runError}
        </div>
      )}
      <PpButton size="sm" onClick={run} disabled={running || done}>
        {running ? <><Loader2 size={12} className="animate-spin" /> Running…</> : done ? 'Done' : 'Run match records migration'}
      </PpButton>
    </PpCard>
  );
}

// ─── Parent Profile v2 Migration Panel ───────────────────────────────────────

/**
 * Adds identity columns (display_name, bio, avatar_initials, avatar_url,
 * cover_style, city, onboarding_stage, etc.) to sc_parent_profiles and
 * sc_player_profiles. Required for parent profile photos to persist.
 */
export function PpAdminParentV2SchemaPanel() {
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState(false);
  const [allPresent, setAllPresent] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Array<{ step: string; status: string; detail?: string }>>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function check() {
    setChecking(true);
    setCheckError(null);
    try {
      // POST a dry-run to the migration endpoint — if all steps come back 'skipped',
      // the columns are already present. We can't use GET /api/parent/profile here
      // because it requires a parent session (admin may not have one).
      // Instead, probe via the migration itself with a no-op run.
      const res = await fetch('/api/parent/admin/run-schema-v2', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok && res.status !== 500) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { success: boolean; steps: Array<{ step: string; status: string }> };
      const steps = data.steps ?? [];
      const hasErrors = steps.some(s => s.status === 'error');
      const allSkipped = steps.length > 0 && steps.every(s => s.status === 'skipped');
      setAllPresent(allSkipped && !hasErrors);
      if (allSkipped && !hasErrors) {
        setDone(true);
      } else if (!hasErrors) {
        // Some columns were added — migration just ran successfully
        setDone(data.success);
        setSteps(steps);
      } else {
        setSteps(steps);
        setRunError('Check found errors — see step log.');
      }
      setChecked(true);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  async function run() {
    if (!window.confirm(
      'Add v2 identity columns to sc_parent_profiles and sc_player_profiles?\n\n' +
      'Idempotent — safe to re-run. No existing data is modified.'
    )) return;
    setRunning(true);
    setRunError(null);
    setSteps([]);
    try {
      const res = await fetch('/api/parent/admin/run-schema-v2', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { success: boolean; steps: Array<{ step: string; status: string; detail?: string }> };
      setSteps(data.steps ?? []);
      if (data.success) {
        setDone(true);
        setAllPresent(true);
      } else {
        setRunError('Migration completed with errors — see step log below.');
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <PpCard className="mt-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <PpSectionHeading icon={<Database size={14} />} title="P1 — Run Parent Profile v2 Migration" />
        {checked && (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: allPresent ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--destructive) / 0.12)',
              color: allPresent ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
            }}
          >
            {allPresent ? '✓ Columns present' : '⚠ Migration required'}
          </span>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code>display_name</code>, <code>bio</code>, <code>avatar_url</code>, <code>cover_style</code>,
        and onboarding columns to <code>sc_parent_profiles</code>. Required for parent profile photos to persist.
        Also adds stat columns to <code>sc_player_profiles</code>. Idempotent — safe to re-run.
      </p>

      {checkError && (
        <p className="text-xs mb-2" style={{ color: 'hsl(var(--destructive))' }}>{checkError}</p>
      )}

      {!checked ? (
        <PpButton size="sm" onClick={check} disabled={checking}>
          {checking ? <><Loader2 size={12} className="animate-spin" /> Running…</> : 'Run v2 migration'}
        </PpButton>
      ) : allPresent ? (
        <p className="text-xs" style={{ color: 'hsl(var(--primary))' }}>
          ✓ All v2 columns are present. No migration needed.
        </p>
      ) : (
        <PpButton size="sm" onClick={run} disabled={running || done}>
          {running ? <><Loader2 size={12} className="animate-spin" /> Running…</> : done ? 'Done' : 'Retry migration'}
        </PpButton>
      )}

      {done && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 mt-3 text-xs" style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
          <CheckCircle size={13} />
          Migration complete — parent profile photos and display names can now be saved.
        </div>
      )}
      {runError && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 mt-3 text-xs" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
          <XCircle size={13} />
          {runError}
        </div>
      )}
      {steps.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {steps.map((s, i) => (
            <li key={i} className="text-[10px]" style={{ color: s.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}>
              <code>{s.step}</code> — {s.status}{s.detail ? `: ${s.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </PpCard>
  );
}

// ─── Player Media Schema Panel ────────────────────────────────────────────────

export function PpAdminPlayerMediaSchemaPanel() {
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ table: string; status: string; detail?: string }>>([]);

  async function run() {
    if (!window.confirm(
      'Create sc_player_media_assignments, sc_player_highlight_collections, sc_player_collection_items?\n\n' +
      'Additive — uses IF NOT EXISTS. No existing data is modified.'
    )) return;
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch('/api/parent/admin/run-schema-player-media', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { ok: boolean; summary: { created: number; skipped: number; errors: number }; results: Array<{ table: string; status: string; detail?: string }> };
      setResults(data.results ?? []);
      if (data.ok) {
        setDone(true);
      } else {
        setError(`Migration completed with ${data.summary?.errors ?? '?'} error(s) — see table log.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <PpCard className="mt-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <PpSectionHeading icon={<Database size={14} />} title="Player Media Schema — run-schema-player-media" />
        {done && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
            ✓ Done
          </span>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Creates three new tables for production player media, collections, and assignments.
        Safe to re-run (IF NOT EXISTS). Does not touch existing tables or rows.
      </p>
      {error && (
        <div className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
          {error}
        </div>
      )}
      <PpButton onClick={run} disabled={running || done} size="sm">
        {running ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
        {done ? 'Migration complete' : running ? 'Running…' : 'Run migration'}
      </PpButton>
      {results.length > 0 && (
        <ul className="mt-3 space-y-1">
          {results.map(r => (
            <li key={r.table} className="text-xs flex items-center gap-2">
              <span
                className="font-mono px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  background: r.status === 'error' ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--pp-blue-light))',
                  color:      r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-navy))',
                }}
              >
                {r.status}
              </span>
              <span style={{ color: 'hsl(var(--pp-text))' }}>{r.table}</span>
              {r.detail && <span style={{ color: 'hsl(var(--pp-text-muted))' }}>— {r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </PpCard>
  );
}

// ─── Recruiting Schema Panel ──────────────────────────────────────────────────

interface RecruitingTableResult {
  table: string;
  label: string;
  exists: boolean;
  rowCount: number | null;
  columns: Array<{ name: string; exists: boolean }>;
  allColumnsPresent: boolean;
}

interface RecruitingCheckResult {
  checkedAt: string;
  allTablesPresent: boolean;
  allColumnsPresent: boolean;
  readyToSeed: boolean;
  tables: RecruitingTableResult[];
}

interface RecruitingMigrationResult {
  ok: boolean;
  summary: { created: number; skipped: number; errors: number };
  results: Array<{ table: string; status: string; detail?: string }>;
}

interface RecruitingV2MigrationResult {
  ok: boolean;
  table: string;
  summary: { added: number; skipped: number; errors: number };
  results: Array<{ column: string; status: 'added' | 'already_exists' | 'error'; detail?: string }>;
}

interface RecruitingSeedTableResult {
  table: string;
  created: number;
  skipped: number;
  errors: number;
  errorDetails?: string[];
  withheld?: Array<{ importKey: string; name: string | null; staffPageUrl: string; reason: string }>;
}

interface RecruitingSeedResult {
  ok: boolean;
  fileCounts?: { programs: number; coaches: number; camps: number; showcases: number };
  programs: RecruitingSeedTableResult;
  coaches: RecruitingSeedTableResult;
  camps: RecruitingSeedTableResult;
  showcases: RecruitingSeedTableResult;
  withheld?: { message: string; coaches: Array<{ importKey: string; name: string | null; staffPageUrl: string; reason: string }> };
}

/**
 * PpAdminRecruitingSchemaPanel
 *
 * Admin-only card for the recruiting database setup.
 * Three actions:
 *   1. Check recruiting schema  — GET  /api/parent/admin/check-schema-recruiting
 *      Read-only probe: table existence, key columns, row counts.
 *   2. Run recruiting migration — POST /api/parent/admin/run-schema-recruiting
 *      Creates the six recruiting tables using IF NOT EXISTS.
 *      Never seeds data or changes access permissions.
 *   3. Seed recruiting data     — POST /api/parent/admin/seed-recruiting
 *      Imports college programs, verified coaches, ID camps, and showcases from bundled JSON.
 *      Uses INSERT IGNORE for new rows; issues UPDATE for corrected coaches so existing rows
 *      with wrong or null names are brought up to date (INSERT IGNORE alone skips them).
 *      Unverified-name coaches are WITHHELD (not seeded).
 *      Recruiting remains restricted to admin/test accounts until data is verified.
 *
 * Non-destructive exclusion:
 *   The coaches GET endpoint excludes unverified coaches at query time by import_key.
 *   No rows are deleted. Existing drafts and saved opportunities are preserved.
 *   The UI labels references to excluded coaches "Verification pending."
 *   To make a coach visible: update _verificationStatus to "corrected" in
 *   college-coaches.json and re-run the seed.
 */
export function PpAdminRecruitingSchemaPanel() {
  // Check state
  const [checking,     setChecking]     = useState(false);
  const [checkResult,  setCheckResult]  = useState<RecruitingCheckResult | null>(null);
  const [checkError,   setCheckError]   = useState<string | null>(null);

  // Migration state
  const [running,      setRunning]      = useState(false);
  const [migResult,    setMigResult]    = useState<RecruitingMigrationResult | null>(null);
  const [migError,     setMigError]     = useState<string | null>(null);

  // V2 migration state (adds subject/recipient_name/recipient_email/sent_at to sc_outreach_drafts)
  const [runningV2,    setRunningV2]    = useState(false);
  const [migV2Result,  setMigV2Result]  = useState<RecruitingV2MigrationResult | null>(null);
  const [migV2Error,   setMigV2Error]   = useState<string | null>(null);

  // Seed state
  const [seeding,      setSeeding]      = useState(false);
  const [seedResult,   setSeedResult]   = useState<RecruitingSeedResult | null>(null);
  const [seedError,    setSeedError]    = useState<string | null>(null);

  // Expand/collapse per-table column details
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await fetch('/api/parent/admin/check-schema-recruiting', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setCheckResult(await res.json() as RecruitingCheckResult);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  async function handleMigrate() {
    if (!window.confirm(
      'Run recruiting schema migration?\n\n' +
      'Creates six tables using CREATE TABLE IF NOT EXISTS:\n' +
      '  • sc_college_programs\n' +
      '  • sc_college_coaches\n' +
      '  • sc_id_camps\n' +
      '  • sc_showcases\n' +
      '  • sc_recruiting_saved\n' +
      '  • sc_outreach_drafts\n\n' +
      'Safe to re-run. No existing data is modified.\n' +
      'Does NOT seed data or enable access for non-admin users.'
    )) return;
    setRunning(true);
    setMigError(null);
    setMigResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-recruiting', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as RecruitingMigrationResult;
      setMigResult(data);
      // Auto-refresh check after migration so column indicators update
      void handleCheck();
    } catch (e) {
      setMigError(e instanceof Error ? e.message : 'Migration request failed');
    } finally {
      setRunning(false);
    }
  }


  async function handleMigrateV2() {
    if (!window.confirm(
      'Run recruiting schema v2 migration?\n\n' +
      'Adds four columns to sc_outreach_drafts:\n' +
      '  \u2022 subject          \u2014 email subject line\n' +
      '  \u2022 recipient_name   \u2014 name captured at draft time\n' +
      '  \u2022 recipient_email  \u2014 email captured at draft time\n' +
      '  \u2022 sent_at          \u2014 set when user manually marks as sent\n\n' +
      'Required for outreach drafts to work. Safe to re-run \u2014 skips columns that already exist.\n' +
      'No existing data is modified.'
    )) return;
    setRunningV2(true);
    setMigV2Error(null);
    setMigV2Result(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-recruiting-v2', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as RecruitingV2MigrationResult;
      setMigV2Result(data);
      void handleCheck();
    } catch (e) {
      setMigV2Error(e instanceof Error ? e.message : 'V2 migration request failed');
    } finally {
      setRunningV2(false);
    }
  }

  async function handleSeed() {
    if (!window.confirm(
      'Seed recruiting data?\n\n' +
      'Imports college programs, ID camps, and showcases from bundled JSON files.\n' +
      'Coaches with unverified names are WITHHELD — only "corrected" status coaches are seeded.\n\n' +
      'Uses INSERT IGNORE — existing rows are skipped (not overwritten). Safe to re-run.\n\n' +
      'Recruiting remains restricted to admin/test accounts until data verification is complete.'
    )) return;
    setSeeding(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const res = await fetch('/api/parent/admin/seed-recruiting', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Guard: parse JSON safely — a non-JSON body (e.g. 502 HTML) must not crash
      let data: RecruitingSeedResult;
      try {
        data = await res.json() as RecruitingSeedResult;
      } catch {
        throw new Error(`Server returned HTTP ${res.status} with a non-JSON body. Check server logs.`);
      }
      if (!res.ok && !data.programs) {
        // Server error with a JSON error body but no table results
        const errBody = data as unknown as { error?: string };
        throw new Error(errBody.error ?? `Seed failed (HTTP ${res.status})`);
      }
      setSeedResult(data);
      // Refresh check so row counts update
      void handleCheck();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Seed request failed');
    } finally {
      setSeeding(false);
    }
  }

  // Derive overall readiness badge from check result
  const allReady = checkResult?.allTablesPresent && checkResult.allColumnsPresent;

  return (
    <PpCard className="mt-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <PpSectionHeading icon={<Database size={14} />} title="Recruiting Database Setup" />
        <span
          className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
        >
          ADMIN ONLY
        </span>
      </div>

      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Creates the six private recruiting tables required by the Recruiting tab.
        All operations use <code>CREATE TABLE IF NOT EXISTS</code> — safe to re-run.
        Does <strong>not</strong> seed data or enable access for non-admin users.
        Existing records are never modified.
      </p>

      {/* ── Step 1: Check ── */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Step 1 — Check recruiting schema
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: 'hsl(var(--pp-blue, 217 91% 60%) / 0.12)', color: 'hsl(var(--pp-blue, 217 91% 60%))' }}
          >
            READ-ONLY
          </span>
        </div>
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Queries the production database directly. Reports table existence, row counts, and
          whether all required columns are present. No writes.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <PpButton variant="outline" size="sm" onClick={() => void handleCheck()} disabled={checking}>
            {checking
              ? <><Loader2 size={12} className="animate-spin" /> Checking…</>
              : <><RefreshCw size={12} /> Check recruiting schema</>}
          </PpButton>
          {checkResult && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: allReady ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--destructive) / 0.12)',
                color:      allReady ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
              }}
            >
              {allReady ? '✓ All tables & columns present' : '⚠ Migration needed'}
            </span>
          )}
        </div>

        {checkError && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
            <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <p className="text-xs break-all" style={{ color: 'hsl(var(--destructive))' }}>{checkError}</p>
          </div>
        )}

        {checkResult && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-3"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
          >
            {/* Summary row */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusIcon ok={checkResult.allTablesPresent} />
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {checkResult.tables.filter(t => t.exists).length} / {checkResult.tables.length} tables present
              </span>
              <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                checked {new Date(checkResult.checkedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Per-table rows */}
            <div className="flex flex-col gap-2">
              {checkResult.tables.map(t => (
                <div key={t.table}>
                  {/* Table header row */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => setExpandedTable(prev => prev === t.table ? null : t.table)}
                  >
                    <StatusIcon ok={t.exists} />
                    <code className="text-[11px] flex-1 text-left" style={{ color: 'hsl(var(--pp-text))' }}>
                      {t.table}
                    </code>
                    <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {t.label}
                    </span>
                    {t.exists && t.rowCount !== null && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--pp-text-muted))' }}
                      >
                        {t.rowCount} rows
                      </span>
                    )}
                    {!t.exists && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
                      >
                        MISSING
                      </span>
                    )}
                    {t.exists && !t.allColumnsPresent && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
                      >
                        COLUMNS MISSING
                      </span>
                    )}
                    {expandedTable === t.table
                      ? <ChevronUp size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      : <ChevronDown size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />}
                  </button>

                  {/* Expanded column list */}
                  {expandedTable === t.table && (
                    <div className="mt-1.5 ml-5 flex flex-col gap-1">
                      {t.exists ? (
                        t.columns.map(col => (
                          <div key={col.name} className="flex items-center gap-2">
                            <StatusIcon ok={col.exists} />
                            <code className="text-[10px]" style={{ color: 'hsl(var(--pp-text))' }}>{col.name}</code>
                            <span className="text-[10px]" style={{ color: col.exists ? 'hsl(var(--pp-text-muted))' : 'hsl(var(--destructive))' }}>
                              {col.exists ? 'present' : 'MISSING — run migration'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>
                          Table does not exist — run migration to create it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Migrate ── */}
      <div
        className="flex flex-col gap-3 pt-4"
        style={{ borderTop: '1px solid hsl(var(--pp-border))' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Step 2 — Run recruiting migration
          </span>
        </div>
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Invokes the existing <code>run-schema-recruiting</code> endpoint.
          Creates only the tables that are missing — existing tables and all their rows are preserved.
          Does <strong>not</strong> seed coach or program data, and does <strong>not</strong> open
          access to non-admin users.
        </p>

        <PpButton
          variant="primary"
          size="sm"
          onClick={() => void handleMigrate()}
          disabled={running || (checkResult?.allTablesPresent === true && checkResult.allColumnsPresent === true)}
        >
          {running
            ? <><Loader2 size={12} className="animate-spin" /> Running migration…</>
            : (checkResult?.allTablesPresent && checkResult.allColumnsPresent)
              ? <><CheckCircle size={12} /> Migration already complete</>
              : 'Run recruiting migration'}
        </PpButton>

        {checkResult?.allTablesPresent && checkResult.allColumnsPresent && (
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            All six tables and their required columns are present. No migration needed.
          </p>
        )}

        {migError && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
            <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <p className="text-xs break-all" style={{ color: 'hsl(var(--destructive))' }}>{migError}</p>
          </div>
        )}

        {migResult && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-2"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
          >
            <div className="flex items-center gap-2">
              <StatusIcon ok={migResult.ok} />
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {migResult.summary.created} created · {migResult.summary.skipped} already existed · {migResult.summary.errors} errors
              </span>
            </div>
            {migResult.results.map(r => (
              <div key={r.table} className="flex items-center gap-2">
                <StatusIcon ok={r.status !== 'error'} />
                <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{r.table}</code>
                <span
                  className="text-[10px]"
                  style={{ color: r.status === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--pp-text-muted))' }}
                >
                  {r.status === 'created' ? 'created'
                    : r.status === 'already_exists' ? 'already existed — no change'
                    : r.status}
                  {r.detail ? ` — ${r.detail}` : ''}
                </span>
              </div>
            ))}
            {migResult.ok && (
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--primary))' }}>
                ✓ Schema ready. Run "Check recruiting schema" above to confirm column state.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Step 2b: V2 migration (outreach draft columns) ── */}
      <div
        className="flex flex-col gap-3 pt-4"
        style={{ borderTop: '1px solid hsl(var(--pp-border))' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Step 2b — Recruiting schema v2 (outreach draft columns)
          </span>
        </div>
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Adds <code>subject</code>, <code>recipient_name</code>, <code>recipient_email</code>, and{' '}
          <code>sent_at</code> to <code>sc_outreach_drafts</code>. Required for outreach drafts to
          work — without these columns every draft POST returns HTTP 500. Safe to re-run; skips
          columns that already exist.
        </p>

        <PpButton
          variant="primary"
          size="sm"
          onClick={() => void handleMigrateV2()}
          disabled={runningV2}
        >
          {runningV2
            ? <><Loader2 size={12} className="animate-spin" /> Running v2 migration…</>
            : migV2Result?.ok
              ? <><CheckCircle size={12} /> V2 migration complete</>
              : 'Run recruiting schema v2'}
        </PpButton>

        {migV2Error && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
            <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <p className="text-xs break-all" style={{ color: 'hsl(var(--destructive))' }}>{migV2Error}</p>
          </div>
        )}

        {migV2Result && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-1.5"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
          >
            <div className="flex items-center gap-2">
              <StatusIcon ok={migV2Result.ok} />
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {migV2Result.summary.added} added · {migV2Result.summary.skipped} already existed · {migV2Result.summary.errors} errors
              </span>
            </div>
            {migV2Result.results.map(r => (
              <div key={r.column} className="flex items-center gap-2">
                <StatusIcon ok={r.status !== 'error'} />
                <code className="text-[11px]" style={{ color: 'hsl(var(--pp-text))' }}>{r.column}</code>
                <span className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {r.status === 'added' ? 'added' : r.status === 'already_exists' ? 'already exists' : `error: ${r.detail ?? ''}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 3: Seed data ── */}
      <div
        className="flex flex-col gap-3 pt-4 mt-2"
        style={{ borderTop: '1px solid hsl(var(--pp-border))' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Step 3 — Seed recruiting data
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
          >
            VERIFY FIRST
          </span>
        </div>
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Imports college programs, verified coaches, ID camps, and showcases from bundled JSON.
          Uses <code>INSERT IGNORE</code> — existing rows are skipped, not overwritten. Safe to re-run.
          Coaches with <code>unverified-name</code> status are <strong>withheld</strong> — not seeded.
          Recruiting remains restricted to admin/test accounts until data is verified.
        </p>

        <PpButton
          variant="primary"
          size="sm"
          onClick={() => void handleSeed()}
          disabled={seeding}
        >
          {seeding
            ? <><Loader2 size={12} className="animate-spin" /> Seeding…</>
            : 'Seed recruiting data'}
        </PpButton>

        {seedError && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
            <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <p className="text-xs break-all" style={{ color: 'hsl(var(--destructive))' }}>{seedError}</p>
          </div>
        )}

        {seedResult && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-2"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
          >
            {/* Overall status badge */}
            <div className="flex items-center gap-2">
              <StatusIcon ok={seedResult.ok} />
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {seedResult.ok ? 'Seed complete' : 'Seed finished with errors'}
              </span>
            </div>

            {/* Source record counts — confirms bundled JSON was loaded (non-zero = good) */}
            {seedResult.fileCounts && (
              <div
                className="rounded px-2 py-1 text-[10px] font-mono"
                style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
              >
                <span className="font-semibold not-italic">Bundled source records: </span>
                {seedResult.fileCounts.programs} programs · {seedResult.fileCounts.coaches} coaches · {seedResult.fileCounts.camps} camps · {seedResult.fileCounts.showcases} showcases
              </div>
            )}

            {/* Per-table counts — guard against undefined table results */}
            {([
              { key: 'programs',  label: 'College programs' },
              { key: 'coaches',   label: 'Coaches' },
              { key: 'camps',     label: 'ID camps' },
              { key: 'showcases', label: 'Showcases' },
            ] as const).map(({ key, label }) => {
              const t = seedResult[key];
              // Guard: if the server returned an unexpected shape, show a safe fallback
              if (!t || typeof t !== 'object') {
                return (
                  <div key={key} className="flex items-center gap-2 flex-wrap">
                    <XCircle size={14} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{label}</span>
                    <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>no data returned</span>
                  </div>
                );
              }
              return (
                <div key={key} className="flex items-center gap-2 flex-wrap">
                  <StatusIcon ok={(t.errors ?? 0) === 0} />
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{label}</span>
                  <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {t.created ?? 0} inserted · {t.skipped ?? 0} skipped · {t.errors ?? 0} errors
                  </span>
                  {key === 'coaches' && Array.isArray(t.withheld) && t.withheld.length > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
                    >
                      {t.withheld.length} withheld (unverified)
                    </span>
                  )}
                  {/* Per-table error details */}
                  {Array.isArray(t.errorDetails) && t.errorDetails.length > 0 && (
                    <div className="w-full ml-5 mt-0.5">
                      {t.errorDetails.slice(0, 5).map((d, i) => (
                        <p key={i} className="text-[10px] break-all" style={{ color: 'hsl(var(--destructive))' }}>{d}</p>
                      ))}
                      {t.errorDetails.length > 5 && (
                        <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          +{t.errorDetails.length - 5} more errors
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Withheld coaches message */}
            {seedResult.withheld && (
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--destructive))' }}>
                {seedResult.withheld.message}
              </p>
            )}
            {!seedResult.withheld && seedResult.ok && (
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--primary))' }}>
                ✓ Recruiting remains restricted to admin/test accounts.
              </p>
            )}
          </div>
        )}

        {/* ── Coverage report ── */}
        <div
          className="mt-4 rounded-xl border p-3 flex flex-col gap-1.5"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
        >
          <p className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Coverage report — as of 2026-10-25
          </p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <strong>Programs:</strong> 63 total (was 61 — added ASU mens, U of Arizona mens).
            All 7 regions covered. No duplicates.
          </p>
          {([
            { region: 'colorado',   programs: 26, coachesVerified: 3,  coachesTotal: 26, contacts: 0, gaps: 'All 23 unverified names; 0 emails/phones' },
            { region: 'arizona',    programs: 7,  coachesVerified: 0,  coachesTotal: 7,  contacts: 0, gaps: 'All 7 names unverified; ASU mens + U of AZ mens added' },
            { region: 'cal-south',  programs: 7,  coachesVerified: 0,  coachesTotal: 7,  contacts: 0, gaps: 'All 7 names unverified; 0 emails/phones' },
            { region: 'cal-north',  programs: 7,  coachesVerified: 0,  coachesTotal: 7,  contacts: 0, gaps: 'All 7 names unverified; 0 emails/phones' },
            { region: 'oregon',     programs: 6,  coachesVerified: 0,  coachesTotal: 6,  contacts: 0, gaps: 'All 6 names unverified; 0 emails/phones' },
            { region: 'washington', programs: 6,  coachesVerified: 0,  coachesTotal: 6,  contacts: 0, gaps: 'All 6 names unverified; 0 emails/phones' },
            { region: 'nevada',     programs: 4,  coachesVerified: 0,  coachesTotal: 4,  contacts: 0, gaps: 'All 4 names unverified; 0 emails/phones' },
          ] as const).map(row => (
            <div key={row.region} className="flex items-start gap-2 text-[10px] font-mono" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span className="w-24 shrink-0 font-semibold">{row.region}</span>
              <span>{row.programs} programs · {row.coachesVerified}/{row.coachesTotal} coaches verified · {row.contacts} contacts</span>
              <span className="ml-auto text-right" style={{ color: row.coachesVerified > 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }}>
                {row.gaps}
              </span>
            </div>
          ))}
          <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <strong>Corrections applied:</strong> CSU URLs fixed (csrams.com → csurams.com);
            Oregon State conference corrected (Pac-12 → ACC, joined 2024);
            GCU mens coach staffPageUrl fixed (was pointing to womens page).
          </p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--destructive))' }}>
            <strong>Not yet verified:</strong> 60/63 coach names unverified. 0/63 programs have
            email or phone contacts. Directory is not complete — do not mark as done.
          </p>
        </div>

        {/* ── Exclusion note ── */}
        <div
          className="mt-4 rounded-xl border p-3 flex flex-col gap-1.5"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-bg))' }}
        >
          <p className="text-xs font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
            Unverified coach exclusion — non-destructive
          </p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            The coaches directory endpoint excludes any coach whose <code>import_key</code> is
            in the unverified set at request time — no rows are deleted. Existing outreach drafts
            and saved opportunities that reference an excluded coach are preserved; the UI labels
            those references <em>"Verification pending."</em>
          </p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            To make a coach visible: update <code>_verificationStatus</code> to{' '}
            <code>"corrected"</code> in <code>college-coaches.json</code>, then re-run Step 3
            (seed). The seed now issues an UPDATE for corrected coaches so existing rows with
            wrong or null names are brought up to date — INSERT IGNORE alone would skip them.
          </p>
          <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Currently verified: <strong>CSU Women's (Keeley Hagen)</strong>,{' '}
            <strong>DU Women's (Julianne Sitch)</strong>,{' '}
            <strong>Air Force Women's (Laura Busby)</strong>.
          </p>
        </div>
      </div>
    </PpCard>
  );
}

/**
 * PpAdminPlayerSoftdeleteSchemaPanel
 * Adds deleted_at column to sc_player_profiles for soft-delete support.
 * Safe to run multiple times.
 */
export function PpAdminPlayerSoftdeleteSchemaPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; steps?: string[]; error?: string } | null>(null);

  async function handleRun() {
    if (!window.confirm(
      'Add deleted_at column to sc_player_profiles?\n\n' +
      'This is an additive migration — safe to run multiple times.\n' +
      'No existing player data is modified.'
    )) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/parent/admin/run-schema-player-softdelete', {
        method: 'POST',
        credentials: 'include',
      });
      setResult(await res.json() as { ok?: boolean; steps?: string[]; error?: string });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <PpCard className="mt-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <PpSectionHeading icon={<Database size={14} />} title="Player Soft-Delete Migration" />
        <span
          className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
        >
          ADMIN ONLY
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        Adds <code>deleted_at</code> to <code>sc_player_profiles</code> so player removal is recoverable.
        Run once after deploying the soft-delete update.
      </p>
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
      >
        {running ? <><Loader2 size={13} className="animate-spin" /> Running…</> : 'Run migration'}
      </button>
      {result && (
        <div className="mt-3 space-y-1">
          {result.steps?.map((s, i) => (
            <p key={i} className="text-xs" style={{ color: result.ok ? 'hsl(var(--pp-green))' : 'hsl(var(--destructive))' }}>
              {s}
            </p>
          ))}
          {result.error && (
            <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{result.error}</p>
          )}
        </div>
      )}
    </PpCard>
  );
}