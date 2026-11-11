import { parent_portal_player_create } from 'virtual:content';
/**
 * CreatePlayerPage — /parent-portal/players/new
 *
 * Wizard: Club → Program → Season → Age Group → Team → Player details + photo
 *
 * Step 1 — Club: ClubSelector (directory search + manual fallback)
 * Step 2 — Program: derived from club selection (Select / ECNL / MLS NEXT / etc.)
 *           Manual fallback when no directory match
 * Step 3 — Season: current + recent seasons
 * Step 4 — Age Group: derived from program or free entry
 * Step 5 — Team: derived from club+program+age group or free entry
 * Step 6 — Player details: name, position, jersey, photo, training interests
 *
 * Rules:
 * - Roster import only shown when an authorized data connection exists (none yet → always manual)
 * - Demo link shown only to admin users
 * - Saves to /api/parent/players (POST) then navigates to /parent-portal/players/:id
 * - Edit existing players via PATCH — same wizard pre-populated
 * - All IDs, stats, schedules, media, collections preserved on edit
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSession } from '@/lib/auth/auth-client';
import {
  ArrowLeft, ArrowRight, Check,
  Loader2, Camera,
  Users, Trophy, Calendar, User, ChevronDown, AlertCircle,
  FlaskConical,
} from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import ClubSelector, { type ClubSelection } from '@/components/portal/ClubSelector';
import PlayerCalendarSetup from '@/components/portal/PlayerCalendarSetup';

// ─── Design tokens (mirrors parent-portal-player.tsx) ─────────────────────────

const PP_TOKENS = `
  :root {
    --pp-navy:       220 60% 22%;
    --pp-blue:       213 80% 52%;
    --pp-blue-light: 213 60% 95%;
    --pp-page-bg:    210 20% 97%;
    --pp-white:      0 0% 100%;
    --pp-bg:         210 20% 97%;
    --pp-card-bg:    0 0% 100%;
    --pp-border:     214 20% 88%;
    --pp-text:       220 30% 18%;
    --pp-text-muted: 215 18% 52%;
    --pp-green:      142 60% 40%;
    --pp-amber:      38 90% 50%;
    --pp-red:        0 72% 51%;
  }
`;

const AGE_BANDS = [
  'U6','U7','U8','U9','U10','U11','U12','U13',
  'U14','U15','U16','U17','U18','U19','Adult',
];

const POSITIONS = [
  'Goalkeeper','Defender','Center Back','Full Back',
  'Midfielder','Defensive Midfielder','Attacking Midfielder',
  'Forward','Winger','Striker',
];

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'club' | 'program' | 'season' | 'agegroup' | 'team' | 'details';

interface DirectoryProgram {
  id: string;
  label: string;
  ageGroups: string[];
}

interface DirectoryClubDetail {
  id: string;
  name: string;
  programs?: DirectoryProgram[];
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function PpButton({
  children, onClick, type = 'button', variant = 'primary',
  disabled, loading, className = '', size = 'md',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const base = `inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
    disabled:opacity-50 disabled:cursor-not-allowed
    ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'}`;
  const variants: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    outline: 'border border-border bg-transparent hover:bg-muted text-foreground',
    ghost:   'bg-transparent hover:bg-muted text-foreground',
    danger:  'bg-destructive text-destructive-foreground hover:opacity-90',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`${base} ${variants[variant] ?? variants.primary} ${className}`}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

function OptionCard({
  label, sublabel, selected, onClick, icon,
}: {
  label: string; sublabel?: string; selected: boolean;
  onClick: () => void; icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all"
      style={{
        borderColor: selected ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
        background: selected ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
      }}
    >
      {icon && (
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: selected ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-blue-light))' }}>
          <span style={{ color: selected ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))' }}>
            {icon}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{label}</p>
        {sublabel && <p className="text-xs truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>{sublabel}</p>}
      </div>
      {selected && <Check size={16} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = ['club','program','season','agegroup','team','details'];

function stepIndex(s: WizardStep): number {
  return WIZARD_STEPS.indexOf(s);
}

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ current }: { current: WizardStep }) {
  const idx = stepIndex(current);
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {WIZARD_STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-1">
          <div
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{
              background: i <= idx ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
            }}
          />
        </div>
      ))}
      <span className="text-[10px] font-medium ml-1 shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {idx + 1}/6
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreatePlayerPage() {
  const navigate = useNavigate();
  // Support /parent-portal/players/new (create) and
  // /parent-portal/players/:playerId/edit (edit existing)
  const { playerId: editPlayerId } = useParams<{ playerId?: string }>();
  const isEdit = !!editPlayerId && editPlayerId !== 'new';

  const { isAuthenticated, isPending, user } = useSession();
  const isAdmin = (user as { isAdmin?: boolean } | null)?.isAdmin === true;

  // ── Wizard state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('club');
  // After a new player is saved, show the optional calendar setup step
  const [calendarSetupPlayerId, setCalendarSetupPlayerId] = useState<string | null>(null);

  // Step 1 — Club
  const [clubSelection, setClubSelection] = useState<ClubSelection>({ directoryId: null, name: null });
  const [parentRegion, setParentRegion] = useState<string | null>(null);
  const [clubDetail, setClubDetail] = useState<DirectoryClubDetail | null>(null);
  const [loadingClubDetail, setLoadingClubDetail] = useState(false);

  // Step 2 — Program
  const [programId, setProgramId] = useState<string | null>(null);
  const [programLabel, setProgramLabel] = useState('');
  const [programManual, setProgramManual] = useState(false);
  const [programManualText, setProgramManualText] = useState('');

  // Step 3 — Season
  const [season, setSeason] = useState('');

  // Step 4 — Age group
  const [ageGroup, setAgeGroup] = useState('');
  const [ageGroupManual, setAgeGroupManual] = useState(false);
  const [ageGroupManualText, setAgeGroupManualText] = useState('');

  // Step 5 — Team
  const [teamName, setTeamName] = useState('');
  const [teamManual, setTeamManual] = useState(false);
  const [teamManualText, setTeamManualText] = useState('');

  // Step 6 — Player details
  const [playerName, setPlayerName] = useState('');
  const [primaryPosition, setPrimaryPosition] = useState('');
  const [secondaryPosition, setSecondaryPosition] = useState('');
  const [jersey, setJersey] = useState('');
  const [trainingInterests, setTrainingInterests] = useState<string[]>([]);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  // ── Load parent region + existing player for edit ───────────────────────────
  useEffect(() => {
    fetch('/api/parent/profile', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { profile?: { tryoutRegions?: string[] } } | null) => {
        const regions = d?.profile?.tryoutRegions;
        if (regions?.length) setParentRegion(regions[0]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isEdit || !editPlayerId) return;
    fetch(`/api/parent/players/${encodeURIComponent(editPlayerId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { player?: {
        label?: string | null; ageBand?: string | null;
        primaryPosition?: string | null; secondaryPosition?: string | null;
        jersey?: string | null; developmentInterests?: string[];
        clubName?: string | null; clubDirectoryId?: string | null;
        avatarUrl?: string | null;
      } } | null) => {
        const p = d?.player;
        if (!p) return;
        if (p.label) setPlayerName(p.label);
        if (p.ageBand) { setAgeGroup(p.ageBand); }
        if (p.primaryPosition) setPrimaryPosition(p.primaryPosition);
        if (p.secondaryPosition) setSecondaryPosition(p.secondaryPosition);
        if (p.jersey) setJersey(p.jersey);
        if (p.developmentInterests?.length) setTrainingInterests(p.developmentInterests);
        if (p.clubName) {
          setClubSelection({ directoryId: p.clubDirectoryId ?? null, name: p.clubName });
        }
        // Pre-fill team name from trainingPreferences (stored by the wizard)
        const prefs = (p as { trainingPreferences?: { team?: string | null } | null }).trainingPreferences;
        if (prefs?.team) { setTeamManualText(prefs.team); setTeamManual(true); }
        // Pre-fill the photo preview with the existing avatar so the user sees
        // the current photo before choosing a replacement. No pendingPhotoFile is
        // set — the existing photo is already stored and will not be re-uploaded
        // unless the user picks a new file.
        if (p.avatarUrl) setPhotoPreviewUrl(p.avatarUrl);
        // Jump straight to details for edit — all wizard steps pre-filled
        setStep('details');
      })
      .catch(() => undefined);
  }, [isEdit, editPlayerId]);

  // ── Load club detail when directory club selected ───────────────────────────
  useEffect(() => {
    if (!clubSelection.directoryId) { setClubDetail(null); return; }
    setLoadingClubDetail(true);
    fetch(`/api/parent/clubs/${encodeURIComponent(clubSelection.directoryId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { club?: DirectoryClubDetail } | null) => {
        setClubDetail(d?.club ?? null);
      })
      .catch(() => setClubDetail(null))
      .finally(() => setLoadingClubDetail(false));
  }, [clubSelection.directoryId]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Programs available for this club (from directory or common list)
  const availablePrograms: DirectoryProgram[] = clubDetail?.programs?.length
    ? clubDetail.programs
    : parent_portal_player_create.COMMON_PROGRAMS.map(p => ({ id: p.toLowerCase(), label: p, ageGroups: AGE_BANDS }));

  // Age groups for selected program
  const selectedProgram = availablePrograms.find(p => p.id === programId);
  const availableAgeGroups: string[] = selectedProgram?.ageGroups.length
    ? selectedProgram.ageGroups
    : AGE_BANDS;

  // Derived team name suggestion
  const suggestedTeamName = [
    clubSelection.name,
    programLabel || programManualText,
    ageGroup || ageGroupManualText,
  ].filter(Boolean).join(' ');

  // ── Dirty check ──────────────────────────────────────────────────────────────
  const isDirty = playerName.trim() !== '' || !!clubSelection.name || ageGroup !== '' || primaryPosition !== '';

  const guardedNavigate = useCallback((destination: () => void) => {
    if (isDirty && !isEdit) {
      pendingNavRef.current = destination;
      setShowUnsaved(true);
    } else {
      destination();
    }
  }, [isDirty, isEdit]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function goBack() {
    const idx = stepIndex(step);
    if (idx === 0) {
      guardedNavigate(() => navigate('/parent-portal'));
    } else {
      setStep(WIZARD_STEPS[idx - 1]);
    }
  }

  function goNext() {
    const idx = stepIndex(step);
    if (idx < WIZARD_STEPS.length - 1) setStep(WIZARD_STEPS[idx + 1]);
  }

  // ── Step validation ──────────────────────────────────────────────────────────
  function canProceed(): boolean {
    switch (step) {
      case 'club':     return !!(clubSelection.name || clubSelection.directoryId);
      case 'program':  return !!(programId || (programManual && programManualText.trim()));
      case 'season':   return !!season;
      case 'agegroup': return !!(ageGroup || (ageGroupManual && ageGroupManualText.trim()));
      case 'team':     return true; // team is optional — skip button and Next both allowed
      case 'details':  return playerName.trim().length > 0;
      default:         return false;
    }
  }

  function commitStep() {
    // Commit manual entries before advancing
    if (step === 'program' && programManual && programManualText.trim()) {
      setProgramLabel(programManualText.trim());
      setProgramId(null);
    }
    if (step === 'agegroup' && ageGroupManual && ageGroupManualText.trim()) {
      setAgeGroup(ageGroupManualText.trim());
    }
    if (step === 'team' && teamManual && teamManualText.trim()) {
      setTeamName(teamManualText.trim());
    }
    goNext();
  }

  // ── Photo handling ───────────────────────────────────────────────────────────
  function handlePhotoSelect(file: File) {
    setPendingPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    setError('');

    if (!playerName.trim()) { setError('Player name is required'); return; }

    setSaving(true);
    try {
      const effectiveAgeGroup = ageGroup || ageGroupManualText.trim() || null;
      const effectiveTeam = teamName || teamManualText.trim() || null;
      const effectiveProgram = programLabel || programManualText.trim() || null;
      const effectiveSeason = season || null;

      const parts = playerName.trim().split(/\s+/);
      const avatarInitials = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : playerName.trim().slice(0, 2).toUpperCase();

      const body = {
        label: playerName.trim(),
        ageBand: effectiveAgeGroup,
        primaryPosition: primaryPosition || null,
        secondaryPosition: secondaryPosition || null,
        clubName: clubSelection.name ?? null,
        clubDirectoryId: clubSelection.directoryId ?? null,
        jersey: jersey.trim() || null,
        developmentInterests: trainingInterests,
        avatarInitials,
        // Store program/team/season in trainingPreferences for now
        // (dedicated columns pending future migration)
        trainingPreferences: {
          program: effectiveProgram,
          team: effectiveTeam,
          season: effectiveSeason,
        },
      };

      let savedId: string;

      if (isEdit && editPlayerId) {
        // PATCH existing player — preserves all IDs, stats, schedules, media, collections
        const res = await fetch(`/api/parent/players/${encodeURIComponent(editPlayerId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? `Save failed (${res.status})`);
        }
        savedId = editPlayerId;
      } else {
        // POST new player
        const res = await fetch('/api/parent/players', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? `Save failed (${res.status})`);
        }
        const { id } = await res.json() as { id: string };
        savedId = id;
      }

      // Upload pending photo if any
      if (pendingPhotoFile) {
        try {
          const form = new FormData();
          form.append('file', pendingPhotoFile);
          const photoRes = await fetch(`/api/parent/players/${encodeURIComponent(savedId)}/photo`, {
            method: 'POST',
            credentials: 'include',
            body: form,
          });
          if (!photoRes.ok) {
            const d = await photoRes.json().catch(() => ({})) as { error?: string };
            // Non-fatal — player was saved. Surface the error so the user knows
            // to re-upload from the player profile page.
            setError(`Player saved. Photo upload failed: ${d.error ?? `HTTP ${photoRes.status}`}. You can add it from the player profile.`);
          }
        } catch (photoErr) {
          // Network error on photo upload — non-fatal
          setError(`Player saved. Photo could not be uploaded (network error). You can add it from the player profile.`);
        }
      }

      // For new players: show optional calendar setup step before navigating.
      // For edits: go straight to the player profile.
      if (isEdit) {
        navigate(`/parent-portal/players/${savedId}`, { replace: true });
      } else {
        setSaving(false);
        setCalendarSetupPlayerId(savedId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }
  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated) {
    navigate('/login/auth?returnTo=/parent-portal/players/new');
    return null;
  }

  // ── Optional calendar setup step (shown after new player is saved) ────────────
  if (calendarSetupPlayerId) {
    return (
      <>
        <style>{PP_TOKENS}</style>
        <Helmet>
          <title>Add a Schedule | Soccer Center</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="pp-shell min-h-screen" style={{ background: 'hsl(var(--pp-page-bg))' }}>
          <div className="max-w-lg mx-auto px-4 py-8">
            {/* Step indicator — step 7 of 7 */}
            <div className="flex items-center gap-2 mb-6">
              {[1,2,3,4,5,6,7].map(n => (
                <div
                  key={n}
                  className="flex-1 h-1.5 rounded-full"
                  style={{ background: n <= 7 ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
                />
              ))}
            </div>
            <div
              className="rounded-2xl shadow-sm p-6"
              style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
            >
              <PlayerCalendarSetup
                playerId={calendarSetupPlayerId}
                onComplete={() => navigate(`/parent-portal/players/${calendarSetupPlayerId}`, { replace: true })}
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Shared field styles ──────────────────────────────────────────────────────
  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  const labelCls = 'block text-xs font-medium mb-1';
  const labelStyle = { color: 'hsl(var(--pp-text-muted))' };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{PP_TOKENS}</style>
      <Helmet>
        <title>{isEdit ? 'Edit Player' : 'Add Player'} | Soccer Center</title>
        <meta name="description" content="Add or edit a player profile in your Soccer Center parent portal." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Unsaved-changes dialog */}
      {showUnsaved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
            style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}>
            <h2 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              Discard changes?
            </h2>
            <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              You have unsaved changes. Leave without saving?
            </p>
            <div className="flex gap-3 justify-end">
              <PpButton variant="outline" onClick={() => { setShowUnsaved(false); pendingNavRef.current = null; }}>
                Stay
              </PpButton>
              <PpButton variant="danger" onClick={() => {
                setShowUnsaved(false);
                pendingNavRef.current?.();
                pendingNavRef.current = null;
              }}>
                Discard
              </PpButton>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen" style={{ background: 'hsl(var(--pp-bg))' }}>

        {/* Sticky header */}
        <div className="sticky top-0 z-20 border-b"
          style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button type="button" onClick={goBack}
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: 'hsl(var(--pp-blue))' }}
              aria-label="Back">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Back</span>
            </button>
            <h1 className="flex-1 text-base font-bold text-center"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              {isEdit ? 'Edit player' : 'Add player'}
            </h1>
            {/* Admin: demo link */}
            {isAdmin && !isEdit && (
              <a
                href="/demo/parent-portal"
                className="flex items-center gap-1 text-xs font-medium shrink-0"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
              >
                <FlaskConical size={12} />
                <span className="hidden sm:inline">Sample players</span>
              </a>
            )}
            {!isAdmin && <div className="w-16 sm:w-24" />}
          </div>
          {/* Progress bar — hidden on edit (jump straight to details) */}
          {!isEdit && <StepBar current={step} />}
        </div>

        {/* Step content */}
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

          {/* ── Step 1: Club ─────────────────────────────────────────────────── */}
          {step === 'club' && (
            <>
              <div className="text-center mb-2">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <Trophy size={22} style={{ color: 'hsl(var(--pp-navy))' }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Which club?
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Search the directory or enter manually.
                </p>
              </div>

              <ClubSelector
                value={clubSelection}
                defaultRegion={parentRegion ?? 'colorado'}
                onChange={sel => {
                  setClubSelection(sel);
                  // Reset downstream selections when club changes
                  setProgramId(null); setProgramLabel(''); setProgramManualText('');
                  setAgeGroup(''); setAgeGroupManualText('');
                  setTeamName(''); setTeamManualText('');
                }}
                inputStyle={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                inputClassName="focus:ring-2 focus:ring-primary"
              />

              {loadingClubDetail && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <Loader2 size={12} className="animate-spin" /> Loading club details…
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <PpButton variant="outline" onClick={() => navigate('/parent-portal')} className="flex-1">
                  Cancel
                </PpButton>
                <PpButton onClick={goNext} disabled={!canProceed()} className="flex-1">
                  Next <ArrowRight size={14} />
                </PpButton>
              </div>
            </>
          )}

          {/* ── Step 2: Program ──────────────────────────────────────────────── */}
          {step === 'program' && (
            <>
              <div className="text-center mb-2">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <Users size={22} style={{ color: 'hsl(var(--pp-navy))' }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Which program?
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {clubSelection.name ?? 'Your club'}
                </p>
              </div>

              <div className="space-y-2">
                {availablePrograms.map(prog => (
                  <OptionCard
                    key={prog.id}
                    label={prog.label}
                    sublabel={prog.ageGroups.length ? `Age groups: ${prog.ageGroups.join(', ')}` : undefined}
                    selected={programId === prog.id && !programManual}
                    onClick={() => {
                      setProgramId(prog.id);
                      setProgramLabel(prog.label);
                      setProgramManual(false);
                    }}
                  />
                ))}

                {/* Manual entry */}
                <button
                  type="button"
                  onClick={() => { setProgramManual(true); setProgramId(null); }}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border transition-all text-left"
                  style={{
                    borderColor: programManual ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                    background: programManual ? 'hsl(var(--pp-blue-light))' : 'transparent',
                    color: 'hsl(var(--pp-blue))',
                  }}
                >
                  + Program not listed / Enter manually
                </button>

                {programManual && (
                  <input
                    type="text"
                    value={programManualText}
                    onChange={e => setProgramManualText(e.target.value)}
                    placeholder="e.g. Academy, Recreational…"
                    className={inputCls}
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                    autoFocus
                  />
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <PpButton variant="outline" onClick={goBack} className="flex-1">Back</PpButton>
                <PpButton onClick={commitStep} disabled={!canProceed()} className="flex-1">
                  Next <ArrowRight size={14} />
                </PpButton>
              </div>
            </>
          )}

          {/* ── Step 3: Season ───────────────────────────────────────────────── */}
          {step === 'season' && (
            <>
              <div className="text-center mb-2">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <Calendar size={22} style={{ color: 'hsl(var(--pp-navy))' }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Which season?
                </h2>
              </div>

              <div className="space-y-2">
                {parent_portal_player_create.SEASONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all"
                    style={{
                      borderColor: season === s ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                      background: season === s ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                    }}
                  >
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: season === s ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-blue-light))' }}>
                      <span style={{ color: season === s ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))' }}>
                        <Calendar size={14} />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{s}</p>
                    </div>
                    {season === s && <Check size={16} style={{ color: 'hsl(var(--pp-blue))' }} className="shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <PpButton variant="outline" onClick={goBack} className="flex-1">Back</PpButton>
                <PpButton onClick={goNext} disabled={!canProceed()} className="flex-1">
                  Next <ArrowRight size={14} />
                </PpButton>
              </div>
            </>
          )}

          {/* ── Step 4: Age group ────────────────────────────────────────────── */}
          {step === 'agegroup' && (
            <>
              <div className="text-center mb-2">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <Users size={22} style={{ color: 'hsl(var(--pp-navy))' }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Age group
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {[clubSelection.name, programLabel || programManualText].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {availableAgeGroups.map(ag => (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => { setAgeGroup(ag); setAgeGroupManual(false); }}
                    className="rounded-xl border py-3 text-sm font-semibold transition-all"
                    style={{
                      borderColor: ageGroup === ag && !ageGroupManual ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                      background: ageGroup === ag && !ageGroupManual ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-white))',
                      color: ageGroup === ag && !ageGroupManual ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text))',
                    }}
                  >
                    {ag}
                  </button>
                ))}
              </div>

              {/* Manual entry */}
              <button
                type="button"
                onClick={() => { setAgeGroupManual(true); setAgeGroup(''); }}
                className="w-full text-sm px-4 py-2.5 rounded-xl border transition-all text-left"
                style={{
                  borderColor: ageGroupManual ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))',
                  background: ageGroupManual ? 'hsl(var(--pp-blue-light))' : 'transparent',
                  color: 'hsl(var(--pp-blue))',
                }}
              >
                + Not listed / Enter manually
              </button>
              {ageGroupManual && (
                <input
                  type="text"
                  value={ageGroupManualText}
                  onChange={e => setAgeGroupManualText(e.target.value)}
                  placeholder="e.g. U12 Girls, 10U…"
                  className={inputCls}
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  autoFocus
                />
              )}

              <div className="flex gap-3 pt-2">
                <PpButton variant="outline" onClick={goBack} className="flex-1">Back</PpButton>
                <PpButton onClick={commitStep} disabled={!canProceed()} className="flex-1">
                  Next <ArrowRight size={14} />
                </PpButton>
              </div>
            </>
          )}

          {/* ── Step 5: Team ─────────────────────────────────────────────────── */}
          {step === 'team' && (
            <>
              <div className="text-center mb-2">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <Users size={22} style={{ color: 'hsl(var(--pp-navy))' }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                  Team name
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Enter the name as it appears on your team's schedule or roster.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={teamManualText || teamName}
                  onChange={e => { setTeamManualText(e.target.value); setTeamName(''); setTeamManual(true); }}
                  placeholder={suggestedTeamName || 'e.g. Colorado Rush ECNL U14'}
                  className={inputCls}
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  autoFocus
                />
                <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Examples: ECNL, MLS NEXT, Select, Recreational
                </p>
              </div>

              {/* No team / skip */}
              <button
                type="button"
                onClick={() => { setTeamName(''); setTeamManual(false); setTeamManualText(''); goNext(); }}
                className="w-full text-xs text-center py-2"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
              >
                Skip — I'll add team details later
              </button>

              <div className="flex gap-3 pt-2">
                <PpButton variant="outline" onClick={goBack} className="flex-1">Back</PpButton>
                <PpButton onClick={commitStep} disabled={!canProceed()} className="flex-1">
                  Next <ArrowRight size={14} />
                </PpButton>
              </div>
            </>
          )}

          {/* ── Step 6: Player details ───────────────────────────────────────── */}
          {step === 'details' && (
            <>
              {/* Photo + name header */}
              <div className="flex flex-col items-center gap-1 mb-2">
                {/* Photo picker */}
                <div className="relative">
                  {photoPreviewUrl ? (
                    <img src={photoPreviewUrl} alt="Player"
                      className="h-20 w-20 rounded-full object-cover border-2"
                      style={{ borderColor: 'hsl(var(--pp-blue))' }} />
                  ) : (
                    <div className="h-20 w-20 rounded-full flex items-center justify-center text-xl font-bold border-2"
                      style={{
                        background: 'hsl(var(--pp-navy))',
                        color: 'hsl(var(--pp-white))',
                        borderColor: 'hsl(var(--pp-border))',
                        fontFamily: 'var(--font-heading)',
                      }}>
                      {playerName.trim()
                        ? (() => { const p = playerName.trim().split(/\s+/); return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : playerName.trim().slice(0,2).toUpperCase(); })()
                        : <User size={28} style={{ color: 'hsl(var(--pp-white))' }} />}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => photoFileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full flex items-center justify-center border-2"
                    style={{ background: 'hsl(var(--pp-blue))', borderColor: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-white))' }}
                    aria-label="Upload photo"
                  >
                    <Camera size={12} />
                  </button>
                </div>
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
                />
                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Tap to add photo</p>
              </div>

              {/* Summary pill */}
              {!isEdit && (clubSelection.name || ageGroup) && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                  {clubSelection.name && (
                    <span className="text-[10px] rounded-full px-2.5 py-1 font-medium"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
                      {clubSelection.name}
                    </span>
                  )}
                  {(programLabel || programManualText) && (
                    <span className="text-[10px] rounded-full px-2.5 py-1 font-medium"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
                      {programLabel || programManualText}
                    </span>
                  )}
                  {(ageGroup || ageGroupManualText) && (
                    <span className="text-[10px] rounded-full px-2.5 py-1 font-medium"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
                      {ageGroup || ageGroupManualText}
                    </span>
                  )}
                  {season && (
                    <span className="text-[10px] rounded-full px-2.5 py-1 font-medium"
                      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
                      {season}
                    </span>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm flex items-start gap-2"
                  style={{ background: 'hsl(var(--pp-red) / 0.08)', color: 'hsl(var(--pp-red))', border: '1px solid hsl(var(--pp-red) / 0.25)' }}>
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Name */}
              <div>
                <label className={labelCls} style={labelStyle}>
                  Player name <span style={{ color: 'hsl(var(--pp-red))' }}>*</span>
                </label>
                <input
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="e.g. Alex Smith"
                  className={inputCls}
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  autoFocus={!isEdit}
                />
              </div>

              {/* Primary position */}
              <div>
                <label className={labelCls} style={labelStyle}>Primary position</label>
                <div className="relative">
                  <select
                    value={primaryPosition}
                    onChange={e => setPrimaryPosition(e.target.value)}
                    className={inputCls + ' appearance-none pr-8'}
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  >
                    <option value="">Select position…</option>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </div>
              </div>

              {/* Secondary position */}
              <div>
                <label className={labelCls} style={labelStyle}>
                  Secondary position <span className="font-normal opacity-60">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={secondaryPosition}
                    onChange={e => setSecondaryPosition(e.target.value)}
                    className={inputCls + ' appearance-none pr-8'}
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  >
                    <option value="">None</option>
                    {POSITIONS.filter(p => p !== primaryPosition).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </div>
              </div>

              {/* Jersey */}
              <div>
                <label className={labelCls} style={labelStyle}>
                  Jersey number <span className="font-normal opacity-60">(optional)</span>
                </label>
                <input
                  value={jersey}
                  onChange={e => setJersey(e.target.value)}
                  placeholder="e.g. 10"
                  className={inputCls}
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  maxLength={4}
                />
              </div>

              {/* Training interests */}
              <div>
                <label className={labelCls} style={labelStyle}>Training interests</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {parent_portal_player_create.TRAINING_INTERESTS.map(t => {
                    const active = trainingInterests.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTrainingInterests(prev =>
                          prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                        )}
                        className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
                        style={
                          active
                            ? { background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))', borderColor: 'hsl(var(--pp-blue))' }
                            : { background: 'transparent', color: 'hsl(var(--pp-text-muted))', borderColor: 'hsl(var(--pp-border))' }
                        }
                      >
                        {active && <Check size={10} className="inline mr-1" />}
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                {!isEdit && (
                  <PpButton variant="outline" onClick={goBack} disabled={saving} className="flex-1">
                    Back
                  </PpButton>
                )}
                {isEdit && (
                  <PpButton variant="outline" onClick={() => navigate(`/parent-portal/players/${editPlayerId}`)} disabled={saving} className="flex-1">
                    Cancel
                  </PpButton>
                )}
                <PpButton
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving || !playerName.trim()}
                  className="flex-1"
                >
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create player'}
                </PpButton>
              </div>

              {/* Admin demo link — bottom of details step */}
              {isAdmin && !isEdit && (
                <div className="pt-2 border-t text-center" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                  <a
                    href="/demo/parent-portal"
                    className="inline-flex items-center gap-1.5 text-xs"
                    style={{ color: 'hsl(var(--pp-text-muted))' }}
                  >
                    <FlaskConical size={11} />
                    Explore sample players (demo)
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
