import UpcomingAppearances from '@/components/portal/UpcomingAppearances';
/**
 * /parent-portal/players/:playerId
 *
 * Private player profile screen — LinkedIn-style.
 * Only the owning parent can access. No public child discovery.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useSession } from '@/lib/auth/auth-client';
import { getClubLogoAsset } from '@/lib/portal/club-logos';
import GameRecordsSection from '@/components/portal/GameRecordsSection';
import RecruitingTab from '@/components/portal/RecruitingTab';
import PlayerScheduleTab from '@/components/portal/PlayerScheduleTab';
import PlayerStatsTab from '@/components/portal/PlayerStatsTab';
import PlayerMediaTab from '@/components/portal/PlayerMediaTab';
import {
  ArrowLeft, Pencil, Shield, Trophy, Calendar,
  Loader2, CheckCircle, ExternalLink, ToggleLeft, ToggleRight,
  Info, Star, Footprints,
  Film, BarChart2, Lock, GraduationCap, Camera,
} from 'lucide-react';
import {
  PpAvatar, PpCard, PpSectionHeading, PpButton, PpBadge, PpDivider,
} from '@/components/portal/PpPrimitives';
import { parent_portal_player } from 'virtual:content';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Affiliation {
  id: string;
  orgName: string;
  orgKey: string | null;
  season: string | null;
  ageGroupLabel: string | null;
  parentEntered: boolean;
}

interface PlayerDetail {
  id: string;
  label: string | null;
  birthYear: number | null;
  jersey: string | null;
  avatarInitials: string | null;
  avatarUrl: string | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  foot: string | null;
  goals: string[];
  ageBand: string | null;
  ageYears: number | null;
  positions: string[];
  skillLevel: string | null;
  developmentInterests: string[];
  trainingMode: string | null;
  clubName: string | null;
  clubUrl: string | null;
  clubDirectoryId: string | null;
  trainingPreferences: {
    focusAreas?: string[];
    sessionLength?: string;
    frequency?: string;
  } | null;
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
  statsAvailable: boolean; // false when stat columns haven't been migrated yet
  affiliations: Affiliation[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PlayerTab = 'profile' | 'schedule' | 'stats' | 'media' | 'recruiting';

/** Placeholder shown for tabs not yet available to the current user */
function ComingSoonTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <PpCard>
      <div
        className="flex flex-col items-center justify-center py-16 text-center gap-4"
      >
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <span style={{ color: 'hsl(var(--pp-navy))' }}>{icon}</span>
        </div>
        <div>
          <p className="text-sm font-bold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
            {label} — coming soon
          </p>
          <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            This feature is being rolled out. Check back soon.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Lock size={11} />
          <span>Available to admin accounts during rollout</span>
        </div>
      </div>
    </PpCard>
  );
}

function playerName(p: PlayerDetail) {
  return p.label ?? 'Player';
}

function playerInitials(p: PlayerDetail) {
  const name = playerName(p);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function completionPct(p: PlayerDetail): number {
  const checks = [
    !!p.label,
    !!p.ageBand,
    p.positions.length > 0 || !!p.primaryPosition,
    !!p.clubName || p.affiliations.length > 0,
    // Training interests are stored in developmentInterests (an array of strings).
    // trainingPreferences is a separate structured object for session/frequency prefs
    // and is optional — do not penalise its absence.
    p.developmentInterests.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ─── Section: About my soccer ────────────────────────────────────────────────

function AboutSection({ player }: { player: PlayerDetail }) {
  const hasContent = player.ageBand || player.birthYear || player.jersey || player.skillLevel || player.foot;
  if (!hasContent) return null;

  return (
    <PpCard>
      <PpSectionHeading>{parent_portal_player.about.heading}</PpSectionHeading>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {player.ageBand && (
          <>
            <dt style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.about.ageGroupLabel}</dt>
            <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.ageBand}</dd>
          </>
        )}
        {player.birthYear && (
          <>
            <dt style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.about.birthYearLabel}</dt>
            <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.birthYear}</dd>
          </>
        )}
        {player.jersey && (
          <>
            <dt style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.about.jerseyLabel}</dt>
            <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.jersey}</dd>
          </>
        )}
        {player.skillLevel && (
          <>
            <dt style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.about.levelLabel}</dt>
            <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.skillLevel}</dd>
          </>
        )}
        {player.foot && (
          <>
            <dt style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.about.footLabel}</dt>
            <dd style={{ color: 'hsl(var(--pp-text))' }}>{player.foot}</dd>
          </>
        )}
      </dl>
    </PpCard>
  );
}

// ─── Section: Positions & goals ───────────────────────────────────────────────

function PositionsSection({ player }: { player: PlayerDetail }) {
  const primaryPos = player.primaryPosition ?? player.positions[0] ?? null;
  const secondaryPos = player.secondaryPosition ?? player.positions[1] ?? null;
  const hasContent = primaryPos || player.goals.length > 0;
  if (!hasContent) return null;

  return (
    <PpCard>
      <PpSectionHeading>{parent_portal_player.positions.heading}</PpSectionHeading>

      {primaryPos && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {parent_portal_player.positions.positionsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-1.5"
              style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
            >
              <Star size={12} />
              {primaryPos}
              <span className="text-[10px] opacity-70 ml-1">{parent_portal_player.positions.primarySuffix}</span>
            </span>
            {secondaryPos && (
              <span
                className="text-sm rounded-full px-4 py-1.5 border"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              >
                {secondaryPos}
              </span>
            )}
            {!player.primaryPosition && player.positions.slice(2).map(pos => (
              <span
                key={pos}
                className="text-sm rounded-full px-4 py-1.5 border"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
              >
                {pos}
              </span>
            ))}
          </div>
        </div>
      )}

      {player.goals.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {parent_portal_player.positions.goalsLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {player.goals.map(g => (
              <span
                key={g}
                className="text-xs rounded-full px-3 py-1"
                style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}
    </PpCard>
  );
}

// ─── Section: Club & team ─────────────────────────────────────────────────────

function ClubSection({ player }: { player: PlayerDetail }) {
  const hasAffiliations = player.affiliations.length > 0;
  const hasLegacyClub = !!player.clubName && !hasAffiliations;

  if (!hasAffiliations && !hasLegacyClub) return null;

  return (
    <PpCard>
      <PpSectionHeading>{parent_portal_player.club.heading}</PpSectionHeading>
      <div className="space-y-3">
        {player.affiliations.map(a => (
          <div key={a.id} className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <Trophy size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                  {a.orgName}
                </p>
                {a.parentEntered && (
                  <PpBadge variant="default">
                    <Info size={9} className="mr-1" />
                    {parent_portal_player.club.parentEnteredBadge}
                  </PpBadge>
                )}
                {!a.parentEntered && (
                  <PpBadge variant="success">
                    <CheckCircle size={9} className="mr-1" />
                    {parent_portal_player.club.directoryMatchBadge}
                  </PpBadge>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {[a.season, a.ageGroupLabel].filter(Boolean).join(' · ') || parent_portal_player.club.seasonNotSet}
              </p>
            </div>
          </div>
        ))}

        {hasLegacyClub && (
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              <Trophy size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                {player.clubName}
              </p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {player.ageBand ?? parent_portal_player.club.ageGroupNotSet}
              </p>
            </div>
            {player.clubUrl && (
              <a
                href={player.clubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto"
                style={{ color: 'hsl(var(--pp-blue))' }}
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}
      </div>
    </PpCard>
  );
}

// ─── Section: Training preferences ───────────────────────────────────────────

function TrainingSection({ player }: { player: PlayerDetail }) {
  const prefs = player.trainingPreferences;
  if (!prefs && !player.trainingMode) return null;

  return (
    <PpCard>
      <PpSectionHeading>{parent_portal_player.training.heading}</PpSectionHeading>
      <div className="space-y-3 text-sm">
        {player.trainingMode && (
          <div className="flex justify-between">
            <span style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.training.modeLabel}</span>
            <span style={{ color: 'hsl(var(--pp-text))' }}>{player.trainingMode}</span>
          </div>
        )}
        {prefs?.sessionLength && (
          <div className="flex justify-between">
            <span style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.training.sessionLengthLabel}</span>
            <span style={{ color: 'hsl(var(--pp-text))' }}>{prefs.sessionLength}</span>
          </div>
        )}
        {prefs?.frequency && (
          <div className="flex justify-between">
            <span style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.training.frequencyLabel}</span>
            <span style={{ color: 'hsl(var(--pp-text))' }}>{prefs.frequency}</span>
          </div>
        )}
        {(prefs?.focusAreas?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.training.focusAreasLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {prefs!.focusAreas!.map(fa => (
                <span
                  key={fa}
                  className="text-xs rounded-full px-2.5 py-1 border"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text))' }}
                >
                  {fa}
                </span>
              ))}
            </div>
          </div>
        )}
        {player.developmentInterests.length > 0 && (
          <div>
            <p className="text-xs mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>{parent_portal_player.training.interestsLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {player.developmentInterests.map(di => (
                <span
                  key={di}
                  className="text-xs rounded-full px-2.5 py-1"
                  style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
                >
                  {di}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </PpCard>
  );
}

// ─── Section: Upcoming events (placeholder) ───────────────────────────────────

// ─── Section: Tryout interest ─────────────────────────────────────────────────

function TryoutInterestSection({ player }: { player: PlayerDetail }) {
  return (
    <PpCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy
            size={16}
            style={{ color: player.tryoutInterest ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {parent_portal_player.tryouts.heading}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {player.tryoutInterest
                ? parent_portal_player.tryouts.onLabel
                : parent_portal_player.tryouts.offLabel}
            </p>
          </div>
        </div>
        <div style={{ color: player.tryoutInterest ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}>
          {player.tryoutInterest ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
        </div>
      </div>
    </PpCard>
  );
}

// Season statistics section removed — stats are now derived from game records

// StatsMigrationPrompt removed — stats now come from game records

// StatsSection removed — stats are now derived from game records

// ─── Setup CTA ────────────────────────────────────────────────────────────────

function SetupCta({ player, onEdit }: { player: PlayerDetail; onEdit: () => void }) {
  const pct = completionPct(player);
  if (pct === 100) return null;

  // Build a list of the specific missing fields so the parent knows exactly what to add.
  const missing: string[] = [];
  if (!player.label) missing.push('Player name');
  if (!player.ageBand) missing.push('Age group');
  if (player.positions.length === 0 && !player.primaryPosition) missing.push('Position');
  if (!player.clubName && player.affiliations.length === 0) missing.push('Club');
  if (player.developmentInterests.length === 0) missing.push('Training interests');

  return (
    <PpCard>
      <div className="flex items-start gap-3">
        <Info size={16} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            {parent_portal_player.setupCta.heading}
          </p>
          {missing.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {missing.map(field => (
                <li key={field} className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: 'hsl(var(--pp-blue))' }} />
                  {field}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <div className="h-1.5 rounded-full mb-1" style={{ background: 'hsl(var(--pp-blue-light))' }}>
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${pct}%`, background: 'hsl(var(--pp-blue))' }}
              />
            </div>
            <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <span>{pct}</span>
              <span>{parent_portal_player.setupCta.pctSuffix}</span>
            </p>
          </div>
          <PpButton className="mt-3" size="sm" onClick={onEdit}>
            {parent_portal_player.setupCta.button}
          </PpButton>
        </div>
      </div>
    </PpCard>
  );
}

// ─── Locked In card (player profile entry point) ──────────────────────────────

function LockedInPlayerCard({ playerName }: { playerName: string }) {
  const navigate = useNavigate();
  return (
    <PpCard>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
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
          onClick={() => navigate(`/parent-portal/locked-in-demo?player=${encodeURIComponent(playerName)}`)}
          className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
          style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
        >
          Explore demo
        </button>
      </div>
    </PpCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ParentPortalPlayerPage() {
  const navigate = useNavigate();
  const { playerId } = useParams<{ playerId: string }>();
  const { isPending, isAuthenticated, user } = useSession();

  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>(() => new URLSearchParams(location.search).get('tab') === 'recruiting' ? 'recruiting' : 'profile');
  const isAdmin = (user as { isAdmin?: boolean } | null)?.isAdmin === true;

  // Pending coach-request count — drives the Recruiting tab badge.
  // Fetched once after the player loads; silently ignored on error.
  const [coachRequestUnread, setCoachRequestUnread] = useState(0);
  useEffect(() => {
    if (!playerId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/coach-requests`);
        if (!res.ok) return;
        const data = await res.json() as { unreadCount?: number };
        setCoachRequestUnread(data.unreadCount ?? 0);
      } catch {
        // Non-fatal — badge stays at 0
      }
    })();
  }, [playerId]);

  // Inline photo upload state
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (isPending) return;
    if (!isAuthenticated) { navigate('/login/auth'); return; }
  }, [isPending, isAuthenticated, navigate]);

  // Hide Inbox launcher on portal pages (widget mounts at body level)
  useEffect(() => {
    document.body.classList.add('sc-portal-active');
    return () => { document.body.classList.remove('sc-portal-active'); };
  }, []);

  const loadPlayer = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}`, {
        credentials: 'include',
      });
      if (res.status === 403) { navigate('/my-soccer'); return; }
      if (res.status === 404) { navigate('/parent-portal'); return; }
      if (!res.ok) throw new Error('Failed to load player');
      const data = await res.json() as { player: PlayerDetail };
      // statsAvailable is always set by the server via upfront SHOW COLUMNS probe.
      // Never override it — false means stat columns are genuinely absent and
      // the stats editor must remain blocked, not silently accept submissions.
      //
      // Strip any stale ?v= suffix from the stored avatarUrl and add a fresh
      // timestamp so the browser always fetches the current file, even when the
      // filename is identical to a previously cached version (same player, same
      // MIME type on replacement).
      const p = data.player;
      if (p.avatarUrl) {
        const url = new URL(p.avatarUrl, window.location.origin);
        url.searchParams.set('v', String(Date.now()));
        p.avatarUrl = url.href;
      }
      setPlayer(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [playerId, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPlayer();
    }
  }, [isAuthenticated, loadPlayer]);

  // Inline photo upload — called when the user picks a file from the avatar button.
  // Uploads immediately, updates local player.avatarUrl on success so the photo
  // appears in the current view without navigation or a full page reload.
  // The dialog stays open (spinner on the avatar) during the upload and clears on success.
  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !playerId) return;
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/parent/players/${encodeURIComponent(playerId)}/photo`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `Upload failed (${res.status})`);
      }
      const data = await res.json() as { avatarUrl: string };
      // Apply the new URL directly to local state — no navigation, no full reload.
      setPlayer(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : prev);
      // Signal the home page to re-fetch its player list when the user navigates back.
      // Uses a localStorage key so the home page picks it up on mount or storage event.
      try {
        localStorage.setItem('sc_pp_player_photo_updated', `${playerId}:${Date.now()}`);
      } catch { /* ignore — non-critical */ }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setPhotoUploading(false);
    }
  }

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--pp-navy))' }} />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>{error ?? 'Player not found'}</p>
        <PpButton onClick={() => navigate('/parent-portal')}>Back to family</PpButton>
      </div>
    );
  }

  const name = playerName(player);
  const initials = player.avatarInitials || playerInitials(player);
  const pct = completionPct(player);
  const displayClub = player.affiliations[0]?.orgName ?? player.clubName;
  // Only use the directory ID when it describes the club displayed here.
  const clubLogo = getClubLogoAsset(displayClub, displayClub === player.clubName ? player.clubDirectoryId : null);
  const subtitle = [player.ageBand, player.primaryPosition ?? player.positions[0]].filter(Boolean).join(' · ');

  return (
    <div className="pp-shell sc-player-page">
      <Helmet>
        <title>{name} — Parent Portal | Soccer Center</title>
        <meta name="description" content={`Private player profile for ${name}. Manage positions, club affiliations, and training preferences.`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Edit modal — kept for potential future use; currently edit navigates to wizard */}

      <div className="sc-player-content max-w-5xl mx-auto px-4 py-6 pb-20 md:pb-6">
        {/* Identity card */}
        <PpCard padding={false} className="sc-player-identity overflow-hidden mb-5">
          {/* Cover banner */}
          <div
            className="sc-player-cover h-24 md:h-32"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--pp-navy)) 0%, hsl(var(--pp-blue)) 100%)',
            }}
          />

          <div className="sc-player-identity-body px-5 pb-5">
            {/* Avatar + actions row */}
            <div className="sc-player-avatar-row flex items-end justify-between -mt-10 mb-4">
              {/* Avatar with inline photo-upload button */}
              <div className="relative shrink-0">
                {/* Hidden file input — triggered by the camera button */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Upload player photo"
                  onChange={handlePhotoFileChange}
                />

                {player.avatarUrl ? (
                  <div
                    className="h-20 w-20 rounded-full border-4 shadow-lg overflow-hidden"
                    style={{ borderColor: 'hsl(var(--pp-white))' }}
                  >
                    {photoUploading ? (
                      <div
                        className="h-full w-full flex items-center justify-center"
                        style={{ background: 'hsl(var(--pp-navy) / 0.7)' }}
                      >
                        <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-white))' }} />
                      </div>
                    ) : (
                      <img
                        src={player.avatarUrl}
                        onLoad={() => setPhotoError(null)}
                        onError={() => setPhotoError('Photo could not load. Please try uploading it again.')}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    {photoUploading ? (
                      <div
                        className="h-20 w-20 rounded-full border-4 shadow-lg flex items-center justify-center"
                        style={{ borderColor: 'hsl(var(--pp-white))', background: 'hsl(var(--pp-navy) / 0.7)' }}
                      >
                        <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-white))' }} />
                      </div>
                    ) : (
                      <PpAvatar
                        initials={initials}
                        size="xl"
                        className="border-4 shadow-lg"
                        style={{ borderColor: 'hsl(var(--pp-white))' } as React.CSSProperties}
                      />
                    )}
                  </div>
                )}

                {/* Camera button — always visible, triggers file picker */}
                <button
                  type="button"
                  disabled={photoUploading}
                  onClick={() => photoInputRef.current?.click()}
                  className="sc-player-photo-action absolute bottom-0 right-0 h-6 w-6 rounded-full flex items-center justify-center shadow-md border-2 transition-opacity disabled:opacity-50"
                  style={{
                    background: 'hsl(var(--pp-navy))',
                    borderColor: 'hsl(var(--pp-white))',
                    color: 'hsl(var(--pp-white))',
                  }}
                  aria-label="Change player photo"
                  title="Change photo"
                >
                  <Camera size={11} />
                </button>
              </div>

              <div className="sc-player-actions flex items-center gap-2 mt-2">
                <PpButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/parent-portal/players/${playerId}/edit`)}
                >
                  <Pencil size={12} />
                  {parent_portal_player.identityCard.editButton}
                </PpButton>
                <PpButton
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/parent-portal')}
                >
                  <ArrowLeft size={12} />
                  {parent_portal_player.identityCard.backButton}
                </PpButton>
              </div>
            </div>

            {/* Inline photo error — shown below avatar, clears on next attempt */}
            {photoError && (
              <p role="alert" className="text-[11px] mb-2" style={{ color: 'hsl(var(--destructive))' }}>
                {photoError}
              </p>
            )}

            {/* Name + subtitle */}
            <h1
              className="text-xl font-bold"
              style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
            >
              {name}
            </h1>
            {displayClub && (
              <div className="sc-player-club">
                {clubLogo && (
                  <img key={clubLogo} src={clubLogo} alt="" width={28} height={28}
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
                <span>{displayClub}</span>
              </div>
            )}
            {subtitle && (
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {subtitle}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <PpBadge variant="default">
                <Shield size={10} className="mr-1" />
                {parent_portal_player.identityCard.parentManagedBadge}
              </PpBadge>
              {player.foot && (
                <PpBadge variant="info">
                  <Footprints size={10} className="mr-1" />
                  <span>{player.foot}</span>
                  <span> {parent_portal_player.identityCard.footLabel}</span>
                </PpBadge>
              )}
              {player.jersey && (
                <PpBadge variant="default">
                  <span>#</span>
                  <span>{player.jersey}</span>
                </PpBadge>
              )}
            </div>

            {/* Completion bar */}
            {pct < 100 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    Profile {pct}% complete
                  </span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'hsl(var(--pp-blue-light))' }}>
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%`, background: 'hsl(var(--pp-blue))' }}
                  />
                </div>
              </div>
            )}
            {pct === 100 && (
              <div className="flex items-center gap-1.5 mt-3">
                <CheckCircle size={14} style={{ color: 'hsl(var(--pp-blue))' }} />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--pp-blue))' }}>
                  {parent_portal_player.identityCard.profileCompleteLabel}
                </span>
              </div>
            )}
          </div>
        </PpCard>

        {/* Privacy notice */}
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-xs"
          style={{
            background: 'hsl(var(--pp-blue-light))',
            color: 'hsl(var(--pp-navy))',
          }}
        >
          <Shield size={13} className="mt-0.5 shrink-0" />
          <span>{parent_portal_player.privacyNotice}</span>
        </div>

        <PpDivider />

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        {(() => {
          const tabs: { id: PlayerTab; label: string; icon: React.ReactNode }[] = [
            { id: 'profile',    label: 'Profile',    icon: <Shield size={13} /> },
            { id: 'schedule',   label: 'Schedule',   icon: <Calendar size={13} /> },
            { id: 'stats',      label: 'Stats',      icon: <BarChart2 size={13} /> },
            { id: 'media',      label: 'Media',      icon: <Film size={13} /> },
            { id: 'recruiting', label: 'Recruiting', icon: <GraduationCap size={13} /> },
          ];
          return (
            <div
              role="group"
              aria-label="Player sections"
              className="sc-player-tabs flex gap-1 mt-5 mb-4 rounded-xl p-1 overflow-x-auto"
              style={{ background: 'hsl(var(--pp-blue-light))' }}
            >
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={activeTab === tab.id}
                  aria-controls="sc-player-section"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 relative"
                  style={{
                    background:  activeTab === tab.id ? 'hsl(var(--pp-white))' : 'transparent',
                    color:       activeTab === tab.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
                    boxShadow:   activeTab === tab.id ? '0 1px 3px hsl(var(--pp-navy) / 0.12)' : 'none',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.id === 'recruiting' && coachRequestUnread > 0 && (
                    <span
                      className="absolute top-1 right-1 h-2 w-2 rounded-full"
                      style={{ background: 'hsl(var(--pp-red))' }}
                      aria-label={`${coachRequestUnread} unread coach request${coachRequestUnread !== 1 ? 's' : ''}`}
                    />
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Tab content ──────────────────────────────────────────────── */}

        <section id="sc-player-section" aria-label={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} section`}>
        {activeTab === 'profile' && (
          <div className="sc-player-sections space-y-4">
            <SetupCta player={player} onEdit={() => navigate(`/parent-portal/players/${playerId}/edit`)} />
            <AboutSection player={player} />
            <PositionsSection player={player} />
            <ClubSection player={player} />
            <TrainingSection player={player} />
            <UpcomingAppearances playerId={playerId!} onManage={() => setActiveTab('schedule')} />
            <GameRecordsSection playerId={player.id} position={player.primaryPosition ?? player.positions[0] ?? null} />
            <TryoutInterestSection player={player} />
            <LockedInPlayerCard playerName={name} />
          </div>
        )}

        {activeTab === 'schedule' && (
          <PlayerScheduleTab playerId={player.id} position={player.primaryPosition ?? player.positions?.[0] ?? null} />
        )}

        {activeTab === 'stats' && (
          <PlayerStatsTab playerId={player.id} player={player} />
        )}

        {activeTab === 'media' && (
          isAdmin
            ? <PlayerMediaTab playerId={player.id} />
            : <ComingSoonTab icon={<Film size={22} />} label="Media & Highlights" />
        )}

        {activeTab === 'recruiting' && (
          <><a href="/parent-portal?tab=recruiting" className="inline-flex items-center min-h-11 mb-3 underline">← Recruiting guide & college search</a><RecruitingTab playerId={player.id} ageBand={player.ageBand ?? null} /></>
        )}
        </section>
      </div>
    </div>
  );
}
