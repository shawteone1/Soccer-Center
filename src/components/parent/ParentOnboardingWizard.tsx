/**
 * ParentOnboardingWizard
 *
 * Guided parent profile setup — mirrors the Fan profile's dark navy/stadium
 * visual style: bg-card cards, border-border, text-primary green accents,
 * font-heading Barlow Condensed, rounded-2xl panels.
 *
 * Steps:
 *   1  Privacy & acknowledgements
 *   2  Add players (name, age band, age) — add up to 10
 *   3  Per-player: club/team, season, age group, positions, goals
 *   4  Per-player: training preferences (skippable)
 *   5  Parent-level: clubs, teams, community resources, vendors
 *   6  Tryouts — Colorado on by default, remembered toggle
 *   7  Calendar — manual events + TeamSnap / PlayMetrics labels
 *   8  Review & save → open Parent dashboard
 *
 * Save/resume: draft persisted in localStorage under 'sc_parent_onboarding_draft'.
 * Optional steps show a "Skip for now" link.
 * Fan profile data is never touched.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, CheckCircle, Plus, Trash2,
  Users, Shield, Calendar, Star, MapPin, X, ArrowRight,
} from 'lucide-react';
import {
  PLAYER_POSITIONS, SKILL_LEVELS, TRAINING_MODES, FOCUS_AREAS,
  SESSION_LENGTHS, FREQUENCIES, DEVELOPMENT_INTERESTS,
  AGE_BANDS, SEASONS, COLORADO_REGIONS,
} from '@/lib/parent-options';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayerDraft {
  id?: string;
  label: string;
  ageBand: string;
  ageYears: string;
  season: string;
  positions: string[];
  skillLevel: string;
  developmentInterests: string[];
  trainingMode: string;
  clubName: string;
  clubUrl: string;
  trainingPreferences: {
    focusAreas: string[];
    sessionLength: string;
    frequency: string;
  };
  tryoutInterest: boolean;
}

export interface WizardDraft {
  clubName: string;
  clubUrl: string;
  teamIds: string[];
  competitionIds: string[];
  communityNotes: string;
  tryoutsEnabled: boolean;
  tryoutRegions: string[];
  tryoutAgeGroups: string[];
  calendarConnections: string[];
  players: PlayerDraft[];
}

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  editMode?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'sc_parent_onboarding_draft';
const TOTAL_STEPS = 8;

const OPTIONAL_STEPS = new Set([4, 5, 7]);

const CALENDAR_OPTIONS = [
  {
    value: 'manual',
    label: 'Manual events',
    desc: 'Add games, practices, and events yourself',
    icon: Calendar,
    badge: null as string | null,
  },
  {
    value: 'teamsnap',
    label: 'TeamSnap',
    desc: 'Connect your TeamSnap account to sync team schedules',
    icon: Users,
    badge: 'Connect after setup',
  },
  {
    value: 'playmetrics',
    label: 'PlayMetrics',
    desc: 'Connect your PlayMetrics account to sync training sessions',
    icon: Star,
    badge: 'Connect after setup',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyPlayer(): PlayerDraft {
  return {
    label: '', ageBand: '', ageYears: '', season: '',
    positions: [], skillLevel: '',
    developmentInterests: [], trainingMode: '',
    clubName: '', clubUrl: '',
    trainingPreferences: { focusAreas: [], sessionLength: '', frequency: '' },
    tryoutInterest: true,
  };
}

function emptyDraft(): WizardDraft {
  return {
    clubName: '', clubUrl: '', teamIds: [], competitionIds: [],
    communityNotes: '',
    tryoutsEnabled: true,
    tryoutRegions: ['colorado'],
    tryoutAgeGroups: [],
    calendarConnections: ['manual'],
    players: [emptyPlayer()],
  };
}

/** Normalise a single player draft so optional array fields are never null/undefined. */
function normalisePlayer(p: Partial<PlayerDraft>): PlayerDraft {
  const base = emptyPlayer();
  const tp = (p.trainingPreferences ?? base.trainingPreferences) as Partial<PlayerDraft['trainingPreferences']> | null;
  return {
    ...base,
    ...p,
    positions:            Array.isArray(p.positions)            ? p.positions            : base.positions,
    developmentInterests: Array.isArray(p.developmentInterests) ? p.developmentInterests : base.developmentInterests,
    trainingPreferences: {
      focusAreas:    Array.isArray(tp?.focusAreas)    ? tp!.focusAreas    : [],
      sessionLength: tp?.sessionLength ?? '',
      frequency:     tp?.frequency     ?? '',
    },
  };
}

function loadDraft(): WizardDraft {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WizardDraft>;
      const base = emptyDraft();
      return {
        ...base,
        ...parsed,
        // Deep-normalise each player so array fields are never undefined/null
        players: Array.isArray(parsed.players)
          ? parsed.players.map((p) => normalisePlayer(p as Partial<PlayerDraft>))
          : base.players,
      };
    }
  } catch { /* ignore */ }
  return emptyDraft();
}

function saveDraft(d: WizardDraft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function clearOnboardingDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

function profileComplete(p: PlayerDraft): boolean {
  return !!(p.label.trim() && p.ageBand);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-foreground border-border hover:border-primary/60'
      }`}
    >
      {active && <CheckCircle size={11} className="shrink-0" />}
      <span>{label}</span>
    </button>
  );
}

function FieldInput({
  label, placeholder, value, onChange, type = 'text',
}: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-colors"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ParentOnboardingWizard({ onComplete, onCancel, editMode = false }: Props) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<WizardDraft>(loadDraft);
  const [activePlayerIdx, setActivePlayerIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { saveDraft(draft); }, [draft]);

  useEffect(() => {
    if (activePlayerIdx >= draft.players.length) {
      setActivePlayerIdx(Math.max(0, draft.players.length - 1));
    }
  }, [draft.players.length, activePlayerIdx]);

  const updatePlayer = useCallback((idx: number, patch: Partial<PlayerDraft>) => {
    setDraft(d => ({
      ...d,
      players: d.players.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }));
  }, []);

  const addPlayer = useCallback(() => {
    if (draft.players.length >= 10) return;
    const next = draft.players.length;
    setDraft(d => ({ ...d, players: [...d.players, emptyPlayer()] }));
    setActivePlayerIdx(next);
  }, [draft.players.length]);

  const removePlayer = useCallback((idx: number) => {
    if (draft.players.length <= 1) return;
    setDraft(d => ({ ...d, players: d.players.filter((_, i) => i !== idx) }));
    setActivePlayerIdx(i => Math.min(i, draft.players.length - 2));
  }, [draft.players.length]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        clubName: draft.clubName || null,
        clubUrl: draft.clubUrl || null,
        teamIds: draft.teamIds,
        competitionIds: draft.competitionIds,
        tryoutsEnabled: draft.tryoutsEnabled,
        tryoutRegions: draft.tryoutRegions,
        tryoutAgeGroups: draft.tryoutAgeGroups,
        calendarConnections: draft.calendarConnections,
        players: draft.players.map(p => ({
          ...(p.id ? { id: p.id } : {}),
          label: p.label.trim() || null,
          ageBand: p.ageBand || null,
          ageYears: p.ageYears ? parseInt(p.ageYears, 10) : null,
          positions: p.positions,
          skillLevel: p.skillLevel || null,
          developmentInterests: p.developmentInterests,
          trainingMode: p.trainingMode || null,
          clubName: p.clubName.trim() || null,
          clubUrl: p.clubUrl.trim() || null,
          trainingPreferences: (
            p.trainingPreferences.focusAreas.length ||
            p.trainingPreferences.sessionLength ||
            p.trainingPreferences.frequency
          ) ? p.trainingPreferences : null,
          tryoutInterest: p.tryoutInterest,
        })),
      };

      const res = await fetch('/api/parent/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(b.error ?? 'Save failed. Please try again.');
        return;
      }

      clearOnboardingDraft();
      onComplete();
    } catch {
      setSaveError('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [draft, onComplete]);

  // ── Player tab bar (steps 3 & 4) ───────────────────────────────────────────

  function PlayerTabs() {
    if (draft.players.length <= 1) return null;
    return (
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {draft.players.map((pl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActivePlayerIdx(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              activePlayerIdx === i
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {profileComplete(pl) && <CheckCircle size={10} />}
            <span>{pl.label || `Player ${i + 1}`}</span>
          </button>
        ))}
      </div>
    );
  }

  // ── Step 1: Privacy ─────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          {[
            {
              icon: <Shield size={16} className="text-primary mt-0.5 shrink-0" />,
              title: 'Your data stays private',
              body: 'Player profiles, family preferences, and calendar data are visible only to you and anyone you explicitly share access with.',
            },
            {
              icon: <Users size={16} className="text-secondary mt-0.5 shrink-0" />,
              title: 'Sharing is always opt-in',
              body: 'You control who can see your family calendar and player profiles. Revoke access at any time from Settings.',
            },
            {
              icon: <MapPin size={16} className="text-accent mt-0.5 shrink-0" />,
              title: 'Location data is optional',
              body: 'Region preferences help surface relevant tryouts and clubs. You can change or clear them at any time.',
            },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-3">
              {item.icon}
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          You acknowledged these terms when you set up your parent account. This is a reminder only — no new consent is required.
        </p>
      </div>
    );
  }

  // ── Step 2: Add players ─────────────────────────────────────────────────────

  function renderStep2() {
    const active = draft.players[activePlayerIdx];
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {draft.players.map((p, i) => (
            <div
              key={i}
              onClick={() => setActivePlayerIdx(i)}
              className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${
                activePlayerIdx === i
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                {p.label ? p.label[0].toUpperCase() : String(i + 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {p.label || `Player ${i + 1}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[p.ageBand, p.ageYears ? `Age ${p.ageYears}` : null].filter(Boolean).join(' · ') || 'No details yet'}
                </p>
              </div>
              {profileComplete(p) && <CheckCircle size={14} className="text-primary shrink-0" />}
              {draft.players.length > 1 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removePlayer(i); }}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                  aria-label="Remove player"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {active && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              {active.label || `Player ${activePlayerIdx + 1}`}
            </p>
            <FieldInput
              label="Name or nickname"
              placeholder="e.g. Alex"
              value={active.label}
              onChange={v => updatePlayer(activePlayerIdx, { label: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Age group</label>
                <select
                  value={active.ageBand}
                  onChange={e => updatePlayer(activePlayerIdx, { ageBand: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Select…</option>
                  {AGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Age (years)</label>
                <input
                  type="number" min={4} max={19} placeholder="e.g. 10"
                  value={active.ageYears}
                  onChange={e => updatePlayer(activePlayerIdx, { ageYears: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          </div>
        )}

        {draft.players.length < 10 && (
          <button
            type="button"
            onClick={addPlayer}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Plus size={14} />
            Add another player
          </button>
        )}
      </div>
    );
  }

  // ── Step 3: Club / positions / goals ────────────────────────────────────────

  function renderStep3() {
    const p = draft.players[activePlayerIdx];
    if (!p) return null;
    return (
      <div className="space-y-5">
        <PlayerTabs />
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Club & season
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldInput
              label="Club name"
              placeholder="e.g. Colorado Rush"
              value={p.clubName}
              onChange={v => updatePlayer(activePlayerIdx, { clubName: v })}
            />
            <FieldInput
              label="Club website (optional)"
              placeholder="https://…"
              value={p.clubUrl}
              onChange={v => updatePlayer(activePlayerIdx, { clubUrl: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Season</label>
              <select
                value={p.season}
                onChange={e => updatePlayer(activePlayerIdx, { season: e.target.value })}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Select…</option>
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Age group</label>
              <select
                value={p.ageBand}
                onChange={e => updatePlayer(activePlayerIdx, { ageBand: e.target.value })}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Select…</option>
                {AGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Positions
          </p>
          <div className="flex flex-wrap gap-2">
            {PLAYER_POSITIONS.map(pos => (
              <Chip
                key={pos}
                label={pos}
                active={p.positions.includes(pos)}
                onClick={() => updatePlayer(activePlayerIdx, { positions: toggleArr(p.positions, pos) })}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Skill level & goals
          </p>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Skill level</p>
            <div className="flex flex-wrap gap-2">
              {SKILL_LEVELS.map(s => (
                <Chip
                  key={s.value}
                  label={s.label}
                  active={p.skillLevel === s.value}
                  onClick={() => updatePlayer(activePlayerIdx, { skillLevel: s.value })}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Development goals</p>
            <div className="flex flex-wrap gap-2">
              {DEVELOPMENT_INTERESTS.map(di => (
                <Chip
                  key={di}
                  label={di}
                  active={p.developmentInterests.includes(di)}
                  onClick={() => updatePlayer(activePlayerIdx, { developmentInterests: toggleArr(p.developmentInterests, di) })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Training preferences ────────────────────────────────────────────

  function renderStep4() {
    const p = draft.players[activePlayerIdx];
    if (!p) return null;
    return (
      <div className="space-y-5">
        <PlayerTabs />
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Training format
          </p>
          <div className="flex flex-wrap gap-2">
            {TRAINING_MODES.map(m => (
              <Chip
                key={m.value}
                label={m.label}
                active={p.trainingMode === m.value}
                onClick={() => updatePlayer(activePlayerIdx, { trainingMode: m.value })}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Focus areas
          </p>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map(fa => (
              <Chip
                key={fa}
                label={fa}
                active={(p.trainingPreferences?.focusAreas ?? []).includes(fa)}
                onClick={() => updatePlayer(activePlayerIdx, {
                  trainingPreferences: {
                    ...p.trainingPreferences,
                    focusAreas: toggleArr(p.trainingPreferences?.focusAreas ?? [], fa),
                  },
                })}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Session preferences
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Session length</label>
              <select
                value={p.trainingPreferences.sessionLength}
                onChange={e => updatePlayer(activePlayerIdx, {
                  trainingPreferences: { ...p.trainingPreferences, sessionLength: e.target.value },
                })}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Any</option>
                {SESSION_LENGTHS.map(sl => <option key={sl} value={sl}>{sl}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Frequency</label>
              <select
                value={p.trainingPreferences.frequency}
                onChange={e => updatePlayer(activePlayerIdx, {
                  trainingPreferences: { ...p.trainingPreferences, frequency: e.target.value },
                })}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Any</option>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5: Parent-level clubs / community ───────────────────────────────────

  function renderStep5() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Your primary club
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldInput
              label="Club name"
              placeholder="e.g. Colorado Rush, Real Colorado"
              value={draft.clubName}
              onChange={v => setDraft(d => ({ ...d, clubName: v }))}
            />
            <FieldInput
              label="Club website (optional)"
              placeholder="https://…"
              value={draft.clubUrl}
              onChange={v => setDraft(d => ({ ...d, clubUrl: v }))}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <Star size={15} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Pro teams & competitions</p>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                Follow specific pro teams and competitions from the Fan tab. Your fan preferences are separate and are never affected by parent setup.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="block text-sm font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Notes
          </label>
          <textarea
            placeholder="Coaches, vendors, community groups, or anything else you'd like to note…"
            value={draft.communityNotes}
            onChange={e => setDraft(d => ({ ...d, communityNotes: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
        </div>
      </div>
    );
  }

  // ── Step 6: Tryouts ─────────────────────────────────────────────────────────

  function renderStep6() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              Show Colorado tryout opportunities
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              On by default. Toggle off to hide tryout listings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDraft(d => ({ ...d, tryoutsEnabled: !d.tryoutsEnabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
              draft.tryoutsEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            aria-pressed={draft.tryoutsEnabled}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              draft.tryoutsEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {draft.tryoutsEnabled && (
          <>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Regions
              </p>
              <div className="flex flex-wrap gap-2">
                {COLORADO_REGIONS.map(r => (
                  <Chip
                    key={r.slug}
                    label={r.label}
                    active={draft.tryoutRegions.includes(r.slug)}
                    onClick={() => setDraft(d => ({ ...d, tryoutRegions: toggleArr(d.tryoutRegions, r.slug) }))}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <p className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Age groups
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(leave blank for all)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {AGE_BANDS.map(ag => (
                  <Chip
                    key={ag}
                    label={ag}
                    active={draft.tryoutAgeGroups.includes(ag)}
                    onClick={() => setDraft(d => ({ ...d, tryoutAgeGroups: toggleArr(d.tryoutAgeGroups, ag) }))}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Step 7: Calendar ─────────────────────────────────────────────────────────

  function renderStep7() {
    return (
      <div className="space-y-3">
        {CALENDAR_OPTIONS.map(opt => {
          const active = draft.calendarConnections.includes(opt.value);
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDraft(d => ({ ...d, calendarConnections: toggleArr(d.calendarConnections, opt.value) }))}
              className={`w-full flex items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                  {opt.badge && (
                    <span className="text-[10px] font-semibold bg-accent/15 text-accent rounded-full px-2 py-0.5">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                {active && opt.badge && (
                  <p className="text-xs text-primary mt-1">
                    You'll be prompted to connect from the Calendar tab after setup.
                  </p>
                )}
              </div>
              {active && <CheckCircle size={15} className="text-primary shrink-0 mt-0.5" />}
            </button>
          );
        })}
        <p className="text-xs text-muted-foreground pt-1">
          Change these at any time from the Calendar tab in your parent portal.
        </p>
      </div>
    );
  }

  // ── Step 8: Review ──────────────────────────────────────────────────────────

  function renderStep8() {
    const completedPlayers = draft.players.filter(profileComplete).length;
    return (
      <div className="space-y-3">
        {[
          {
            label: 'Players',
            value: draft.players.length === 0
              ? 'None added'
              : draft.players.map((p, i) => p.label || `Player ${i + 1}`).join(', '),
            goStep: 2,
          },
          {
            label: 'Your club',
            value: draft.clubName || 'Not set',
            goStep: 5,
          },
          {
            label: 'Colorado tryouts',
            value: draft.tryoutsEnabled
              ? `On · ${draft.tryoutRegions.length ? draft.tryoutRegions.join(', ') : 'All regions'}`
              : 'Off',
            goStep: 6,
          },
          {
            label: 'Calendar',
            value: draft.calendarConnections.length
              ? draft.calendarConnections.join(', ')
              : 'None selected',
            goStep: 7,
          },
        ].map(row => (
          <div key={row.label} className="rounded-2xl border border-border bg-card p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{row.label}</p>
              <p className="text-sm text-foreground truncate">{row.value}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep(row.goStep)}
              className="text-xs text-primary hover:underline shrink-0"
            >
              Edit
            </button>
          </div>
        ))}

        {saveError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <X size={14} className="shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-1">
          {completedPlayers > 0
            ? `${completedPlayers} player profile${completedPlayers !== 1 ? 's' : ''} ready. `
            : ''}
          Everything can be edited from your parent dashboard at any time.
        </p>
      </div>
    );
  }

  // ── Step metadata ────────────────────────────────────────────────────────────

  const stepMeta = [
    { title: 'Privacy & data sharing',       subtitle: 'A quick reminder of what you agreed to.' },
    { title: 'Add your players',             subtitle: 'Add each child you want to track — up to 10.' },
    { title: 'Club, positions & goals',      subtitle: `Setting up ${draft.players[activePlayerIdx]?.label || `Player ${activePlayerIdx + 1}`}.` },
    { title: 'Training preferences',         subtitle: `Optional — helps us recommend content for ${draft.players[activePlayerIdx]?.label || `Player ${activePlayerIdx + 1}`}.` },
    { title: 'Clubs & community',            subtitle: 'Your primary club affiliation and notes.' },
    { title: 'Colorado tryouts',             subtitle: 'On by default — toggle off to hide listings.' },
    { title: 'Calendar & scheduling',        subtitle: 'Choose how to manage your family schedule.' },
    { title: 'Review & save',                subtitle: 'Everything look right? Save to open your dashboard.' },
  ];

  const stepRenderers = [
    renderStep1, renderStep2, renderStep3, renderStep4,
    renderStep5, renderStep6, renderStep7, renderStep8,
  ];

  const currentMeta = stepMeta[step - 1];
  const isLastStep = step === TOTAL_STEPS;
  const isOptional = OPTIONAL_STEPS.has(step);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-8">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/10 text-secondary shrink-0">
            <Users size={15} />
          </div>
          <span className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            {editMode ? 'Edit parent profile' : 'Parent profile setup'}
          </span>
        </div>
        {editMode && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel"
          >
            <X size={17} />
          </button>
        )}
      </div>

      <div className="px-5 pb-6 pt-5">
        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1 mb-5">
          <div
            className="bg-primary h-1 rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step heading */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </span>
            {isOptional && (
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                Optional
              </span>
            )}
          </div>
          <h2
            className="text-xl font-bold text-foreground leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {currentMeta.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{currentMeta.subtitle}</p>
        </div>

        {/* Step content */}
        <div className="min-h-[280px]">
          {stepRenderers[step - 1]?.()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-7 pt-5 border-t border-border">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
              Back
            </button>
            {isOptional && !isLastStep && (
              <button
                type="button"
                onClick={() => setStep(s => Math.min(TOTAL_STEPS, s + 1))}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            )}
          </div>

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 px-6 text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                : <CheckCircle size={15} />}
              <span>{saving ? 'Saving…' : 'Save & open dashboard'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(s => Math.min(TOTAL_STEPS, s + 1))}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 px-6 text-sm transition-all hover:opacity-90"
            >
              <span>Continue</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
