import TeamChatCard from '@/components/portal/TeamChatCard';
/**
 * Parent Portal — LinkedIn-style profile home.
 * Blue/white/grey palette via .pp-shell scoped CSS.
 * Requires PARENT access type + portal allowlist.
 *
 * Layout matches approved Canva design:
 *  - Horizontal top nav: My profile | Players | Network | Calendar | Tryouts | Saved | Settings
 *  - Profile header: cover banner, overlapping avatar, name/role/location, bio, inline action buttons
 *  - Two-column: main content (My players list) + right sidebar (setup, tryouts, upcoming events)
 *  - Mobile: bottom nav
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import '@/styles/parent-home-polish.css';
import '@/styles/parent-recruiting-hub.css';
const ParentRecruitingHub = lazy(() => import('@/components/portal/ParentRecruitingHub'));
import { useNavigate, useLocation } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSession } from '@/lib/auth/auth-client';
import {
  Users, Calendar, Trophy, Settings, Plus, Pencil,
  Loader2, Shield, Dumbbell,
  Bookmark, Wifi, MapPin, ChevronDown, X, Camera, Check,
  Star, LogOut, MoreHorizontal, Eye, Trash2, MessageCircle,
} from 'lucide-react';
import {
  PpAvatar, PpCard, PpSectionHeading, PpButton, PpBadge,
  PpDivider,
} from '@/components/portal/PpPrimitives';
import { parent_portal_ui } from 'virtual:content';
import ParentOnboardingWizard from '@/components/portal/ParentOnboardingWizard';
import PpTryoutsTab from '@/components/portal/PpTryoutsTab';
import PpCalendarTab from '@/components/portal/PpCalendarTab';
import PpSettingsTab from '@/components/portal/PpSettingsTab';
import PpNewsContentWall from '@/components/portal/PpNewsContentWall';
import PpAdminMigrationPanel, { PpAdminSeedSourcesPanel, PpAdminSeedTeamSourcesPanel, PpAdminSeedTeamsPanel, PpAdminSchemaV5Panel, PpAdminSeedCompetitionsPanel, PpAdminSeedCatalogTeamsPanel, PpAdminSeedTeamCompetitionsPanel, PpAdminFanProfileSchemaPanel, PpAdminSchemaStatusPanel, PpAdminSchemaStatsPanel, PpAdminMatchRecordsSchemaPanel, PpAdminParentV2SchemaPanel, PpAdminPlayerMediaSchemaPanel, PpAdminRecruitingSchemaPanel, PpAdminPlayerSoftdeleteSchemaPanel } from '@/components/portal/PpAdminMigrationPanel';
import PpActivityFeed from '@/components/portal/PpActivityFeed';
import PpCommunityFeed from '@/components/portal/PpCommunityFeed';
import UpcomingEventsWidget from '@/components/portal/UpcomingEventsWidget';
import type { UpcomingEvent } from '@/components/portal/UpcomingEventsWidget';
import PpPhotosGallery from '@/components/portal/PpPhotosGallery';
import PpSourceFeed from '@/components/portal/PpSourceFeed';
import PpProSourceBrowser from '@/components/portal/PpProSourceBrowser';
import PpCommunityTab from '@/components/portal/PpCommunityTab';
import PpNetworkTab from '@/components/portal/PpNetworkTab';
import DevTab from '@/components/DevTab';
import DeletePlayerDialog from '@/components/portal/DeletePlayerDialog';
import { getClubLogoAsset } from '@/lib/portal/club-logos';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerProfile {
  id: string;
  label: string | null;
  ageBand: string | null;
  ageYears: number | null;
  positions: string[];
  primaryPosition: string | null;
  secondaryPosition: string | null;
  skillLevel: string | null;
  developmentInterests: string[];
  goals: string[];
  trainingMode: string | null;
  clubName: string | null;
  clubUrl: string | null;
  avatarInitials: string | null;
  avatarUrl: string | null;
  trainingPreferences: { focusAreas?: string[]; sessionLength?: string; frequency?: string } | null;
  tryoutInterest: boolean;
  sortOrder: number;
  // Season statistics (null = not yet entered)
  statGp:      number | null;
  statGoals:   number | null;
  statAssists: number | null;
  statShots:   number | null;
  statGa:      number | null;
  statSaves:   number | null;
  statSo:      number | null;
}

interface ParentProfileData {
  displayName: string | null;
  bio: string | null;
  avatarInitials: string | null;
  avatarUrl: string | null;
  coverStyle: string | null;
  coverImageUrl: string | null;
  city: string | null;
  timezone: string;
  privacyPrivate: boolean;
  onboardingStage: string | null;
  onboardingStepsCompleted: string[];
  clubName: string | null;
  clubUrl: string | null;
  teamIds: string[];
  competitionIds: string[];
  tryoutsEnabled: boolean;
  tryoutRegions: string[];
  tryoutAgeGroups: string[];
}

interface MeData {
  accessType: string | null;
  parentOnboardingDone: boolean;
  setupAllowed: boolean;
}

type PortalTab = 'profile' | 'players' | 'recruiting' | 'network' | 'development' | 'calendar' | 'tryouts' | 'saved' | 'settings';

// ─── Game-record summary types ────────────────────────────────────────────────

interface StatBucket {
  games:    number;
  goals:    number;
  assists:  number;
  ga:       number | null;   // goalkeeper: goals allowed
  saves:    number | null;   // goalkeeper: saves
  shutouts: number | null;   // goalkeeper: shutouts
}

interface PlayerRecordSummary {
  lifetime: StatBucket;
  bySeason: Record<string, StatBucket>;
}

/** Keyed by playerId. Absent key = no records for that player. */
type RecordSummaries = Record<string, PlayerRecordSummary>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
}

function playerName(p: PlayerProfile, idx: number) {
  return p.label ?? `Player ${idx + 1}`;
}


// ─── Top nav ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: PortalTab | 'camps'; label: string }[] = [
  { id: 'profile',     label: 'My profile' },
  { id: 'players',     label: 'Players' },
  { id: 'recruiting',  label: 'Recruiting' },
  { id: 'network',     label: 'Network / Messaging' },
  { id: 'development', label: 'Development' },
  { id: 'calendar',    label: 'Calendar' },
  { id: 'tryouts',     label: 'Tryouts' },
  { id: 'camps',       label: 'Camps' },
  { id: 'saved',       label: 'Saved' },
  { id: 'settings',    label: 'Settings' },
];

function PortalTopNav({ active, onChange }: { active: PortalTab; onChange: (t: PortalTab) => void }) {
  const [buildCommit, setBuildCommit] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parent/build-info', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { commit?: string } | null) => { if (d?.commit) setBuildCommit(d.commit); })
      .catch(() => {});
  }, []);
  async function handleSwitchToFan() {
    // Save fan preference BEFORE navigating so /my-soccer reads 'fan' from /me.
    // Use profile POST (same as PortalLayout) — portal-preference endpoint is
    // a separate path that may not exist yet on all deployments.
    try {
      await fetch('/api/my-soccer/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lastPortalPreference: 'fan' }),
      });
    } catch { /* non-fatal — navigate anyway */ }
    // Hard navigation resets meLoadedRef in my-soccer.tsx so the freshly
    // saved 'fan' preference is read cleanly from /me on mount.
    window.location.href = '/my-soccer';
  }

  async function handleLogout() {
    // Clear all arena/portal session state before signing out
    try {
      sessionStorage.removeItem('sc_portal_choice');
      sessionStorage.removeItem('sc_portal_preference');
    } catch { /* ignore */ }
    const { signOut } = await import('@/lib/auth/auth-client');
    await signOut();
    // Redirect to the public homepage, not the chooser
    window.location.href = '/';
  }

  return (
    <nav
      aria-label="Parent portal navigation"
      className="border-b overflow-x-auto"
      style={{
        background: 'hsl(var(--pp-card-bg))',
        borderColor: 'hsl(var(--pp-border))',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } as React.CSSProperties}
    >
      <div
        className="max-w-6xl mx-auto px-4 flex items-center min-w-max"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {NAV_ITEMS.map(item => item.id === 'camps' ? (
          <a key={item.id} href="/camps?from=parent" className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 border-transparent whitespace-nowrap" style={{ color: 'hsl(var(--pp-text-muted))' }}>Camps</a>
        ) : (
          <button
            key={item.id}
            type="button"
            onClick={() => { if (item.id !== 'camps') onChange(item.id); }}
            className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: active === item.id ? 'hsl(var(--pp-navy))' : 'transparent',
              color: active === item.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            {item.id === 'network' && <MessageCircle size={16} aria-hidden="true" className="inline-block mr-2 align-text-bottom" />}
            {item.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1 min-w-4" />

        {/* Build identifier — visible to confirm which build is running */}
        {buildCommit && (
          <span
            className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded mr-2 select-all"
            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            title="Server build commit — share this when reporting issues"
          >
            {buildCommit}
          </span>
        )}

        {/* Fan Arena switch */}
        <button
          type="button"
          onClick={handleSwitchToFan}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            color: 'hsl(var(--pp-text-muted))',
          }}
          title="Switch to Fan Arena"
        >
          <Star size={13} />
          Fan Arena
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            color: 'hsl(var(--pp-text-muted))',
          }}
          title="Sign out"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </nav>
  );
}

// ─── Profile edit modal ───────────────────────────────────────────────────────

function ProfileEditModal({
  profile,
  userEmail,
  v2ColsAvailable,
  onSave,
  onClose,
}: {
  profile: ParentProfileData | null;
  userEmail: string;
  v2ColsAvailable: boolean | null;
  onSave: (updated: Partial<ParentProfileData>) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Tracks the persisted URL returned by the upload endpoint
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);

  const initials = displayName.trim()
    ? displayName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : userEmail.slice(0, 2).toUpperCase();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let resolvedAvatarUrl = uploadedAvatarUrl;

      if (avatarFile) {
        setUploadingAvatar(true);
        const fd = new FormData();
        fd.append('file', avatarFile);
        fd.append('mediaType', 'avatar');
        const upRes = await fetch('/api/parent/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        setUploadingAvatar(false);
        if (!upRes.ok) {
          const b = await upRes.json().catch(() => ({})) as { error?: string };
          setError(b.error ?? 'Avatar upload failed');
          setSaving(false);
          return;
        }
        const upData = await upRes.json() as { publicUrl?: string };
        resolvedAvatarUrl = upData.publicUrl ?? null;
        setUploadedAvatarUrl(resolvedAvatarUrl);
      }

      const newInitials = displayName.trim()
        ? displayName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : undefined;

      const body: Record<string, unknown> = {
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        city: city.trim() || null,
      };
      if (newInitials) body.avatarInitials = newInitials;
      if (resolvedAvatarUrl !== undefined) body.avatarUrl = resolvedAvatarUrl;

      const res = await fetch('/api/parent/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setError(b.error ?? 'Save failed');
        setSaving(false);
        return;
      }
      onSave({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        city: city.trim() || null,
        avatarInitials: newInitials ?? profile?.avatarInitials ?? null,
        avatarUrl: resolvedAvatarUrl,
      });
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--modal-overlay))' }}
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between shrink-0 border-b"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
            Edit profile
          </h2>
          <button
            type="button"
            onClick={saving ? undefined : onClose}
            disabled={saving}
            className="rounded-full p-1 transition-colors disabled:opacity-40"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form id="profile-edit-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="h-16 w-16 rounded-full object-cover border-2"
                  style={{ borderColor: 'hsl(var(--pp-border))' }}
                />
              ) : (
                <div
                  className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold border-2"
                  style={{
                    background: 'hsl(var(--pp-blue))',
                    color: 'hsl(var(--pp-white))',
                    borderColor: 'hsl(var(--pp-border))',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={v2ColsAvailable === false}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center shadow border disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'hsl(var(--pp-navy))',
                  borderColor: 'hsl(var(--pp-white))',
                  color: 'hsl(var(--pp-white))',
                }}
                title={v2ColsAvailable === false ? 'Photo upload requires a schema migration — see Admin tab' : 'Change photo'}
                aria-label="Change profile photo"
              >
                <Camera size={11} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
                disabled={v2ColsAvailable === false}
              />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>Profile photo</p>
              {v2ColsAvailable === false ? (
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                  Photo saving requires a schema migration. Ask an admin to run the v2 migration from the Admin tab.
                </p>
              ) : (
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  JPG, PNG or GIF · max 5 MB
                </p>
              )}
              {avatarFile && (
                <button
                  type="button"
                  onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                  className="text-xs mt-1 underline"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="Your name"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2"
              style={{
                background: 'hsl(var(--pp-card-bg))',
                borderColor: 'hsl(var(--pp-border))',
                color: 'hsl(var(--pp-text))',
              }}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Short bio
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Soccer parent, coach, fan…"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 resize-none"
              style={{
                background: 'hsl(var(--pp-card-bg))',
                borderColor: 'hsl(var(--pp-border))',
                color: 'hsl(var(--pp-text))',
              }}
            />
            <p className="text-[10px] mt-0.5 text-right" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {bio.length}/300
            </p>
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              maxLength={80}
              placeholder="e.g. Denver, CO"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2"
              style={{
                background: 'hsl(var(--pp-card-bg))',
                borderColor: 'hsl(var(--pp-border))',
                color: 'hsl(var(--pp-text))',
              }}
            />
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2 border" style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive))', background: 'hsl(var(--destructive) / 0.05)' }}>
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div
          className="px-5 py-4 flex items-center justify-end gap-3 shrink-0 border-t"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="profile-edit-form"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> {uploadingAvatar ? 'Uploading…' : 'Saving…'}</>
            ) : (
              <><Check size={14} /> Save changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cover style presets ──────────────────────────────────────────────────────

const COVER_PRESETS = [
  { id: 'stadium-blue',  label: 'Stadium Blue' },
  { id: 'forest-green',  label: 'Forest Green' },
  { id: 'sunset-orange', label: 'Sunset Orange' },
  { id: 'midnight',      label: 'Midnight' },
  { id: 'pitch-dark',    label: 'Pitch Dark' },
  { id: 'gold-rush',     label: 'Gold Rush' },
] as const;

type CoverStyleId = typeof COVER_PRESETS[number]['id'];

// ─── Profile header ───────────────────────────────────────────────────────────

function ProfileHeader({ profile, userEmail, onEdit, onAddPlayer, onCoverChanged }: {
  profile: ParentProfileData | null;
  userEmail: string;
  onEdit: () => void;
  onAddPlayer: () => void;
  onCoverChanged: (update: { coverImageUrl?: string | null; coverStyle?: string | null }) => void;
}) {
  const initials = profile?.avatarInitials
    || (profile?.displayName
      ? profile.displayName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
      : userEmail.slice(0, 2).toUpperCase());
  const displayName = profile?.displayName || userEmail.split('@')[0];

  const [coverStyle, setCoverStyle] = useState<CoverStyleId>(
    (profile?.coverStyle as CoverStyleId | null | undefined) ?? 'stadium-blue'
  );
  // Custom photo URL — takes precedence over preset when set
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(profile?.coverImageUrl ?? null);
  // Object-position for repositioning the photo
  const [coverPosition, setCoverPosition] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);

  async function saveCoverStyle(style: CoverStyleId) {
    setSavingCover(true);
    setCoverError(null);
    setShowCoverPicker(false);
    try {
      const response = await fetch('/api/parent/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverStyle: style, coverImageUrl: null }),
      });
      if (!response.ok) throw new Error('Could not save cover. Please try again.');
      setCoverStyle(style);
      setCoverPhotoUrl(null);
      onCoverChanged({ coverStyle: style, coverImageUrl: null });
    } catch (error) { setCoverError(error instanceof Error ? error.message : 'Could not save cover.'); }
    finally { setSavingCover(false); }
  }

  async function handleCoverPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setCoverError(null);
    setShowCoverPicker(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/parent/profile/cover', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || 'Could not upload cover. Please try again.');
      }
      const { publicUrl } = await res.json() as { publicUrl: string };
      setCoverPhotoUrl(publicUrl);
      setCoverPosition({ x: 50, y: 50 });
      onCoverChanged({ coverImageUrl: publicUrl, coverStyle: null });
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Could not upload cover. Please try again.');
    } finally {
      setUploadingCover(false);
      // Reset file input so the same file can be re-selected
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  }

  // Drag-to-reposition: track pointer movement on the cover image
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  function handleRepoDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!repositioning) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: coverPosition.x, oy: coverPosition.y };
  }

  function handleRepoDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!repositioning || !dragStart.current || !coverRef.current) return;
    const rect = coverRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.current.px) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.current.py) / rect.height) * 100;
    setCoverPosition({
      x: Math.max(0, Math.min(100, dragStart.current.ox - dx)),
      y: Math.max(0, Math.min(100, dragStart.current.oy - dy)),
    });
  }

  function handleRepoDragEnd() {
    dragStart.current = null;
  }

  return (
    <div className="pp-home-profile pp-card mb-5">
      {/* Cover banner */}
      <div
        ref={coverRef}
        className="pp-home-cover pp-cover h-28 md:h-36 relative rounded-t-2xl overflow-hidden"
        data-cover-style={coverPhotoUrl ? undefined : coverStyle}
        style={coverPhotoUrl ? {
          backgroundImage: `url(${coverPhotoUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: `${coverPosition.x}% ${coverPosition.y}%`,
          cursor: repositioning ? 'grab' : undefined,
        } : undefined}
        onPointerDown={handleRepoDragStart}
        onPointerMove={handleRepoDragMove}
        onPointerUp={handleRepoDragEnd}
        onPointerCancel={handleRepoDragEnd}
      >
        {!coverPhotoUrl && (
          <div
            className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded"
            style={{
              background: 'hsl(var(--pp-cover-label-bg))',
              color: 'hsl(var(--pp-cover-label-fg))',
            }}
          >
            YOUR SOCCER WORLD
          </div>
        )}

        {/* Reposition hint */}
        {repositioning && coverPhotoUrl && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'hsl(var(--pp-navy) / 0.35)' }}
          >
            <p className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'hsl(var(--pp-navy) / 0.7)', color: 'hsl(var(--pp-white))' }}>
              Drag to reposition
            </p>
          </div>
        )}

        {/* Change cover button */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          {repositioning && coverPhotoUrl && (
            <button
              type="button"
              onClick={() => setRepositioning(false)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              <Check size={11} />
              Done
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (!repositioning) setShowCoverPicker(p => !p); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'hsl(var(--pp-cover-label-bg))',
              color: 'hsl(var(--pp-cover-label-fg))',
            }}
            aria-label="Change cover"
          >
            {(savingCover || uploadingCover)
              ? <Loader2 size={11} className="animate-spin" />
              : <Camera size={11} />}
            <span className="hidden sm:inline">
              {uploadingCover ? 'Uploading…' : 'Change cover'}
            </span>
          </button>
        </div>

        {/* Hidden file input for cover photo */}
        <input
          ref={coverFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleCoverPhotoChange}
        />
      </div>

        {/* Cover picker popover */}
        {showCoverPicker && (
          <div
            className="pp-home-cover-picker relative rounded-xl border p-3 mx-4 mt-14 mb-4"
            style={{ background: 'hsl(var(--pp-white))', minWidth: '220px' }}
          >
            {/* Upload photo option */}
            <button
              type="button"
              onClick={() => { setShowCoverPicker(false); coverFileRef.current?.click(); }}
              className="min-h-11 w-full flex items-center gap-2 text-sm font-semibold px-2 py-2 rounded-lg mb-2 transition-colors hover:bg-gray-50"
              style={{ color: 'hsl(var(--pp-navy))' }}
            >
              <Camera size={13} />
              Upload a photo
            </button>

            {/* Reposition option — only when a photo is set */}
            {coverPhotoUrl && (
              <button
                type="button"
                onClick={() => { setShowCoverPicker(false); setRepositioning(true); }}
                className="min-h-11 w-full flex items-center gap-2 text-sm font-semibold px-2 py-2 rounded-lg mb-2 transition-colors hover:bg-gray-50"
                style={{ color: 'hsl(var(--pp-navy))' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
                Reposition photo
              </button>
            )}

            <p className="text-[10px] font-semibold mb-1.5 mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Or choose a color
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {COVER_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => saveCoverStyle(preset.id)}
                  className="relative h-10 rounded-lg overflow-hidden focus-visible:outline focus-visible:outline-2 transition-transform hover:scale-105"
                  style={{ outline: (!coverPhotoUrl && coverStyle === preset.id) ? '2px solid hsl(var(--pp-blue))' : 'none' }}
                  aria-label={preset.label}
                  title={preset.label}
                >
                  <div className="pp-cover w-full h-full" data-cover-style={preset.id} />
                  {!coverPhotoUrl && coverStyle === preset.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check size={12} style={{ color: 'hsl(var(--pp-white))' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCoverPicker(false)}
              className="mt-2 w-full text-xs py-1 rounded-lg"
              style={{ color: 'hsl(var(--pp-text-muted))' }}
            >
              Cancel
            </button>
          </div>
        )}

      {coverError && <p role="alert" className="mx-4 mt-14 mb-4 text-sm">{coverError}</p>}
      {/* Identity row */}
      <div className="pp-home-identity px-5 pb-5">
        {/* Avatar overlapping cover — -mt-12 so the circle sits half-in, half-out */}
        <div className={`${showCoverPicker || coverError ? "mt-4" : "-mt-12"} mb-2 relative z-10`}>
          <PpAvatar
            initials={initials}
            photoUrl={profile?.avatarUrl ?? null}
            size="xl"
            className="border-4 shadow-lg"
            style={{ borderColor: 'hsl(var(--pp-white))' } as React.CSSProperties}
          />
        </div>

        {/* Name + role + location */}
        <h1
          className="text-xl font-bold mt-2"
          style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
        >
          {displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          <span className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {parent_portal_ui.identityCard.roleLabel}
          </span>
          {profile?.city && (
            <>
              <span style={{ color: 'hsl(var(--pp-border))' }}>·</span>
              <span className="flex items-center gap-1 text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <MapPin size={12} />
                {profile.city}
              </span>
            </>
          )}
        </div>

        {/* Privacy badge */}
        {profile?.privacyPrivate && (
          <div className="mt-1.5">
            <PpBadge variant="default">
              <Shield size={10} className="mr-1" />
              {parent_portal_ui.identityCard.privateBadge}
            </PpBadge>
          </div>
        )}

        {/* Bio */}
        {profile?.bio && (
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'hsl(var(--pp-text))' }}>
            {profile.bio}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <PpButton variant="primary" size="sm" onClick={onEdit}>
            <Pencil size={12} />
            Edit profile
          </PpButton>
          <PpButton variant="outline" size="sm" onClick={onAddPlayer}>
            <Plus size={12} />
            Add player
          </PpButton>
        </div>
      </div>
    </div>
  );
}

// ─── My Players list — individual rounded cards ───────────────────────────────

function MyPlayersList({ players, recordSummaries, summaryTableAvailable, onAddPlayer, onViewPlayer, onStartOnboarding, onPlayerDeleted }: {
  players: PlayerProfile[];
  recordSummaries: RecordSummaries;
  summaryTableAvailable: boolean | null;
  onAddPlayer: () => void;
  onViewPlayer: (idx: number) => void;
  onStartOnboarding: () => void;
  onPlayerDeleted: (playerId: string) => void;
}) {
  // Per-player season selection: 'lifetime' | season string (e.g. '2026-27')
  const [playerSeasonView, setPlayerSeasonView] = useState<Record<string, string>>({});
  // Per-card secondary menu open state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function getSeasonView(playerId: string, availableSeasons: string[]): string {
    const saved = playerSeasonView[playerId];
    if (saved && (saved === 'lifetime' || availableSeasons.includes(saved))) return saved;
    return availableSeasons.length > 0 ? availableSeasons[0] : 'lifetime';
  }

  function setSeasonView(playerId: string, season: string) {
    setPlayerSeasonView(prev => ({ ...prev, [playerId]: season }));
  }

  // Close the secondary menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    function handleClick() { setOpenMenuId(null); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  return (
    <PpCard>
      <PpSectionHeading
        action={
          players.length < 10 ? (
            <PpButton variant="outline" size="sm" onClick={onAddPlayer}>
              <Plus size={12} />
              {parent_portal_ui.familyOverview.addPlayerButton}
            </PpButton>
          ) : undefined
        }
      >
        My players
      </PpSectionHeading>

      {players.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <Users size={32} className="mx-auto" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {parent_portal_ui.familyOverview.noPlayersBody}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <PpButton onClick={onAddPlayer}>
              <Plus size={14} />
              {parent_portal_ui.familyOverview.addFirstPlayerButton}
            </PpButton>
            <a
              href="/demo/parent-portal"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium border transition-colors"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              Explore sample players →
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3 mt-1">
          {players.map((p, i) => {
            const name = playerName(p, i);
            const pos = p.primaryPosition ?? p.positions[0] ?? null;
            const isGk = pos?.toLowerCase().includes('goalkeeper') ?? false;

            const summary = recordSummaries[p.id] ?? null;
            const hasRecords = summary != null && summary.lifetime.games > 0;
            const availableSeasons = summary
              ? Object.keys(summary.bySeason).sort().reverse()
              : [];
            const seasonView = getSeasonView(p.id, availableSeasons);
            const bucket: StatBucket | null = hasRecords
              ? (seasonView === 'lifetime' ? summary.lifetime : (summary.bySeason[seasonView] ?? null))
              : null;

            const initials = p.avatarInitials
              ?? (p.label ? p.label.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?');

            return (
              <div
                key={p.id}
                className="pp-home-player rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-offset-1"
                style={{
                  borderColor: 'hsl(var(--pp-border))',
                  background: 'hsl(var(--pp-card-bg))',
                }}
              >
                {/* Card header: photo + name + actions */}
                <div className="pp-home-player-heading flex items-center gap-3 p-3">
                  {/* Avatar — show saved photo if available, initials fallback */}
                  <div className="shrink-0">
                    <PpAvatar
                      initials={initials}
                      photoUrl={p.avatarUrl ?? null}
                      size="md"
                    />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="pp-home-player-name text-sm font-semibold truncate"
                      style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
                    >
                      {name}
                    </p>
                    <p className="pp-home-player-meta text-xs truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {(() => {
                        const metaParts = [p.ageBand, p.clubName, pos].filter(Boolean);
                        if (metaParts.length === 0) return <span className="italic opacity-60">No details added</span>;
                        const logoAsset = getClubLogoAsset(p.clubName);
                        return (
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            {logoAsset && p.clubName && (
                              <img
                                src={logoAsset}
                                alt=""
                                width={28}
                                height={28}
                                className="inline-block shrink-0 rounded-sm object-contain"
                                style={{ verticalAlign: 'middle' }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <span>{metaParts.join(' · ')}</span>
                          </span>
                        );
                      })()}
                    </p>
                  </div>

                  {/* Primary action: View player */}
                  <button
                    type="button"
                    onClick={() => onViewPlayer(i)}
                    className="pp-home-player-open shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
                    style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
                    aria-label={`View ${name}`}
                  >
                    <Eye size={12} />
                    <span className="hidden sm:inline">View player</span>
                    <span className="sm:hidden">View</span>
                  </button>

                  {/* Secondary actions menu */}
                  <div className="pp-home-player-menu relative shrink-0">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === p.id ? null : p.id); }}
                      className="p-1.5 rounded-lg transition-colors focus-visible:outline focus-visible:outline-2"
                      style={{ color: 'hsl(var(--pp-text-muted))' }}
                      aria-label={`More options for ${name}`}
                      aria-expanded={openMenuId === p.id}
                      aria-haspopup="menu"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {openMenuId === p.id && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-xl shadow-xl z-20 overflow-hidden min-w-[160px]"
                        style={{ background: 'hsl(var(--pp-white))', border: '1px solid hsl(var(--pp-border))' }}
                        role="menu"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenuId(null); onViewPlayer(i); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:bg-gray-50"
                          style={{ color: 'hsl(var(--pp-text))' }}
                        >
                          <Pencil size={13} />
                          Edit player
                        </button>
                        <div style={{ borderTop: '1px solid hsl(var(--pp-border))' }} />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenuId(null); setDeleteTarget({ id: p.id, name }); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:bg-red-50"
                          style={{ color: 'hsl(var(--destructive))' }}
                        >
                          <Trash2 size={13} />
                          Remove player
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                {summaryTableAvailable !== false && (
                  <div className="pp-home-player-stats px-3 pb-3">
                    {!hasRecords ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          No game records yet
                        </span>
                        <button
                          type="button"
                          onClick={() => onViewPlayer(i)}
                          className="text-[11px] font-medium underline-offset-2 hover:underline"
                          style={{ color: 'hsl(var(--pp-blue))' }}
                        >
                          Add game
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        {/* Season / Lifetime toggle */}
                        <div className="pp-home-seasons flex items-center gap-0.5 rounded-full border overflow-hidden shrink-0"
                          style={{ borderColor: 'hsl(var(--pp-border))' }}>
                          {availableSeasons.map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSeasonView(p.id, s)}
                              className="text-[10px] font-semibold px-2 py-0.5 transition-colors"
                              style={{
                                background: seasonView === s ? 'hsl(var(--pp-navy))' : 'transparent',
                                color: seasonView === s ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                              }}
                            >
                              {s}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setSeasonView(p.id, 'lifetime')}
                            className="text-[10px] font-semibold px-2 py-0.5 transition-colors"
                            style={{
                              background: seasonView === 'lifetime' ? 'hsl(var(--pp-navy))' : 'transparent',
                              color: seasonView === 'lifetime' ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
                            }}
                          >
                            All
                          </button>
                        </div>

                        {bucket && (() => {
                          const chips = isGk
                            ? [
                                { label: 'GP',  value: bucket.games },
                                { label: 'GA',  value: bucket.ga    ?? 0, recorded: bucket.ga    != null },
                                { label: 'SV',  value: bucket.saves ?? 0, recorded: bucket.saves != null },
                                { label: 'SO',  value: bucket.shutouts ?? 0, recorded: bucket.shutouts != null },
                              ]
                            : [
                                { label: 'GP', value: bucket.games },
                                { label: 'G',  value: bucket.goals },
                                { label: 'A',  value: bucket.assists },
                              ];
                          return chips.map(chip => (
                            <span
                              key={chip.label}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                background: 'hsl(var(--pp-blue-light))',
                                color: 'hsl(var(--pp-navy))',
                                opacity: ('recorded' in chip && chip.recorded === false) ? 0.45 : 1,
                              }}
                            >
                              <span style={{ color: 'hsl(var(--pp-text-muted))' }}>{chip.label}</span>
                              <span>{chip.value}</span>
                            </span>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeletePlayerDialog
          playerId={deleteTarget.id}
          playerName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => { setDeleteTarget(null); onPlayerDeleted(id); }}
          onRestored={() => setDeleteTarget(null)}
        />
      )}
    </PpCard>
  );
}

// ─── Admin bootstrap panel ────────────────────────────────────────────────────
// Shown in Settings when the current user is NOT yet admin.
// Calls /api/parent/admin/grant-self-admin — only succeeds if the user's email
// is in the PARENT_PORTAL_TESTERS secret. After success the user must re-login.

function AdminBootstrapPanel() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'already' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleGrant() {
    setStatus('loading');
    try {
      const r = await fetch('/api/parent/admin/grant-self-admin', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json() as { ok?: boolean; already?: boolean; granted?: boolean; error?: string; next?: string };
      if (!r.ok) {
        setStatus('error');
        setMessage(d.error ?? `HTTP ${r.status}`);
        return;
      }
      if (d.already) {
        setStatus('already');
        setMessage('Your account already has admin access. Sign out and back in to refresh your session.');
        return;
      }
      setStatus('granted');
      setMessage(d.next ?? 'Admin access granted. Sign out and sign back in to activate it.');
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Request failed');
    }
  }

  return (
    <div
      className="mt-6 rounded-2xl border p-5"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-surface))' }}
    >
      <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
        Admin access
      </p>
      <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        If your email is in the admin allowlist, click below to activate admin access for your account.
        You will need to sign out and sign back in after granting.
      </p>

      {status === 'idle' && (
        <button
          type="button"
          onClick={() => void handleGrant()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
        >
          Grant admin access to my account
        </button>
      )}

      {status === 'loading' && (
        <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Checking allowlist…</p>
      )}

      {(status === 'granted' || status === 'already') && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
        >
          <p className="font-semibold mb-1">{status === 'granted' ? '✓ Admin access granted' : '✓ Already admin'}</p>
          <p className="text-xs">{message}</p>
          <button
            type="button"
            onClick={() => { try { sessionStorage.removeItem('sc_portal_choice'); sessionStorage.removeItem('sc_portal_preference'); } catch { /* ignore */ } void import('@/lib/auth/auth-client').then(m => m.signOut()).then(() => { window.location.href = '/'; }); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border"
            style={{ borderColor: 'hsl(var(--primary) / 0.4)', color: 'hsl(var(--primary))' }}
          >
            Sign out now →
          </button>
        </div>
      )}

      {status === 'error' && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}
        >
          <p className="font-semibold mb-1">Not granted</p>
          <p className="text-xs">{message}</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Make sure your email (Shawteone@gmail.com) is in the PARENT_PORTAL_TESTERS secret, then try again.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Network tab ──────────────────────────────────────────────────────────────

function NetworkTab() {
  return <PpNetworkTab />;
}

// ─── Saved tab ────────────────────────────────────────────────────────────────

interface SavedTryoutEntry {
  tryoutId: string;
  savedAt: string;
  found: boolean;
  clubName: string | null;
  city: string | null;
  level: string | null;
  ageGroups: string[];
  eventDate: string | null;
  location: string | null;
  registrationUrl: string | null;
  sourceUrl: string | null;
  isPast: boolean;
}

function SavedTab({ refreshKey, onUnsave }: { refreshKey?: number; onUnsave?: () => void }) {
  const [savedTryouts, setSavedTryouts] = useState<SavedTryoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/my-soccer/saved-tryouts-resolved', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { items: SavedTryoutEntry[] }) => setSavedTryouts(data.items ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleUnsave(tryoutId: string) {
    await fetch(`/api/my-soccer/saved-tryouts/${encodeURIComponent(tryoutId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setSavedTryouts(prev => prev.filter(t => t.tryoutId !== tryoutId));
    // Notify parent so Tryouts tab re-fetches its saved IDs
    onUnsave?.();
  }

  return (
    <div className="space-y-4">
      <PpCard>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Bookmark size={18} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div>
            <h2
              className="text-base font-semibold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              Saved opportunities
            </h2>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Tryouts and listings you&apos;ve saved
            </p>
          </div>
        </div>
        <PpDivider />

        {loading && (
          <div className="py-8 flex justify-center">
            <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm py-4 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {error}
          </p>
        )}

        {!loading && !error && savedTryouts.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No saved opportunities yet. Browse tryouts to save listings.
            </p>
          </div>
        )}

        {!loading && !error && savedTryouts.length > 0 && (
          <div className="space-y-2 mt-3">
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {savedTryouts.length} saved item{savedTryouts.length !== 1 ? 's' : ''}
            </p>
            {savedTryouts.map(t => (
              <div
                key={t.tryoutId}
                className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: 'hsl(var(--pp-border))',
                  background: t.found ? 'hsl(var(--pp-card-bg))' : 'hsl(var(--pp-page-bg))',
                  opacity: t.found ? 1 : 0.7,
                }}
              >
                <Trophy size={14} className="mt-0.5 shrink-0" style={{ color: t.found ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }} />
                <div className="flex-1 min-w-0">
                  {t.found ? (
                    <>
                      <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
                        {t.clubName}
                      </p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        {t.city && <span>{t.city}</span>}
                        {t.level && <span>{t.level}</span>}
                        {t.ageGroups.length > 0 && <span>{t.ageGroups.join(', ')}</span>}
                        {t.eventDate && <span>{t.eventDate}</span>}
                        {t.isPast && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                          >
                            Past
                          </span>
                        )}
                      </div>
                      {t.location && (
                        <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                          {t.location}
                        </p>
                      )}
                      <div className="flex gap-3 mt-1">
                        {t.registrationUrl && (
                          <a
                            href={t.registrationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium"
                            style={{ color: 'hsl(var(--pp-blue))' }}
                          >
                            Register ↗
                          </a>
                        )}
                        {t.sourceUrl && !t.registrationUrl && (
                          <a
                            href={t.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs"
                            style={{ color: 'hsl(var(--pp-blue))' }}
                          >
                            View listing ↗
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      This listing is no longer available
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnsave(t.tryoutId)}
                  className="shrink-0 p-1 rounded"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}
                  title="Remove from saved"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PpCard>
    </div>
  );
}

// ─── Right sidebar ────────────────────────────────────────────────────────────

function RightSidebar({ profile, meData, players, calendarRefreshKey, onStartOnboarding, onTabChange, onEventClick }: {
  profile: ParentProfileData | null;
  meData: MeData | null;
  players: PlayerProfile[];
  calendarRefreshKey: number;
  onStartOnboarding: () => void;
  onTabChange: (t: PortalTab) => void;
  onEventClick: (ev: UpcomingEvent) => void;
}) {
  const onboardingDone = meData?.parentOnboardingDone ?? false;
  const tryoutsOn = profile?.tryoutsEnabled ?? true;

  return (
    <div className="space-y-4">
      {/* Continue your setup */}
      {!onboardingDone && (
        <PpCard>
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
          >
            Continue your setup
          </p>
          <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {parent_portal_ui.rightSidebar.setupCtaBody}
          </p>
          <PpButton size="sm" onClick={onStartOnboarding}>
            {parent_portal_ui.rightSidebar.setupCtaButton}
          </PpButton>
        </PpCard>
      )}

      {/* Colorado tryouts — matching Canva design */}
      <PpCard>
        <p
          className="text-sm font-semibold mb-3"
          style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
        >
          Colorado tryouts
        </p>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tryoutsOn}
              readOnly
              className="rounded"
              style={{ accentColor: 'hsl(var(--pp-navy))' }}
            />
            <span className="text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
              Show on my profile
            </span>
          </label>
          <button
            type="button"
            onClick={() => onTabChange('tryouts')}
            className="flex items-center gap-2 text-sm w-full text-left"
            style={{ color: 'hsl(var(--pp-text))' }}
          >
            <Wifi size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
            Browse opportunities by club and age group
          </button>
        </div>
        <div className="mt-3">
          <PpButton variant="outline" size="sm" onClick={() => onTabChange('tryouts')}>
            Browse tryouts
          </PpButton>
        </div>
      </PpCard>

      {/* Upcoming events — real data from manual + iCal feed events */}
      <PpCard>
        <p
          className="text-sm font-semibold mb-3"
          style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
        >
          Upcoming events
        </p>
        <UpcomingEventsWidget
          playerNames={new Map(players.map(p => [p.id, p.label ?? 'Player']))}
          refreshKey={calendarRefreshKey}
          onEventClick={onEventClick}
          onCalendarClick={() => onTabChange('calendar')}
        />
      </PpCard>
    </div>
  );
}

// ─── Locked In card (visible to all authenticated parents) ────────────────────

function LockedInCard() {
  const navigate = useNavigate();
  return (
    <PpCard>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            {/* Lock icon inline — lucide not imported here, use SVG */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--pp-navy))' }} aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              Locked In
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Preview a simpler way to manage player verification, health documents and registration.
            </p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          Coming soon
        </span>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => navigate('/parent-portal/locked-in-demo')}
          className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
        >
          Explore demo
        </button>
      </div>
    </PpCard>
  );
}

// ─── Profile tab (main home view) ─────────────────────────────────────────────

type ProfileContentTab = 'feed' | 'sources' | 'community' | 'media';

function ProfileTab({ players, recordSummaries, summaryTableAvailable, onAddPlayer, onViewPlayer, onStartOnboarding, onPlayerDeleted }: {
  players: PlayerProfile[];
  recordSummaries: RecordSummaries;
  summaryTableAvailable: boolean | null;
  onAddPlayer: () => void;
  onViewPlayer: (idx: number) => void;
  onStartOnboarding: () => void;
  onPlayerDeleted: (playerId: string) => void;
}) {
  const [contentTab, setContentTab] = useState<ProfileContentTab>('feed');

  const CONTENT_TABS: { id: ProfileContentTab; label: string }[] = [
    { id: 'feed',      label: 'My Feed' },
    { id: 'sources',   label: 'Sources' },
    { id: 'community', label: 'Community' },
    { id: 'media',     label: 'Media' },
  ];

  return (
    <div className="space-y-4">
      <MyPlayersList
        players={players}
        recordSummaries={recordSummaries}
        summaryTableAvailable={summaryTableAvailable}
        onAddPlayer={onAddPlayer}
        onViewPlayer={onViewPlayer}
        onStartOnboarding={onStartOnboarding}
        onPlayerDeleted={onPlayerDeleted}
      />

      {/* ── Locked In card ── */}
      <LockedInCard />

      {/* ── Player Portal Demo entry ── */}
      <PpCard>
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <Users size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
              Player Portal Demo
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Explore the presentation demo — club selection, player profiles, schedule and stats.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <a
            href="/demo/parent-portal"
            className="inline-block rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          >
            Open demo →
          </a>
        </div>
      </PpCard>

      {/* Content wall sub-nav */}
      <div
        className="pp-home-feed-tabs flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
        role="tablist"
        aria-label="Profile content sections"
      >
        {CONTENT_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={contentTab === tab.id}
            onClick={() => setContentTab(tab.id)}
            className="text-xs px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{
              background: contentTab === tab.id ? 'hsl(var(--pp-navy))' : 'transparent',
              color: contentTab === tab.id ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-navy))',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {contentTab === 'feed' && (
        <>
          <PpActivityFeed />
          <PpCommunityFeed />
          <PpNewsContentWall />
        </>
      )}
      {contentTab === 'sources' && (
        <>
          <PpSourceFeed mode="manage" />
          <PpProSourceBrowser />
        </>
      )}
      {contentTab === 'community' && <PpCommunityTab />}
      {contentTab === 'media' && <PpPhotosGallery />}
    </div>
  );
}

// ─── Mobile sidebar panel (collapsible, shown below profile header on mobile) ──

function MobileSidebarPanel({ profile, meData, players, calendarRefreshKey, onStartOnboarding, onTabChange, onEventClick }: {
  profile: ParentProfileData | null;
  meData: MeData | null;
  players: PlayerProfile[];
  calendarRefreshKey: number;
  onStartOnboarding: () => void;
  onTabChange: (t: PortalTab) => void;
  onEventClick: (ev: UpcomingEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const onboardingDone = meData?.parentOnboardingDone ?? false;
  const tryoutsOn = profile?.tryoutsEnabled ?? true;

  return (
    <div
      className="lg:hidden mb-4 pp-card overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
          {!onboardingDone ? 'Setup · Tryouts · Events' : 'Tryouts · Upcoming events'}
        </span>
        <ChevronDown
          size={15}
          style={{ color: 'hsl(var(--pp-text-muted))' }}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="border-t px-4 pb-4 pt-3 space-y-4"
          style={{ borderColor: 'hsl(var(--pp-border))' }}
        >
          {/* Setup progress */}
          {!onboardingDone && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                Continue your setup
              </p>
              <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {parent_portal_ui.rightSidebar.setupCtaBody}
              </p>
              <PpButton size="sm" onClick={onStartOnboarding}>
                {parent_portal_ui.rightSidebar.setupCtaButton}
              </PpButton>
            </div>
          )}

          {/* Tryout preferences */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
              Colorado tryouts
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tryoutsOn}
                  readOnly
                  className="rounded"
                  style={{ accentColor: 'hsl(var(--pp-navy))' }}
                />
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}>
                  Show on my profile
                </span>
              </label>
              <button
                type="button"
                onClick={() => { setOpen(false); onTabChange('tryouts'); }}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: 'hsl(var(--pp-blue))' }}
              >
                <Wifi size={11} />
                Browse tryout opportunities
              </button>
            </div>
          </div>

          {/* Upcoming events — real data */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
              Upcoming events
            </p>
            <UpcomingEventsWidget
              playerNames={new Map(players.map(p => [p.id, p.label ?? 'Player']))}
              refreshKey={calendarRefreshKey}
              onEventClick={ev => { setOpen(false); onEventClick(ev); }}
              onCalendarClick={() => { setOpen(false); onTabChange('calendar'); }}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}



const MOBILE_NAV: { id: PortalTab; icon: React.ReactNode; label: string }[] = [
  { id: 'profile',     icon: <Users size={18} />,    label: 'Profile' },
  { id: 'development', icon: <Dumbbell size={18} />, label: 'Development' },
  { id: 'calendar',    icon: <Calendar size={18} />, label: 'Calendar' },
  { id: 'tryouts',     icon: <Trophy size={18} />,   label: 'Tryouts' },
  { id: 'settings',    icon: <Settings size={18} />, label: 'Settings' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ParentPortalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: sessionUser, isPending, isAuthenticated } = useSession();

  const [meData, setMeData] = useState<MeData | null>(null);
  const [profile, setProfile] = useState<ParentProfileData | null>(null);
  const [v2ColsAvailable, setV2ColsAvailable] = useState<boolean | null>(null);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [recordSummaries, setRecordSummaries] = useState<RecordSummaries>({});
  const [summaryTableAvailable, setSummaryTableAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Increment to trigger UpcomingEventsWidget refresh after calendar mutations
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  // Increment to trigger SavedTab re-fetch after save/unsave in Tryouts tab
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  // Increment to trigger PpTryoutsTab saved-IDs re-fetch after unsave in Saved tab
  const [tryoutsRefreshKey, setTryoutsRefreshKey] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab') as PortalTab | null;
    const validTabs: PortalTab[] = ['profile', 'players', 'recruiting', 'network', 'development', 'calendar', 'tryouts', 'saved', 'settings'];
    return (t && validTabs.includes(t)) ? t : 'profile';
  });
  const [initialPlayerFilter] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('player');
  });

  useEffect(() => {
    if (isPending) return;
    if (!isAuthenticated) { navigate('/login/auth'); return; }
  }, [isPending, isAuthenticated, navigate]);

  // Add body class so the global CSS can hide the Inbox launcher at body level
  // (the widget mounts outside .pp-shell so scoped selectors don't reach it)
  useEffect(() => {
    document.body.classList.add('sc-portal-active');
    return () => { document.body.classList.remove('sc-portal-active'); };
  }, []);

  // Refresh the upcoming events widget whenever the user leaves the calendar tab
  // (they may have added/edited/deleted events while there).
  const prevTabRef = useRef<PortalTab>(activeTab);
  useEffect(() => {
    if (prevTabRef.current === 'calendar' && activeTab !== 'calendar') {
      setCalendarRefreshKey(k => k + 1);
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, profileRes, playersRes, summaryRes] = await Promise.all([
        apiFetch('/api/my-soccer/me'),
        apiFetch('/api/parent/profile'),
        apiFetch('/api/parent/players'),
        apiFetch('/api/parent/players/match-records-summary'),
      ]);

      if (meRes.status === 403) { navigate('/my-soccer'); return; }
      if (!meRes.ok) throw new Error('Failed to load account data');

      const meJson = await meRes.json() as MeData;
      setMeData(meJson);

      if (meJson.accessType !== 'PARENT') { navigate('/my-soccer'); return; }

      if (profileRes.ok) {
        const pj = await profileRes.json() as { profile: ParentProfileData | null; v2ColsAvailable?: boolean };
        setProfile(pj.profile);
        setV2ColsAvailable(pj.v2ColsAvailable ?? null);
      }
      if (playersRes.ok) {
        const plj = await playersRes.json() as { players: PlayerProfile[] };
        setPlayers(plj.players ?? []);
      }
      if (summaryRes.ok) {
        const sj = await summaryRes.json() as { tableAvailable: boolean; totals: RecordSummaries };
        setSummaryTableAvailable(sj.tableAvailable);
        setRecordSummaries(sj.totals ?? {});
      } else {
        console.warn('[parent-portal] match-records-summary fetch failed:', summaryRes.status, summaryRes.statusText);
      }

      if (!meJson.parentOnboardingDone) setShowWizard(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { if (isAuthenticated) loadAll(); }, [isAuthenticated, loadAll]);

  // Re-fetch the player list when the player profile page signals a photo change.
  // Uses a localStorage key written by parent-portal-player.tsx after a successful upload.
  // This keeps the My Players card avatars current without a full page reload.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== 'sc_pp_player_photo_updated') return;
      // Lightweight re-fetch of just the players list
      apiFetch('/api/parent/players')
        .then(r => r.ok ? r.json() : null)
        .then((d: { players?: PlayerProfile[] } | null) => {
          if (d?.players) setPlayers(d.players);
        })
        .catch(() => { /* non-critical */ });
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  async function handleTryoutsToggle(v: boolean) {
    setProfile(p => p ? { ...p, tryoutsEnabled: v } : p);
    await apiFetch('/api/parent/profile', { method: 'PUT', body: JSON.stringify({ tryoutsEnabled: v }) });
  }

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error}</p>
        <PpButton onClick={loadAll}>Try again</PpButton>
      </div>
    );
  }

  if (showWizard) {
    return (
      <ParentOnboardingWizard
        onComplete={() => { setShowWizard(false); loadAll(); }}
        onDismiss={() => setShowWizard(false)}
      />
    );
  }

  const showRightSidebar = activeTab === 'profile' || activeTab === 'players';

  return (
    <div className={activeTab === 'profile' ? 'pp-home-polish' : undefined}>
      <Helmet>
        <title>Parent Portal | Soccer Center</title>
        <meta name="description" content="Manage your family's soccer journey — players, tryouts, calendar, and more." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Tab nav */}
      <PortalTopNav active={activeTab} onChange={setActiveTab} />

      {/* Page body */}
      <div className="pp-home-body max-w-6xl mx-auto px-4 py-5 pb-20 md:pb-6">

        {/* Profile header — always visible */}
        <ProfileHeader
          profile={profile}
          userEmail={sessionUser?.email ?? ''}
          onEdit={() => setShowProfileEdit(true)}
          onAddPlayer={() => navigate('/parent-portal/players/new')}
          onCoverChanged={(update) => setProfile(prev => prev ? { ...prev, ...update } : prev)}
        />

        {/* Inline profile edit modal */}
        {showProfileEdit && (
          <ProfileEditModal
            profile={profile}
            userEmail={sessionUser?.email ?? ''}
            v2ColsAvailable={v2ColsAvailable}
            onSave={(updated) => setProfile(prev => prev ? { ...prev, ...updated } : prev)}
            onClose={() => setShowProfileEdit(false)}
          />
        )}

        {/* Mobile sidebar panel — setup, tryouts, events (hidden on desktop) */}
        {showRightSidebar && (
          <MobileSidebarPanel
            profile={profile}
            meData={meData}
            players={players}
            calendarRefreshKey={calendarRefreshKey}
            onStartOnboarding={() => setShowWizard(true)}
            onTabChange={setActiveTab}
            onEventClick={ev => { setActiveTab('calendar'); void ev; }}
          />
        )}

        {/* Two-column layout: main + right sidebar */}
        <div className="pp-home-columns flex gap-5 items-start">
          {/* Main content */}
          <main className="flex-1 min-w-0">
            {activeTab === 'profile' && (
              <>
              <ProfileTab
                players={players}
                recordSummaries={recordSummaries}
                summaryTableAvailable={summaryTableAvailable}
                onAddPlayer={() => navigate('/parent-portal/players/new')}
                onViewPlayer={(idx) => navigate(`/parent-portal/players/${players[idx]?.id}`)}
                onStartOnboarding={() => setShowWizard(true)}
                onPlayerDeleted={(id) => setPlayers(prev => prev.filter(p => p.id !== id))}
              />
              </>
            )}
            {activeTab === 'players' && (
              <MyPlayersList
                players={players}
                recordSummaries={recordSummaries}
                summaryTableAvailable={summaryTableAvailable}
                onAddPlayer={() => navigate('/parent-portal/players/new')}
                onViewPlayer={(idx) => navigate(`/parent-portal/players/${players[idx]?.id}`)}
                onStartOnboarding={() => setShowWizard(true)}
                onPlayerDeleted={(id) => setPlayers(prev => prev.filter(p => p.id !== id))}
              />
            )}
            {activeTab === 'recruiting' && <Suspense fallback={<p role="status">Loading recruiting hub…</p>}><ParentRecruitingHub players={players} /></Suspense>}
            {activeTab === 'network' && <><TeamChatCard key={players.map(p => p.id).join(':')} /><NetworkTab /></>}
            {activeTab === 'development' && (
              <div>
                <DevTab
                  onSave={async () => {}}
                  onUnsave={async () => {}}
                />
              </div>
            )}
            {activeTab === 'calendar' && <PpCalendarTab players={players.map(p => ({ id: p.id, label: p.label }))} initialPlayerFilter={initialPlayerFilter ?? undefined} />}
            {activeTab === 'tryouts' && (
              <PpTryoutsTab
                tryoutsEnabled={profile?.tryoutsEnabled ?? true}
                onToggle={handleTryoutsToggle}
                onSaveChange={() => setSavedRefreshKey(k => k + 1)}
                savedRefreshKey={tryoutsRefreshKey}
              />
            )}
            {activeTab === 'saved' && (
              <SavedTab
                refreshKey={savedRefreshKey}
                onUnsave={() => setTryoutsRefreshKey(k => k + 1)}
              />
            )}
            {activeTab === 'settings' && (
              <>
                <PpSettingsTab
                  playerNames={players.map((p, i) => p.label ?? `Player ${i + 1}`)}
                  playerIds={players.map(p => p.id)}
                  userEmail={sessionUser?.email ?? ''}
                  profilePrivate={profile?.privacyPrivate ?? true}
                  onPrivacyChange={async (v) => {
                    setProfile(p => p ? { ...p, privacyPrivate: v } : p);
                    await apiFetch('/api/parent/profile', { method: 'PUT', body: JSON.stringify({ privacyPrivate: v }) });
                  }}
                />
                {sessionUser?.isAdmin ? (
                  <div className="mt-6 flex flex-col gap-4">
                    {/* ── PlayMetrics Integration Pilot ── */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-blue-900 text-sm">PlayMetrics Integration Pilot</div>
                          <div className="text-xs text-blue-700 mt-0.5">
                            Team-to-player workflow demonstration · Demo data only
                          </div>
                        </div>
                        <a
                          href="/parent-portal/pilot"
                          className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                        >
                          Open pilot →
                        </a>
                      </div>
                    </div>
                    {/* Step 3d — Run Fan Profile Migration
                        Adds display_name, bio, avatar_url, cover_image_url, location
                        to sc_member_profiles. Required before fan identity fields persist.
                        Endpoint: POST /api/parent/admin/run-schema-fan-profile (isAdmin required) */}
                    <PpAdminFanProfileSchemaPanel />
                    <PpAdminParentV2SchemaPanel />
                    <PpAdminMatchRecordsSchemaPanel />
                    <PpAdminPlayerMediaSchemaPanel />
                    <PpAdminRecruitingSchemaPanel />
                    <PpAdminPlayerSoftdeleteSchemaPanel />
                    {/* ── Step 3e — Player stats columns ── */}
                    <PpAdminSchemaStatsPanel />
                    {/* ── Schema status + remaining migrations ── */}
                    <PpAdminSchemaStatusPanel />
                    <PpAdminMigrationPanel />
                    <PpAdminSeedSourcesPanel />
                    <PpAdminSchemaV5Panel />
                    <PpAdminSeedTeamsPanel />
                    <PpAdminSeedTeamSourcesPanel />
                    {/* ── Full catalog migration (3c-i → 3c-ii → 3c-iii) ── */}
                    <PpAdminSeedCompetitionsPanel />
                    <PpAdminSeedCatalogTeamsPanel />
                    <PpAdminSeedTeamCompetitionsPanel />
                  </div>
                ) : (
                  <AdminBootstrapPanel />
                )}
              </>
            )}
          </main>

          {/* Right sidebar — profile and players tabs only, desktop */}
          {showRightSidebar && (
            <aside className="hidden lg:block w-64 shrink-0">
              <RightSidebar
                profile={profile}
                meData={meData}
                players={players}
                calendarRefreshKey={calendarRefreshKey}
                onStartOnboarding={() => setShowWizard(true)}
                onTabChange={setActiveTab}
                onEventClick={ev => {
                  // Navigate to calendar tab; the calendar will highlight the event
                  setActiveTab('calendar');
                  void ev; // event detail navigation handled by PpCalendarTab
                }}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 border-t flex"
        style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
      >
        {MOBILE_NAV.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors"
            style={{ color: activeTab === tab.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))' }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
