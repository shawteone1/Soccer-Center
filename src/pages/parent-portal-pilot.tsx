/**
 * Parent Portal — PlayMetrics Integration Pilot
 *
 * Route: /parent-portal/pilot
 * Access: Admin-only (isAdmin required)
 * Layout: PortalLayout (same as parent-portal)
 *
 * This is a demonstrable pilot of the team-to-player workflow.
 * ALL data is fictional demo data — not connected to PlayMetrics.
 *
 * Flow: Region → Club → Season → Team → Player → Games → Individual stats
 *
 * Storage: In-memory server store (resets on server restart).
 * This is clearly communicated in the UI.
 *
 * Reference identifiers (for future authorized integration):
 *   Governing body: 1017 | League: 1829 | Provider team: 39137
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSession } from '@/lib/auth/auth-client';
import {
  AlertTriangle, CheckCircle2, ChevronRight,
  Loader2, Plus, Pencil, Trash2, RotateCcw, Info,
  Calendar, MapPin, Trophy, User, Shield, Clock,
  ArrowLeft, Check, X,
} from 'lucide-react';
import {
  PpCard, PpSectionHeading, PpButton, PpBadge,
} from '@/components/portal/PpPrimitives';

// ─── Types (mirrored from server/pilot/types.ts) ──────────────────────────────

interface PilotFixture {
  id: string;
  providerTeamId: string;
  date: string;
  time?: string;
  opponent: string;
  venue?: string;
  isHome: boolean;
  status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
  teamScore?: number | null;
  opponentScore?: number | null;
  competition?: string;
  season: string;
}

interface PilotTeam {
  id: string;
  providerTeamId: string;
  name: string;
  clubName: string;
  clubId?: string;
  season: string;
  competition?: string;
  ageGroup?: string;
  region?: string;
}

interface PilotSeason {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface PilotGameRecord {
  id: string;
  playerId: string;
  fixtureId: string;
  participated: boolean;
  goals: number | null;
  assists: number | null;
  ga: number | null;
  saves: number | null;
  shutouts: number | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  fixture?: PilotFixture | null;
}

interface PilotTotals {
  gp: number;
  goals: number;
  assists: number;
  ga: number | null;
  saves: number | null;
  shutouts: number | null;
}

interface PlayerProfile {
  id: string;
  label: string | null;
  primaryPosition: string | null;
  ageBand: string | null;
  clubName: string | null;
}

interface ConnectorState {
  mode: string;
  lastRefreshed?: string;
  lastRefreshError?: string;
  sourceLabel: string;
  sourceRef?: {
    governingBody?: string;
    league?: string;
    providerTeamId?: string;
  };
}

// ─── Step type ────────────────────────────────────────────────────────────────

type PilotStep = 'select-player' | 'select-team' | 'preview-schedule' | 'game-list' | 'game-detail';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function formatDate(iso: string) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function statusBadge(status: PilotFixture['status']) {
  switch (status) {
    case 'completed':  return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">Completed</span>;
    case 'scheduled':  return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">Scheduled</span>;
    case 'cancelled':  return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Cancelled</span>;
    case 'postponed':  return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">Postponed</span>;
  }
}

// ─── Demo banner ──────────────────────────────────────────────────────────────

function DemoBanner({ connector }: { connector: ConnectorState | null }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
      <div>
        <span className="font-semibold">Demo data — not connected to PlayMetrics.</span>
        {connector?.sourceRef && (
          <span className="ml-2 text-amber-700 text-xs">
            Reference: governing body {connector.sourceRef.governingBody}, league {connector.sourceRef.league}, team {connector.sourceRef.providerTeamId}
          </span>
        )}
        <div className="mt-0.5 text-xs text-amber-600">
          All fixtures, teams, and clubs are fictional. Player stats are stored in server memory and reset on restart.
        </div>
      </div>
    </div>
  );
}

// ─── Stats form ───────────────────────────────────────────────────────────────

interface StatsFormProps {
  fixture: PilotFixture;
  existing?: PilotGameRecord;
  playerId: string;
  isGK: boolean;
  onSave: (record: PilotGameRecord, totals: PilotTotals) => void;
  onCancel: () => void;
}

function StatsForm({ fixture, existing, playerId, isGK, onSave, onCancel }: StatsFormProps) {
  const [participated, setParticipated] = useState(existing?.participated ?? false);
  const [goals, setGoals]     = useState<string>(existing?.goals   != null ? String(existing.goals)   : '');
  const [assists, setAssists] = useState<string>(existing?.assists != null ? String(existing.assists) : '');
  const [ga, setGa]           = useState<string>(existing?.ga      != null ? String(existing.ga)      : '');
  const [saves, setSaves]     = useState<string>(existing?.saves   != null ? String(existing.saves)   : '');
  const [shutouts, setShutouts] = useState<string>(existing?.shutouts != null ? String(existing.shutouts) : '');
  const [notes, setNotes]     = useState(existing?.notes ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function parseNum(s: string): number | null {
    if (s === '') return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : Math.max(0, n);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const body = {
        playerId,
        fixtureId: fixture.id,
        participated,
        goals:    parseNum(goals),
        assists:  parseNum(assists),
        ga:       parseNum(ga),
        saves:    parseNum(saves),
        shutouts: parseNum(shutouts),
        notes:    notes || undefined,
      };

      let res: Response;
      if (existing) {
        res = await apiFetch(`/api/parent/pilot/records/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch('/api/parent/pilot/records', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Failed to save');
        return;
      }
      const d = await res.json();
      onSave(d.record, d.totals);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <div className="font-semibold text-gray-800">{fixture.opponent}</div>
        <div className="text-gray-500 text-xs mt-0.5">{formatDate(fixture.date)}{fixture.time ? ` · ${fixture.time}` : ''} · {fixture.isHome ? 'Home' : 'Away'}</div>
        {fixture.venue && <div className="text-gray-500 text-xs">{fixture.venue}</div>}
      </div>

      {/* Participation toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            role="checkbox"
            aria-checked={participated}
            tabIndex={0}
            onClick={() => setParticipated(p => !p)}
            onKeyDown={e => e.key === ' ' && setParticipated(p => !p)}
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer ${participated ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${participated ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">Player participated in this game</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-13">
          Scheduled games do not automatically count as played. Only confirmed participation is included in totals.
        </p>
      </div>

      {participated && (
        <div className="space-y-3">
          {isGK ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Goals allowed</label>
                  <input type="number" min="0" value={ga} onChange={e => setGa(e.target.value)}
                    placeholder="—"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Saves</label>
                  <input type="number" min="0" value={saves} onChange={e => setSaves(e.target.value)}
                    placeholder="—"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Shutout</label>
                  <input type="number" min="0" max="1" value={shutouts} onChange={e => setShutouts(e.target.value)}
                    placeholder="—"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Goals</label>
                <input type="number" min="0" value={goals} onChange={e => setGoals(e.target.value)}
                  placeholder="—"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assists</label>
                <input type="number" min="0" value={assists} onChange={e => setAssists(e.target.value)}
                  placeholder="—"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any notes about this game..."
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {existing ? 'Update stats' : 'Save stats'}
        </button>
      </div>
    </div>
  );
}

// ─── Totals bar ───────────────────────────────────────────────────────────────

function TotalsBar({ totals, isGK }: { totals: PilotTotals; isGK: boolean }) {
  return (
    <div className="flex items-center gap-6 rounded-lg border border-gray-200 bg-white px-5 py-3">
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900">{totals.gp}</div>
        <div className="text-xs text-gray-500 uppercase tracking-wide">GP</div>
      </div>
      {isGK ? (
        <>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totals.ga ?? '—'}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">GA</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totals.saves ?? '—'}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">SV</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totals.shutouts ?? '—'}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">SO</div>
          </div>
        </>
      ) : (
        <>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totals.goals}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">G</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totals.assists}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">A</div>
          </div>
        </>
      )}
      <div className="ml-auto text-xs text-gray-400 italic">Pilot totals · demo only</div>
    </div>
  );
}

// ─── Connector info panel ─────────────────────────────────────────────────────

function ConnectorPanel({ connector, onReset }: { connector: ConnectorState | null; onReset: () => void }) {
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  async function handleReset() {
    if (!confirm('Reset the demo store? All pilot assignments and game records will be cleared.')) return;
    setResetting(true);
    try {
      const res = await apiFetch('/api/parent/pilot/reset', { method: 'POST' });
      const d = await res.json();
      setResetMsg(d.message ?? 'Reset complete');
      onReset();
    } catch {
      setResetMsg('Reset failed');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Shield size={14} className="text-blue-500" />
          Connector
        </h3>
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 uppercase tracking-wide">
          {connector?.mode ?? 'demo'}
        </span>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <div><span className="font-medium">Source:</span> {connector?.sourceLabel ?? 'Demo data'}</div>
        {connector?.lastRefreshed && (
          <div><span className="font-medium">Last refreshed:</span> {new Date(connector.lastRefreshed).toLocaleString()}</div>
        )}
        {connector?.lastRefreshError && (
          <div className="text-red-600"><span className="font-medium">Last error:</span> {connector.lastRefreshError}</div>
        )}
        {connector?.sourceRef && (
          <div className="pt-1 border-t border-gray-100">
            <span className="font-medium">Reference IDs</span> (for future authorized integration):<br />
            Governing body: {connector.sourceRef.governingBody} · League: {connector.sourceRef.league} · Team: {connector.sourceRef.providerTeamId}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <div className="text-xs font-medium text-gray-600">Connector modes</div>
        <div className="space-y-1">
          {[
            { mode: 'demo', label: 'Demo', desc: 'Active — fictional data, in-memory store', active: true },
            { mode: 'authorized_import', label: 'Authorized import', desc: 'Pending — normalized file import with validation', active: false },
            { mode: 'partner_api', label: 'Partner API', desc: 'Disabled — requires PlayMetrics approved access', active: false },
          ].map(m => (
            <div key={m.mode} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${m.active ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-100'}`}>
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${m.active ? 'bg-blue-500' : 'bg-gray-300'}`} />
              <div>
                <span className="font-medium">{m.label}</span>
                <span className="text-gray-500 ml-1">— {m.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <button type="button" onClick={handleReset} disabled={resetting}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 disabled:opacity-50">
          {resetting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          Reset demo store
        </button>
        {resetMsg && <p className="text-xs text-gray-500 mt-1">{resetMsg}</p>}
        <p className="text-xs text-gray-400 mt-1">
          Clears all pilot assignments and game records from server memory.
          Data resets automatically on server restart.
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ParentPortalPilotPage() {
  const { user, isPending, isAuthenticated } = useSession();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<PilotStep>('select-player');
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [teams, setTeams] = useState<PilotTeam[]>([]);
  const [seasons, setSeasons] = useState<PilotSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('season-fall-2026');
  const [selectedTeam, setSelectedTeam] = useState<PilotTeam | null>(null);
  const [fixtures, setFixtures] = useState<PilotFixture[]>([]);
  const [connector, setConnector] = useState<ConnectorState | null>(null);
  const [records, setRecords] = useState<PilotGameRecord[]>([]);
  const [totals, setTotals] = useState<PilotTotals | null>(null);
  const [selectedFixture, setSelectedFixture] = useState<PilotFixture | null>(null);
  const [editingRecord, setEditingRecord] = useState<PilotGameRecord | null | undefined>(undefined); // undefined = not editing; null = new
  const [assignment, setAssignment] = useState<{ pilotTeamId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isGK = selectedPlayer?.primaryPosition?.toLowerCase().includes('goalkeeper') ||
               selectedPlayer?.primaryPosition?.toLowerCase().includes('gk') || false;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPending && isAuthenticated && !user?.isAdmin) {
      navigate('/parent-portal');
    }
  }, [isPending, isAuthenticated, user, navigate]);

  // ── Load players ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.isAdmin) return;
    apiFetch('/api/parent/players')
      .then(r => r.json())
      .then(d => setPlayers(d.players ?? []))
      .catch(() => {});
  }, [user]);

  // ── Load teams + seasons ───────────────────────────────────────────────────
  const loadTeams = useCallback(async () => {
    try {
      const r = await apiFetch('/api/parent/pilot/teams');
      const d = await r.json();
      setTeams(d.teams ?? []);
      setSeasons(d.seasons ?? []);
      setConnector(d.connector ?? null);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  // ── Load fixtures for selected team/season ─────────────────────────────────
  const loadFixtures = useCallback(async (teamId: string, season: string) => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/parent/pilot/fixtures?teamId=${teamId}&season=${season}`);
      const d = await r.json();
      setFixtures(d.fixtures ?? []);
      setConnector(d.connector ?? connector);
    } catch {
      setError('Failed to load fixtures');
    } finally {
      setLoading(false);
    }
  }, [connector]);

  // ── Load records for selected player ──────────────────────────────────────
  const loadRecords = useCallback(async (playerId: string) => {
    try {
      const r = await apiFetch(`/api/parent/pilot/records?playerId=${playerId}`);
      const d = await r.json();
      setRecords(d.records ?? []);
      setTotals(d.totals ?? null);
    } catch { /* non-fatal */ }
  }, []);

  // ── Load assignment for selected player ────────────────────────────────────
  const loadAssignment = useCallback(async (playerId: string) => {
    try {
      const r = await apiFetch(`/api/parent/pilot/assignment?playerId=${playerId}`);
      const d = await r.json();
      setAssignment(d.assignment);
      if (d.team) setSelectedTeam(d.team);
    } catch { /* non-fatal */ }
  }, []);

  // ── Select player ──────────────────────────────────────────────────────────
  async function handleSelectPlayer(player: PlayerProfile) {
    setSelectedPlayer(player);
    setStep('select-team');
    await loadAssignment(player.id);
    await loadRecords(player.id);
  }

  // ── Select team ────────────────────────────────────────────────────────────
  async function handleSelectTeam(team: PilotTeam) {
    setSelectedTeam(team);
    await loadFixtures(team.id, selectedSeason);
    setStep('preview-schedule');
  }

  // ── Confirm assignment + calendar sync ────────────────────────────────────
  async function handleConfirmAssignment() {
    if (!selectedPlayer || !selectedTeam) return;
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/parent/pilot/assignment', {
        method: 'POST',
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          pilotTeamId: selectedTeam.id,
          calendarSynced: true,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? 'Failed to assign team');
        return;
      }
      const d = await r.json();
      setAssignment(d.assignment);
      await loadRecords(selectedPlayer.id);
      setStep('game-list');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  // ── Delete record ──────────────────────────────────────────────────────────
  async function handleDeleteRecord(recordId: string) {
    if (!confirm('Delete this game record? This cannot be undone.')) return;
    setDeletingId(recordId);
    try {
      const r = await apiFetch(`/api/parent/pilot/records/${recordId}`, { method: 'DELETE' });
      const d = await r.json();
      setTotals(d.totals);
      setRecords(prev => prev.filter(rec => rec.id !== recordId));
    } catch { /* non-fatal */ }
    finally { setDeletingId(null); }
  }

  // ── Reset handler ──────────────────────────────────────────────────────────
  function handleReset() {
    setStep('select-player');
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setFixtures([]);
    setRecords([]);
    setTotals(null);
    setAssignment(null);
    setSelectedFixture(null);
    setEditingRecord(undefined);
    loadTeams();
  }

  // ── Auth loading ───────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  // Not authenticated at all — redirect to login
  if (!isAuthenticated) {
    navigate('/login/auth?returnTo=/parent-portal/pilot', { replace: true });
    return null;
  }

  // Authenticated but not admin — show a clear message instead of silent redirect
  if (!user?.isAdmin) {
    return (
      <div className="pp-shell min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--pp-bg))' }}>
        <div className="max-w-sm text-center space-y-4 px-6">
          <Shield size={40} className="mx-auto text-gray-300" />
          <h1 className="text-lg font-bold text-gray-800">Admin access required</h1>
          <p className="text-sm text-gray-500">
            Your account (<strong>{user?.email}</strong>) does not have admin access.
            The PlayMetrics pilot is restricted to admin accounts only.
          </p>
          <p className="text-xs text-gray-400">
            If you believe this is an error, use the grant-self-admin endpoint or contact the site owner.
          </p>
          <button
            type="button"
            onClick={() => navigate('/parent-portal')}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Back to Parent Portal
          </button>
        </div>
      </div>
    );
  }

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumbs: { label: string; step: PilotStep }[] = [
    { label: 'Select player', step: 'select-player' },
    { label: 'Select team', step: 'select-team' },
    { label: 'Preview schedule', step: 'preview-schedule' },
    { label: 'Game records', step: 'game-list' },
  ];
  const stepIndex = breadcrumbs.findIndex(b => b.step === step);

  return (
    <>
      <Helmet>
        <title>Integration Pilot — Soccer Center Parent Portal</title>
        <meta name="description" content="Admin-only PlayMetrics integration pilot: team-to-player workflow demonstration using demo data." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="pp-shell min-h-screen" style={{ background: 'hsl(var(--pp-bg))' }}>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <button type="button" onClick={() => navigate('/parent-portal')}
                  className="hover:text-blue-600 flex items-center gap-1">
                  <ArrowLeft size={12} /> Parent Portal
                </button>
                <ChevronRight size={12} />
                <span className="text-gray-700 font-medium">Integration Pilot</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">PlayMetrics Integration Pilot</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Team-to-player workflow demonstration · Admin only
              </p>
            </div>
            <span className="shrink-0"><PpBadge variant="warning">Demo mode</PpBadge></span>
          </div>

          {/* Demo banner — always visible */}
          <DemoBanner connector={connector} />

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs">
            {breadcrumbs.map((b, i) => (
              <span key={b.step} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
                <button
                  type="button"
                  onClick={() => i < stepIndex && setStep(b.step)}
                  className={`px-2 py-1 rounded ${i === stepIndex
                    ? 'bg-blue-100 text-blue-700 font-semibold'
                    : i < stepIndex
                      ? 'text-blue-600 hover:underline cursor-pointer'
                      : 'text-gray-400 cursor-default'}`}
                >
                  {i < stepIndex && <Check size={10} className="inline mr-1" />}
                  {b.label}
                </button>
              </span>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              <AlertTriangle size={14} /> {error}
              <button type="button" onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-4">

              {/* ── Step 1: Select player ── */}
              {step === 'select-player' && (
                <PpCard>
                  <PpSectionHeading icon={<User size={16} />}>Select a player</PpSectionHeading>
                  <p className="text-sm text-gray-500 mb-4">
                    Choose which player to associate with a pilot team. This does not modify any official roster.
                  </p>
                  {players.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No players found. Add a player in the Players tab first.</p>
                  ) : (
                    <div className="space-y-2">
                      {players.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPlayer(p)}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                        >
                          <div>
                            <div className="font-medium text-gray-800">{p.label ?? 'Unnamed player'}</div>
                            <div className="text-xs text-gray-500">
                              {[p.primaryPosition, p.ageBand, p.clubName].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-gray-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </PpCard>
              )}

              {/* ── Step 2: Select team ── */}
              {step === 'select-team' && selectedPlayer && (
                <PpCard>
                  <div className="flex items-center gap-2 mb-1">
                    <button type="button" onClick={() => setStep('select-player')}
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                      <ArrowLeft size={14} /> Back
                    </button>
                  </div>
                  <PpSectionHeading icon={<Trophy size={16} />}>
                    Select a team for {selectedPlayer.label ?? 'player'}
                  </PpSectionHeading>

                  {/* Season selector */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Season</label>
                    <select
                      value={selectedSeason}
                      onChange={e => setSelectedSeason(e.target.value)}
                      className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {seasons.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    {teams.filter(t => t.season === selectedSeason).map(team => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => handleSelectTeam(team)}
                        className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-gray-800">{team.name}</div>
                          <div className="text-xs text-gray-500">
                            {[team.clubName, team.competition, team.ageGroup].filter(Boolean).join(' · ')}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Provider team ID: {team.providerTeamId}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                      </button>
                    ))}
                    {teams.filter(t => t.season === selectedSeason).length === 0 && (
                      <p className="text-sm text-gray-400 italic">No teams available for this season.</p>
                    )}
                  </div>
                </PpCard>
              )}

              {/* ── Step 3: Preview schedule ── */}
              {step === 'preview-schedule' && selectedTeam && (
                <PpCard>
                  <div className="flex items-center gap-2 mb-1">
                    <button type="button" onClick={() => setStep('select-team')}
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                      <ArrowLeft size={14} /> Back
                    </button>
                  </div>
                  <PpSectionHeading icon={<Calendar size={16} />}>
                    Schedule preview — {selectedTeam.name}
                  </PpSectionHeading>
                  <p className="text-sm text-gray-500 mb-4">
                    Review the team schedule before assigning it to{' '}
                    <strong>{selectedPlayer?.label ?? 'player'}</strong>'s calendar.
                    This does not modify the official roster.
                  </p>

                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                  ) : (
                    <div className="space-y-2 mb-5">
                      {fixtures.map(f => (
                        <div key={f.id}
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{f.opponent}</div>
                            <div className="text-xs text-gray-500">
                              {formatDate(f.date)}{f.time ? ` · ${f.time}` : ''} · {f.isHome ? 'Home' : 'Away'}
                            </div>
                            {f.venue && <div className="text-xs text-gray-400">{f.venue}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            {f.status === 'completed' && f.teamScore != null && (
                              <span className="text-xs font-semibold text-gray-700">
                                {f.teamScore}–{f.opponentScore}
                              </span>
                            )}
                            {statusBadge(f.status)}
                          </div>
                        </div>
                      ))}
                      {fixtures.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No fixtures found for this team/season.</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                    <button type="button" onClick={() => setStep('select-team')}
                      className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
                      Choose different team
                    </button>
                    <button type="button" onClick={handleConfirmAssignment} disabled={loading}
                      className="px-5 py-2 text-sm rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {loading && <Loader2 size={14} className="animate-spin" />}
                      <Check size={14} />
                      Confirm &amp; add to calendar
                    </button>
                  </div>
                </PpCard>
              )}

              {/* ── Step 4: Game list ── */}
              {step === 'game-list' && selectedPlayer && (
                <div className="space-y-4">
                  <PpCard>
                    <div className="flex items-center justify-between mb-3">
                      <PpSectionHeading icon={<Trophy size={16} />}>
                        {selectedPlayer.label ?? 'Player'} — {selectedTeam?.name}
                      </PpSectionHeading>
                      <button type="button" onClick={() => setStep('select-team')}
                        className="text-xs text-blue-600 hover:underline">Change team</button>
                    </div>

                    {totals && <TotalsBar totals={totals} isGK={isGK} />}
                  </PpCard>

                  {/* Completed games */}
                  <PpCard>
                    <PpSectionHeading icon={<CheckCircle2 size={16} className="text-green-600" />}>
                      Completed games
                    </PpSectionHeading>
                    <div className="space-y-2">
                      {fixtures.filter(f => f.status === 'completed').map(f => {
                        const rec = records.find(r => r.fixtureId === f.id);
                        return (
                          <div key={f.id}
                            className="rounded-lg border border-gray-200 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setSelectedFixture(f); setStep('game-detail'); }}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                            >
                              <div>
                                <div className="font-medium text-gray-800 text-sm">{f.opponent}</div>
                                <div className="text-xs text-gray-500">
                                  {formatDate(f.date)} · {f.isHome ? 'Home' : 'Away'}
                                  {f.teamScore != null && ` · ${f.teamScore}–${f.opponentScore}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {rec ? (
                                  <div className="text-xs text-gray-600 text-right">
                                    {rec.participated ? (
                                      isGK ? (
                                        <span>{rec.ga ?? '—'} GA · {rec.saves ?? '—'} SV</span>
                                      ) : (
                                        <span>{rec.goals ?? 0}G · {rec.assists ?? 0}A</span>
                                      )
                                    ) : (
                                      <span className="text-gray-400">Did not play</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 font-medium">Add stats</span>
                                )}
                                <ChevronRight size={14} className="text-gray-400" />
                              </div>
                            </button>
                          </div>
                        );
                      })}
                      {fixtures.filter(f => f.status === 'completed').length === 0 && (
                        <p className="text-sm text-gray-400 italic">No completed games yet.</p>
                      )}
                    </div>
                  </PpCard>

                  {/* Upcoming fixtures */}
                  <PpCard>
                    <PpSectionHeading icon={<Clock size={16} className="text-blue-500" />}>
                      Upcoming fixtures
                    </PpSectionHeading>
                    <div className="space-y-2">
                      {fixtures.filter(f => f.status === 'scheduled').map(f => (
                        <div key={f.id}
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{f.opponent}</div>
                            <div className="text-xs text-gray-500">
                              {formatDate(f.date)}{f.time ? ` · ${f.time}` : ''} · {f.isHome ? 'Home' : 'Away'}
                            </div>
                            {f.venue && (
                              <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                <MapPin size={10} /> {f.venue}
                              </div>
                            )}
                          </div>
                          {statusBadge(f.status)}
                        </div>
                      ))}
                      {fixtures.filter(f => f.status === 'scheduled').length === 0 && (
                        <p className="text-sm text-gray-400 italic">No upcoming fixtures.</p>
                      )}
                    </div>
                  </PpCard>
                </div>
              )}

              {/* ── Step 5: Game detail ── */}
              {step === 'game-detail' && selectedFixture && selectedPlayer && (
                <PpCard>
                  <div className="flex items-center gap-2 mb-3">
                    <button type="button" onClick={() => { setStep('game-list'); setEditingRecord(undefined); }}
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                      <ArrowLeft size={14} /> Back to games
                    </button>
                  </div>

                  {/* Fixture detail */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 mb-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{selectedFixture.opponent}</div>
                        <div className="text-sm text-gray-500">
                          {selectedFixture.isHome ? 'Home' : 'Away'} · {selectedFixture.competition}
                        </div>
                      </div>
                      {statusBadge(selectedFixture.status)}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wide">Date</div>
                        <div className="font-medium">{formatDate(selectedFixture.date)}{selectedFixture.time ? ` · ${selectedFixture.time}` : ''}</div>
                      </div>
                      {selectedFixture.venue && (
                        <div>
                          <div className="text-xs text-gray-400 uppercase tracking-wide">Venue</div>
                          <div className="font-medium">{selectedFixture.venue}</div>
                        </div>
                      )}
                      {selectedFixture.status === 'completed' && selectedFixture.teamScore != null && (
                        <div>
                          <div className="text-xs text-gray-400 uppercase tracking-wide">Team result</div>
                          <div className="font-bold text-gray-900">
                            {selectedFixture.teamScore}–{selectedFixture.opponentScore}
                            <span className="text-xs font-normal text-gray-500 ml-1">(team score only)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Player stats section */}
                  {(() => {
                    const rec = records.find(r => r.fixtureId === selectedFixture.id);
                    if (editingRecord !== undefined) {
                      return (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">
                            {editingRecord ? 'Edit player stats' : 'Add player stats'}
                          </h3>
                          <StatsForm
                            fixture={selectedFixture}
                            existing={editingRecord ?? undefined}
                            playerId={selectedPlayer.id}
                            isGK={isGK}
                            onSave={(record, newTotals) => {
                              setRecords(prev => {
                                const idx = prev.findIndex(r => r.id === record.id);
                                if (idx >= 0) {
                                  const next = [...prev];
                                  next[idx] = { ...record, fixture: selectedFixture };
                                  return next;
                                }
                                return [...prev, { ...record, fixture: selectedFixture }];
                              });
                              setTotals(newTotals);
                              setEditingRecord(undefined);
                            }}
                            onCancel={() => setEditingRecord(undefined)}
                          />
                        </div>
                      );
                    }

                    if (rec) {
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">Player stats</h3>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setEditingRecord(rec)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <Pencil size={12} /> Edit
                              </button>
                              <button type="button" onClick={() => handleDeleteRecord(rec.id)}
                                disabled={deletingId === rec.id}
                                className="flex items-center gap-1 text-xs text-red-500 hover:underline disabled:opacity-50">
                                {deletingId === rec.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                Delete
                              </button>
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
                            <div className="flex items-center gap-2">
                              {rec.participated
                                ? <CheckCircle2 size={14} className="text-green-500" />
                                : <X size={14} className="text-gray-400" />}
                              <span className="text-sm font-medium">
                                {rec.participated ? 'Participated' : 'Did not participate'}
                              </span>
                            </div>
                            {rec.participated && (
                              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                                {isGK ? (
                                  <>
                                    <div className="text-center">
                                      <div className="text-xl font-bold">{rec.ga ?? '—'}</div>
                                      <div className="text-xs text-gray-500">GA</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold">{rec.saves ?? '—'}</div>
                                      <div className="text-xs text-gray-500">Saves</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold">{rec.shutouts ?? '—'}</div>
                                      <div className="text-xs text-gray-500">SO</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-center">
                                      <div className="text-xl font-bold">{rec.goals ?? '—'}</div>
                                      <div className="text-xs text-gray-500">Goals</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold">{rec.assists ?? '—'}</div>
                                      <div className="text-xs text-gray-500">Assists</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {rec.notes && (
                              <p className="text-xs text-gray-500 italic pt-1 border-t border-gray-100">{rec.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Player stats</h3>
                        <p className="text-sm text-gray-500 mb-3">
                          No stats recorded yet for this game.
                          {selectedFixture.status === 'scheduled' && (
                            <span className="text-amber-600 ml-1">
                              This game is still scheduled — participation must be confirmed explicitly.
                            </span>
                          )}
                        </p>
                        <PpButton variant="primary" size="sm" onClick={() => setEditingRecord(null)}>
                          <Plus size={14} className="mr-1" /> Add player stats
                        </PpButton>
                      </div>
                    );
                  })()}
                </PpCard>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Player summary */}
              {selectedPlayer && (
                <PpCard>
                  <PpSectionHeading icon={<User size={14} />}>Player</PpSectionHeading>
                  <div className="text-sm font-semibold text-gray-800">{selectedPlayer.label ?? 'Unnamed'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[selectedPlayer.primaryPosition, selectedPlayer.ageBand].filter(Boolean).join(' · ')}
                  </div>
                  {assignment && selectedTeam && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                      <CheckCircle2 size={12} className="inline text-green-500 mr-1" />
                      Assigned to <strong>{selectedTeam.name}</strong>
                    </div>
                  )}
                </PpCard>
              )}

              {/* Connector panel */}
              <ConnectorPanel connector={connector} onReset={handleReset} />

              {/* Media roadmap */}
              <PpCard>
                <PpSectionHeading icon={<Info size={14} />}>Next increment</PpSectionHeading>
                <p className="text-xs text-gray-500 mb-2">Planned for a future pilot phase (not in this build):</p>
                <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                  <li>Account-level photo/video library</li>
                  <li>Assign media to players, seasons, games</li>
                  <li>Private visibility and deliberate sharing</li>
                  <li>Highlights from season or date range</li>
                  <li>Clip selection, trimming, ordering, preview, export</li>
                </ul>
                <p className="text-xs text-gray-400 mt-2 italic">
                  Video rendering and camera-provider integrations excluded from first pilot.
                </p>
              </PpCard>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
