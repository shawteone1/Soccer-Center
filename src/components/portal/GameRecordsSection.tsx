/**
 * GameRecordsSection — Per-player match performance records.
 *
 * - Add / edit / delete match records
 * - Season filter dropdown
 * - Season totals + lifetime totals
 * - GK stat fields (GA, SV, SO) shown when position is Goalkeeper
 * - tableAvailable gating: shows migration prompt if sc_player_match_records absent
 * - 409 duplicate detection
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, Check, X, ChevronDown,
} from 'lucide-react';
import { PpCard, PpButton, PpSectionHeading } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchRecord {
  id: string;
  match_date: string;
  opponent: string;
  goals:   number | null;
  assists: number | null;
  ga:      number | null;
  saves:   number | null;
  shutouts:number | null;
  notes:   string | null;
  season:  string | null;
}

interface MatchTotals {
  games:   number;
  goals:   number;
  assists: number;
  ga:      number | null;
  saves:   number | null;
  shutouts:number | null;
}

function totals(records: MatchRecord[]): MatchTotals {
  return records.reduce<MatchTotals>(
    (acc, r) => ({
      games:    acc.games + 1,
      goals:    acc.goals   + (r.goals   ?? 0),
      assists:  acc.assists + (r.assists  ?? 0),
      ga:       r.ga      != null ? (acc.ga      ?? 0) + r.ga      : acc.ga,
      saves:    r.saves   != null ? (acc.saves   ?? 0) + r.saves   : acc.saves,
      shutouts: r.shutouts != null ? (acc.shutouts ?? 0) + r.shutouts : acc.shutouts,
    }),
    { games: 0, goals: 0, assists: 0, ga: null, saves: null, shutouts: null }
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const CURRENT_SEASON = '2026-27';

// ─── Component ────────────────────────────────────────────────────────────────

export default function GameRecordsSection({
  playerId,
  position,
  refreshKey,
  onSaved,
}: {
  playerId: string;
  position?: string | null;
  /** Increment to trigger a reload from outside (e.g. after GameDetailsPanel saves). */
  refreshKey?: number;
  /** Called after any save/edit/delete so parent can refresh season totals. */
  onSaved?: () => void;
}) {
  const p = (position ?? '').toLowerCase();
  const isGk = p.includes('goalkeeper') || p.includes('keeper') || p === 'gk';

  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [tableAvailable, setTableAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Season filter
  const [seasonFilter, setSeasonFilter] = useState<string>(CURRENT_SEASON);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<MatchRecord | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formOpponent, setFormOpponent] = useState('');
  const [formGoals, setFormGoals] = useState('');
  const [formAssists, setFormAssists] = useState('');
  const [formGa, setFormGa] = useState('');
  const [formSaves, setFormSaves] = useState('');
  const [formShutouts, setFormShutouts] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSeason, setFormSeason] = useState(CURRENT_SEASON);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/players/${playerId}/match-records`, { credentials: 'include' });
      if (res.status === 404) {
        setTableAvailable(false);
        setRecords([]);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { tableAvailable: boolean; records: MatchRecord[] };
      setTableAvailable(data.tableAvailable);
      setRecords(data.records ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  function resetForm() {
    setFormDate('');
    setFormOpponent('');
    setFormGoals('');
    setFormAssists('');
    setFormGa('');
    setFormSaves('');
    setFormShutouts('');
    setFormNotes('');
    setFormSeason(CURRENT_SEASON);
    setFormError(null);
  }

  function openAdd() {
    setEditRecord(null);
    resetForm();
    setShowForm(true);
  }

  function openEdit(r: MatchRecord) {
    setEditRecord(r);
    setFormDate(r.match_date?.slice(0, 10) ?? '');
    setFormOpponent(r.opponent ?? '');
    setFormGoals(r.goals    != null ? String(r.goals)    : '');
    setFormAssists(r.assists != null ? String(r.assists)  : '');
    setFormGa(r.ga           != null ? String(r.ga)       : '');
    setFormSaves(r.saves     != null ? String(r.saves)    : '');
    setFormShutouts(r.shutouts != null ? String(r.shutouts) : '');
    setFormNotes(r.notes ?? '');
    setFormSeason(r.season ?? CURRENT_SEASON);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formDate) { setFormError('Match date is required.'); return; }
    if (!formOpponent.trim()) { setFormError('Opponent is required.'); return; }

    setFormSaving(true);
    setFormError(null);

    const toNum = (v: string) => v !== '' ? Number(v) : null;

    const body = {
      match_date: formDate,
      opponent:   formOpponent.trim(),
      goals:      toNum(formGoals),
      assists:    toNum(formAssists),
      ga:         toNum(formGa),
      saves:      toNum(formSaves),
      shutouts:   toNum(formShutouts),
      notes:      formNotes.trim() || null,
      season:     formSeason.trim() || null,
    };

    try {
      if (editRecord) {
        const res = await fetch(`/api/parent/players/${playerId}/match-records/${editRecord.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? 'Update failed');
        }
      } else {
        const res = await fetch(`/api/parent/players/${playerId}/match-records`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 409) {
          setFormError('A record for this date and opponent already exists.');
          setFormSaving(false);
          return;
        }
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
      }
      await load();
      setShowForm(false);
      setEditRecord(null);
      onSaved?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/parent/players/${playerId}/match-records/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setRecords(prev => prev.filter(r => r.id !== id));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // Derive season list from records + current season
  const seasons = Array.from(new Set([CURRENT_SEASON, ...records.map(r => r.season).filter(Boolean) as string[]])).sort().reverse();

  const filtered = seasonFilter === 'all' ? records : records.filter(r => r.season === seasonFilter);
  const seasonTotals = totals(filtered);
  const lifetimeTotals = totals(records);

  // ─── Stat totals bar ──────────────────────────────────────────────────────

  function TotalsBar({ t }: { t: MatchTotals }) {
    const outfieldStats = [
      { label: 'Games',   value: t.games },
      { label: 'Goals',   value: t.goals },
      { label: 'Assists', value: t.assists },
    ];
    const gkStats = [
      { label: 'Games',    value: t.games },
      { label: 'GA',       value: t.ga      ?? '—' },
      { label: 'Saves',    value: t.saves   ?? '—' },
      { label: 'Shutouts', value: t.shutouts ?? '—' },
    ];
    const stats = isGk ? gkStats : outfieldStats;
    return (
      <div
        className={`grid gap-2 rounded-xl px-3 py-2.5 mb-4 text-center`}
        style={{
          gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
          background: 'hsl(var(--pp-blue-light))',
        }}
      >
        {stats.map(s => (
          <div key={s.label}>
            <p className="text-base font-bold" style={{ color: 'hsl(var(--pp-navy))' }}>{s.value}</p>
            <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{s.label}</p>
          </div>
        ))}
      </div>
    );
  }

  // ─── Input helper ─────────────────────────────────────────────────────────

  function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>{label}</label>
        <input
          type="number"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
        />
      </div>
    );
  }

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>Game records</PpSectionHeading>
        {!showForm && tableAvailable && (
          <PpButton size="sm" onClick={openAdd}>
            <Plus size={12} />
            Add game
          </PpButton>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {/* Migration prompt */}
      {!loading && tableAvailable === false && (
        <div
          className="rounded-xl border px-4 py-4 text-xs space-y-2"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}
        >
          <p className="font-semibold" style={{ color: 'hsl(var(--pp-navy))' }}>Game records not yet enabled</p>
          <p style={{ color: 'hsl(var(--pp-text-muted))' }}>
            An admin must run the <strong>match records migration</strong> from the admin settings panel before game records can be saved.
          </p>
        </div>
      )}

      {/* Add / edit form */}
      {!loading && tableAvailable && showForm && (
        <div
          className="rounded-xl border p-4 mb-4 space-y-3"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            {editRecord ? 'Edit game record' : 'Add game record'}
          </p>

          {/* Date + Opponent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Date *</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Opponent *</label>
              <input
                type="text"
                value={formOpponent}
                onChange={e => setFormOpponent(e.target.value)}
                placeholder="e.g. FC Denver"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
          </div>

          {/* Outfield stats */}
          {!isGk && (
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Goals"   value={formGoals}   onChange={setFormGoals} />
              <NumInput label="Assists" value={formAssists} onChange={setFormAssists} />
            </div>
          )}

          {/* Goalkeeper stats */}
          {isGk && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Goalkeeper stats
              </p>
              <div className="grid grid-cols-3 gap-3">
                <NumInput label="Goals against (GA)" value={formGa}       onChange={setFormGa} />
                <NumInput label="Saves (SV)"          value={formSaves}    onChange={setFormSaves} />
                <NumInput label="Shutout (SO)"         value={formShutouts} onChange={setFormShutouts} />
              </div>
            </>
          )}

          {/* Season */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Season</label>
            <input
              type="text"
              value={formSeason}
              onChange={e => setFormSeason(e.target.value)}
              placeholder="e.g. 2026-27"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Notes</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about the game"
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
            />
          </div>

          {formError && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'hsl(var(--destructive))' }}>
              <AlertCircle size={12} />{formError}
            </p>
          )}

          <div className="flex gap-2">
            <PpButton size="sm" onClick={handleSave} disabled={formSaving}>
              {formSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {editRecord ? 'Save changes' : 'Add record'}
            </PpButton>
            <PpButton size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditRecord(null); }}>
              <X size={12} />
              Cancel
            </PpButton>
          </div>
        </div>
      )}

      {/* Season filter + totals */}
      {!loading && tableAvailable && records.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="relative">
              <select
                value={seasonFilter}
                onChange={e => setSeasonFilter(e.target.value)}
                className="appearance-none rounded-lg border pl-3 pr-7 py-1.5 text-xs font-medium"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              >
                <option value="all">All seasons</option>
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </div>
            <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {filtered.length} game{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          <TotalsBar t={seasonTotals} />

          {/* Lifetime totals (only when a season is selected and there are more records) */}
          {seasonFilter !== 'all' && records.length > filtered.length && (
            <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span className="font-medium">Lifetime:</span>
              <span>{lifetimeTotals.games} games</span>
              {isGk ? (
                <>
                  <span>{lifetimeTotals.ga ?? '—'} GA</span>
                  <span>{lifetimeTotals.saves ?? '—'} SV</span>
                  <span>{lifetimeTotals.shutouts ?? '—'} SO</span>
                </>
              ) : (
                <>
                  <span>{lifetimeTotals.goals} goals</span>
                  <span>{lifetimeTotals.assists} assists</span>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Records list */}
      {!loading && tableAvailable && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(r => (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>vs {r.opponent}</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {formatDate(r.match_date)}
                  {!isGk && r.goals   != null && ` · ${r.goals}G`}
                  {!isGk && r.assists != null && ` ${r.assists}A`}
                  {isGk  && r.ga      != null && ` · ${r.ga} GA`}
                  {isGk  && r.saves   != null && ` · ${r.saves} SV`}
                  {isGk  && r.shutouts != null && ` · ${r.shutouts} SO`}
                </p>
                {r.notes && <p className="text-xs mt-0.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>{r.notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-muted"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Edit record"
                >
                  <Pencil size={13} />
                </button>
                {confirmDeleteId === r.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]" style={{ color: 'hsl(var(--destructive))' }}>Delete?</span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
                    >
                      {deletingId === r.id ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                      style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(r.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-destructive/10"
                    style={{ color: 'hsl(var(--destructive))' }}
                    aria-label="Delete record"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && tableAvailable && records.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>No game records yet</p>
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {isGk ? 'Track GA, saves, and shutouts for each match.' : 'Track goals, assists, and notes for each match.'}
          </p>
          <PpButton size="sm" onClick={openAdd}>
            <Plus size={12} />
            Add first game
          </PpButton>
        </div>
      )}
    </PpCard>
  );
}
