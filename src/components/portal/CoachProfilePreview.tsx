/**
 * CoachProfilePreview
 *
 * Owner-parent read-only preview of what a coach would see for this player.
 * Shown inside the Recruiting tab when COACH_PROFILE_LINKS_ENABLED is true.
 *
 * Fetches GET /api/parent/players/:playerId/coach-preview
 * Displays the strict coach projection — same fields a coach link would expose.
 *
 * Media is shown with a blocker notice (E4 unresolved) so the owner knows
 * the photo will not be included in coach links until origin protection is in place.
 *
 * This component does NOT create links, tokens, or any shareable artifact.
 * It is purely informational — "here is what a coach would see."
 */

import { useState, useEffect, useCallback } from 'react';
import { Eye, AlertCircle, Loader2, Trophy, User, BarChart2, Building2, BookOpen } from 'lucide-react';
import { PpCard, PpSectionHeading, PpBadge } from './PpPrimitives';
import { PpAvatar } from './PpPrimitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedStats {
  gamesPlayed: number;
  goals:       number | null;
  assists:     number | null;
  shots:       number | null;
  goalsAgainst: number | null;
  saves:       number | null;
  shutouts:    number | null;
  season:      string | null;
  excludedCount: number;
  coverage:    'full' | 'partial' | 'none';
}

interface CoachProjection {
  label:               string | null;
  ageBand:             string | null;
  ageYears:            number | null;
  graduationYear:      number | null;
  primaryPosition:     string | null;
  secondaryPosition:   string | null;
  foot:                string | null;
  positions:           string[];
  skillLevel:          string | null;
  clubName:            string | null;
  profileIntroduction: string | null;
  achievements:        string[];
  playingLevel:        string | null;
  avatarUrl:           string | null;
  avatarInitials:      string | null;
  affiliations: Array<{
    orgName:       string;
    season:        string | null;
    ageGroupLabel: string | null;
  }>;
  stats:               AggregatedStats | null;
  statsSource:         'match_records' | 'profile_fallback';
  statsTableAvailable: boolean;
  mediaOriginProtected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statVal(n: number | null): string {
  return n == null ? '—' : String(n);
}

function isGk(p: CoachProjection): boolean {
  const pos = (p.primaryPosition ?? p.positions[0] ?? '').toLowerCase();
  return pos.includes('goalkeeper') || pos.includes('keeper') || pos === 'gk';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsSection({ projection }: { projection: CoachProjection }) {
  const { stats, statsSource, statsTableAvailable } = projection;
  const gk = isGk(projection);

  if (!statsTableAvailable && !stats) {
    return (
      <div className="flex items-center gap-2 text-xs py-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        <AlertCircle size={12} />
        Stats unavailable — run the stats schema migration.
      </div>
    );
  }

  if (!stats || stats.gamesPlayed === 0) {
    return (
      <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        No game records logged yet.
      </p>
    );
  }

  const statItems = gk
    ? [
        { label: 'GP',       value: String(stats.gamesPlayed) },
        { label: 'GA',       value: statVal(stats.goalsAgainst) },
        { label: 'Saves',    value: statVal(stats.saves) },
        { label: 'Shutouts', value: statVal(stats.shutouts) },
      ]
    : [
        { label: 'GP',      value: String(stats.gamesPlayed) },
        { label: 'Goals',   value: statVal(stats.goals) },
        { label: 'Assists', value: statVal(stats.assists) },
      ];

  return (
    <div>
      <div
        className="grid gap-2 mt-1"
        style={{ gridTemplateColumns: `repeat(${statItems.length}, 1fr)` }}
      >
        {statItems.map(s => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-center rounded-xl py-3 gap-0.5"
            style={{ background: 'hsl(var(--pp-blue-light))' }}
          >
            <span className="text-xl font-bold leading-none" style={{ color: 'hsl(var(--pp-text))' }}>
              {s.value}
            </span>
            <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {stats.coverage === 'partial' && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <AlertCircle size={11} />
          {stats.excludedCount} game{stats.excludedCount !== 1 ? 's' : ''} excluded (not participated or overridden)
        </p>
      )}
      {statsSource === 'profile_fallback' && (
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Using profile-level stats — log game records for a live summary.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CoachProfilePreview({ playerId }: { playerId: string }) {
  const [projection, setProjection] = useState<CoachProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/players/${playerId}/coach-preview`, {
        credentials: 'include',
      });
      if (res.status === 403) {
        setError('feature_disabled');
        return;
      }
      if (!res.ok) {
        setError('load_failed');
        return;
      }
      const data = await res.json() as { preview: CoachProjection };
      setProjection(data.preview);
    } catch {
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <PpCard>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      </PpCard>
    );
  }

  if (error === 'feature_disabled') return null;

  if (error || !projection) {
    return (
      <PpCard>
        <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <AlertCircle size={13} />
          Could not load coach preview.
        </div>
      </PpCard>
    );
  }

  const positions = [
    projection.primaryPosition,
    projection.secondaryPosition,
    ...projection.positions,
  ].filter((p, i, arr): p is string => !!p && arr.indexOf(p) === i);

  return (
    <div className="space-y-3">
      {/* Header notice */}
      <div
        className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
        style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-text-muted))' }}
      >
        <Eye size={13} className="mt-0.5 shrink-0" />
        <span>
          This is a preview of what a coach would see. No link has been created.
          {!projection.mediaOriginProtected && (
            <> Photo sharing is disabled until media origin protection is in place.</>
          )}
        </span>
      </div>

      {/* Identity card */}
      <PpCard>
        <div className="flex items-center gap-3">
          <PpAvatar
            initials={projection.avatarInitials ?? (projection.label?.slice(0, 2) ?? '??')}
            photoUrl={projection.mediaOriginProtected ? projection.avatarUrl : null}
            size="lg"
          />
          <div className="min-w-0">
            <p className="font-semibold text-base leading-tight" style={{ color: 'hsl(var(--pp-text))' }}>
              {projection.label ?? 'Unnamed player'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {projection.ageBand && (
                <PpBadge>{projection.ageBand}</PpBadge>
              )}
              {projection.graduationYear && (
                <PpBadge>Class of {projection.graduationYear}</PpBadge>
              )}
              {projection.playingLevel && (
                <PpBadge>{projection.playingLevel}</PpBadge>
              )}
            </div>
          </div>
        </div>

        {projection.profileIntroduction && (
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: 'hsl(var(--pp-text))' }}
          >
            {projection.profileIntroduction}
          </p>
        )}
      </PpCard>

      {/* Positions & club */}
      <PpCard>
        <PpSectionHeading icon={<User size={13} />} title="Position & club" />
        <div className="mt-2 space-y-1.5 text-sm" style={{ color: 'hsl(var(--pp-text))' }}>
          {positions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {positions.map(p => <PpBadge key={p}>{p}</PpBadge>)}
              {projection.foot && (
                <PpBadge>{projection.foot === 'both' ? 'Two-footed' : `${projection.foot.charAt(0).toUpperCase() + projection.foot.slice(1)}-footed`}</PpBadge>
              )}
            </div>
          )}
          {projection.clubName && (
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {projection.clubName}
            </p>
          )}
        </div>
      </PpCard>

      {/* Affiliations */}
      {projection.affiliations.length > 0 && (
        <PpCard>
          <PpSectionHeading icon={<Building2 size={13} />} title="Club history" />
          <div className="mt-2 space-y-1">
            {projection.affiliations.map((a, i) => (
              <div key={i} className="flex items-baseline justify-between text-xs">
                <span style={{ color: 'hsl(var(--pp-text))' }}>{a.orgName}</span>
                <span style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {[a.ageGroupLabel, a.season].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </PpCard>
      )}

      {/* Achievements */}
      {projection.achievements.length > 0 && (
        <PpCard>
          <PpSectionHeading icon={<Trophy size={13} />} title="Achievements" />
          <ul className="mt-2 space-y-1">
            {projection.achievements.map((a, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                <span className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-accent))' }}>·</span>
                {a}
              </li>
            ))}
          </ul>
        </PpCard>
      )}

      {/* Stats */}
      <PpCard>
        <PpSectionHeading icon={<BarChart2 size={13} />} title="Season stats" />
        <div className="mt-2">
          <StatsSection projection={projection} />
        </div>
      </PpCard>

      {/* Introduction note if empty */}
      {!projection.profileIntroduction && (
        <PpCard>
          <PpSectionHeading icon={<BookOpen size={13} />} title="Introduction" />
          <p className="mt-1 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            No introduction written yet. Add one in the player details to help coaches understand this player's story.
          </p>
        </PpCard>
      )}
    </div>
  );
}
