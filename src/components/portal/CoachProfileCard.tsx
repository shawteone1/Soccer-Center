import { calendarTime } from '@/lib/portal/calendar-display';
/**
 * CoachProfileCard — shared card renderer used in both:
 *   1. /coach/profile/:token  — the public coach-facing page
 *   2. CoachShareTab preview  — the parent's inline preview before creating a link
 *
 * NULL METRIC POLICY
 * ──────────────────
 * A stat value of null means "not recorded for these matches", not "zero".
 * StatCell renders null as "—" so coaches see an honest picture.
 * A value of 0 is a real zero and is rendered as "0".
 *
 * COVERAGE BANNER
 * ───────────────
 * coverage === 'partial' → inline notice: "Some matches are missing individual stats"
 * coverage === 'none'    → stats.available is false, shows unavailable message
 */

import { CoachRequestForm, DemoCoachRequestForm } from './CoachRequests';
import { useState } from 'react';
import { coachCardStyle, type CoachCardStyle } from '@/lib/portal/coach-card-style';
import '@/styles/coach-card-layouts.css';
import type React from 'react';
import {
  Shield, Clock, ChevronDown, ChevronUp, AlertCircle,
  FlaskConical, Play, MapPin,
} from 'lucide-react';

// ─── Types (exported so callers can type their data) ──────────────────────────

export interface CoachAcademics {
  gpa: number;
  scale: number;
  weighted: boolean;
  intendedMajor?: string | null;
}

export interface CoachHighlight {
  id: string;
  title: string;
  /** Public URL of the uploaded video — null when media proxy is not yet active (blocker E4). */
  publicUrl: string | null;
  season: string;
}

export interface CoachUpcomingEvent {
  startAt?: string;
  allDay?: boolean;
  eventType?: string;
  id: string;
  date: string;          // ISO YYYY-MM-DD
  title: string;
  location: string;
  opponent: string | null;
  competition: string;
  isHome: boolean;
}

export interface CoachStats {
  available: boolean;
  statsLabel?: string;
  gamesPlayed?: number;
  goals?: number | null;
  assists?: number | null;
  shots?: number | null;
  goalsAgainst?: number | null;
  saves?: number | null;
  shutouts?: number | null;
  /** 'full' = all selected matches have every stat; 'partial' = some null; 'none' = no matches */
  coverage?: 'full' | 'partial' | 'none';
  excludedCount?: number;
  /**
   * Per-metric recorded-match counts.
   * Present when coverage='partial' so the card can show "2 goals · 1 of 2 matches".
   * Absent when coverage='full' (all records have all metrics).
   */
  recordedCounts?: {
    goals?: number;
    assists?: number;
    shots?: number;
    goalsAgainst?: number;
    saves?: number;
    shutouts?: number;
  };
}

export interface CoachProfile {
  demoPlayerId?: string;
  label?: string | null;
  ageBand?: string | null;
  graduationYear?: number | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  foot?: string | null;
  positions?: string[];
  skillLevel?: string | null;
  clubName?: string | null;
  playingLevel?: string | null;
  profileIntroduction?: string | null;
  collegeGoals?: string | null;
  achievements?: string[];
  affiliations?: Array<{ orgName: string | null; season: string | null; ageGroupLabel: string | null }>;
  ukEducation?: Omit<import('@/lib/portal/uk-education').UkEducation, 'documents'> | null;
  academics?: CoachAcademics | null;
  highlights?: CoachHighlight[];
  upcomingEvents?: CoachUpcomingEvent[];
  /** Parent-controlled contact email shown to coaches */
  contactEmail?: string | null;
  /** High school name */
  highSchool?: string | null;
  /** High school city */
  schoolCity?: string | null;
  /** High school state */
  schoolState?: string | null;
  stats?: CoachStats;
  avatarUrl?: string | null;
  avatarInitials?: string | null;
  mediaOriginProtected?: boolean;
  statsTableAvailable?: boolean;
  approvedMatchRecordCount?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Renders a single stat cell with three distinct states:
 *
 *   null/undefined  → "—"  (entirely unrecorded — not applicable or not entered)
 *   0               → "0"  (real zero — e.g. 0 goals in a match)
 *   number + partial → value with "· N of M" annotation below the label
 *                      (partial total — some matches did not record this metric)
 */
function StatCell({
  label,
  value,
  recordedCount,
  gamesPlayed,
}: {
  label: string;
  value: number | null | undefined;
  recordedCount?: number;
  gamesPlayed?: number;
}) {
  const isNull = value == null;
  const isPartial =
    !isNull &&
    recordedCount != null &&
    gamesPlayed != null &&
    recordedCount > 0 &&
    recordedCount < gamesPlayed;

  return (
    <div data-testid="coach-card-stat" className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg"
      style={{ background: 'hsl(var(--pp-blue-light))' }}>
      <span data-stat-value className="text-lg font-bold"
        style={{ color: isNull ? 'hsl(var(--pp-text-muted))' : 'hsl(var(--pp-navy))' }}>
        {isNull ? '—' : String(value)}
      </span>
      <span data-stat-label className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{label}</span>
      {isPartial && (
        <span data-stat-coverage className="text-[9px] leading-tight text-center"
          style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {recordedCount} of {gamesPlayed}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sc-coach-section flex flex-col gap-2" data-section={title}>
      <p className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div data-testid="coach-card-field" className="flex items-baseline justify-between gap-2 py-1.5"
      style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
      <span data-field-label className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{label}</span>
      <span data-field-value className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{value}</span>
    </div>
  );
}

/**
 * Synthetic portrait for demo mode — an SVG-accented initials avatar.
 * In production this would be replaced by the player's uploaded photo.
 */
function DemoPortrait({ initials }: { initials: string }) {
  return (
    <div
      className="relative h-20 w-20 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, hsl(var(--pp-blue)) 0%, hsl(var(--pp-navy)) 100%)' }}
      aria-label={`Player portrait — ${initials}`}
    >
      <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 80 80" aria-hidden="true">
        <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke="white" strokeWidth="1.5" />
        <polygon points="40,16 62,28 62,52 40,64 18,52 18,28" fill="none" stroke="white" strokeWidth="1" />
      </svg>
      <span className="relative text-xl font-bold" style={{ color: 'hsl(var(--pp-white))' }}>
        {initials}
      </span>
    </div>
  );
}

/**
 * YouTube thumbnail with play-button overlay. Opens in new tab on click.
 */
function HighlightCard({ highlight, isDemo }: { highlight: CoachHighlight; isDemo: boolean }) {
  if (isDemo) {
    return (
      <figure className="rounded-lg border p-2">
        <video controls preload="metadata" className="w-full rounded" src="/demo-media/sample-play.mp4" aria-label={highlight.title} />
        <figcaption className="text-xs mt-1">{highlight.title}<span className="block text-slate-400">Synthetic field animation for playback review; not athlete footage.</span></figcaption>
      </figure>
    );
  }
  // Real uploaded video — served through the token-gated media proxy.
  if (highlight.publicUrl) {
    return (
      <figure className="rounded-lg overflow-hidden" style={{ border: '1px solid hsl(var(--pp-border))' }}>
        <video
          controls
          preload="metadata"
          className="w-full block"
          src={highlight.publicUrl}
          aria-label={highlight.title}
          style={{ background: 'hsl(var(--pp-navy))', maxHeight: '240px' }}
        />
        <figcaption className="px-2.5 py-2" style={{ background: 'hsl(var(--pp-surface))' }}>
          <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
            {highlight.title}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {highlight.season}
          </p>
        </figcaption>
      </figure>
    );
  }
  // publicUrl is null — link was created before media proxy was active, or
  // the assignment was deleted after the link was created. Show a placeholder.
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid hsl(var(--pp-border))' }}
    >
      <div className="relative aspect-video flex items-center justify-center"
        style={{ background: 'hsl(var(--pp-surface))' }}>
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <div className="h-10 w-10 rounded-full flex items-center justify-center"
            style={{ background: 'hsl(var(--pp-blue-light))' }}>
            <Play size={16} style={{ color: 'hsl(var(--pp-blue))', marginLeft: 2 }} />
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Video available upon request
          </p>
        </div>
      </div>
      <div className="px-2.5 py-2" style={{ background: 'hsl(var(--pp-surface))' }}>
        <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
          {highlight.title}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {highlight.season}
        </p>
      </div>
    </div>
  );
}

/**
 * Single upcoming event row with date badge.
 */
function EventRow({ event }: { event: CoachUpcomingEvent }) {
  const d = new Date(event.date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
      <div className="shrink-0 flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[44px]"
        style={{ background: 'hsl(var(--pp-blue-light))' }}>
        <span className="text-[10px] font-semibold uppercase" style={{ color: 'hsl(var(--pp-blue))' }}>
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-base font-bold leading-none" style={{ color: 'hsl(var(--pp-navy))' }}>
          {d.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug" style={{ color: 'hsl(var(--pp-text))' }}>
          {event.opponent ? `vs. ${event.opponent}` : event.title}
          <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded"
            style={{ background: 'hsl(var(--pp-surface))', color: 'hsl(var(--pp-text-muted))' }}>
            {event.eventType && event.eventType !== 'game' ? event.eventType : event.isHome ? 'Home' : 'Away'}
          </span>
        </p>
        <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <MapPin size={10} className="shrink-0" />
          {event.location}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {[event.competition, dateStr, event.startAt ? `${calendarTime(event.startAt, event.allDay)}${event.allDay ? '' : ' · America/Denver'}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CoachProfileCard({
  profile: p,
  expiresAt,
  isDemoLink = false,
  token = '',
  layout = 'classic',
}: {
  profile: CoachProfile;
  layout?: CoachCardStyle;
  expiresAt?: string | null;
  isDemoLink?: boolean;
  /** Raw bearer token from the URL — required for real request form submission. */
  token?: string;
}) {
  const [showAffiliations, setShowAffiliations] = useState(false);

  const initials = p.avatarInitials
    ?? (p.label ? p.label.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : '??');

  const formatExpiry = (iso: string | null | undefined): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
      if (diff <= 0) return 'Expired';
      if (diff === 1) return 'Expires tomorrow';
      if (diff <= 7) return `Expires in ${diff} days`;
      return `Expires ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch {
      return '';
    }
  };

  return (
    <div
      data-testid="coach-profile-card"
      className={`sc-coach-card sc-coach-${coachCardStyle(layout)} rounded-xl overflow-hidden`}
      data-layout={coachCardStyle(layout)}
      style={{ border: '1px solid hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sc-coach-header px-5 py-5 flex items-center gap-4"
        style={{ background: 'hsl(var(--pp-navy))' }}>
        {p.avatarUrl && !isDemoLink ? (
          <img src={p.avatarUrl} alt="Player portrait" className="h-20 w-20 rounded-full object-cover shrink-0" />
        ) : <DemoPortrait initials={initials} />}
        <div className="min-w-0 flex-1">
          {p.label && (
            <h1 data-testid="coach-card-player-name" className="text-lg font-bold leading-tight"
              style={{ color: 'hsl(var(--pp-white))' }}>
              {p.label}
            </h1>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {p.ageBand && (
              <span data-identity-age-band className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}>
                {p.ageBand}
              </span>
            )}
            {p.graduationYear && (
              <span data-identity-grad-year className="text-[11px]"
                style={{ color: 'hsl(var(--pp-white) / 0.8)' }}>
                Class of {p.graduationYear}
              </span>
            )}
            {p.clubName && (
              <span className="text-[11px]" style={{ color: 'hsl(var(--pp-white) / 0.7)' }}>
                {p.clubName}
              </span>
            )}
            {p.playingLevel && (
              <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'hsl(var(--pp-white) / 0.15)', color: 'hsl(var(--pp-white))' }}>
                {p.playingLevel}
              </span>
            )}
          </div>
          {(p.primaryPosition || p.secondaryPosition) && (
            <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--pp-white) / 0.75)' }}>
              {[p.primaryPosition, p.secondaryPosition].filter(Boolean).join(' · ')}
              {p.foot ? ` · ${p.foot} foot` : ''}
            </p>
          )}
        </div>
      </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
      <div data-testid="coach-card-body" className="px-5 py-4 flex flex-col gap-5"
        style={{ background: 'hsl(var(--pp-card-bg))' }}>

        {/* About me */}
        {p.profileIntroduction && (
          <Section title="About me">
            <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-text))' }}>
              {p.profileIntroduction}
            </p>
          </Section>
        )}

        {/* College goals */}
        {p.collegeGoals && (
          <Section title="College goals">
            <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-text))' }}>
              {p.collegeGoals}
            </p>
          </Section>
        )}

        {/* High school */}
        {p.highSchool && (
          <Section title="School & academics">
            <Field label="High school" value={p.highSchool} />
            {(p.schoolCity || p.schoolState) && (
              <Field label="Location" value={[p.schoolCity, p.schoolState].filter(Boolean).join(', ')} />
            )}
          </Section>
        )}

        {/* Academics */}
        {p.ukEducation && <Section title="UK exams & qualifications"><p>{p.ukEducation.system} · Completion: {p.ukEducation.completionYear ?? 'Pending'} · US entry: {p.ukEducation.entryYear ?? 'Pending'}</p><p>Family-reported; official evaluation pending.</p>{p.ukEducation.exams.map((e,i) => <p key={i}>{e.qualification} · {e.subject} · {e.grade || 'Pending'} ({e.status}) · {e.awardTitle} · {e.board} · {e.examMonth}</p>)}</Section>}
        {p.academics && !p.ukEducation && (
          <Section title="Academics">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col items-center justify-center rounded-xl px-4 py-3"
                style={{ background: 'hsl(var(--pp-blue-light))' }}>
                <span className="text-2xl font-bold" style={{ color: 'hsl(var(--pp-navy))' }}>
                  {p.academics.gpa.toFixed(1)}
                </span>
                <span className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  GPA / {p.academics.scale.toFixed(1)} · {p.academics.weighted ? 'Weighted' : 'Unweighted'}
                </span>
              </div>
              {p.academics.intendedMajor && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Intended major</span>
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>
                    {p.academics.intendedMajor}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Player details */}
        {p.skillLevel && (
          <Section title="Player details">
            <Field label="Skill level" value={p.skillLevel} />
          </Section>
        )}

        {/* Club history / affiliations */}
        {p.affiliations && p.affiliations.length > 0 && (
          <Section title="Club history">
            <button
              type="button"
              data-testid="coach-card-affiliations-toggle"
              className="flex items-center justify-between w-full text-xs py-1"
              style={{ color: 'hsl(var(--pp-blue))' }}
              onClick={() => setShowAffiliations(v => !v)}
            >
              <span>{p.affiliations!.length} affiliation{p.affiliations!.length !== 1 ? 's' : ''}</span>
              {showAffiliations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showAffiliations && (
              <div className="flex flex-col gap-1.5 mt-1">
                {p.affiliations!.map((a, i) => (
                  <div key={i} data-testid="coach-card-affiliation-row"
                    className="flex items-center justify-between text-xs py-1"
                    style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
                    <span data-aff-org style={{ color: 'hsl(var(--pp-text))' }}>{a.orgName ?? '—'}</span>
                    <span data-aff-meta style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {[a.season, a.ageGroupLabel].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Achievements */}
        {p.achievements && p.achievements.length > 0 && (
          <Section title="Achievements">
            <div className="flex flex-col gap-1">
              {p.achievements.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs py-1"
                  style={{ borderBottom: '1px solid hsl(var(--pp-border))' }}>
                  <span style={{ color: 'hsl(var(--pp-text))' }}>{a}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Match statistics */}
        {p.stats && (
          <Section title="Match statistics">
            {p.stats.available ? (
              <>
                {p.stats.coverage === 'partial' && (
                  <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] mb-1"
                    style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
                    <AlertCircle size={11} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                    <span style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {p.stats.recordedCounts
                        ? 'Cells marked "N of M" are partial totals — not all matches recorded that stat.'
                        : 'Some matches are missing individual stats — those cells show "—".'}
                      {(p.stats.excludedCount ?? 0) > 0
                        ? ` ${p.stats.excludedCount} match${p.stats.excludedCount !== 1 ? 'es' : ''} excluded from totals.`
                        : ''}
                    </span>
                  </div>
                )}
                <div data-testid="coach-card-stats-grid" className="grid grid-cols-3 gap-2">
                  <StatCell label="GP"      value={p.stats.gamesPlayed} />
                  <StatCell label="Goals"   value={p.stats.goals}   recordedCount={p.stats.recordedCounts?.goals}   gamesPlayed={p.stats.gamesPlayed} />
                  <StatCell label="Assists" value={p.stats.assists} recordedCount={p.stats.recordedCounts?.assists} gamesPlayed={p.stats.gamesPlayed} />
                  {p.stats.shots != null && <StatCell label="Shots"    value={p.stats.shots}        />}
                  {p.stats.goalsAgainst != null && <StatCell label="GA" value={p.stats.goalsAgainst} />}
                  {p.stats.saves != null && <StatCell label="Saves"    value={p.stats.saves}        />}
                  {p.stats.shutouts != null && <StatCell label="Shutouts" value={p.stats.shutouts}  />}
                </div>
                {p.stats.statsLabel && (
                  <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {p.stats.statsLabel}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {p.stats.statsLabel ?? 'No match statistics available.'}
              </p>
            )}
          </Section>
        )}

        {/* Highlights */}
        {p.highlights && p.highlights.length > 0 && (
          <Section title="Highlights">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {p.highlights.map(h => (
                <HighlightCard key={h.id} highlight={h} isDemo={isDemoLink} />
              ))}
            </div>
            {isDemoLink && (
              <p className="text-[10px] mt-1 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Synthetic video demonstrates playback. Production footage remains dependent on protected media integration.
              </p>
            )}
          </Section>
        )}

        {/* Upcoming events */}
        {p.upcomingEvents && p.upcomingEvents.length > 0 && (
          <Section title="Upcoming events">
            <div className="flex flex-col">
              {p.upcomingEvents.map(ev => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </Section>
        )}

        {/* Request more information */}
        {p.contactEmail && (
          <Section title="Request information">
            {isDemoLink && p.demoPlayerId
              ? <DemoCoachRequestForm playerId={p.demoPlayerId} />
              : token
                ? <CoachRequestForm token={token} />
                : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      To reach out about this player, contact the family directly:
                    </p>
                    <a
                      href={`mailto:${p.contactEmail}`}
                      className="text-sm font-medium break-all"
                      style={{ color: 'hsl(var(--pp-blue))' }}
                    >
                      {p.contactEmail}
                    </a>
                  </div>
                )
            }
          </Section>
        )}

      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div data-testid="coach-card-footer"
        className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: '1px solid hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Shield size={11} />
          <span>{isDemoLink ? 'Demo link · Soccer Center' : 'Shared via Soccer Center'}</span>
        </div>
        <div className="flex items-center gap-3">
          {expiresAt && (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <Clock size={11} />
              <span>{formatExpiry(expiresAt)}</span>
            </div>
          )}
          {isDemoLink && (
            <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
              <FlaskConical size={10} />
              <span>Demo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
