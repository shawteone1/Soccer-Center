/**
 * Parent Onboarding Wizard — 6-step rail
 * Steps: You → Players → Affiliations → Preferences → Calendar → Review
 *
 * - Server-saved draft via /api/parent/onboarding-draft (PUT)
 * - Resume survives logout
 * - Save & continue + Save for later on every step
 * - Blue/white/grey .pp-shell palette
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  User, Users, Trophy, Settings, Calendar, CheckCircle,
  ChevronRight, ChevronLeft, Plus, Trash2, Loader2, Info,
  Check, X,
} from 'lucide-react';
import { PpCard, PpButton, PpBadge, PpAvatar } from './PpPrimitives';
import ClubSearchCombobox from './ClubSearchCombobox';
import { AGE_BANDS, PLAYER_POSITIONS, FOCUS_AREAS, COLORADO_REGIONS } from '@/lib/parent-options';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep = 'you' | 'players' | 'affiliations' | 'preferences' | 'calendar' | 'review';

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'you',          label: 'You',          icon: <User size={14} /> },
  { id: 'players',      label: 'Players',      icon: <Users size={14} /> },
  { id: 'affiliations', label: 'Affiliations', icon: <Trophy size={14} /> },
  { id: 'preferences',  label: 'Preferences',  icon: <Settings size={14} /> },
  { id: 'calendar',     label: 'Calendar',     icon: <Calendar size={14} /> },
  { id: 'review',       label: 'Review',       icon: <CheckCircle size={14} /> },
];

interface DraftPlayer {
  tempId: string;
  label: string;
  birthYear: string;
  jersey: string;
  avatarInitials: string;
  // positions step (filled after add)
  primaryPosition: string;
  secondaryPosition: string;
  foot: string;
  goals: string[];
}

interface DraftAffiliation {
  tempId: string;
  playerId: string;
  orgName: string;
  season: string;
  ageGroupLabel: string;
}

interface WizardDraft {
  // Step 1 — You
  displayName: string;
  bio: string;
  city: string;
  timezone: string;
  privacyAck: boolean;
  marketingOptIn: boolean;
  // Step 2 — Players
  players: DraftPlayer[];
  // Step 3 — Affiliations
  affiliations: DraftAffiliation[];
  // Step 4 — Preferences
  tryoutsEnabled: boolean;
  tryoutRegions: string[];
  playerTraining: Record<string, { optIn: boolean; focusAreas: string[] }>;
  // Step 5 — Calendar (read-only; no data to collect)
}

const EMPTY_DRAFT: WizardDraft = {
  displayName: '',
  bio: '',
  city: '',
  timezone: 'America/Denver',
  privacyAck: false,
  marketingOptIn: false,
  players: [],
  affiliations: [],
  tryoutsEnabled: true,
  tryoutRegions: [],
  playerTraining: {},
};

const GOAL_OPTIONS = [
  'Ball control', 'Defending', 'Confidence', 'Fitness',
  'Goalkeeper skills', 'Still exploring',
];

const TIMEZONES = [
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function playerInitials(label: string, avatarInitials: string) {
  if (avatarInitials) return avatarInitials.slice(0, 2).toUpperCase();
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase() || 'P?';
}

// ─── Step rail ────────────────────────────────────────────────────────────────

function StepRail({
  current,
  completed,
  onJump,
}: {
  current: WizardStep;
  completed: WizardStep[];
  onJump: (step: WizardStep) => void;
}) {
  const currentIdx = STEPS.findIndex(s => s.id === current);

  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const isDone = completed.includes(step.id);
        const isActive = step.id === current;
        const isReachable = isDone || i <= currentIdx;

        return (
          <div key={step.id} className="flex items-center">
            <button
              type="button"
              disabled={!isReachable}
              onClick={() => isReachable && onJump(step.id)}
              className="flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-current={isActive ? 'step' : undefined}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center transition-colors"
                style={{
                  background: isDone
                    ? 'hsl(var(--pp-navy))'
                    : isActive
                    ? 'hsl(var(--pp-blue))'
                    : 'hsl(var(--pp-blue-light))',
                  color: isDone || isActive ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))',
                }}
              >
                {isDone ? <Check size={14} /> : step.icon}
              </div>
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: isActive ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))' }}
              >
                {step.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className="h-px w-4 shrink-0 mx-0.5"
                style={{ background: isDone ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Step 1: You ─────────────────────────────────────────────────────────────

function StepYou({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
          Your name <span style={{ color: 'hsl(var(--pp-blue))' }}>*</span>
        </label>
        <input
          type="text"
          value={draft.displayName}
          onChange={e => onChange({ displayName: e.target.value })}
          placeholder="e.g. Taylor Martinez"
          className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 transition"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            background: 'hsl(var(--pp-card-bg))',
            color: 'hsl(var(--pp-text))',
          }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
          Short bio <span className="text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>(optional)</span>
        </label>
        <textarea
          value={draft.bio}
          onChange={e => onChange({ bio: e.target.value })}
          placeholder="e.g. Soccer parent in Denver, two kids in the Colorado United system."
          rows={3}
          className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 transition resize-none"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            background: 'hsl(var(--pp-card-bg))',
            color: 'hsl(var(--pp-text))',
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            City <span className="text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={draft.city}
            onChange={e => onChange({ city: e.target.value })}
            placeholder="e.g. Denver"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 transition"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-card-bg))',
              color: 'hsl(var(--pp-text))',
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            Timezone
          </label>
          <select
            value={draft.timezone}
            onChange={e => onChange({ timezone: e.target.value })}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 transition"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background: 'hsl(var(--pp-card-bg))',
              color: 'hsl(var(--pp-text))',
            }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Privacy acknowledgements */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
      >
        <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-navy))' }}>
          Privacy &amp; data
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors"
            style={{
              borderColor: draft.privacyAck ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              background: draft.privacyAck ? 'hsl(var(--pp-navy))' : 'transparent',
            }}
            onClick={() => onChange({ privacyAck: !draft.privacyAck })}
          >
            {draft.privacyAck && <Check size={12} style={{ color: 'hsl(var(--pp-white))' }} />}
          </div>
          <span className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-navy))' }}>
            I understand that player profiles are private by default and are never publicly discoverable. Only I and accepted guardians can view them. <span className="font-semibold">Required</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors"
            style={{
              borderColor: draft.marketingOptIn ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              background: draft.marketingOptIn ? 'hsl(var(--pp-navy))' : 'transparent',
            }}
            onClick={() => onChange({ marketingOptIn: !draft.marketingOptIn })}
          >
            {draft.marketingOptIn && <Check size={12} style={{ color: 'hsl(var(--pp-white))' }} />}
          </div>
          <span className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-navy))' }}>
            I'd like to receive occasional Soccer Center updates about Colorado youth soccer. <span className="font-normal opacity-70">Optional</span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Step 2: Players ──────────────────────────────────────────────────────────

function StepPlayers({
  draft,
  onChange,
  activeSetupPlayerId,
  onSetupPlayer,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  activeSetupPlayerId: string | null;
  onSetupPlayer: (id: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', birthYear: '', jersey: '', avatarInitials: '' });

  function addPlayer() {
    if (!form.label.trim()) return;
    const newPlayer: DraftPlayer = {
      tempId: uid(),
      label: form.label.trim(),
      birthYear: form.birthYear,
      jersey: form.jersey,
      avatarInitials: form.avatarInitials,
      primaryPosition: '',
      secondaryPosition: '',
      foot: '',
      goals: [],
    };
    const updated = [...draft.players, newPlayer];
    onChange({ players: updated });
    setForm({ label: '', birthYear: '', jersey: '', avatarInitials: '' });
    setAdding(false);
    // Immediately open this player's profile setup
    onSetupPlayer(newPlayer.tempId);
  }

  function removePlayer(tempId: string) {
    onChange({
      players: draft.players.filter(p => p.tempId !== tempId),
      affiliations: draft.affiliations.filter(a => a.playerId !== tempId),
    });
    if (activeSetupPlayerId === tempId) onSetupPlayer(null);
  }

  function updatePlayerPositions(tempId: string, patch: Partial<DraftPlayer>) {
    onChange({
      players: draft.players.map(p => p.tempId === tempId ? { ...p, ...patch } : p),
    });
  }

  // If a player is in setup mode, show their positions/goals form
  const setupPlayer = activeSetupPlayerId
    ? draft.players.find(p => p.tempId === activeSetupPlayerId) ?? null
    : null;

  if (setupPlayer) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <PpAvatar
            initials={playerInitials(setupPlayer.label, setupPlayer.avatarInitials)}
            size="md"
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {setupPlayer.label}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Set up positions &amp; goals
            </p>
          </div>
          <button
            type="button"
            className="ml-auto text-xs"
            style={{ color: 'hsl(var(--pp-blue))' }}
            onClick={() => onSetupPlayer(null)}
          >
            ← Back to players
          </button>
        </div>

        {/* Primary position */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
            Primary position
          </label>
          <div className="flex flex-wrap gap-2">
            {PLAYER_POSITIONS.map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => updatePlayerPositions(setupPlayer.tempId, { primaryPosition: pos })}
                className="text-sm rounded-full px-3 py-1.5 border transition-colors"
                style={{
                  borderColor: setupPlayer.primaryPosition === pos ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  background: setupPlayer.primaryPosition === pos ? 'hsl(var(--pp-navy))' : 'transparent',
                  color: setupPlayer.primaryPosition === pos ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))',
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary position */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            Secondary position <span className="text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PLAYER_POSITIONS.filter(p => p !== setupPlayer.primaryPosition).map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => updatePlayerPositions(setupPlayer.tempId, {
                  secondaryPosition: setupPlayer.secondaryPosition === pos ? '' : pos,
                })}
                className="text-sm rounded-full px-3 py-1.5 border transition-colors"
                style={{
                  borderColor: setupPlayer.secondaryPosition === pos ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: setupPlayer.secondaryPosition === pos ? 'hsl(var(--pp-blue-light))' : 'transparent',
                  color: setupPlayer.secondaryPosition === pos ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text))',
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred foot */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            Preferred foot <span className="text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>(optional)</span>
          </label>
          <div className="flex gap-2">
            {['Left', 'Right', 'Both'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => updatePlayerPositions(setupPlayer.tempId, { foot: setupPlayer.foot === f ? '' : f })}
                className="text-sm rounded-full px-4 py-1.5 border transition-colors"
                style={{
                  borderColor: setupPlayer.foot === f ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: setupPlayer.foot === f ? 'hsl(var(--pp-blue-light))' : 'transparent',
                  color: setupPlayer.foot === f ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text))',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Goals */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
            Development goals <span className="text-xs font-normal" style={{ color: 'hsl(var(--pp-text-muted))' }}>(select all that apply)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map(g => {
              const selected = setupPlayer.goals.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => updatePlayerPositions(setupPlayer.tempId, {
                    goals: selected
                      ? setupPlayer.goals.filter(x => x !== g)
                      : [...setupPlayer.goals, g],
                  })}
                  className="text-sm rounded-full px-3 py-1.5 border transition-colors"
                  style={{
                    borderColor: selected ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                    background: selected ? 'hsl(var(--pp-blue-light))' : 'transparent',
                    color: selected ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text))',
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <PpButton onClick={() => onSetupPlayer(null)}>
          <Check size={14} />
          Done with {setupPlayer.label}
        </PpButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {draft.players.length === 0 && !adding && (
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Users size={24} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-navy))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--pp-navy))' }}>
            Add your first player to get started.
          </p>
        </div>
      )}

      {/* Player list */}
      {draft.players.map(p => (
        <div
          key={p.tempId}
          className="flex items-center gap-3 rounded-xl border p-3"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <PpAvatar initials={playerInitials(p.label, p.avatarInitials)} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
              {p.label}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {[p.birthYear && `Born ${p.birthYear}`, p.primaryPosition].filter(Boolean).join(' · ') || 'No details yet'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSetupPlayer(p.tempId)}
            className="text-xs px-2.5 py-1 rounded-full border transition-colors"
            style={{ borderColor: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-blue))' }}
          >
            {p.primaryPosition ? 'Edit' : 'Set up'}
          </button>
          <button
            type="button"
            onClick={() => removePlayer(p.tempId)}
            className="p-1.5 rounded-full transition-colors"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label={`Remove ${p.label}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {/* Add player form */}
      {adding ? (
        <div
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: 'hsl(var(--pp-blue))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            Add player
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Name <span style={{ color: 'hsl(var(--pp-blue))' }}>*</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Avery Martinez"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Birth year <span className="opacity-60">(optional)</span>
              </label>
              <input
                type="number"
                value={form.birthYear}
                onChange={e => setForm(f => ({ ...f, birthYear: e.target.value }))}
                placeholder="e.g. 2014"
                min={2000}
                max={2025}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Jersey # <span className="opacity-60">(optional)</span>
              </label>
              <input
                type="text"
                value={form.jersey}
                onChange={e => setForm(f => ({ ...f, jersey: e.target.value }))}
                placeholder="e.g. 7"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Initials <span className="opacity-60">(optional, e.g. AM)</span>
              </label>
              <input
                type="text"
                value={form.avatarInitials}
                onChange={e => setForm(f => ({ ...f, avatarInitials: e.target.value.slice(0, 2).toUpperCase() }))}
                placeholder="AM"
                maxLength={2}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <PpButton onClick={addPlayer} disabled={!form.label.trim()}>
              <Plus size={14} />
              Add &amp; set up positions
            </PpButton>
            <PpButton variant="outline" onClick={() => setAdding(false)}>
              <X size={14} />
              Cancel
            </PpButton>
          </div>
        </div>
      ) : (
        draft.players.length < 10 && (
          <PpButton variant="outline" onClick={() => setAdding(true)}>
            <Plus size={14} />
            Add player
          </PpButton>
        )
      )}
    </div>
  );
}

// ─── Step 3: Affiliations ─────────────────────────────────────────────────────

function StepAffiliations({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}) {
  const [adding,   setAdding]   = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [season,   setSeason]   = useState('');
  const [ageBand,  setAgeBand]  = useState('');

  function addAffiliation(playerId: string) {
    if (!clubName.trim()) return;
    const newAff: DraftAffiliation = {
      tempId: uid(),
      playerId,
      orgName: clubName.trim(),
      season,
      ageGroupLabel: ageBand,
    };
    onChange({ affiliations: [...draft.affiliations, newAff] });
    setClubName('');
    setSeason('');
    setAgeBand('');
    setAdding(null);
  }

  function removeAffiliation(tempId: string) {
    onChange({ affiliations: draft.affiliations.filter(a => a.tempId !== tempId) });
  }

  if (draft.players.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
      >
        <p className="text-sm" style={{ color: 'hsl(var(--pp-navy))' }}>
          Add players in the previous step before setting up club affiliations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Search the Colorado youth club directory or enter manually. Directory matches are linked to
          verified records — manual entries are parent-provided and not cross-referenced.
        </span>
      </div>

      {draft.players.map(player => {
        const playerAffs = draft.affiliations.filter(a => a.playerId === player.tempId);
        const initials = playerInitials(player.label, player.avatarInitials);

        return (
          <div key={player.tempId} className="space-y-2">
            <div className="flex items-center gap-2">
              <PpAvatar initials={initials} size="sm" />
              <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {player.label}
              </p>
            </div>

            {playerAffs.map(a => (
              <div
                key={a.tempId}
                className="flex items-center gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
              >
                <Trophy size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                    {a.orgName}
                  </p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {[a.season, a.ageGroupLabel].filter(Boolean).join(' · ') || 'Season not set'}
                  </p>
                </div>
                <PpBadge variant="default">
                  <Info size={9} className="mr-1" />
                  Parent-entered
                </PpBadge>
                <button
                  type="button"
                  onClick={() => removeAffiliation(a.tempId)}
                  className="p-1 rounded"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  aria-label="Remove affiliation"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {adding === player.tempId ? (
              <div
                className="rounded-xl border p-3 space-y-3"
                style={{ borderColor: 'hsl(var(--pp-blue))', background: 'hsl(var(--pp-card-bg))' }}
              >
                {/* Club search combobox */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                    Club <span className="text-red-500">*</span>
                  </label>
                  <ClubSearchCombobox
                    value={clubName}
                    onChange={(name) => setClubName(name)}
                    defaultRegion="colorado"
                    placeholder="Search Colorado clubs…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                      Season
                    </label>
                    <select
                      value={season}
                      onChange={e => setSeason(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                    >
                      <option value="">Optional</option>
                      {['Fall 2026', 'Spring 2026', 'Fall 2025', 'Spring 2025'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                      Age group
                    </label>
                    <select
                      value={ageBand}
                      onChange={e => setAgeBand(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))', color: 'hsl(var(--pp-text))' }}
                    >
                      <option value="">Optional</option>
                      {AGE_BANDS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <PpButton size="sm" onClick={() => addAffiliation(player.tempId)} disabled={!clubName.trim()}>
                    <Plus size={12} />
                    Add club
                  </PpButton>
                  <PpButton size="sm" variant="outline" onClick={() => { setAdding(null); setClubName(''); setSeason(''); setAgeBand(''); }}>
                    Cancel
                  </PpButton>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(player.tempId)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-blue))' }}
              >
                <Plus size={12} />
                Add club for {player.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 4: Preferences ──────────────────────────────────────────────────────

function StepPreferences({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}) {
  function toggleRegion(slug: string) {
    const current = draft.tryoutRegions;
    const updated = current.includes(slug)
      ? current.filter(r => r !== slug)
      : [...current, slug];
    onChange({ tryoutRegions: updated });
  }

  function togglePlayerTraining(playerId: string, optIn: boolean) {
    onChange({
      playerTraining: {
        ...draft.playerTraining,
        [playerId]: { ...draft.playerTraining[playerId], optIn },
      },
    });
  }

  function toggleFocusArea(playerId: string, area: string) {
    const current = draft.playerTraining[playerId]?.focusAreas ?? [];
    const updated = current.includes(area)
      ? current.filter(a => a !== area)
      : [...current, area];
    onChange({
      playerTraining: {
        ...draft.playerTraining,
        [playerId]: { ...draft.playerTraining[playerId], focusAreas: updated },
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Colorado Tryouts toggle */}
      <PpCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              Colorado tryout listings
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Show tryout opportunities from the Colorado directory across the portal.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.tryoutsEnabled}
            onClick={() => onChange({ tryoutsEnabled: !draft.tryoutsEnabled })}
            className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
            style={{ background: draft.tryoutsEnabled ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 rounded-full shadow transform transition-transform"
              style={{
                background: 'hsl(var(--pp-white))',
                transform: draft.tryoutsEnabled ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {draft.tryoutsEnabled && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Regions (optional — leave blank for all Colorado)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COLORADO_REGIONS.map(r => {
                const selected = draft.tryoutRegions.includes(r.slug);
                return (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => toggleRegion(r.slug)}
                    className="text-xs rounded-full px-2.5 py-1 border transition-colors"
                    style={{
                      borderColor: selected ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                      background: selected ? 'hsl(var(--pp-navy))' : 'transparent',
                      color: selected ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PpCard>

      {/* Per-player training opt-in */}
      {draft.players.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            Training resources
          </p>
          {draft.players.map(player => {
            const prefs = draft.playerTraining[player.tempId] ?? { optIn: false, focusAreas: [] };
            const initials = playerInitials(player.label, player.avatarInitials);

            return (
              <PpCard key={player.tempId}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PpAvatar initials={initials} size="sm" />
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
                      {player.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.optIn}
                    onClick={() => togglePlayerTraining(player.tempId, !prefs.optIn)}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    style={{ background: prefs.optIn ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
                  >
                    <span
                      className="pointer-events-none inline-block h-5 w-5 rounded-full shadow transform transition-transform"
                      style={{
                        background: 'hsl(var(--pp-white))',
                        transform: prefs.optIn ? 'translateX(20px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>

                {prefs.optIn && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
                    <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Focus areas (optional)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {FOCUS_AREAS.map(area => {
                        const selected = (prefs.focusAreas ?? []).includes(area);
                        return (
                          <button
                            key={area}
                            type="button"
                            onClick={() => toggleFocusArea(player.tempId, area)}
                            className="text-xs rounded-full px-2.5 py-1 border transition-colors"
                            style={{
                              borderColor: selected ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                              background: selected ? 'hsl(var(--pp-blue-light))' : 'transparent',
                              color: selected ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
                            }}
                          >
                            {area}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </PpCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Calendar ─────────────────────────────────────────────────────────

function StepCalendar() {
  const services = [
    {
      name: 'PlayMetrics',
      description: 'Connect your PlayMetrics account to sync practice and game schedules.',
      status: 'Setup required',
    },
    {
      name: 'TeamSnap',
      description: 'Connect your TeamSnap account to sync team events and schedules.',
      status: 'Setup required',
    },
  ];

  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Calendar connections are set up after onboarding. You'll be able to connect PlayMetrics and TeamSnap from the Calendar tab in your portal.
        </span>
      </div>

      {services.map(svc => (
        <div
          key={svc.name}
          className="flex items-center gap-4 rounded-xl border p-4"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Calendar size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {svc.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {svc.description}
            </p>
          </div>
          <span
            className="text-xs font-medium rounded-full px-2.5 py-1 shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            {svc.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Step 6: Review ───────────────────────────────────────────────────────────

function StepReview({
  draft,
  onJump,
}: {
  draft: WizardDraft;
  onJump: (step: WizardStep) => void;
}) {
  const items: { label: string; value: string; step: WizardStep; ok: boolean }[] = [
    {
      label: 'Your name',
      value: draft.displayName || 'Not set',
      step: 'you',
      ok: !!draft.displayName,
    },
    {
      label: 'Privacy acknowledged',
      value: draft.privacyAck ? 'Yes' : 'Not yet',
      step: 'you',
      ok: draft.privacyAck,
    },
    {
      label: 'Players added',
      value: draft.players.length > 0
        ? draft.players.map(p => p.label).join(', ')
        : 'None',
      step: 'players',
      ok: draft.players.length > 0,
    },
    {
      label: 'Club affiliations',
      value: draft.affiliations.length > 0
        ? `${draft.affiliations.length} affiliation${draft.affiliations.length > 1 ? 's' : ''}`
        : 'None added',
      step: 'affiliations',
      ok: true, // optional
    },
    {
      label: 'Colorado tryouts',
      value: draft.tryoutsEnabled ? 'On' : 'Off',
      step: 'preferences',
      ok: true,
    },
  ];

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div
          key={item.label}
          className="flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
        >
          <div
            className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: item.ok ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))',
            }}
          >
            {item.ok
              ? <Check size={12} style={{ color: 'hsl(var(--pp-white))' }} />
              : <Info size={12} style={{ color: 'hsl(var(--pp-navy))' }} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{item.label}</p>
            <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
              {item.value}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onJump(item.step)}
            className="text-xs shrink-0"
            style={{ color: 'hsl(var(--pp-blue))' }}
          >
            Edit
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface ParentOnboardingWizardProps {
  onComplete: () => void;
  onDismiss: () => void;
}

export default function ParentOnboardingWizard({
  onComplete,
  onDismiss,
}: ParentOnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('you');
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
  const [activeSetupPlayerId, setActiveSetupPlayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing draft on mount ────────────────────────────────────────────
  useEffect(() => {
    async function loadDraft() {
      try {
        const res = await apiFetch('/api/parent/onboarding-draft');
        if (res.ok) {
          const data = await res.json() as {
            draft: {
              stage: WizardStep;
              stepsCompleted: WizardStep[];
              draftData: WizardDraft | null;
            } | null;
          };
          if (data.draft) {
            setCurrentStep(data.draft.stage ?? 'you');
            setCompletedSteps(data.draft.stepsCompleted ?? []);
            if (data.draft.draftData) {
              setDraft({ ...EMPTY_DRAFT, ...data.draft.draftData });
            }
          }
        }
      } catch {
        // ignore — start fresh
      } finally {
        setLoadingDraft(false);
      }
    }
    loadDraft();
  }, []);

  // ── Auto-save draft (debounced) ─────────────────────────────────────────────
  const saveDraft = useCallback(async (
    step: WizardStep,
    steps: WizardStep[],
    data: WizardDraft,
  ) => {
    setSaving(true);
    try {
      await apiFetch('/api/parent/onboarding-draft', {
        method: 'PUT',
        body: JSON.stringify({
          stage: step,
          stepsCompleted: steps,
          draftData: data,
        }),
      });
    } catch {
      // silent — will retry on next change
    } finally {
      setSaving(false);
    }
  }, []);

  function scheduleSave(step: WizardStep, steps: WizardStep[], data: WizardDraft) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveDraft(step, steps, data), 1500);
  }

  function patchDraft(patch: Partial<WizardDraft>) {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      scheduleSave(currentStep, completedSteps, next);
      return next;
    });
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  const stepOrder = STEPS.map(s => s.id);

  function canAdvance(): boolean {
    if (currentStep === 'you') return !!draft.displayName.trim() && draft.privacyAck;
    if (currentStep === 'players') return draft.players.length > 0;
    return true;
  }

  async function handleNext() {
    const idx = stepOrder.indexOf(currentStep);
    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    setCompletedSteps(newCompleted);

    if (idx < stepOrder.length - 1) {
      const nextStep = stepOrder[idx + 1];
      setCurrentStep(nextStep);
      setActiveSetupPlayerId(null);
      await saveDraft(nextStep, newCompleted, draft);
    }
  }

  async function handleBack() {
    const idx = stepOrder.indexOf(currentStep);
    if (idx > 0) {
      const prevStep = stepOrder[idx - 1];
      setCurrentStep(prevStep);
      setActiveSetupPlayerId(null);
      await saveDraft(prevStep, completedSteps, draft);
    }
  }

  async function handleSaveForLater() {
    await saveDraft(currentStep, completedSteps, draft);
    onDismiss();
  }

  async function handleSubmit() {
    if (!canAdvance() && currentStep !== 'review') return;
    setSubmitting(true);
    try {
      // Save final draft
      await saveDraft('review', [...completedSteps, 'review'], draft);
      // Submit to onboarding endpoint
      await apiFetch('/api/parent/onboarding', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: draft.displayName,
          bio: draft.bio,
          city: draft.city,
          timezone: draft.timezone,
          privacyAck: draft.privacyAck,
          marketingOptIn: draft.marketingOptIn,
          tryoutsEnabled: draft.tryoutsEnabled,
          tryoutRegions: draft.tryoutRegions,
          players: draft.players.map(p => ({
            label: p.label,
            birthYear: p.birthYear ? parseInt(p.birthYear) : null,
            jersey: p.jersey || null,
            avatarInitials: p.avatarInitials || null,
            primaryPosition: p.primaryPosition || null,
            secondaryPosition: p.secondaryPosition || null,
            foot: p.foot || null,
            goals: p.goals,
          })),
          affiliations: draft.affiliations,
          playerTraining: draft.playerTraining,
        }),
      });
      onComplete();
    } catch {
      // TODO: surface error
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loadingDraft) {
    return (
      <div className="pp-shell flex items-center justify-center min-h-screen">
        <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
      </div>
    );
  }

  const isLastStep = currentStep === 'review';
  const isFirstStep = currentStep === 'you';

  return (
    <div className="pp-shell">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1
              className="text-xl font-bold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              Set up your Parent Portal
            </h1>
            <button
              type="button"
              onClick={handleSaveForLater}
              className="text-xs"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              Save &amp; exit
            </button>
          </div>
          <StepRail
            current={currentStep}
            completed={completedSteps}
            onJump={step => {
              setCurrentStep(step);
              setActiveSetupPlayerId(null);
            }}
          />
        </div>

        {/* Step content */}
        <PpCard>
          <div className="mb-5">
            <h2
              className="text-base font-semibold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              {STEPS.find(s => s.id === currentStep)?.label}
            </h2>
          </div>

          {currentStep === 'you' && (
            <StepYou draft={draft} onChange={patchDraft} />
          )}
          {currentStep === 'players' && (
            <StepPlayers
              draft={draft}
              onChange={patchDraft}
              activeSetupPlayerId={activeSetupPlayerId}
              onSetupPlayer={setActiveSetupPlayerId}
            />
          )}
          {currentStep === 'affiliations' && (
            <StepAffiliations draft={draft} onChange={patchDraft} />
          )}
          {currentStep === 'preferences' && (
            <StepPreferences draft={draft} onChange={patchDraft} />
          )}
          {currentStep === 'calendar' && (
            <StepCalendar />
          )}
          {currentStep === 'review' && (
            <StepReview draft={draft} onJump={step => { setCurrentStep(step); setActiveSetupPlayerId(null); }} />
          )}
        </PpCard>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5 gap-3">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <PpButton variant="outline" onClick={handleBack} disabled={saving || submitting}>
                <ChevronLeft size={14} />
                Back
              </PpButton>
            )}
            <button
              type="button"
              onClick={handleSaveForLater}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              Save for later
            </button>
          </div>

          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <Loader2 size={11} className="animate-spin" />
                Saving…
              </span>
            )}
            {isLastStep ? (
              <PpButton onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Complete setup
              </PpButton>
            ) : (
              <PpButton onClick={handleNext} disabled={!canAdvance() || saving}>
                Save &amp; continue
                <ChevronRight size={14} />
              </PpButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
