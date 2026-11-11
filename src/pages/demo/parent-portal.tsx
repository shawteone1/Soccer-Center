import {useMemo} from 'react';
import FullRecruitingTab from '@/components/portal/RecruitingTab';
import { RecruitingData, createDemoRecruitingRequest } from '@/components/portal/RecruitingData';
/**
 * /demo/parent-portal
 *
 * Presentation-ready Parent & Player Portal demo.
 * Isolated route — no authentication required.
 * All state persists in localStorage under sc_demo_pp_* keys.
 * Reset clears only demo keys; real profiles/auth are never touched.
 *
 * Tabs: Profile | Schedule | Stats | Media | Recruiting (U16+ only)
 *
 * Season: Fall 2026 — Sep 6 – Nov 22, 2026
 *   8 Saturday games: Sep 6, 13, 20, 27 | Oct 4, 18 | Nov 1, 15
 *   30 M/W/F practices: 4:30–6:00 PM (skipping Oct 11–17 fall break week)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  RotateCcw, ChevronRight, User, Calendar, Trophy, Film, Star,
  MapPin, Clock, Eye, EyeOff, Plus, Check, X, Pencil,
  Shield, Footprints, ArrowLeft, Info, Camera, AlertCircle,
  BarChart2, Lock, ExternalLink, Trash2, Tag, ChevronLeft,
  Download, Share2, List, GripVertical, Play, SkipForward, SkipBack,
  Copy, Instagram, Facebook, Search as SearchIcon,
} from 'lucide-react';
import {
  DEMO_CLUBS, DEMO_TEAMS, DEMO_PLAYERS, DEMO_EVENTS,
  RECRUITING_AGE_GROUPS,
  type DemoPlayer, type DemoEvent, type DemoTeam, type DemoClub,
  type DemoMediaItem, type DemoMediaKind,
  playerDisplayName, playerInitials,
} from '@/lib/demo/portal-demo-data';
import {
  usePortalDemo, type DemoStatEntry, type CalFilter, type SchedView,
} from '@/lib/demo/use-portal-demo';
import {
  idbPutBlob, idbDeleteBlob, getBlobUrl, revokeBlobUrl,
  idbPutCollection, idbGetAllCollections, idbDeleteCollection,
  type DemoCollection,
} from '@/lib/demo/use-media-idb';
import {
  PpCard, PpSectionHeading, PpButton, PpBadge, PpDivider,
} from '@/components/portal/PpPrimitives';
import DemoTryoutsTab from '@/components/portal/DemoTryoutsTab';
import CoachShareTab from '@/components/portal/CoachShareTab';
import { demo_parent_portal } from 'virtual:content';

// ─── Types ────────────────────────────────────────────────────────────────────

// Recruiting tab only appears for U16+ players; otherwise the slot is hidden.
type DemoTab = 'profile' | 'schedule' | 'stats' | 'media' | 'recruiting' | 'tryouts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function formatTime(t: string): string {
  try {
    const [h, min] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(min).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
}

/** Returns the ISO year-month string "YYYY-MM" for a given event date */
function eventMonth(iso: string): string { return iso.slice(0, 7); }

/** All distinct months in a sorted list of events */
function eventMonths(events: DemoEvent[]): string[] {
  return [...new Set(events.map(e => eventMonth(e.date)))].sort();
}

/** Days in a given YYYY-MM month */
function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Day-of-week (0=Sun) for the 1st of a YYYY-MM month */
function firstDayOfWeek(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Demo banner ──────────────────────────────────────────────────────────────

function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-2 text-xs font-semibold"
      style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
    >
      <span className="flex items-center gap-2">
        <Info size={13} />
        <span>{demo_parent_portal.banner.label}</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 px-2 py-1 rounded border border-white/30 hover:bg-white/10 transition-colors"
          aria-label="Reset demo"
        >
          <RotateCcw size={11} />
          <span>{demo_parent_portal.banner.resetBtn}</span>
        </button>
        <a
          href="/parent-portal"
          className="flex items-center gap-1 px-2 py-1 rounded border border-white/30 hover:bg-white/10 transition-colors"
          aria-label="Back to portal"
        >
          <ArrowLeft size={11} />
          <span>{demo_parent_portal.banner.backBtn}</span>
        </a>
      </div>
    </div>
  );
}

// ─── Cascading selectors ──────────────────────────────────────────────────────

function SelectorPanel({
  selection,
  setClub, setProgram, setAgeGroup, setTeam, setPlayer,
}: {
  selection: ReturnType<typeof usePortalDemo>['selection'];
  setClub: (id: string) => void;
  setProgram: (id: string) => void;
  setAgeGroup: (ag: string) => void;
  setTeam: (id: string) => void;
  setPlayer: (id: string) => void;
}) {
  const selectedClub    = DEMO_CLUBS.find(c => c.id === selection.clubId);
  const programs        = selectedClub?.programs ?? [];
  const selectedProgram = programs.find(p => p.id === selection.programId);
  const ageGroups       = selectedProgram?.ageGroups ?? [];
  const teams           = DEMO_TEAMS.filter(
    t => t.clubId    === selection.clubId    &&
         t.programId === selection.programId &&
         t.ageGroup  === selection.ageGroup
  );
  const players = selection.teamId ? (DEMO_PLAYERS[selection.teamId] ?? []) : [];

  const hint = !selection.clubId    ? demo_parent_portal.selector.hintClub
             : !selection.programId ? demo_parent_portal.selector.hintProgram
             : !selection.ageGroup  ? demo_parent_portal.selector.hintAgeGroup
             : !selection.teamId    ? demo_parent_portal.selector.hintTeam
             : !selection.playerId  ? demo_parent_portal.selector.hintPlayer
             :                        demo_parent_portal.selector.hintDone;

  const hintDone = !!selection.playerId;

  const selBorderColor = 'hsl(var(--pp-border))';
  const selBg          = 'hsl(var(--pp-page-bg))';
  const selColor       = 'hsl(var(--pp-text))';
  const selDisabledBg  = 'hsl(var(--pp-blue-light))';
  const cls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';

  const makeStyle = (disabled: boolean): React.CSSProperties => ({
    borderColor: selBorderColor,
    background:  disabled ? selDisabledBg : selBg,
    color:       selColor,
    opacity:     disabled ? 0.55 : 1,
    cursor:      disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <PpCard>
      <PpSectionHeading>
        <span>{demo_parent_portal.selector.heading}</span>
      </PpSectionHeading>

      <div
        className="mb-4 text-xs font-medium rounded-lg px-3 py-2"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        Season: <strong>Fall 2026</strong> (Sep 6 – Nov 22)
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>1. {demo_parent_portal.selector.clubLabel}</span>
          </label>
          <select value={selection.clubId} onChange={e => setClub(e.target.value)} className={cls} style={makeStyle(false)}>
            <option value="">{demo_parent_portal.selector.clubPlaceholder}</option>
            {DEMO_CLUBS.map((c: DemoClub) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>2. {demo_parent_portal.selector.programLabel}</span>
          </label>
          <select value={selection.programId} onChange={e => setProgram(e.target.value)} disabled={!selection.clubId} className={cls} style={makeStyle(!selection.clubId)}>
            <option value="">{demo_parent_portal.selector.programPlaceholder}</option>
            {programs.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>3. {demo_parent_portal.selector.ageGroupLabel}</span>
          </label>
          <select value={selection.ageGroup} onChange={e => setAgeGroup(e.target.value)} disabled={!selection.programId} className={cls} style={makeStyle(!selection.programId)}>
            <option value="">{demo_parent_portal.selector.ageGroupPlaceholder}</option>
            {ageGroups.map(ag => (
              <option key={ag} value={ag}>{ag}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>4. {demo_parent_portal.selector.teamLabel}</span>
          </label>
          {selection.ageGroup && teams.length === 0 ? (
            <p className="text-xs italic px-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{demo_parent_portal.selector.noTeam}</span>
            </p>
          ) : (
            <select value={selection.teamId} onChange={e => setTeam(e.target.value)} disabled={!selection.ageGroup} className={cls} style={makeStyle(!selection.ageGroup)}>
              <option value="">{demo_parent_portal.selector.teamPlaceholder}</option>
              {teams.map((t: DemoTeam) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>5. {demo_parent_portal.selector.playerLabel}</span>
          </label>
          <select value={selection.playerId} onChange={e => setPlayer(e.target.value)} disabled={!selection.teamId || players.length === 0} className={cls} style={makeStyle(!selection.teamId || players.length === 0)}>
            <option value="">{demo_parent_portal.selector.playerPlaceholder}</option>
            {players.map((p: DemoPlayer) => (
              <option key={p.id} value={p.id}>
                #{p.jersey} {playerDisplayName(p)} — {p.position}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
        style={{
          background: hintDone ? 'hsl(var(--pp-badge-success-bg))' : 'hsl(var(--pp-blue-light))',
          color:      hintDone ? 'hsl(var(--pp-badge-success-fg))' : 'hsl(var(--pp-navy))',
        }}
      >
        {hintDone ? <Check size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
        <span>{hint}</span>
      </div>
    </PpCard>
  );
}

// ─── Photo picker ─────────────────────────────────────────────────────────────

function PhotoPicker({
  playerId,
  currentPhoto,
  initials,
  onSet,
  onClear,
  error,
  onClearError,
}: {
  playerId: string;
  currentPhoto: string | null;
  initials: string;
  onSet: (playerId: string, dataUrl: string) => 'ok' | 'too-large' | 'quota';
  onClear: (playerId: string) => void;
  error: string | null;
  onClearError: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onSet(playerId, dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="relative group">
      <div
        className="h-20 w-20 rounded-full border-4 flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden"
        style={{
          background:   currentPhoto ? 'transparent' : 'hsl(var(--pp-blue))',
          color:        'hsl(var(--pp-white))',
          borderColor:  'hsl(var(--pp-card-bg))',
          fontFamily:   'var(--font-heading)',
        }}
        aria-label="Player photo"
      >
        {currentPhoto ? (
          <img src={currentPhoto} alt="Player photo" className="h-full w-full object-cover" loading="eager" />
        ) : (
          initials
        )}
      </div>

      {/* Camera overlay — always slightly visible on touch; hover-only on desktop */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="absolute inset-0 rounded-full flex items-center justify-center opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        style={{ background: 'hsl(var(--pp-navy) / 0.6)' }}
        aria-label={demo_parent_portal.photoPickerLabel}
        title={demo_parent_portal.photoPickerLabel}
      >
        <Camera size={18} style={{ color: 'hsl(var(--pp-white))' }} />
      </button>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFile} aria-label="Upload player photo" />

      {currentPhoto && (
        <button
          type="button"
          onClick={() => onClear(playerId)}
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          aria-label={demo_parent_portal.photoPickerRemove}
          title={demo_parent_portal.photoPickerRemove}
        >
          <X size={10} />
        </button>
      )}

      {error && (
        <div
          className="absolute top-full left-0 mt-2 z-50 rounded-xl px-3 py-2 text-xs shadow-lg flex items-start gap-2 w-56"
          style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
        >
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
          <button type="button" onClick={onClearError} className="ml-auto shrink-0" aria-label="Dismiss">
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Player profile header ────────────────────────────────────────────────────

function PlayerProfileHeader({
  player, team, club,
  getPhoto, setPhoto, clearPhoto, photoError, clearPhotoError,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  club: DemoClub;
  getPhoto: (id: string) => string | null;
  setPhoto: (id: string, url: string) => 'ok' | 'too-large' | 'quota';
  clearPhoto: (id: string) => void;
  photoError: string | null;
  clearPhotoError: () => void;
}) {
  const initials = playerInitials(player);
  const isGk     = player.position === 'Goalkeeper';
  const photo    = getPhoto(player.id);

  return (
    <PpCard padding={false}>
      <div className="h-24 rounded-t-2xl" style={{ background: 'linear-gradient(135deg, hsl(var(--pp-navy)) 0%, hsl(var(--pp-blue)) 100%)' }} />
      <div className="px-5 pb-5">
        <div className="flex items-end justify-between -mt-10 mb-4">
          <PhotoPicker
            playerId={player.id}
            currentPhoto={photo}
            initials={initials}
            onSet={setPhoto}
            onClear={clearPhoto}
            error={photoError}
            onClearError={clearPhotoError}
          />
          <div
            className="h-14 w-14 rounded-xl border-2 flex flex-col items-center justify-center text-center shrink-0"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            title={demo_parent_portal.profileHeader.clubLogoNote}
            aria-label={`${club.name} ${demo_parent_portal.profileHeader.clubLogoAlt}`}
          >
            <Shield size={18} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <span className="text-[9px] mt-0.5 font-semibold leading-tight text-center px-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {club.shortName}
            </span>
          </div>
        </div>

        <p className="text-[10px] mb-2 -mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Camera size={9} className="inline mr-1" />
          <span>{demo_parent_portal.photoPickerHint}</span>
          {' · tap avatar to change'}
        </p>

        <h2 className="text-xl font-bold mb-0.5" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
          {playerDisplayName(player)}
        </h2>
        <p className="text-sm mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {player.position} · #{player.jersey} · {player.ageGroup}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <PpBadge variant="default">{team.competition}</PpBadge>
          <PpBadge variant="info">{team.season}</PpBadge>
          {isGk && <PpBadge variant="warning">Goalkeeper</PpBadge>}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Club</span>
          <span style={{ color: 'hsl(var(--pp-text))' }}>{club.name}</span>
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Team</span>
          <span style={{ color: 'hsl(var(--pp-text))' }}>{team.name}</span>
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Birth year</span>
          <span style={{ color: 'hsl(var(--pp-text))' }}>{player.birthYear}</span>
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Preferred foot</span>
          <span style={{ color: 'hsl(var(--pp-text))' }}>{player.foot}</span>
        </div>
      </div>
    </PpCard>
  );
}

// ─── Tab nav ──────────────────────────────────────────────────────────────────

function PlayerTabNav({
  active,
  onChange,
  showRecruiting,
}: {
  active: DemoTab;
  onChange: (t: DemoTab) => void;
  showRecruiting: boolean;
}) {
  const tabs: { id: DemoTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',  label: demo_parent_portal.tabs.profile,  icon: <User size={14} /> },
    { id: 'schedule', label: demo_parent_portal.tabs.schedule, icon: <Calendar size={14} /> },
    { id: 'stats',    label: demo_parent_portal.tabs.stats,    icon: <BarChart2 size={14} /> },
    { id: 'media',    label: demo_parent_portal.tabs.media,    icon: <Film size={14} /> },
    { id: 'tryouts',  label: 'Tryouts',                        icon: <SearchIcon size={14} /> },
    ...(showRecruiting ? [{ id: 'recruiting' as DemoTab, label: demo_parent_portal.tabs.recruiting, icon: <Star size={14} /> }] : []),
  ];

  return (
    <div
      className="flex overflow-x-auto border-b"
      style={{ borderColor: 'hsl(var(--pp-border))', scrollbarWidth: 'none' } as React.CSSProperties}
    >
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className="flex items-center gap-1.5 shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
          style={{
            borderBottomColor: active === t.id ? 'hsl(var(--pp-navy))' : 'transparent',
            color: active === t.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
          }}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  player,
  team,
  club,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  club: DemoClub;
}) {
  const isGk = player.position === 'Goalkeeper';
  const devInterests = isGk
    ? ['Shot-stopping', 'Distribution', 'Positioning', 'Communication']
    : player.position === 'Forward'
    ? ['Finishing', 'Movement off the ball', 'Dribbling', '1v1 attacking']
    : player.position === 'Midfielder'
    ? ['Passing range', 'Pressing', 'Ball retention', 'Transition play']
    : ['Defending 1v1', 'Aerial duels', 'Positioning', 'Build-up play'];

  const c  = demo_parent_portal.profileTab;
  const li = demo_parent_portal.lockedInCard;

  return (
    <div className="space-y-4">
      {/* About */}
      <PpCard>
        <PpSectionHeading icon={<User size={14} />}>
          <span>{c.aboutHeading}</span>
        </PpSectionHeading>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{c.ageGroupLabel}</span></dt>
          <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.ageGroup}</dd>
          <dt style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{c.birthYearLabel}</span></dt>
          <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.birthYear}</dd>
          <dt style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{c.jerseyLabel}</span></dt>
          <dd style={{ color: 'hsl(var(--pp-text))' }}>#{player.jersey}</dd>
          <dt style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{c.footLabel}</span></dt>
          <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.foot}</dd>
        </dl>
      </PpCard>

      {/* Position */}
      <PpCard>
        <PpSectionHeading icon={<Footprints size={14} />}>
          <span>{c.positionHeading}</span>
        </PpSectionHeading>
        <div className="flex flex-wrap gap-2 mb-4">
          <span
            className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-1.5"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          >
            <Star size={11} />
            {player.position}
            <span className="text-[10px] opacity-70 ml-1">{c.primarySuffix}</span>
          </span>
        </div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{c.devFocusLabel}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {devInterests.map(d => (
            <span key={d} className="text-xs rounded-full px-3 py-1" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
              {d}
            </span>
          ))}
        </div>
      </PpCard>

      {/* Club & team */}
      <PpCard>
        <PpSectionHeading icon={<Trophy size={14} />}>
          <span>{c.clubHeading}</span>
        </PpSectionHeading>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--pp-blue-light))' }}>
            <Trophy size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{team.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{team.competition} · {team.season}</p>
            <p className="text-xs mt-0.5 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{c.clubLogoNote}</span>
            </p>
          </div>
        </div>
      </PpCard>

      {/* Locked In — Registration & Eligibility */}
      <PpCard>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--pp-navy))' }}>
              <Lock size={15} style={{ color: 'hsl(var(--pp-white))' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                <span>{li.heading}</span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{li.intro}</span>
        </p>

        {/* Club + season */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{li.clubLabel}</span></span>
          <span className="font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{club.name}</span>
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{li.seasonLabel}</span></span>
          <span className="font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{team.season}</span>
        </div>

        <PpDivider />

        {/* Age verification */}
        <div className="flex items-center justify-between mt-3 mb-3 text-xs">
          <span style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{li.ageVerifLabel}</span></span>
          <PpBadge variant="warning"><span>{li.ageVerifStatus}</span></PpBadge>
        </div>

        {/* Required forms */}
        <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{li.formsHeading}</span>
        </p>
        <div className="space-y-2 mb-3">
          {li.formItems.map((req: string) => (
            <div key={req} className="flex items-center gap-2 text-xs">
              <div className="h-4 w-4 rounded border-2 flex items-center justify-center shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }} />
              <span style={{ color: 'hsl(var(--pp-text-muted))' }}>{req}</span>
              <PpBadge variant="warning"><span>{li.formStatus}</span></PpBadge>
            </div>
          ))}
        </div>

        <PpDivider />

        {/* Medical + payment */}
        <div className="mt-3 space-y-2 text-xs mb-4">
          <div className="flex items-center justify-between">
            <span style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{li.medicalLabel}</span></span>
            <PpBadge variant="warning"><span>{li.medicalStatus}</span></PpBadge>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{li.paymentLabel}</span></span>
            <PpBadge variant="error"><span>{li.paymentStatus}</span></PpBadge>
          </div>
        </div>

        {/* Sim disclaimer */}
        <p className="text-[10px] italic mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{li.simDisclaimer}</span>
        </p>

        {/* CTA */}
        <a
          href="/parent-portal/locked-in-demo"
          className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
        >
          <ExternalLink size={14} />
          <span>{li.openDemoBtn}</span>
        </a>
        <p className="text-[10px] text-center mt-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{li.returnNote}</span>
        </p>
      </PpCard>
    </div>
  );
}

// ─── Stat entry form ──────────────────────────────────────────────────────────

function StatEntryForm({
  event,
  playerId,
  isGk,
  existing,
  onSave,
  onClose,
}: {
  event: DemoEvent;
  playerId: string;
  isGk: boolean;
  existing: DemoStatEntry | null;
  onSave: (entry: DemoStatEntry) => void;
  onClose: () => void;
}) {
  const [played,   setPlayed]   = useState(existing?.played   ?? false);
  const [goals,    setGoals]    = useState(String(existing?.goals    ?? ''));
  const [assists,  setAssists]  = useState(String(existing?.assists  ?? ''));
  const [ga,       setGa]       = useState(String(existing?.ga       ?? ''));
  const [saves,    setSaves]    = useState(String(existing?.saves    ?? ''));
  const [shutouts, setShutouts] = useState(String(existing?.shutouts ?? ''));

  // playerId is kept for call-site symmetry
  void playerId;

  const numOrNull = (v: string): number | null => {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  };

  const handleSave = () => {
    onSave({
      played,
      goals:    isGk ? null : numOrNull(goals),
      assists:  isGk ? null : numOrNull(assists),
      ga:       isGk ? numOrNull(ga)       : null,
      saves:    isGk ? numOrNull(saves)    : null,
      shutouts: isGk ? numOrNull(shutouts) : null,
    });
    onClose();
  };

  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2';
  const inputBorderColor = 'hsl(var(--pp-border))';
  const inputBg          = 'hsl(var(--pp-page-bg))';
  const inputTextColor   = 'hsl(var(--pp-text))';
  const f = demo_parent_portal.statForm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>{event.title}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatDate(event.date)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
              <span>{f.participatedLabel}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={played}
              onClick={() => setPlayed(p => !p)}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={{ background: played ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full shadow transform transition-transform"
                style={{ background: 'hsl(var(--pp-white))', transform: played ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {played && !isGk && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{f.goalsLabel}</span></label>
                <input type="number" min="0" value={goals} onChange={e => setGoals(e.target.value)} className={inputCls} style={{ borderColor: inputBorderColor, background: inputBg, color: inputTextColor }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{f.assistsLabel}</span></label>
                <input type="number" min="0" value={assists} onChange={e => setAssists(e.target.value)} className={inputCls} style={{ borderColor: inputBorderColor, background: inputBg, color: inputTextColor }} />
              </div>
            </>
          )}

          {played && isGk && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{f.gaLabel}</span></label>
                <input type="number" min="0" value={ga} onChange={e => setGa(e.target.value)} className={inputCls} style={{ borderColor: inputBorderColor, background: inputBg, color: inputTextColor }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{f.savesLabel}</span></label>
                <input type="number" min="0" value={saves} onChange={e => setSaves(e.target.value)} className={inputCls} style={{ borderColor: inputBorderColor, background: inputBg, color: inputTextColor }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{f.shutoutsLabel}</span></label>
                <input type="number" min="0" value={shutouts} onChange={e => setShutouts(e.target.value)} className={inputCls} style={{ borderColor: inputBorderColor, background: inputBg, color: inputTextColor }} />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 flex gap-2 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <PpButton onClick={handleSave} className="flex-1"><Check size={13} /><span>{f.saveBtn}</span></PpButton>
          <PpButton variant="outline" onClick={onClose} className="flex-1"><span>{f.cancelBtn}</span></PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function CalendarView({
  events,
  calFilter,
}: {
  events: DemoEvent[];
  calFilter: CalFilter;
}) {
  const filtered = events.filter(e =>
    calFilter === 'games'     ? e.type === 'game' :
    calFilter === 'practices' ? e.type === 'practice' : true
  );

  const months = eventMonths(filtered.length > 0 ? filtered : events);
  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const currentMonth = months[monthIdx] ?? months[0];
  if (!currentMonth) return null;

  const days = daysInMonth(currentMonth);
  const startDow = firstDayOfWeek(currentMonth);

  // Build a map: YYYY-MM-DD → events
  const byDay: Record<string, DemoEvent[]> = {};
  filtered.forEach(e => {
    if (e.date.startsWith(currentMonth)) {
      (byDay[e.date] ??= []).push(e);
    }
  });

  const s = demo_parent_portal.scheduleTab;

  const dayEventsForSelected = selectedDay ? (byDay[selectedDay] ?? []) : [];

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => { setMonthIdx(i => Math.max(0, i - 1)); setSelectedDay(null); }}
          disabled={monthIdx === 0}
          className="p-1.5 rounded-lg disabled:opacity-30 transition-opacity"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
          aria-label={s.calMonthPrev}
        >
          <ChevronLeft size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
        </button>
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
          {monthLabel(currentMonth)}
        </p>
        <button
          type="button"
          onClick={() => { setMonthIdx(i => Math.min(months.length - 1, i + 1)); setSelectedDay(null); }}
          disabled={monthIdx === months.length - 1}
          className="p-1.5 rounded-lg disabled:opacity-30 transition-opacity"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
          aria-label={s.calMonthNext}
        >
          <ChevronRight size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: startDow }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const iso = `${currentMonth}-${String(day).padStart(2, '0')}`;
          const dayEvents = byDay[iso] ?? [];
          const hasGame     = dayEvents.some(e => e.type === 'game');
          const hasPractice = dayEvents.some(e => e.type === 'practice');
          const isSelected  = selectedDay === iso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : iso)}
              className="flex flex-col items-center py-1 rounded-lg transition-colors"
              style={{
                background: isSelected ? 'hsl(var(--pp-navy))' : dayEvents.length > 0 ? 'hsl(var(--pp-blue-light))' : 'transparent',
              }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: isSelected ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))' }}
              >
                {day}
              </span>
              <div className="flex gap-0.5 mt-0.5 h-2">
                {hasGame     && <span className="h-1.5 w-1.5 rounded-full" style={{ background: isSelected ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))' }} title={s.calGameDot} />}
                {hasPractice && <span className="h-1.5 w-1.5 rounded-full" style={{ background: isSelected ? 'hsl(var(--pp-white) / 0.7)' : 'hsl(var(--pp-blue))' }} title={s.calPracticeDot} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-4 rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatDate(selectedDay)}</p>
          {dayEventsForSelected.length === 0 ? (
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.calNoEventsDay}</span></p>
          ) : (
            dayEventsForSelected.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <div
                  className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: e.type === 'game' ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))' }}
                >
                  {e.type === 'game'
                    ? <Trophy size={11} style={{ color: 'hsl(var(--pp-white))' }} />
                    : <Footprints size={11} style={{ color: 'hsl(var(--pp-navy))' }} />
                  }
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{e.title}</p>
                  <p style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatTime(e.startTime)} · {e.location}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Schedule tab ─────────────────────────────────────────────────────────────

function ScheduleTab({
  player,
  team,
  getStat,
  setStat,
  isEventVisible,
  toggleEventVisibility,
  calFilter,
  setCalFilter,
  schedView,
  setSchedView,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  getStat: (playerId: string, eventId: string) => DemoStatEntry | null;
  setStat: (playerId: string, eventId: string, entry: DemoStatEntry) => void;
  isEventVisible: (eventId: string) => boolean;
  toggleEventVisibility: (eventId: string) => void;
  calFilter: CalFilter;
  setCalFilter: (f: CalFilter) => void;
  schedView: SchedView;
  setSchedView: (v: SchedView) => void;
}) {
  const [editingEvent, setEditingEvent] = useState<DemoEvent | null>(null);
  const isGk      = player.position === 'Goalkeeper';
  const allEvents = DEMO_EVENTS[team.id] ?? [];
  const s         = demo_parent_portal.scheduleTab;

  const filtered = allEvents.filter(e =>
    calFilter === 'games'     ? e.type === 'game' :
    calFilter === 'practices' ? e.type === 'practice' : true
  );

  const filterChips: { id: CalFilter; label: string }[] = [
    { id: 'all',       label: s.filterAll },
    { id: 'games',     label: s.filterGames },
    { id: 'practices', label: s.filterPractices },
  ];

  return (
    <div className="space-y-4">
      {/* View toggle + filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {/* List / Calendar toggle */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          {(['list', 'calendar'] as SchedView[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setSchedView(v)}
              className="px-3 py-1.5 text-xs font-medium transition-colors capitalize"
              style={{
                background: schedView === v ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
                color:      schedView === v ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
              }}
            >
              {v === 'list' ? s.viewList : s.viewCalendar}
            </button>
          ))}
        </div>

        {/* Filter chips */}
        {filterChips.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setCalFilter(chip.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={{
              background:  calFilter === chip.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
              color:       calFilter === chip.id ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
              borderColor: calFilter === chip.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            }}
          >
            {calFilter === chip.id && <Check size={10} />}
            <span>{chip.label}</span>
          </button>
        ))}
      </div>

      {/* Calendar view */}
      {schedView === 'calendar' && (
        <PpCard>
          <CalendarView events={allEvents} calFilter={calFilter} />
        </PpCard>
      )}

      {/* List view */}
      {schedView === 'list' && (
        <PpCard padding={false}>
          <div className="divide-y" style={{ borderColor: 'hsl(var(--pp-border))' }}>
            {filtered.length === 0 && (
              <p className="px-5 py-4 text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{s.noEvents}</span>
              </p>
            )}
            {filtered.map(event => {
              const stat    = getStat(player.id, event.id);
              const visible = isEventVisible(event.id);
              const isGame  = event.type === 'game';

              return (
                <div key={event.id} className="px-5 py-4 flex items-start gap-3" style={{ opacity: visible ? 1 : 0.45 }}>
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: isGame ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-blue-light))' }}
                  >
                    {isGame
                      ? <Trophy size={14} style={{ color: 'hsl(var(--pp-white))' }} />
                      : <Footprints size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{event.title}</p>
                      {isGame && (
                        <PpBadge variant={event.isHome ? 'success' : 'default'}>
                          <span>{event.isHome ? s.homeLabel : s.awayLabel}</span>
                        </PpBadge>
                      )}
                      {stat?.played && <PpBadge variant="info"><span>{s.playedLabel}</span></PpBadge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(event.date)}</span>
                      <span className="flex items-center gap-1"><Clock size={11} />{formatTime(event.startTime)}–{formatTime(event.endTime)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      <MapPin size={11} />{event.location}
                    </div>
                    {isGame && stat?.played && (
                      <div className="mt-2 flex gap-3 text-xs font-medium" style={{ color: 'hsl(var(--pp-navy))' }}>
                        {!isGk && <><span>{stat.goals ?? 0}G</span><span>{stat.assists ?? 0}A</span></>}
                        {isGk  && <><span>{stat.ga ?? 0} GA</span><span>{stat.saves ?? 0} SV</span>{stat.shutouts != null && <span>{stat.shutouts} SO</span>}</>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isGame && (
                      <button
                        type="button"
                        onClick={() => setEditingEvent(event)}
                        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                        style={{ background: 'hsl(var(--pp-blue-light))' }}
                        title={s.addStatsLabel}
                        aria-label={`${s.addStatsLabel}: ${event.title}`}
                      >
                        {stat?.played
                          ? <Pencil size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                          : <Plus   size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                        }
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleEventVisibility(event.id)}
                      className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                      style={{ background: 'hsl(var(--pp-page-bg))' }}
                      title={visible ? s.hideLabel : s.showLabel}
                      aria-label={visible ? s.hideLabel : s.showLabel}
                    >
                      {visible
                        ? <Eye    size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                        : <EyeOff size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </PpCard>
      )}

      {editingEvent && (
        <StatEntryForm
          event={editingEvent}
          playerId={player.id}
          isGk={isGk}
          existing={getStat(player.id, editingEvent.id)}
          onSave={entry => setStat(player.id, editingEvent.id, entry)}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────────────

function StatsTab({
  player,
  team,
  getStat,
  setStat,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  getStat: (playerId: string, eventId: string) => DemoStatEntry | null;
  setStat: (playerId: string, eventId: string, entry: DemoStatEntry) => void;
}) {
  const [editingEvent, setEditingEvent] = useState<DemoEvent | null>(null);
  const isGk      = player.position === 'Goalkeeper';
  const allEvents = DEMO_EVENTS[team.id] ?? [];
  const s         = demo_parent_portal.statsTab;

  const gameEvents = allEvents.filter(e => e.type === 'game');

  const playedGames = gameEvents
    .map(e => ({ event: e, stat: getStat(player.id, e.id) }))
    .filter((x): x is { event: DemoEvent; stat: DemoStatEntry } => x.stat !== null && x.stat.played);

  const totals = playedGames.reduce(
    (acc, { stat: st }) => ({
      gp:       acc.gp + 1,
      goals:    acc.goals   + (st.goals   ?? 0),
      assists:  acc.assists + (st.assists  ?? 0),
      ga:       st.ga      != null ? (acc.ga      ?? 0) + st.ga      : acc.ga,
      saves:    st.saves   != null ? (acc.saves   ?? 0) + st.saves   : acc.saves,
      shutouts: st.shutouts != null ? (acc.shutouts ?? 0) + st.shutouts : acc.shutouts,
    }),
    { gp: 0, goals: 0, assists: 0, ga: null as number | null, saves: null as number | null, shutouts: null as number | null }
  );

  return (
    <div className="space-y-4">
      {/* Season totals */}
      <PpCard>
        <PpSectionHeading icon={<Trophy size={14} />}>
          <span>{s.totalsHeading}</span>
        </PpSectionHeading>
        {playedGames.length === 0 ? (
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>{s.noStats}</span>
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}>{totals.gp}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.gpLabel}</span></p>
            </div>
            {!isGk && (
              <>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}>{totals.goals}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.goalsLabel}</span></p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}>{totals.assists}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.assistsLabel}</span></p>
                </div>
              </>
            )}
            {isGk && (
              <>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}>{totals.ga ?? 0}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.gaLabel}</span></p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}>{totals.saves ?? 0}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.savesLabel}</span></p>
                </div>
              </>
            )}
          </div>
        )}
      </PpCard>

      {/* Game log */}
      <PpCard padding={false}>
        <div className="px-5 pt-4 pb-2">
          <PpSectionHeading icon={<BarChart2 size={14} />}>
            <span>{s.gameLogHeading}</span>
          </PpSectionHeading>
        </div>
        {gameEvents.length === 0 ? (
          <p className="px-5 pb-4 text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}><span>{s.noGameLog}</span></p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'hsl(var(--pp-border))' }}>
            {gameEvents.map(event => {
              const stat   = getStat(player.id, event.id);
              const isHome = event.isHome ?? false;

              return (
                <div key={event.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                        {isHome ? s.vsLabel : s.atLabel} {event.opponent}
                      </p>
                      <PpBadge variant={isHome ? 'success' : 'default'}>
                        {isHome ? 'Home' : 'Away'}
                      </PpBadge>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatDate(event.date)}</p>
                    {stat?.played && (
                      <div className="mt-1 flex gap-2 text-xs font-medium" style={{ color: 'hsl(var(--pp-navy))' }}>
                        {!isGk && <><span>{stat.goals ?? 0}G</span><span>{stat.assists ?? 0}A</span></>}
                        {isGk  && <><span>{stat.ga ?? 0} GA</span><span>{stat.saves ?? 0} SV</span>{stat.shutouts != null && <span>{stat.shutouts} SO</span>}</>}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingEvent(event)}
                    className="p-1.5 rounded-lg shrink-0 transition-colors hover:opacity-80"
                    style={{ background: 'hsl(var(--pp-blue-light))' }}
                    aria-label={`${demo_parent_portal.scheduleTab.addStatsLabel}: ${event.title}`}
                  >
                    {stat?.played
                      ? <Pencil size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                      : <Plus   size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                    }
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PpCard>

      {editingEvent && (
        <StatEntryForm
          event={editingEvent}
          playerId={player.id}
          isGk={isGk}
          existing={getStat(player.id, editingEvent.id)}
          onSave={entry => setStat(player.id, editingEvent.id, entry)}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

// ─── Media helpers ────────────────────────────────────────────────────────────

/** Generate a stable unique ID for a new media item */
function newMediaId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Accepted MIME types for file picker */
const ACCEPTED_MEDIA = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

/** Max file size: 200 MB (videos can be large; blobs go to IDB not localStorage) */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function mimeToKind(mime: string): DemoMediaKind {
  if (mime.startsWith('video/')) return 'video';
  return 'photo';
}

// ─── Media viewer (lightbox) ──────────────────────────────────────────────────

function MediaViewer({
  item,
  onClose,
}: {
  item: DemoMediaItem;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!item.blobId) { setLoading(false); return; }
    getBlobUrl(item.blobId)
      .then(u => { setUrl(u); setLoading(false); })
      .catch(() => { setErr('Could not load file from this device.'); setLoading(false); });
  }, [item.blobId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'hsl(var(--viewer-overlay))' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5"
          style={{ background: 'hsl(var(--viewer-close-bg))' }}
          aria-label="Close"
        >
          <X size={16} style={{ color: 'hsl(var(--viewer-text))' }} />
        </button>

        {loading && (
          <div className="flex items-center justify-center h-64" style={{ background: 'hsl(var(--viewer-bg))' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: 'hsl(var(--viewer-text))' }} />
          </div>
        )}

        {!loading && err && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center" style={{ background: 'hsl(var(--viewer-bg))' }}>
            <AlertCircle size={32} style={{ color: 'hsl(var(--viewer-err))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--viewer-text))' }}>{err}</p>
            <p className="text-xs" style={{ color: 'hsl(var(--viewer-text-muted))' }}>
              Files are stored on this device only. They may have been cleared by the browser.
            </p>
          </div>
        )}

        {!loading && !err && !url && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center" style={{ background: 'hsl(var(--viewer-bg))' }}>
            <Film size={32} style={{ color: 'hsl(var(--viewer-text-dim))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--viewer-text-faint))' }}>
              No file attached to this item.
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--viewer-text-muted))' }}>
              Edit the item to attach a photo or video file.
            </p>
          </div>
        )}

        {!loading && url && item.mimeType?.startsWith('video/') && (
          <video
            src={url}
            controls
            autoPlay
            className="w-full max-h-[70vh] rounded-2xl"
            style={{ background: 'hsl(var(--viewer-bg))' }}
          />
        )}

        {!loading && url && !item.mimeType?.startsWith('video/') && (
          <img
            src={url}
            alt={item.title}
            className="w-full max-h-[70vh] object-contain rounded-2xl"
            style={{ background: 'hsl(var(--viewer-bg-dark))' }}
          />
        )}

        <div className="px-4 py-3" style={{ background: 'hsl(var(--viewer-bar))' }}>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--viewer-text))' }}>{item.title}</p>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--viewer-text-muted))' }}>
            {item.season} · {item.kind} · Added {item.addedAt}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Playlist viewer ──────────────────────────────────────────────────────────

function PlaylistViewer({
  collection,
  items,
  onClose,
}: {
  collection: DemoCollection;
  items: DemoMediaItem[];
  onClose: () => void;
}) {
  const m = demo_parent_portal.mediaTab;
  const clips = collection.itemIds
    .map(id => items.find(i => i.id === id))
    .filter((i): i is DemoMediaItem => !!i);

  const [idx, setIdx] = useState(0);
  const current = clips[idx];

  if (!current) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'hsl(var(--viewer-playlist-bg))' }}
        onClick={onClose}
      >
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'hsl(var(--viewer-text))' }}>{m.collectionNoClips}</p>
          <PpButton onClick={onClose}><span>{m.playlistClose}</span></PpButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'hsl(var(--viewer-playlist-bg))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--viewer-text-muted))' }}>
            <span>{m.playlistHeading}</span>
          </p>
          <p className="text-sm font-bold" style={{ color: 'hsl(var(--viewer-text))' }}>{collection.name}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close playlist">
          <X size={20} style={{ color: 'hsl(var(--viewer-text-faint))' }} />
        </button>
      </div>

      {/* Viewer — embedded, no backdrop click to close */}
      <div className="flex-1 flex items-center justify-center px-4 min-h-0 overflow-hidden">
        <div className="w-full max-w-2xl">
          {/* Inline viewer without the fixed-overlay wrapper */}
          <InlineMediaContent item={current} />
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 px-4 py-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="p-2 rounded-full disabled:opacity-30"
          style={{ background: 'hsl(var(--viewer-ctrl))' }}
          aria-label={m.playlistPrev}
        >
          <SkipBack size={18} style={{ color: 'hsl(var(--viewer-text))' }} />
        </button>
        <p className="text-xs" style={{ color: 'hsl(var(--viewer-text))' }}>
          {idx + 1} / {clips.length} — {current.title}
        </p>
        <button
          type="button"
          onClick={() => setIdx(i => Math.min(clips.length - 1, i + 1))}
          disabled={idx === clips.length - 1}
          className="p-2 rounded-full disabled:opacity-30"
          style={{ background: 'hsl(var(--viewer-ctrl))' }}
          aria-label={m.playlistNext}
        >
          <SkipForward size={18} style={{ color: 'hsl(var(--viewer-text))' }} />
        </button>
      </div>
    </div>
  );
}

/** Inline media content — used inside PlaylistViewer (no fixed overlay) */
function InlineMediaContent({ item }: { item: DemoMediaItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null); setLoading(true); setErr(null);
    if (!item.blobId) { setLoading(false); return; }
    getBlobUrl(item.blobId)
      .then(u => { setUrl(u); setLoading(false); })
      .catch(() => { setErr('Could not load file.'); setLoading(false); });
  }, [item.blobId, item.id]);

  if (loading) return (
    <div className="flex items-center justify-center h-48" style={{ background: 'hsl(var(--viewer-bg))' }}>
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: 'hsl(var(--viewer-text))' }} />
    </div>
  );
  if (err || !url) return (
    <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ background: 'hsl(var(--viewer-bg))' }}>
      <Film size={28} style={{ color: 'hsl(var(--viewer-text-dim))' }} />
      <p className="text-xs" style={{ color: 'hsl(var(--viewer-text-muted))' }}>{err ?? 'No file attached.'}</p>
    </div>
  );
  if (item.mimeType?.startsWith('video/')) return (
    <video src={url} controls autoPlay className="w-full max-h-[60vh] rounded-xl" style={{ background: 'hsl(var(--viewer-bg))' }} />
  );
  return (
    <img src={url} alt={item.title} className="w-full max-h-[60vh] object-contain rounded-xl" style={{ background: 'hsl(var(--viewer-bg-dark))' }} />
  );
}

// ─── Share sheet ──────────────────────────────────────────────────────────────

function ShareSheet({
  item,
  onClose,
}: {
  item: DemoMediaItem;
  onClose: () => void;
}) {
  const s = demo_parent_portal.shareSheet;
  const [caption, setCaption] = useState('');
  const [tags,    setTags]    = useState('');
  const [copied,  setCopied]  = useState(false);

  const isVideo = item.mimeType?.startsWith('video/');
  const fullCaption = [caption.trim(), tags.trim()].filter(Boolean).join('\n');

  const handleNativeShare = async () => {
    if (!item.blobId) {
      try { await navigator.share({ title: item.title, text: fullCaption }); } catch { /* cancelled */ }
      return;
    }
    try {
      const url = await getBlobUrl(item.blobId);
      if (!url) return;
      const blob = await fetch(url).then(r => r.blob());
      const ext  = item.mimeType?.split('/')[1] ?? 'bin';
      const file = new File([blob], `${item.title}.${ext}`, { type: item.mimeType });
      await navigator.share({ title: item.title, text: fullCaption, files: [file] });
    } catch { /* cancelled or unsupported */ }
  };

  const handleDownload = async () => {
    if (!item.blobId) return;
    const url = await getBlobUrl(item.blobId);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title}.${item.mimeType?.split('/')[1] ?? 'bin'}`;
    a.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullCaption || item.title);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            <span>{s.heading}</span> — {item.title}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
            <Info size={12} className="shrink-0 mt-0.5" />
            <span>{s.privateNote}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{s.captionLabel}</span>
            </label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder={s.captionPlaceholder}
              rows={3}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))', resize: 'vertical' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{s.tagsLabel}</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder={s.tagsPlaceholder}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}
            />
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{s.destinationsHeading}</span>
            </p>
            <div className="space-y-2">
              {[
                { icon: <Instagram size={14} />, label: s.destInstagram, note: s.destInstagramNote },
                { icon: <Facebook size={14} />,  label: s.destFacebook,  note: s.destFacebookNote  },
                { icon: <span className="text-xs font-bold leading-none">𝕏</span>, label: s.destX, note: s.destXNote },
              ].map(d => (
                <div key={d.label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span style={{ color: 'hsl(var(--pp-navy))' }}>{d.icon}</span>
                    <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{d.label}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{d.note}</p>
                </div>
              ))}
            </div>
          </div>

          {isVideo && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text-muted))', border: '1px solid hsl(var(--pp-border))' }}>
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>{s.collectionShareNote}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t shrink-0 space-y-2" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          {canNativeShare && (
            <PpButton onClick={handleNativeShare} className="w-full">
              <Share2 size={13} /><span>{s.nativeShareBtn}</span>
            </PpButton>
          )}
          {item.blobId && (
            <PpButton variant="outline" onClick={handleDownload} className="w-full">
              <Download size={13} /><span>{s.downloadBtn}</span>
            </PpButton>
          )}
          <PpButton variant="outline" onClick={handleCopy} className="w-full">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? s.copiedMsg : s.copyBtn}</span>
          </PpButton>
          <PpButton variant="ghost" onClick={onClose} className="w-full">
            <span>{s.cancelBtn}</span>
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── New collection modal ─────────────────────────────────────────────────────

function NewCollectionModal({
  highlights,
  onSave,
  onClose,
}: {
  highlights: DemoMediaItem[];
  onSave: (name: string, itemIds: string[]) => void;
  onClose: () => void;
}) {
  const nc = demo_parent_portal.newCollectionModal;
  const [name,     setName]     = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            <span>{nc.heading}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{nc.nameLabel}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={nc.namePlaceholder}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}
              autoFocus
            />
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{nc.selectClipsLabel}</span>
            </p>
            {highlights.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{nc.noHighlights}</span>
              </p>
            ) : (
              <div className="space-y-2">
                {highlights.map(h => {
                  const checked = selected.includes(h.id);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggle(h.id)}
                      className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                        background:  checked ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-page-bg))',
                      }}
                    >
                      <div
                        className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))', background: checked ? 'hsl(var(--pp-navy))' : 'transparent' }}
                      >
                        {checked && <Check size={11} style={{ color: 'hsl(var(--pp-white))' }} />}
                      </div>
                      <Film size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                      <span className="text-sm truncate" style={{ color: 'hsl(var(--pp-text))' }}>{h.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 flex gap-2 border-t shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <PpButton
            onClick={() => { if (name.trim() && selected.length > 0) onSave(name.trim(), selected); }}
            disabled={!name.trim() || selected.length === 0}
            className="flex-1"
          >
            <Check size={13} /><span>{nc.createBtn}</span>
          </PpButton>
          <PpButton variant="outline" onClick={onClose} className="flex-1">
            <span>{nc.cancelBtn}</span>
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Edit collection modal ────────────────────────────────────────────────────

function EditCollectionModal({
  collection,
  allHighlights,
  onSave,
  onClose,
}: {
  collection: DemoCollection;
  allHighlights: DemoMediaItem[];
  onSave: (updated: DemoCollection) => void;
  onClose: () => void;
}) {
  const ec = demo_parent_portal.editCollectionModal;
  const [name,    setName]    = useState(collection.name);
  const [itemIds, setItemIds] = useState<string[]>([...collection.itemIds]);

  const inCollection = new Set(itemIds);
  const available = allHighlights.filter(h => !inCollection.has(h.id));

  const moveUp   = (i: number) => { if (i === 0) return; const a = [...itemIds]; [a[i-1], a[i]] = [a[i], a[i-1]]; setItemIds(a); };
  const moveDown = (i: number) => { if (i === itemIds.length - 1) return; const a = [...itemIds]; [a[i], a[i+1]] = [a[i+1], a[i]]; setItemIds(a); };
  const remove   = (id: string) => setItemIds(ids => ids.filter(x => x !== id));
  const add      = (id: string) => setItemIds(ids => [...ids, id]);

  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            <span>{ec.heading}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{ec.nameLabel}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}
            />
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{ec.clipsLabel}</span>
            </p>
            {itemIds.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{demo_parent_portal.mediaTab.collectionNoClips}</span>
              </p>
            ) : (
              <div className="space-y-1.5">
                {itemIds.map((id, i) => {
                  const clip = allHighlights.find(h => h.id === id);
                  if (!clip) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
                    >
                      <GripVertical size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      <span className="flex-1 text-xs truncate" style={{ color: 'hsl(var(--pp-text))' }}>{clip.title}</span>
                      <button type="button" onClick={() => moveUp(i)} disabled={i === 0} className="p-1 disabled:opacity-30" aria-label="Move up">
                        <ChevronLeft size={12} style={{ color: 'hsl(var(--pp-text-muted))', transform: 'rotate(90deg)' }} />
                      </button>
                      <button type="button" onClick={() => moveDown(i)} disabled={i === itemIds.length - 1} className="p-1 disabled:opacity-30" aria-label="Move down">
                        <ChevronRight size={12} style={{ color: 'hsl(var(--pp-text-muted))', transform: 'rotate(90deg)' }} />
                      </button>
                      <button type="button" onClick={() => remove(id)} className="p-1" aria-label="Remove clip">
                        <X size={12} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{ec.addClipsLabel}</span>
              </p>
              <div className="space-y-1.5">
                {available.map(h => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => add(h.id)}
                    className="w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left"
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
                  >
                    <Plus size={12} style={{ color: 'hsl(var(--pp-navy))' }} />
                    <span className="text-xs truncate" style={{ color: 'hsl(var(--pp-text))' }}>{h.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex gap-2 border-t shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <PpButton
            onClick={() => onSave({ ...collection, name: name.trim() || collection.name, itemIds })}
            className="flex-1"
          >
            <Check size={13} /><span>{ec.saveBtn}</span>
          </PpButton>
          <PpButton variant="outline" onClick={onClose} className="flex-1">
            <span>{ec.cancelBtn}</span>
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Add media modal ──────────────────────────────────────────────────────────

function AddMediaModal({
  playerId,
  teamId,
  season,
  gameEvents,
  onAdd,
  onClose,
}: {
  playerId: string;
  teamId: string;
  season: string;
  gameEvents: DemoEvent[];
  onAdd: (item: DemoMediaItem) => void;
  onClose: () => void;
}) {
  const [kind,        setKind]        = useState<DemoMediaKind>('photo');
  const [title,       setTitle]       = useState('');
  const [gameEventId, setGameEventId] = useState('');
  const [file,        setFile]        = useState<File | null>(null);
  const [fileErr,     setFileErr]     = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = demo_parent_portal.mediaTab;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFileErr(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) {
      setFileErr('File is too large (max 200 MB). Choose a smaller file.');
      setFile(null);
      return;
    }
    setFile(f);
    const autoKind = mimeToKind(f.type);
    if (autoKind !== kind) setKind(autoKind);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const id = newMediaId();
    let blobId: string | undefined;
    let mimeType: string | undefined;

    if (file) {
      blobId   = id;
      mimeType = file.type;
      try {
        await idbPutBlob({ id: blobId, blob: file, mimeType: file.type });
      } catch {
        setFileErr('Could not save file to this device. Storage may be full.');
        setSaving(false);
        return;
      }
    }

    const item: DemoMediaItem = {
      id,
      playerId,
      teamId,
      season,
      kind,
      title:       title.trim(),
      gameEventId: gameEventId || undefined,
      thumbLabel:  `${kind.charAt(0).toUpperCase() + kind.slice(1)}: ${title.trim()}`,
      addedAt:     new Date().toISOString().slice(0, 10),
      blobId,
      mimeType,
    };
    onAdd(item);
    onClose();
  };

  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            <span>{m.addModalHeading}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Kind */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.addModalKindLabel}</span>
            </label>
            <div className="flex gap-2">
              {(['photo', 'video', 'highlight'] as DemoMediaKind[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    background:  kind === k ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
                    color:       kind === k ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                    borderColor: kind === k ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                  }}
                >
                  {k === 'photo' ? m.addModalKindPhoto : k === 'video' ? m.addModalKindVideo : m.addModalKindHighlight}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.addModalTitleLabel}</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={m.addModalTitlePlaceholder}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}
              autoFocus
            />
          </div>

          {/* File picker */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.addModalFileLabel}</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_MEDIA}
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Select media file"
            />
            {file ? (
              <div
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: 'hsl(var(--pp-navy))', background: 'hsl(var(--pp-blue-light))' }}
              >
                {file.type.startsWith('video/') ? <Film size={14} style={{ color: 'hsl(var(--pp-navy))' }} /> : <Camera size={14} style={{ color: 'hsl(var(--pp-navy))' }} />}
                <span className="flex-1 text-xs truncate" style={{ color: 'hsl(var(--pp-text))' }}>{file.name}</span>
                <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove file">
                  <X size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-xs font-medium transition-colors"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              >
                <Plus size={13} />
                <span>{m.addModalFileBtn}</span>
              </button>
            )}
            {fileErr && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                <AlertCircle size={11} />
                <span>{fileErr}</span>
              </div>
            )}
            <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.addModalFileHint}</span>
            </p>
          </div>

          {/* Game tag */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.addModalGameLabel}</span>
            </label>
            <select
              value={gameEventId}
              onChange={e => setGameEventId(e.target.value)}
              className={inputCls}
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}
            >
              <option value="">{m.addModalGameNone}</option>
              {gameEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.title} — {formatDate(ev.date)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 py-4 flex gap-2 border-t shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <PpButton onClick={handleAdd} disabled={!title.trim() || saving} className="flex-1">
            {saving
              ? <div className="h-3 w-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'hsl(var(--pp-white))' }} />
              : <Check size={13} />
            }
            <span>{m.addModalSaveBtn}</span>
          </PpButton>
          <PpButton variant="outline" onClick={onClose} className="flex-1">
            <span>{m.addModalCancelBtn}</span>
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Media tab ────────────────────────────────────────────────────────────────

function MediaTab({
  player,
  team,
  mediaItems,
  addMediaItem,
  removeMediaItem,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  mediaItems: DemoMediaItem[];
  addMediaItem: (item: DemoMediaItem) => void;
  removeMediaItem: (id: string) => void;
}) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [gameFilter,   setGameFilter]   = useState<string>('all');
  const [viewingItem,  setViewingItem]  = useState<DemoMediaItem | null>(null);
  const [sharingItem,  setSharingItem]  = useState<DemoMediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DemoMediaItem | null>(null);
  const [collections,  setCollections]  = useState<DemoCollection[]>([]);
  const [showNewColl,  setShowNewColl]  = useState(false);
  const [editingColl,  setEditingColl]  = useState<DemoCollection | null>(null);
  const [playingColl,  setPlayingColl]  = useState<DemoCollection | null>(null);

  const m          = demo_parent_portal.mediaTab;
  const allEvents  = DEMO_EVENTS[team.id] ?? [];
  const gameEvents = allEvents.filter(e => e.type === 'game');

  // Load collections from IDB on mount / player change
  useEffect(() => {
    idbGetAllCollections()
      .then(cols => {
        const playerItemIds = new Set(mediaItems.filter(i => i.playerId === player.id).map(i => i.id));
        setCollections(cols.filter(c => c.itemIds.some(id => playerItemIds.has(id))));
      })
      .catch(() => setCollections([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, mediaItems]);

  const playerItems = mediaItems.filter(item => item.playerId === player.id);
  const seasons     = [...new Set(playerItems.map(i => i.season))].sort();
  const highlights  = playerItems.filter(i => i.kind === 'highlight');

  const visible = playerItems.filter(item => {
    if (seasonFilter !== 'all' && item.season !== seasonFilter) return false;
    if (gameFilter   !== 'all') {
      if (gameFilter === 'untagged' && item.gameEventId) return false;
      if (gameFilter !== 'untagged' && item.gameEventId !== gameFilter) return false;
    }
    return true;
  });

  const kindIcon = (kind: DemoMediaKind) =>
    kind === 'photo' ? <Camera size={14} /> : kind === 'video' ? <Film size={14} /> : <Star size={14} />;

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.blobId) {
      await idbDeleteBlob(deleteTarget.blobId).catch(() => {});
      revokeBlobUrl(deleteTarget.blobId);
    }
    removeMediaItem(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleSaveCollection = async (name: string, itemIds: string[]) => {
    const col: DemoCollection = {
      id:        `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      itemIds,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    await idbPutCollection(col).catch(() => {});
    setCollections(prev => [...prev, col]);
    setShowNewColl(false);
  };

  const handleSaveEditCollection = async (updated: DemoCollection) => {
    await idbPutCollection(updated).catch(() => {});
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setEditingColl(null);
  };

  const handleDeleteCollection = async (id: string) => {
    await idbDeleteCollection(id).catch(() => {});
    setCollections(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <PpSectionHeading icon={<Film size={14} />}>
          <span>{m.heading}</span>
        </PpSectionHeading>
        <PpButton size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={12} /><span>{m.addItemBtn}</span>
        </PpButton>
      </div>

      {/* Storage note */}
      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
      >
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>{m.storageNote}</span>
      </div>

      {/* Season filter */}
      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {['all', ...seasons].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSeasonFilter(s)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                background:  seasonFilter === s ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
                color:       seasonFilter === s ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                borderColor: seasonFilter === s ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              }}
            >
              {s === 'all' ? <span>{m.seasonAll}</span> : s}
            </button>
          ))}
        </div>
      )}

      {/* Game tag filter */}
      {playerItems.some(i => i.gameEventId) && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all',      label: <span>{m.seasonAll}</span> },
            { key: 'untagged', label: <span>{m.gameTagNone}</span> },
            ...gameEvents
              .filter(e => playerItems.some(i => i.gameEventId === e.id))
              .map(e => ({ key: e.id, label: <><Tag size={10} /><span>{e.title} {formatDate(e.date)}</span></> })),
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGameFilter(key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                background:  gameFilter === key ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
                color:       gameFilter === key ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                borderColor: gameFilter === key ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Media grid or empty state */}
      {visible.length === 0 ? (
        <PpCard>
          <div
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-12 text-center"
            style={{ borderColor: 'hsl(var(--pp-border))' }}
          >
            <Film size={32} className="mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <p className="text-sm font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
              <span>{m.emptyHeading}</span>
            </p>
            <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.emptyNote}</span>
            </p>
          </div>
        </PpCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map(item => {
            const taggedGame = item.gameEventId ? gameEvents.find(e => e.id === item.gameEventId) : null;
            return (
              <div
                key={item.id}
                className="rounded-xl border p-3 flex items-start gap-3"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
              >
                {/* Thumb / play button */}
                <button
                  type="button"
                  onClick={() => setViewingItem(item)}
                  className="h-14 w-14 rounded-lg flex items-center justify-center shrink-0 relative group"
                  style={{ background: 'hsl(var(--pp-blue-light))' }}
                  aria-label={m.viewBtn}
                >
                  <span style={{ color: 'hsl(var(--pp-navy))' }}>{kindIcon(item.kind)}</span>
                  {item.blobId && (
                    <div
                      className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ background: 'hsl(var(--viewer-thumb-hover))' }}
                    >
                      {item.mimeType?.startsWith('video/') ? <Play size={16} style={{ color: 'hsl(var(--viewer-text))' }} /> : <Eye size={16} style={{ color: 'hsl(var(--viewer-text))' }} />}
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {item.season} · {item.kind}{item.blobId ? ' · file attached' : ''}
                  </p>
                  {taggedGame && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'hsl(var(--pp-blue))' }}>
                      <Tag size={10} />
                      {taggedGame.title} — {formatDate(taggedGame.date)}
                    </p>
                  )}
                  <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>Added {item.addedAt}</p>

                  {/* Action row */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setViewingItem(item)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors"
                      style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                    >
                      <Eye size={11} /><span>{m.viewBtn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSharingItem(item)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors"
                      style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                    >
                      <Share2 size={11} /><span>{m.shareBtn}</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  className="p-1 rounded-lg shrink-0 hover:opacity-80 transition-opacity"
                  style={{ background: 'hsl(var(--pp-page-bg))' }}
                  aria-label={m.removeBtn}
                  title={m.removeBtn}
                >
                  <Trash2 size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Highlight collections ─────────────────────────────────────────── */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <PpSectionHeading icon={<List size={14} />}>
            <span>{m.collectionsHeading}</span>
          </PpSectionHeading>
          <PpButton size="sm" onClick={() => setShowNewColl(true)} disabled={highlights.length === 0}>
            <Plus size={12} /><span>{m.newCollectionBtn}</span>
          </PpButton>
        </div>

        {collections.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 text-center"
            style={{ borderColor: 'hsl(var(--pp-border))' }}
          >
            <List size={24} className="mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.collectionEmptyNote}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map(col => {
              const clipCount = col.itemIds.filter(id => playerItems.some(i => i.id === id)).length;
              return (
                <div
                  key={col.id}
                  className="rounded-xl border p-3 flex items-center gap-3"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--pp-blue-light))' }}
                  >
                    <List size={14} style={{ color: 'hsl(var(--pp-navy))' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>{col.name}</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{clipCount} clip{clipCount !== 1 ? 's' : ''} · Created {col.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPlayingColl(col)}
                      className="p-1.5 rounded-lg"
                      style={{ background: 'hsl(var(--pp-blue-light))' }}
                      aria-label={m.collectionPlayBtn}
                      title={m.collectionPlayBtn}
                    >
                      <Play size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingColl(col)}
                      className="p-1.5 rounded-lg"
                      style={{ background: 'hsl(var(--pp-page-bg))' }}
                      aria-label={m.collectionEditBtn}
                      title={m.collectionEditBtn}
                    >
                      <Pencil size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCollection(col.id)}
                      className="p-1.5 rounded-lg"
                      style={{ background: 'hsl(var(--pp-page-bg))' }}
                      aria-label={m.collectionDeleteBtn}
                      title={m.collectionDeleteBtn}
                    >
                      <Trash2 size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {showAdd && (
        <AddMediaModal
          playerId={player.id}
          teamId={team.id}
          season={team.season}
          gameEvents={gameEvents}
          onAdd={addMediaItem}
          onClose={() => setShowAdd(false)}
        />
      )}

      {viewingItem && (
        <MediaViewer item={viewingItem} onClose={() => setViewingItem(null)} />
      )}

      {sharingItem && (
        <ShareSheet item={sharingItem} onClose={() => setSharingItem(null)} />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'hsl(var(--modal-overlay))' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl shadow-2xl p-6 text-center"
            style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
            onClick={e => e.stopPropagation()}
          >
            <Trash2 size={24} className="mx-auto mb-3" style={{ color: 'hsl(var(--destructive))' }} />
            <p className="text-sm font-bold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
              <span>{m.deleteConfirmHeading}</span>
            </p>
            <p className="text-xs mb-5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{m.deleteConfirmNote}</span>
            </p>
            <div className="flex gap-2">
              <PpButton onClick={handleDeleteConfirm} className="flex-1 !bg-destructive !text-destructive-foreground">
                <span>{m.deleteConfirmYes}</span>
              </PpButton>
              <PpButton variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1">
                <span>{m.deleteConfirmNo}</span>
              </PpButton>
            </div>
          </div>
        </div>
      )}

      {showNewColl && (
        <NewCollectionModal
          highlights={highlights}
          onSave={handleSaveCollection}
          onClose={() => setShowNewColl(false)}
        />
      )}

      {editingColl && (
        <EditCollectionModal
          collection={editingColl}
          allHighlights={highlights}
          onSave={handleSaveEditCollection}
          onClose={() => setEditingColl(null)}
        />
      )}

      {playingColl && (
        <PlaylistViewer
          collection={playingColl}
          items={playerItems}
          onClose={() => setPlayingColl(null)}
        />
      )}
    </div>
  );
}

// ─── Coach outreach form ──────────────────────────────────────────────────────

interface CoachEntry {
  id: string;
  name: string;
  school: string;
  division: string;
  position: string;
}

interface OutreachDraft {
  coachId: string;
  intro: string;
  selectedCollectionId: string;
  selectedGameIds: string[];
}

function CoachOutreachModal({
  player,
  team,
  mediaItems,
  gameEvents,
  onClose,
  initialCoachId,
  profileLinkUrl,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  mediaItems: DemoMediaItem[];
  gameEvents: DemoEvent[];
  onClose: () => void;
  /** Pre-select this coach when the modal opens (from "Draft email with this link") */
  initialCoachId?: string;
  /** Pre-insert this profile URL into the intro when the modal opens */
  profileLinkUrl?: string;
}) {
  const f = demo_parent_portal.coachOutreachForm;
  const coaches = f.coaches as CoachEntry[];

  const [collections, setCollections] = useState<DemoCollection[]>([]);

  useEffect(() => {
    const playerItemIds = new Set(mediaItems.filter(i => i.playerId === player.id).map(i => i.id));
    idbGetAllCollections()
      .then(cols => setCollections(cols.filter(c => c.itemIds.some(id => playerItemIds.has(id)))))
      .catch(() => setCollections([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  // Upcoming games: today or later (demo date is Oct 24 2026)
  const today = '2026-10-24';
  const upcomingGames = gameEvents.filter(e => e.date >= today);

  const defaultIntro = profileLinkUrl
    ? `Please find ${player.firstName}'s player profile here:\n${profileLinkUrl}`
    : '';

  const [draft, setDraft] = useState<OutreachDraft>({
    coachId: initialCoachId ?? '',
    intro: defaultIntro,
    selectedCollectionId: '',
    selectedGameIds: [],
  });
  const [showPreview, setShowPreview] = useState(false);
  const [draftSaved,  setDraftSaved]  = useState(false);

  const selectedCoach = coaches.find(c => c.id === draft.coachId);
  const selectedCollection = collections.find(c => c.id === draft.selectedCollectionId);

  const toggleGame = (id: string) => {
    setDraft(d => ({
      ...d,
      selectedGameIds: d.selectedGameIds.includes(id)
        ? d.selectedGameIds.filter(x => x !== id)
        : [...d.selectedGameIds, id],
    }));
  };

  const handleSaveDraft = () => {
    // Persist draft to localStorage under sc_demo_pp_outreach_draft
    try {
      localStorage.setItem('sc_demo_pp_outreach_draft', JSON.stringify(draft));
    } catch { /* quota — ignore in demo */ }
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 3000);
  };

  const inputCls = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';
  const outreachBorder = 'hsl(var(--pp-border))';
  const outreachBg     = 'hsl(var(--pp-page-bg))';
  const outreachText   = 'hsl(var(--pp-text))';

  // ── Preview panel ────────────────────────────────────────────────────────────
  if (showPreview) {
    const selectedGames = upcomingGames.filter(g => draft.selectedGameIds.includes(g.id));

    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'hsl(var(--modal-overlay))' }}
        onClick={() => setShowPreview(false)}
      >
        <div
          className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Preview header */}
          <div
            className="px-5 py-4 flex items-center justify-between border-b shrink-0"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-navy))' }}
          >
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--pp-white))', fontFamily: 'var(--font-heading)' }}>
                <span>{f.previewHeading}</span>
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-white) / 0.7)' }}>
                <span>{f.previewNote}</span>
              </p>
            </div>
            <button type="button" onClick={() => setShowPreview(false)} aria-label="Close preview">
              <X size={16} style={{ color: 'hsl(var(--pp-white))' }} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
            {/* To / From */}
            <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ borderColor: 'hsl(var(--pp-border))' }}>
              <div className="flex gap-3">
                <span className="w-10 text-xs font-semibold shrink-0 pt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>To</span>
                <div>
                  <p className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{selectedCoach?.name ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{selectedCoach?.position} · {selectedCoach?.school}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-10 text-xs font-semibold shrink-0 pt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>From</span>
                <div>
                  <p className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{player.firstName} {player.lastName}'s family</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{team.name} · {team.competition}</p>
                </div>
              </div>
            </div>

            {/* Introduction */}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>Introduction</p>
              <div
                className="rounded-xl border p-4 text-sm whitespace-pre-wrap"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              >
                {draft.intro.trim() || <span style={{ color: 'hsl(var(--pp-text-muted))' }}><em>No introduction written yet.</em></span>}
              </div>
            </div>

            {/* Collection */}
            {selectedCollection && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>Shared highlight collection</p>
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                  <List size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                  <span style={{ color: 'hsl(var(--pp-text))' }}>{selectedCollection.name}</span>
                  <PpBadge variant="info">{selectedCollection.itemIds.length} clip{selectedCollection.itemIds.length !== 1 ? 's' : ''}</PpBadge>
                </div>
              </div>
            )}

            {/* Tournament games */}
            {selectedGames.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>Games to watch</p>
                <div className="space-y-2">
                  {selectedGames.map(g => (
                    <div key={g.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                      <Trophy size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                      <div>
                        <span style={{ color: 'hsl(var(--pp-text))' }}>{g.title}</span>
                        <span className="ml-2 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatDate(g.date)} · {g.location}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Demo label */}
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
            >
              <Info size={12} className="shrink-0" />
              <span>{f.simDisclaimer}</span>
            </div>
          </div>

          <div className="px-5 py-4 border-t shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
            <PpButton onClick={() => setShowPreview(false)} className="w-full">
              <span>{f.previewCloseBtn}</span>
            </PpButton>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              <span>{f.heading}</span>
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {player.firstName} {player.lastName} · {team.name}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </button>
        </div>

        {/* Sim disclaimer */}
        <div
          className="mx-5 mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs shrink-0"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>{f.simDisclaimer}</span>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Coach selector */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.coachLabel}</span>
            </label>
            <select
              value={draft.coachId}
              onChange={e => setDraft(d => ({ ...d, coachId: e.target.value }))}
              className={inputCls}
              style={{ borderColor: outreachBorder, background: outreachBg, color: outreachText }}
            >
              <option value="">{f.coachPlaceholder}</option>
              {coaches.map((c: CoachEntry) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.school} ({c.division})
                </option>
              ))}
            </select>
            {selectedCoach && (
              <div
                className="mt-2 rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
              >
                <p className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{selectedCoach.position}</p>
                <p style={{ color: 'hsl(var(--pp-text-muted))' }}>{selectedCoach.school} · {selectedCoach.division}</p>
              </div>
            )}
          </div>

          {/* Introduction */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.introLabel}</span>
            </label>
            <textarea
              value={draft.intro}
              onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))}
              placeholder={f.introPlaceholder}
              rows={5}
              className={inputCls}
              style={{ borderColor: outreachBorder, background: outreachBg, color: outreachText, resize: 'vertical' }}
            />
            {profileLinkUrl && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2 text-[11px]"
                style={{ background: 'hsl(var(--pp-green-light))', border: '1px solid hsl(var(--pp-green))' }}>
                <Share2 size={11} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-green))' }} />
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: 'hsl(var(--pp-green))' }}>Player profile link included</p>
                  <p className="mt-0.5 font-mono truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>{profileLinkUrl}</p>
                  <p className="mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>Edit the intro above to adjust placement.</p>
                </div>
              </div>
            )}
            <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.introHint}</span>
            </p>
          </div>

          {/* Collections */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.collectionsLabel}</span>
            </p>
            {collections.length === 0 ? (
              <div
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-6 text-center"
                style={{ borderColor: 'hsl(var(--pp-border))' }}
              >
                <List size={22} className="mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                <p className="text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                  <span>{f.collectionsNoneHeading}</span>
                </p>
                <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span>{f.collectionsNoneNote}</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {collections.map(col => {
                  const checked = draft.selectedCollectionId === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setDraft(d => ({ ...d, selectedCollectionId: checked ? '' : col.id }))}
                      className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                        background:  checked ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-page-bg))',
                      }}
                    >
                      <div
                        className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))', background: checked ? 'hsl(var(--pp-navy))' : 'transparent' }}
                      >
                        {checked && <Check size={11} style={{ color: 'hsl(var(--pp-white))' }} />}
                      </div>
                      <List size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>{col.name}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{col.itemIds.length} clip{col.itemIds.length !== 1 ? 's' : ''} · Created {col.createdAt}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tournament / upcoming games */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.tournamentsLabel}</span>
            </p>
            <p className="text-[10px] mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{f.tournamentsHint}</span>
            </p>
            {upcomingGames.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{f.noGames}</span>
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingGames.map(g => {
                  const checked = draft.selectedGameIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGame(g.id)}
                      className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
                        background:  checked ? 'hsl(var(--pp-blue-light))' : 'hsl(var(--pp-page-bg))',
                      }}
                    >
                      <div
                        className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))', background: checked ? 'hsl(var(--pp-navy))' : 'transparent' }}
                      >
                        {checked && <Check size={11} style={{ color: 'hsl(var(--pp-white))' }} />}
                      </div>
                      <Trophy size={13} style={{ color: 'hsl(var(--pp-navy))' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{g.title}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{formatDate(g.date)} · {g.location}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t shrink-0 space-y-2" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          {draftSaved && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mb-2"
              style={{ background: 'hsl(var(--pp-badge-success-bg))', color: 'hsl(var(--pp-badge-success-fg))' }}
            >
              <Check size={12} />
              <span>{f.draftSavedMsg}</span>
            </div>
          )}
          <div className="flex gap-2">
            <PpButton
              onClick={() => setShowPreview(true)}
              disabled={!draft.coachId}
              className="flex-1"
            >
              <Eye size={13} />
              <span>{f.previewBtn}</span>
            </PpButton>
            <PpButton
              variant="outline"
              onClick={handleSaveDraft}
              className="flex-1"
            >
              <span>{f.saveDraftBtn}</span>
            </PpButton>
          </div>
          <PpButton variant="ghost" onClick={onClose} className="w-full">
            <span>{f.cancelBtn}</span>
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── Recruiting tab ───────────────────────────────────────────────────────────

export function LegacyRecruitingTab({
  player,
  team,
  mediaItems,
}: {
  player: DemoPlayer;
  team: DemoTeam;
  mediaItems: DemoMediaItem[];
}) {
  const [showOutreach, setShowOutreach] = useState(false);
  // When "Draft email with this link" is clicked in CoachShareTab, store the
  // target coach id and profile URL so CoachOutreachModal opens pre-filled.
  const [outreachCoachId, setOutreachCoachId] = useState<string | undefined>(undefined);
  const [outreachProfileUrl, setOutreachProfileUrl] = useState<string | undefined>(undefined);
  const r = demo_parent_portal.recruitingTab;
  const f = demo_parent_portal.coachOutreachForm;
  const demoCoaches = f.coaches as CoachEntry[];

  const allEvents  = DEMO_EVENTS[team.id] ?? [];
  const gameEvents = allEvents.filter(e => e.type === 'game');

  const fields = [
    { label: r.gpaLabel,      placeholder: r.gpaPlaceholder },
    { label: r.gradYearLabel, placeholder: r.gradYearPlaceholder },
    { label: r.divisionLabel, placeholder: r.divisionPlaceholder },
  ];

  /** Called from CoachShareTab "Draft email with this link" button */
  const handleDraftWithLink = (coachId: string, profileUrl: string) => {
    setOutreachCoachId(coachId);
    setOutreachProfileUrl(profileUrl);
    setShowOutreach(true);
  };

  return (
    <div className="space-y-4">
      {/* Reach out CTA — prominent, at the top */}
      <div
        className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: 'linear-gradient(135deg, hsl(var(--pp-navy)) 0%, hsl(var(--pp-blue)) 100%)' }}
      >
        <div className="flex-1">
          <p className="text-base font-bold mb-1" style={{ color: 'hsl(var(--pp-white))', fontFamily: 'var(--font-heading)' }}>
            <span>{r.reachOutBtn}</span>
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-white) / 0.75)' }}>
            <span>{r.reachOutSubtitle}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowOutreach(true)}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shrink-0 transition-opacity hover:opacity-90"
          style={{ background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-navy))' }}
        >
          <Star size={14} />
          <span>{r.reachOutBtn}</span>
        </button>
      </div>

      {/* Profile fields */}
      <PpCard>
        <div className="flex items-center justify-between mb-4">
          <PpSectionHeading icon={<Star size={14} />}>
            <span>{r.heading}</span>
          </PpSectionHeading>
          <span
            className="text-xs font-bold rounded px-2 py-1"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            <span>{r.phaseNote}</span>
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{r.intro}</span>
        </p>
        <div className="space-y-3">
          {fields.map(field => (
            <div key={field.label}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <span>{field.label}</span>
              </label>
              <input
                type="text"
                placeholder={field.placeholder}
                className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                style={{
                  borderColor: 'hsl(var(--pp-border))',
                  background:  'hsl(var(--pp-page-bg))',
                  color:       'hsl(var(--pp-text))',
                  opacity:     0.6,
                  cursor:      'not-allowed',
                }}
                readOnly
                disabled
              />
            </div>
          ))}
        </div>
        <p className="text-xs mt-3 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{r.readOnlyNote}</span>
        </p>
      </PpCard>

      {/* College programs placeholder */}
      <PpCard>
        <PpSectionHeading>
          <span>{r.programsHeading}</span>
        </PpSectionHeading>
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 text-center"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <Star size={24} className="mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>{r.programsEmpty}</span>
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {player.firstName}'s recruiting profile will be built here.
          </p>
        </div>
      </PpCard>

      {/* Coach profile sharing — synthetic demo mode, no API calls */}
      <CoachShareTab
        playerId={player.id}
        isDemoMode={true}
        savedCoaches={demoCoaches.map(c => ({
          coachId: c.id,
          name: c.name,
          role: c.position,
          email: null,
          institution: c.school,
          division: c.division,
        }))}
        onDraftWithLink={handleDraftWithLink}
      />

      {showOutreach && (
        <CoachOutreachModal
          player={player}
          team={team}
          mediaItems={mediaItems}
          gameEvents={gameEvents}
          initialCoachId={outreachCoachId}
          profileLinkUrl={outreachProfileUrl}
          onClose={() => {
            setShowOutreach(false);
            setOutreachCoachId(undefined);
            setOutreachProfileUrl(undefined);
          }}
        />
      )}
    </div>
  );
}

// ─── Recruiting gated (U15 and below) ────────────────────────────────────────

function RecruitingGated({ ageGroup }: { ageGroup: string }) {
  const g = demo_parent_portal.recruitingGated;
  return (
    <PpCard>
      <div className="flex flex-col items-center text-center py-8 gap-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Lock size={20} style={{ color: 'hsl(var(--pp-navy))' }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
          <span>{g.heading}</span>
        </p>
        <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{g.message}</span>
        </p>
        <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {g.hint.replace('{ageGroup}', ageGroup)}
        </p>
      </div>
    </PpCard>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const e = demo_parent_portal.emptyState;
  return (
    <div
      className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-16 text-center"
      style={{ borderColor: 'hsl(var(--pp-border))' }}
    >
      <User size={36} className="mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }} />
      <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
        <span>{e.message}</span>
      </p>
      <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        <span>{e.hint}</span>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentPortalDemoPage() {
  const [activeTab, setActiveTab] = useState<DemoTab>('profile');
  const {
    selection,
    setClub, setProgram, setAgeGroup, setTeam, setPlayer,
    getStat, setStat,
    isEventVisible, toggleEventVisibility,
    calFilter, setCalFilter,
    schedView, setSchedView,
    getPhoto, setPhoto, clearPhoto,
    photoError, clearPhotoError,
    mediaItems, addMediaItem, removeMediaItem,
    tryoutSaved, tryoutCal,
    saveTryout, unsaveTryout,
    addTryoutToCalendar, removeTryoutFromCalendar,
    reset,
  } = usePortalDemo();

  const selectedTeam   = DEMO_TEAMS.find(t => t.id === selection.teamId);
  const selectedClub   = DEMO_CLUBS.find(c => c.id === selection.clubId);
  const selectedPlayer = selectedTeam
    ? (DEMO_PLAYERS[selectedTeam.id] ?? []).find(p => p.id === selection.playerId)
    : undefined;

  // Recruiting is only shown for U16+ players
  const showRecruiting = !!selectedPlayer && RECRUITING_AGE_GROUPS.has(selectedPlayer.ageGroup);

  // If the active tab is 'recruiting' but the player is not eligible, reset to profile
  const safeTab: DemoTab = activeTab === 'recruiting' && !showRecruiting ? 'profile' : activeTab;

  const handleReset = useCallback(() => {
    reset();
    setActiveTab('profile');
  }, [reset]);

  // When player changes, stay on current tab unless it becomes invalid
  const handleTabChange = useCallback((t: DemoTab) => {
    if (t === 'recruiting' && !showRecruiting) return;
    setActiveTab(t);
  }, [showRecruiting]);
  const h = demo_parent_portal.header;

  return (
    <div className="pp-shell min-h-screen" style={{ background: 'hsl(var(--pp-page-bg))' }}>
      <Helmet>
        <title>Player Portal Demo — Soccer Center</title>
        <meta name="description" content="Presentation demo of the Soccer Center Parent and Player Portal. Sample data only." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <DemoBanner onReset={handleReset} />

      {/* Page header */}
      <div className="border-b px-4 py-4" style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold mb-0.5" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            <span>{h.title}</span>
          </h1>
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            <span>{h.subtitle}</span>
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

          {/* Left: selector + team summary */}
          <div className="space-y-4">
            <SelectorPanel
              selection={selection}
              setClub={setClub}
              setProgram={setProgram}
              setAgeGroup={setAgeGroup}
              setTeam={setTeam}
              setPlayer={setPlayer}
            />

            {selectedTeam && (
              <PpCard>
                <PpSectionHeading icon={<Trophy size={14} />}>
                  <span>{demo_parent_portal.teamCard.heading}</span>
                </PpSectionHeading>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'hsl(var(--pp-text))' }}>{selectedTeam.name}</p>
                <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{selectedTeam.competition} · {selectedTeam.season}</p>
                <PpDivider />
                <p className="text-xs mt-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {(DEMO_PLAYERS[selectedTeam.id] ?? []).length} sample players
                  · {(DEMO_EVENTS[selectedTeam.id] ?? []).filter(e => e.type === 'game').length} games
                  · {(DEMO_EVENTS[selectedTeam.id] ?? []).filter(e => e.type === 'practice').length} practices
                </p>
              </PpCard>
            )}
          </div>

          {/* Right: player content */}
          <div className="space-y-4">
            {!selectedPlayer ? (
              <EmptyState />
            ) : (
              <>
                <PlayerProfileHeader
                  player={selectedPlayer}
                  team={selectedTeam!}
                  club={selectedClub!}
                  getPhoto={getPhoto}
                  setPhoto={setPhoto}
                  clearPhoto={clearPhoto}
                  photoError={photoError}
                  clearPhotoError={clearPhotoError}
                />

                <div
                  className="rounded-2xl overflow-hidden border"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
                >
                  <PlayerTabNav
                    active={safeTab}
                    onChange={handleTabChange}
                    showRecruiting={showRecruiting}
                  />
                  <div className="p-5">
                    {safeTab === 'profile' && (
                      <ProfileTab
                        player={selectedPlayer}
                        team={selectedTeam!}
                        club={selectedClub!}
                      />
                    )}
                    {safeTab === 'schedule' && (
                      <ScheduleTab
                        player={selectedPlayer}
                        team={selectedTeam!}
                        getStat={getStat}
                        setStat={setStat}
                        isEventVisible={isEventVisible}
                        toggleEventVisibility={toggleEventVisibility}
                        calFilter={calFilter}
                        setCalFilter={setCalFilter}
                        schedView={schedView}
                        setSchedView={setSchedView}
                      />
                    )}
                    {safeTab === 'stats' && (
                      <StatsTab
                        player={selectedPlayer}
                        team={selectedTeam!}
                        getStat={getStat}
                        setStat={setStat}
                      />
                    )}
                    {safeTab === 'media' && (
                      <MediaTab
                        player={selectedPlayer}
                        team={selectedTeam!}
                        mediaItems={mediaItems}
                        addMediaItem={addMediaItem}
                        removeMediaItem={removeMediaItem}
                      />
                    )}
                    {safeTab === 'tryouts' && (
                      <DemoTryoutsTab
                        player={selectedPlayer}
                        clubId={selection.clubId}
                        savedMap={tryoutSaved}
                        calSet={tryoutCal}
                        onSave={saveTryout}
                        onUnsave={unsaveTryout}
                        onAddToCalendar={addTryoutToCalendar}
                        onRemoveFromCalendar={removeTryoutFromCalendar}
                      />
                    )}
                    {safeTab === 'recruiting' && showRecruiting && (
                      <RecruitingTab
                        player={selectedPlayer}
                        team={selectedTeam!}
                        mediaItems={mediaItems}
                      />
                    )}
                    {safeTab === 'recruiting' && !showRecruiting && (
                      <RecruitingGated ageGroup={selectedPlayer.ageGroup} />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecruitingTab({player,team}: {player:DemoPlayer;team:DemoTeam;mediaItems:DemoMediaItem[]}) {
  const request = useMemo(()=>createDemoRecruitingRequest(player.id),[player.id]);
  return <RecruitingData.Provider value={{demo:true,request}}><div className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">Synthetic recruiting workspace · browser-local saves and drafts · no external messages</div><FullRecruitingTab key={player.id} playerId={player.id} ageBand={team.ageGroup}/></RecruitingData.Provider>;
}
