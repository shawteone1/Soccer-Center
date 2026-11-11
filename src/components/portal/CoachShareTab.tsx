import AppearanceForm from './AppearanceForm';
import { calendarTime } from '@/lib/portal/calendar-display';
import {CoachRequestInbox} from './CoachRequests';
import ProfileBuilder from './ProfileBuilder';
import type { DemoBaseProfile } from './coach-demo-store';
/**
 * CoachShareTab — parent-facing share link management UI.
 *
 * Displayed inside the Recruiting tab for U16+ players when
 * COACH_PROFILE_LINKS_ENABLED is active.
 *
 * DEMO MODE BEHAVIOR
 * ──────────────────
 * When the API returns 503 (STORE_UNAVAILABLE), the tab shows a clearly
 * labeled demo mode with synthetic fixtures. Demo links are process-local
 * and do not survive restarts. All demo UI elements carry a "Demo" badge.
 *
 * FLOW
 * ────
 * 1. Field selection — parent picks which profile fields to share
 * 2. Match record selection — parent picks which game records to include in stats
 * 3. Link settings — label + expiry (1–365 days, default 30)
 * 4. Preview — shows what the coach will see
 * 5. Create link — calls POST /api/parent/players/:id/coach-links
 * 6. Share URL displayed — copy to clipboard
 * 7. Link list — shows all links with status + revoke button
 *
 * FIELD CONTRACT
 * ──────────────
 * Field keys come from GET /api/parent/players/:id/coach-fields.
 * "label" is the player name field. "name" is not a valid key.
 */

import { filterCoachProfile, coachPreviewParams } from '@/lib/portal/coach-sharing';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Share2, Eye, Link2, Trash2, Copy, Check,
  AlertCircle, Loader2, Info, Plus,
  CheckSquare, Square, FlaskConical, ExternalLink,
  Clock, Shield, ChevronUp, ChevronDown, Mail,
} from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton } from '@/components/portal/PpPrimitives';
import { COACH_CARD_STYLES, styledCoachUrl, type CoachCardStyle } from '@/lib/portal/coach-card-style';
import { CoachProfileCard } from '@/components/portal/CoachProfileCard';
import {
  demoLinkStore,
  buildDemoProjection,
  DEMO_MATCH_RECORDS as DEMO_MATCH_RECORDS_STORE,
  DEMO_BASE_PROFILE as DEMO_BASE_PROFILE_STORE,
} from '@/components/portal/coach-demo-store';


// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  description: string;
  recommended: boolean;
  group: 'identity' | 'positions' | 'club' | 'profile' | 'stats';
}

interface MatchRecord {
  id: string;
  match_date: string | null;
  opponent: string | null;
  goals: number | null;
  assists: number | null;
  season: string | null;
}

/**
 * A coach profile link record as returned by GET /api/parent/players/:id/coach-links.
 *
 * COPY URL DESIGN NOTE
 * ────────────────────
 * Raw tokens are never stored — only their SHA-256 hash is persisted.
 * This means the share URL cannot be reconstructed from the link list after
 * the creation response is dismissed.
 *
 * Copy URL is therefore only available in the 'created' step immediately
 * after the link is created. The link list shows the link's metadata
 * (label, fields, expiry, status) and a Revoke button for active links.
 * For revoked or expired links, "Create replacement link" is offered so
 * the parent can generate a new link with the same settings.
 *
 * This is intentional: storing recoverable tokens would require either
 * persisting the raw token (a security regression) or adding a server-side
 * URL reconstruction endpoint (which would need to re-issue a new token
 * anyway — equivalent to creating a replacement link).
 */
interface CoachLink {
  id: string;
  label: string | null;
  approvedFields: string[];
  selectedMatchRecordCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'revoked' | 'expired';
}

// ─── Demo fixtures ────────────────────────────────────────────────────────────

const DEMO_FIELDS: FieldDef[] = [
  { key: 'label',               label: 'Player name',         description: 'First and last name',                          recommended: true,  group: 'identity'  },
  { key: 'ageBand',             label: 'Age group',           description: 'Age band (e.g. U17)',                          recommended: true,  group: 'identity'  },
  { key: 'graduationYear',      label: 'Graduation year',     description: 'Expected high school graduation year',         recommended: true,  group: 'identity'  },
  { key: 'photo',               label: 'Player photo',        description: 'Profile photo shown on the coach card',        recommended: true,  group: 'identity'  },
  { key: 'primaryPosition',     label: 'Primary position',    description: 'Main playing position',                        recommended: true,  group: 'positions' },
  { key: 'secondaryPosition',   label: 'Secondary position',  description: 'Second playing position',                      recommended: false, group: 'positions' },
  { key: 'foot',                label: 'Dominant foot',       description: 'Left, right, or both',                         recommended: true,  group: 'positions' },
  { key: 'skillLevel',          label: 'Skill level',         description: 'Competitive level classification',             recommended: false, group: 'positions' },
  { key: 'clubName',            label: 'Club name',           description: 'Current club',                                 recommended: true,  group: 'club'      },
  { key: 'playingLevel',        label: 'Playing level',       description: 'Competitive level (e.g. ECNL, NPL)',           recommended: true,  group: 'club'      },
  { key: 'profileIntroduction', label: 'About me',            description: 'Player-written introduction',                  recommended: true,  group: 'profile'   },
  { key: 'collegeGoals',        label: 'College goals',       description: 'Academic and soccer aspirations',              recommended: true,  group: 'profile'   },
  { key: 'academics',           label: 'Academics',           description: 'GPA or UK exam results and intended major',               recommended: true,  group: 'profile'   },
  { key: 'achievements',        label: 'Achievements',        description: 'Notable achievements and honors',              recommended: false, group: 'profile'   },
  { key: 'affiliations',        label: 'Club history',        description: 'Past and current club affiliations',           recommended: false, group: 'profile'   },
  { key: 'stats',               label: 'Match statistics',    description: 'Aggregated stats from selected matches',       recommended: false, group: 'stats'     },
  { key: 'highlights',          label: 'Highlights',          description: 'Selected video highlights',                    recommended: false, group: 'profile'   },
  { key: 'upcomingEvents',      label: 'Upcoming events',      description: 'Selected appearances where coaches can watch the player',     recommended: true,  group: 'profile'   },
  { key: 'contactEmail',        label: 'Contact destination', description: 'Email address coaches use to reach the family',recommended: true,  group: 'profile'   },
  { key: 'highSchool',          label: 'High school',         description: 'School name and city/state',                    recommended: false, group: 'profile'   },
];

// DEMO_MATCH_RECORDS and DEMO_BASE_PROFILE are imported from coach-demo-store
// to keep fixtures in sync with the coach profile page's demo resolution.
const DEMO_MATCH_RECORDS = DEMO_MATCH_RECORDS_STORE;

const GROUP_LABELS: Record<string, string> = {
  identity: 'Identity',
  positions: 'Positions',
  club: 'Club',
  profile: 'Profile & Goals',
  stats: 'Statistics',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function daysUntil(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (diff <= 0) return 'Expired';
  if (diff === 1) return '1 day left';
  return `${diff} days left`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DemoBanner() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs mb-4"
      style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
    >
      <FlaskConical size={13} className="mt-0.5 shrink-0" />
      <div>
        <span className="font-semibold">Demo mode — </span>
        This preview uses synthetic fixtures and browser localStorage. Links created
        here work only within the same browser — they cannot be shared with coaches
        on other devices. In production, links are stored durably on the server.
      </div>
    </div>
  );
}

function FieldCheckbox({
  field,
  checked,
  onChange,
}: {
  field: FieldDef;
  checked: boolean;
  onChange: (key: string, checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={field.label}
      data-field-key={field.key}
      onClick={() => onChange(field.key, !checked)}
      className="flex items-start gap-2.5 w-full text-left rounded-lg px-3 py-2.5 transition-colors"
      style={{
        background: checked ? 'hsl(var(--pp-blue-light))' : 'transparent',
        border: `1px solid ${checked ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))'}`,
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: checked ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}>
        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
            {field.label}
          </span>
          {field.recommended && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'hsl(var(--pp-green-light))', color: 'hsl(var(--pp-green))' }}>
              Recommended
            </span>
          )}
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {field.description}
        </p>
      </div>
    </button>
  );
}

function MatchRecordRow({
  record,
  checked,
  onChange,
}: {
  record: MatchRecord;
  checked: boolean;
  onChange: (id: string, checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-match-id={record.id}
      aria-pressed={checked}
      onClick={() => onChange(record.id, !checked)}
      className="flex items-center gap-2.5 w-full text-left rounded-lg px-3 py-2 transition-colors"
      style={{
        background: checked ? 'hsl(var(--pp-blue-light))' : 'transparent',
        border: `1px solid ${checked ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))'}`,
      }}
    >
      <span className="shrink-0" style={{ color: checked ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}>
        {checked ? <CheckSquare size={13} /> : <Square size={13} />}
      </span>
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-x-2">
        <span className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
          {record.opponent ?? 'Unknown opponent'}
        </span>
        <span className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {formatDate(record.match_date)}
        </span>
      </div>
      <span className="text-[11px] shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {record.goals ?? 0}G {record.assists ?? 0}A
      </span>
    </button>
  );
}

function LinkRow({
  link,
  onRevoke,
  revoking,
  onCreateReplacement,
}: {
  link: CoachLink;
  onRevoke: (id: string) => void;
  revoking: boolean;
  /** Called when the parent wants to create a new link with the same label/settings. */
  onCreateReplacement?: (link: CoachLink) => void;
}) {
  const statusColor = link.status === 'active'
    ? 'hsl(var(--pp-green))'
    : link.status === 'revoked'
    ? 'hsl(var(--pp-red))'
    : 'hsl(var(--pp-text-muted))';

  return (
    <div
      className="rounded-lg px-3 py-3 flex flex-col gap-2"
      style={{ border: '1px solid hsl(var(--pp-border))', background: 'hsl(var(--pp-surface))' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
              {link.label ?? 'Untitled link'}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: link.status === 'active' ? 'hsl(var(--pp-green-light))' : 'hsl(var(--pp-border))', color: statusColor }}>
              {link.status.charAt(0).toUpperCase() + link.status.slice(1)}
            </span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            {link.approvedFields.length} field{link.approvedFields.length !== 1 ? 's' : ''}
            {link.selectedMatchRecordCount > 0 && ` · ${link.selectedMatchRecordCount} match record${link.selectedMatchRecordCount !== 1 ? 's' : ''}`}
            {' · '}Created {formatDate(link.createdAt)}
          </p>
        </div>
        {link.status === 'active' && (
          <PpButton
            size="sm"
            variant="ghost"
            data-testid="revoke-link-btn"
            onClick={() => onRevoke(link.id)}
            disabled={revoking}
            className="shrink-0"
          >
            {revoking ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            <span className="ml-1">Revoke</span>
          </PpButton>
        )}
      </div>
      {link.expiresAt && (
        <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Clock size={10} />
          <span>Expires {formatDate(link.expiresAt)} · {daysUntil(link.expiresAt)}</span>
        </div>
      )}
      {link.status !== 'active' && onCreateReplacement && (
        // Raw tokens are never stored, so the original URL cannot be recovered.
        // Offer "Create replacement link" so the parent can generate a new link
        // with the same label — the new link goes through the full creation flow.
        <button
          type="button"
          onClick={() => onCreateReplacement(link)}
          className="self-start text-[11px] font-medium flex items-center gap-1 mt-0.5"
          style={{ color: 'hsl(var(--pp-blue))' }}
        >
          <Plus size={10} />
          Create replacement link
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step = 'fields' | 'matches' | 'media' | 'events' | 'settings' | 'preview' | 'created';

interface MediaAssignment {
  id: string;           // assignment id — used as selectedMedia entry
  title: string | null;
  season: string | null;
  media_type: string;
  original_name: string | null;
}

interface UpcomingEvent {
  startAt?: string;
  allDay?: boolean;
  id: string;
  date: string;
  title: string;
  location: string;
  opponent: string | null;
  /** Competition name — empty string when not set; required by CoachUpcomingEvent */
  competition: string;
  isHome: boolean;
}

export default function CoachShareTab({
  playerId,
  isDemoMode = false,
  savedCoaches = [],
  onDraftWithLink,
}: {
  playerId: string;
  isDemoMode?: boolean;
  /** Saved coaches from the parent's Saved Opportunities list — used to offer "Draft email with this link" */
  savedCoaches?: Array<{
    coachId: string;
    name: string | null;
    role: string | null;
    email: string | null;
    institution: string;
    division: string | null;
  }>;
  /** Called when the parent clicks "Draft email with this link" for a saved coach */
  onDraftWithLink?: (coachId: string, profileUrl: string) => void;
}) {
  const [profile, setProfile] = useState<DemoBaseProfile>(structuredClone(DEMO_BASE_PROFILE_STORE));
  const [editingProfile, setEditingProfile] = useState(isDemoMode);
  const [step, setStep] = useState<Step>('fields');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>([]);
  const [optionalErrors, setOptionalErrors] = useState<string[]>([]);
  const [mediaAssignments, setMediaAssignments] = useState<MediaAssignment[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [addingAppearance, setAddingAppearance] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [cardLayout, setCardLayout] = useState<CoachCardStyle>('classic');
  const [linkLabel, setLinkLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);

  /**
   * In-memory demo link store — process-local, never persisted.
   * Used only when isDemoMode=true so create/list/revoke never touch the
   * application database or real API endpoints.
   */
  // Demo links are stored in sessionStorage via demoLinkStore so they
  // survive navigation and are accessible from /coach/profile/:token in a new tab.
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLinks, setShowLinks] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  /** True when coach-fields returned 403 FEATURE_DISABLED — show a clear message instead of a blank form */
  const [featureDisabled, setFeatureDisabled] = useState(false);
  /** Non-null when coach-fields returned an unexpected status (401, 500, network error) */
  const [fieldsLoadError, setFieldsLoadError] = useState<string | null>(null);

  const isDemo = isDemoMode;

  const fieldsInitialized = useRef(false);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Demo mode: branch BEFORE any API calls — no application API or database access
      if (isDemo) {
        setFields(DEMO_FIELDS);
        setSelectedFields(new Set(DEMO_FIELDS.filter(f => f.recommended).map(f => f.key)));
        setMatchRecords(DEMO_MATCH_RECORDS);
        setLinks(demoLinkStore.list().filter(l => l.playerId === playerId).map(l => ({
          id: l.id,
          label: l.label,
          approvedFields: l.approvedFields,
          selectedMatchRecordCount: l.selectedMatchRecordIds.length,
          expiresAt: l.expiresAt,
          revokedAt: l.revokedAt,
          createdAt: l.createdAt,
          status: l.status,
        })));
        return;
      }

      // Real mode: fetch fields first, in isolation.
      // Optional endpoints (match records, links, media, preview) are fetched
      // separately with Promise.allSettled so a failure in any of them cannot
      // prevent the fields step from rendering.
      let fieldsRes: Response;
      try {
        fieldsRes = await fetch(`/api/parent/players/${playerId}/coach-fields`);
      } catch (err) {
        // Network-level failure on the fields request itself
        setFieldsLoadError('Network error loading profile fields. Check your connection and try again.');
        console.error('[CoachShareTab] coach-fields fetch error:', err);
        return;
      }

      if (fieldsRes.ok) {
        const data = await fieldsRes.json() as { fields: FieldDef[] };
        const serverFields = Array.isArray(data.fields) && data.fields.length > 0
          ? data.fields
          : null;
        if (serverFields) {
          setFields(serverFields);
          if (!fieldsInitialized.current) {
            setSelectedFields(new Set(serverFields.filter(f => f.recommended).map(f => f.key)));
            fieldsInitialized.current = true;
          }
          setFeatureDisabled(false);
          setFieldsLoadError(null);
        } else {
          setFieldsLoadError('The server returned an empty field list. Please try again.');
        }
      } else if (fieldsRes.status === 403) {
        // Read the body to distinguish FEATURE_DISABLED from other 403 reasons
        let errorCode = '';
        try {
          const body = await fieldsRes.json() as { error?: string };
          errorCode = body.error ?? '';
        } catch { /* non-JSON body — treat as unknown 403 */ }

        if (errorCode === 'FEATURE_DISABLED') {
          // COACH_PROFILE_LINKS_ENABLED is not 'true'.
          // Show the static field list so the parent can see what will be available,
          // but block link creation with a clear explanation.
          setFeatureDisabled(true);
          setFieldsLoadError(null);
          setFields(DEMO_FIELDS);
          setSelectedFields(new Set(DEMO_FIELDS.filter(f => f.recommended).map(f => f.key)));
        } else {
          // Other 403 (e.g. player not owned by this user)
          setFieldsLoadError('Access denied loading profile fields (HTTP 403). Please try again or contact support.');
        }
      } else {
        // 401, 500, or any other unexpected status.
        // Do NOT silently leave fields=[]; that produces a blank selector with no explanation.
        let msg = 'Could not load profile fields (HTTP ' + String(fieldsRes.status) + ').';
        if (fieldsRes.status === 401) msg = 'Your session has expired. Please sign in again, then return to this page.';
        else if (fieldsRes.status === 503) msg = 'Coach sharing is temporarily unavailable. Please try again in a moment.';
        setFieldsLoadError(msg);
      }

      // Decode within each settled task: one malformed optional response must
      // not suppress the other sections. Keep errors visible to the owner.
      const readOptional = async (path: string) => {
        const response = await fetch(`/api/parent/players/${playerId}/${path}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      };
      const [matchResult, linksResult, mediaResult, previewResult] = await Promise.allSettled([
        readOptional('match-records'),
        readOptional('coach-links'),
        readOptional('media-assignments'),
        readOptional('coach-preview'),
      ]);

      const failed = [
        ['Match records', matchResult], ['Share links', linksResult],
        ['Media', mediaResult], ['Upcoming events', previewResult],
      ] as const;
      setOptionalErrors(failed.filter(([, result]) => result.status === 'rejected').map(([label]) => label));

      if (matchResult.status === 'fulfilled') {
        const data = matchResult.value as { tableAvailable: boolean; records: MatchRecord[] };
        if (data.tableAvailable) setMatchRecords(data.records);
      }

      if (linksResult.status === 'fulfilled') {
        const data = linksResult.value as { links: CoachLink[] };
        setLinks(data.links);
      }

      if (mediaResult.status === 'fulfilled') {
        // GET /media-assignments returns camelCase: { id, mediaType, kind, title, originalName, season }
        const data = mediaResult.value as { assignments: Array<{
          id: string;
          kind: string;
          title: string | null;
          season: string | null;
          mediaType: string;
          originalName: string | null;
        }> };
        setMediaAssignments(
          (data.assignments ?? [])
            // Eligibility: any video assignment, regardless of stored kind.
            // kind='photo'/'video' from older uploads are equally eligible.
            .filter(a => a.mediaType === 'video')
            .map(a => ({
              id: a.id,
              title: a.title,
              season: a.season,
              media_type: a.mediaType,
              original_name: a.originalName,
            })),
        );
      }

      if (previewResult.status === 'fulfilled') {
        const data = previewResult.value as { profile: { upcomingEvents?: UpcomingEvent[] } };
        setUpcomingEvents(data.profile.upcomingEvents ?? []);
      }
    } catch (err) {
      // Unexpected error after the fields fetch completed — log but do not
      // overwrite a fieldsLoadError that was already set above.
      console.error('[CoachShareTab] loadData unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [playerId, isDemo]);

  useEffect(() => {
    fieldsInitialized.current = false;
    setSelectedMatches(new Set()); setSelectedMedia(new Set()); setSelectedEvents(new Set());
    setMatchRecords([]); setMediaAssignments([]); setUpcomingEvents([]);
    setStep('fields');
    void loadData();
  }, [loadData]);

  const toggleField = useCallback((key: string, checked: boolean) => {
    if (!checked) {
      if (key === 'stats') setSelectedMatches(new Set());
      if (key === 'highlights') setSelectedMedia(new Set());
      if (key === 'upcomingEvents') setSelectedEvents(new Set());
    }
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const toggleMatch = useCallback((id: string, checked: boolean) => {
    if (checked) setSelectedFields(prev => new Set([...prev, 'stats']));
    setSelectedMatches(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const toggleMedia = useCallback((id: string, checked: boolean) => {
    if (checked) setSelectedFields(prev => new Set([...prev, 'highlights']));
    setSelectedMedia(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const toggleEvent = useCallback((id: string, checked: boolean) => {
    if (checked) setSelectedFields(prev => new Set([...prev, 'upcomingEvents']));
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const previewRequest = useRef(0);
  const loadPreview = useCallback(async () => {
    const requestId = ++previewRequest.current;
    setPreviewData(null);
    setError(null);
    setPreviewLoading(true);
    try {
      if (isDemo) {
        // Demo mode: build a fully synthetic preview using the shared buildDemoProjection
        // function so preview and coach view are guaranteed to show identical content.
        // No API call is made — the demo workflow must not query the application database.
        const projection = buildDemoProjection(selectedFields, selectedMatches, profile);
        setPreviewData(projection);
        return;
      }
      // Real mode: pass selected match IDs, media IDs, and event IDs so the
      // preview reflects exactly what the coach will see after link creation.
      // The preview endpoint returns the full projection; we filter it here to
      // the selected approved fields before rendering.
      const qs = coachPreviewParams(selectedFields, selectedMatches, selectedMedia, selectedEvents).toString();
      const previewUrl = `/api/parent/players/${playerId}/coach-preview?${qs}`;
      const res = await fetch(previewUrl);
      if (res.ok) {
        const data = await res.json() as { profile: Record<string, unknown> };
        if (requestId !== previewRequest.current) return;
        setPreviewData(filterCoachProfile(data.profile, selectedFields));
      } else if (requestId === previewRequest.current) {
        setError('Could not load the coach preview. Please try again.');
      }
    } catch {
      if (requestId === previewRequest.current) setError('Could not load the coach preview. Please try again.');
    } finally {
      if (requestId === previewRequest.current) setPreviewLoading(false);
    }
  }, [playerId, isDemo, selectedMatches, selectedMedia, selectedEvents, selectedFields, profile]);

  useEffect(() => {
    if (step === 'preview') void loadPreview();
    return () => { ++previewRequest.current; };
  }, [step, loadPreview]);

  const createLink = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      if (isDemo) {
        // Demo mode: persist to localStorage via demoLinkStore (cross-tab).
        // No API call is made — the demo workflow must not write to the database.
        // The token is stored with the approved fields + selected match IDs so
        // /coach/profile/:token can resolve it from localStorage in a new tab.
        const { link, shareUrl, persisted } = demoLinkStore.create({
          label: linkLabel.trim() || null,
          approvedFields: Array.from(selectedFields),
          selectedMatchRecordIds: Array.from(selectedMatches),
          expiresInDays,
          baseProfile: profile,
          playerId,
        });
        if (!persisted) {
          setError('Could not save demo link — browser storage unavailable. Try disabling private/incognito mode.');
          return;
        }
        const newLink: CoachLink = {
          id: link.id,
          label: link.label,
          approvedFields: link.approvedFields,
          selectedMatchRecordCount: link.selectedMatchRecordIds.length,
          expiresAt: link.expiresAt,
          revokedAt: null,
          createdAt: link.createdAt,
          status: 'active',
        };
        setCreatedShareUrl(styledCoachUrl(shareUrl, cardLayout));
        setLinks(prev => [newLink, ...prev]);
        setStep('created');
        return;
      }
      const res = await fetch(`/api/parent/players/${playerId}/coach-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedFields: Array.from(selectedFields),
          selectedMatchRecords: Array.from(selectedMatches),
          selectedMedia: Array.from(selectedMedia),
          selectedEvents: Array.from(selectedEvents),
          expiresInDays,
          baseProfile: profile,
          playerId,
          label: linkLabel.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to create link');
        return;
      }
      const data = await res.json() as { linkId: string; shareUrl: string; expiresAt: string | null };
      setCreatedShareUrl(styledCoachUrl(data.shareUrl, cardLayout));
      setStep('created');
      const linksRes = await fetch(`/api/parent/players/${playerId}/coach-links`);
      if (linksRes.ok) {
        const linksData = await linksRes.json() as { links: CoachLink[] };
        setLinks(linksData.links);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [playerId, selectedFields, selectedMatches, selectedMedia, selectedEvents, expiresInDays, linkLabel, isDemo, profile, cardLayout]);

  const revokeLink = useCallback(async (linkId: string) => {
    setRevoking(linkId);
    setError(null);
    try {
      if (isDemo) {
        // Demo mode: revoke in localStorage via demoLinkStore, no API call.
        // Only update UI state when persistence succeeds — a failed write means
        // the link is still active in storage and the coach tab can still resolve it.
        const result = demoLinkStore.revoke(linkId);
        if (!result.persisted) {
          setError('Could not revoke demo link — browser storage unavailable. Try disabling private/incognito mode.');
          return;
        }
        if (!result.revoked) {
          // Already revoked or not found — treat as a no-op, refresh list from storage
          setLinks(demoLinkStore.list().filter(l => l.playerId === playerId).map(l => ({
            id: l.id,
            label: l.label,
            approvedFields: l.approvedFields,
            selectedMatchRecordCount: l.selectedMatchRecordIds.length,
            expiresAt: l.expiresAt,
            revokedAt: l.revokedAt,
            createdAt: l.createdAt,
            status: l.status,
          })));
          return;
        }
        // Persistence confirmed — safe to update UI
        setLinks(prev => prev.map(l =>
          l.id === linkId ? { ...l, status: 'revoked' as const, revokedAt: new Date().toISOString() } : l,
        ));
        return;
      }
      const res = await fetch(`/api/parent/players/${playerId}/coach-links/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        setLinks(prev => prev.map(l => l.id === linkId ? { ...l, status: 'revoked' as const, revokedAt: new Date().toISOString() } : l));
      } else {
        setError('Failed to revoke link. Please try again.');
      }
    } catch {
      setError('Network error while revoking. Please try again.');
    } finally {
      setRevoking(null);
    }
  }, [playerId, isDemo]);

  const copyUrl = useCallback(async () => {
    if (!createdShareUrl) return;
    try {
      await navigator.clipboard.writeText(createdShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  }, [createdShareUrl]);

  const fieldsByGroup = fields.reduce<Record<string, FieldDef[]>>((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  if (loading) {
    return (
      <PpCard>
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading coach sharing…</span>
        </div>
      </PpCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {optionalErrors.length > 0 && (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          Could not load: {optionalErrors.join(', ')}. These sections may be incomplete.
          <button type="button" className="ml-2 underline" onClick={() => void loadData()}>Retry sections</button>
        </div>
      )}
      {!isDemo && <section className="rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Games, camps & tournaments</h3>
        <p className="text-sm">Add upcoming camps, tournaments and showcases here. Then select them in Coach Sharing; saving an event does not share it.</p>
        {addingAppearance ? <AppearanceForm playerId={playerId} onClose={() => setAddingAppearance(false)} onSaved={() => { setAddingAppearance(false); void loadData(); }} /> : <button type="button" className="border rounded-lg px-4 py-2" onClick={() => setAddingAppearance(true)}>Add camp or tournament</button>}
      </section>}
      {isDemo && <DemoBanner />}
      {isDemo && <CoachRequestInbox playerId={playerId}/>}
      <ProfileBuilder key={playerId} playerId={playerId} isDemo={isDemo} editing={editingProfile} onEdit={() => setEditingProfile(true)} onSaved={p => { setProfile(p); setEditingProfile(false); setStep('fields'); }} />
      {!editingProfile && <button type="button" className="self-start text-xs font-medium underline" style={{ color: 'hsl(var(--pp-blue))' }} onClick={() => setEditingProfile(true)}>Edit profile</button>}

      {step === 'fields' && !editingProfile && (
        <PpCard className="overflow-x-hidden">
          <PpSectionHeading icon={<Share2 size={14} />} title="Share with a coach" />
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Select which profile fields to include in the coach-facing card.
            Only the fields you choose will be visible.
          </p>
          {fieldsLoadError && (
            <div className="rounded-xl px-3 py-3 mb-4 flex flex-col gap-2"
              style={{ background: 'hsl(var(--pp-red-light))', border: '1px solid hsl(var(--pp-red))' }}>
              <div className="flex items-start gap-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--pp-red))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--pp-red))' }}>{fieldsLoadError}</p>
              </div>
              <PpButton size="sm" variant="ghost" onClick={() => void loadData()} className="self-start">
                <Loader2 size={11} className="mr-1" />Retry
              </PpButton>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {Object.entries(fieldsByGroup).map(([group, groupFields]) => (
              <div key={group}>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                  style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {GROUP_LABELS[group] ?? group}
                </p>
                <div className="flex flex-col gap-1.5">
                  {groupFields.map(f => (
                    <FieldCheckbox key={f.key} field={f} checked={selectedFields.has(f.key)} onChange={toggleField} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {featureDisabled && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mt-4 text-xs"
              style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Coach sharing is not yet enabled</p>
                <p className="mt-0.5">The <code className="font-mono">COACH_PROFILE_LINKS_ENABLED</code> secret must be set to <code className="font-mono">true</code> in Settings → Secrets. Once enabled, you can select fields and generate a share link.</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
            </span>
            <PpButton size="sm" disabled={selectedFields.size === 0 || featureDisabled} onClick={() => setStep('matches')}>
              Next: Match records
            </PpButton>
          </div>
        </PpCard>
      )}

      {step === 'matches' && (
        <PpCard>
          <PpSectionHeading icon={<CheckSquare size={14} />} title="Select match records" />
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Choose which game records to include in the stats shown to the coach.
            Only selected records are aggregated.
          </p>
          {matchRecords.length === 0 ? (
            <div className="rounded-lg px-4 py-6 text-center"
              style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>No match records yet</p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Add game records in the Stats tab to include them here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {matchRecords.map(r => (
                <MatchRecordRow key={r.id} record={r} checked={selectedMatches.has(r.id)} onChange={toggleMatch} />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => setStep('fields')}>Back</PpButton>
            <div className="flex items-center gap-2">
              {selectedMatches.size === 0 && (
                <PpButton size="sm" variant="ghost" onClick={() => setStep('media')}>Skip</PpButton>
              )}
              {selectedMatches.size > 0 && (
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {selectedMatches.size} record{selectedMatches.size !== 1 ? 's' : ''} selected
                </span>
              )}
              <PpButton size="sm" onClick={() => setStep('media')}>
                {selectedMatches.size > 0 ? 'Next: Highlight videos' : 'Next'}
              </PpButton>
            </div>
          </div>
        </PpCard>
      )}

      {step === 'media' && (
        <PpCard>
          <PpSectionHeading icon={<CheckSquare size={14} />} title="Select highlight videos" />
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Choose which uploaded highlight videos to share with the coach.
            Only selected videos are accessible through the link.
          </p>
          {mediaAssignments.length === 0 ? (
            <div className="rounded-lg px-4 py-6 text-center"
              style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>No highlight videos yet</p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Upload video highlights in the Media tab to include them here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {mediaAssignments.map(a => (
                <label key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
                  style={{ background: 'hsl(var(--pp-surface))', border: `1px solid ${selectedMedia.has(a.id) ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))'}` }}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedMedia.has(a.id)}
                    onChange={e => toggleMedia(a.id, e.target.checked)}
                  />
                  <span style={{ color: selectedMedia.has(a.id) ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}>
                    {selectedMedia.has(a.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                      {a.title ?? a.original_name ?? 'Untitled video'}
                    </p>
                    {a.season && (
                      <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{a.season}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => setStep('matches')}>Back</PpButton>
            <div className="flex items-center gap-2">
              {selectedMedia.size === 0 && (
                <PpButton size="sm" variant="ghost" onClick={() => setStep('events')}>Skip</PpButton>
              )}
              {selectedMedia.size > 0 && (
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {selectedMedia.size} video{selectedMedia.size !== 1 ? 's' : ''} selected
                </span>
              )}
              <PpButton size="sm" onClick={() => setStep('events')}>
                {selectedMedia.size > 0 ? 'Next: Upcoming events' : 'Next'}
              </PpButton>
            </div>
          </div>
        </PpCard>
      )}

      {step === 'events' && (
        <PpCard>
          <PpSectionHeading icon={<CheckSquare size={14} />} title="Select upcoming events" />
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Choose which upcoming events to share with the coach.
            Only selected events are visible — coaches can see where and when to watch.
          </p>
          {upcomingEvents.length === 0 ? (
            <div className="rounded-lg px-4 py-6 text-center"
              style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>No upcoming events</p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Add a game, camp, tournament or showcase for this player in Schedule, then select it here. Imported calendar events are not shared automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {upcomingEvents.map(ev => (
                <button
                  key={ev.id}
                  type="button"
                  data-event-id={ev.id}
                  aria-pressed={selectedEvents.has(ev.id)}
                  onClick={() => toggleEvent(ev.id, !selectedEvents.has(ev.id))}
                  className="flex items-center gap-2.5 w-full text-left rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    background: selectedEvents.has(ev.id) ? 'hsl(var(--pp-blue-light))' : 'transparent',
                    border: `1px solid ${selectedEvents.has(ev.id) ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))'}`,
                  }}
                >
                  <span className="shrink-0" style={{ color: selectedEvents.has(ev.id) ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-text-muted))' }}>
                    {selectedEvents.has(ev.id) ? <CheckSquare size={13} /> : <Square size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                      {ev.opponent ? `${ev.isHome ? 'vs.' : '@'} ${ev.opponent}` : ev.title}
                    </p>
                    <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      {formatDate(ev.date)}{ev.startAt ? ` · ${calendarTime(ev.startAt, ev.allDay)}` : ''}{ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => setStep('media')}>Back</PpButton>
            <div className="flex items-center gap-2">
              {selectedEvents.size === 0 && (
                <PpButton size="sm" variant="ghost" onClick={() => setStep('settings')}>Skip</PpButton>
              )}
              {selectedEvents.size > 0 && (
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {selectedEvents.size} event{selectedEvents.size !== 1 ? 's' : ''} selected
                </span>
              )}
              <PpButton size="sm" onClick={() => setStep('settings')}>
                {selectedEvents.size > 0 ? 'Next: Link settings' : 'Next'}
              </PpButton>
            </div>
          </div>
        </PpCard>
      )}

      {step === 'settings' && (
        <PpCard>
          <PpSectionHeading icon={<Link2 size={14} />} title="Link settings" />
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                Label (optional)
              </label>
              <input
                type="text"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                placeholder="e.g. Colorado State — Coach Smith"
                maxLength={120}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: 'hsl(var(--pp-surface))',
                  border: '1px solid hsl(var(--pp-border))',
                  color: 'hsl(var(--pp-text))',
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Helps you identify this link later. Not visible to the coach.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--pp-text))' }}>
                Expires in
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {[7, 14, 30, 90].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setExpiresInDays(days)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: expiresInDays === days ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-surface))',
                      color: expiresInDays === days ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))',
                      border: `1px solid ${expiresInDays === days ? 'hsl(var(--pp-blue))' : 'hsl(var(--pp-border))'}`,
                    }}
                  >
                    {days}d
                  </button>
                ))}
                <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>(max 365 days)</span>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5"
              style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
              <Shield size={12} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
              <div className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                <strong style={{ color: 'hsl(var(--pp-text))' }}>Privacy: </strong>
                Anyone with the URL can view the card until it expires or you revoke it.
                Share only with coaches you trust. The link is not indexed or discoverable.
              </div>
            </div>
          </div>
          {featureDisabled && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mt-3 text-xs"
              style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <p>Coach sharing is not yet enabled. Set <code className="font-mono">COACH_PROFILE_LINKS_ENABLED</code> to <code className="font-mono">true</code> in Settings → Secrets.</p>
            </div>
          )}
          {error && (
            <div data-testid="coach-share-error" className="flex items-center gap-2 mt-3 text-xs rounded-lg px-3 py-2"
              style={{ background: 'hsl(var(--pp-red-light))', color: 'hsl(var(--pp-red))' }}>
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => setStep('events')}>Back</PpButton>
            <div className="flex items-center gap-2">
              <PpButton size="sm" variant="ghost" data-testid="preview-card-btn" onClick={() => setStep('preview')}>
                <Eye size={12} className="mr-1" />Preview card
              </PpButton>
              <PpButton size="sm" onClick={() => void createLink()} disabled={creating || featureDisabled}>
                {creating ? <Loader2 size={12} className="animate-spin mr-1" /> : <Link2 size={12} className="mr-1" />}
                Create link
              </PpButton>
            </div>
          </div>
        </PpCard>
      )}

      {step === 'preview' && (
        <PpCard>
          <PpSectionHeading icon={<Eye size={14} />} title="Coach card preview" />
          <p className="text-xs mb-4" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            This is what a coach will see. Only the fields you selected are shown.
          </p>
          <fieldset className="mb-5"><legend className="text-sm font-semibold mb-2">Card style</legend>
            <div className="flex flex-wrap gap-2">{COACH_CARD_STYLES.map(style => <button key={style} type="button" aria-pressed={cardLayout === style}
              className="min-h-11 px-4 py-2 rounded-xl border text-sm font-semibold"
              style={{background: cardLayout === style ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-white))', color: cardLayout === style ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text))', borderColor:'hsl(var(--pp-border))'}}
              onClick={() => setCardLayout(style)}>{style === 'classic' ? 'Classic' : style === 'trading' ? 'Player card' : 'Recruiting profile'}</button>)}</div>
            <p className="text-xs mt-2" style={{color:'hsl(var(--pp-text-muted))'}}>Same approved information in every style. Your choice is included in the link you create.</p>
          </fieldset>
          {/* Editable intro and college goals moved to ProfileBuilder */}
          {previewLoading ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Loading preview…</span>
            </div>
          ) : previewData ? (
            // Use the shared CoachProfileCard so preview and coach view are identical
            <CoachProfileCard
              profile={previewData as Parameters<typeof CoachProfileCard>[0]['profile']}
              isDemoLink={isDemo}
              layout={cardLayout}
            />
          ) : (
            <div className="text-xs text-center py-6" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {error ?? 'Preview unavailable.'}
              <button type="button" className="ml-2 underline" onClick={() => void loadPreview()}>Retry preview</button>
            </div>
          )}
          <div className="flex items-center justify-between mt-5 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => setStep('settings')}>Back</PpButton>
            <PpButton size="sm" data-testid="create-link-btn" onClick={() => void createLink()} disabled={creating || previewLoading || !previewData}>
              {creating ? <Loader2 size={12} className="animate-spin mr-1" /> : <Link2 size={12} className="mr-1" />}
              Create link
            </PpButton>
          </div>
        </PpCard>
      )}

      {step === 'created' && createdShareUrl && (
        <PpCard>
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'hsl(var(--pp-green-light))' }}>
              <Check size={22} style={{ color: 'hsl(var(--pp-green))' }} />
            </div>
            <div>
              <p className="text-sm font-bold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                Coach link created
                {isDemo && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}>
                    Demo
                  </span>
                )}
              </p>
              <p className="text-xs max-w-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {isDemo
                  ? 'Open the link below in this browser to preview the coach view. Demo links work only within the same browser.'
                  : 'Copy the link below and share it with the coach. Anyone with this URL can view the card until it expires.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 mt-2"
            style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}>
            <span data-testid="coach-share-url" className="flex-1 text-xs font-mono truncate" style={{ color: 'hsl(var(--pp-text))' }}>
              {createdShareUrl}
            </span>
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
              style={{ color: copied ? 'hsl(var(--pp-green))' : 'hsl(var(--pp-blue))' }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={createdShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
              style={{ color: 'hsl(var(--pp-blue))' }}
              title="Open coach view in new tab"
            >
              <ExternalLink size={11} />
            </a>
          </div>
          <a
            href={createdShareUrl ?? '#'}
            data-testid="view-as-coach-btn"
            className="flex items-center justify-center gap-2 w-full mt-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'hsl(var(--pp-green))', color: 'hsl(var(--pp-white))' }}
          >
            <Eye size={14} />
            View as Coach
          </a>
          {isDemo && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mt-3 text-[11px]"
              style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
              <Info size={11} className="mt-0.5 shrink-0" />
              <span>
                <strong>Demo link — </strong>
                This URL works only within the same browser (localStorage). It cannot be
                shared with coaches on other devices. In production, links are stored
                durably on the server and remain valid until expiry or revocation.
              </span>
            </div>
          )}

          {/* ── Send to a saved coach ─────────────────────────────────── */}
          {savedCoaches.length > 0 && onDraftWithLink && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
                Include this link in an outreach draft
              </p>
              <p className="text-[11px] mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Choose a saved coach to open the draft composer with this profile link pre-inserted.
              </p>
              <div className="flex flex-col gap-2">
                {savedCoaches.map(sc => (
                  <button
                    key={sc.coachId}
                    type="button"
                    onClick={() => onDraftWithLink(sc.coachId, createdShareUrl!)}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:opacity-90"
                    style={{ background: 'hsl(var(--pp-surface))', border: '1px solid hsl(var(--pp-border))' }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                        {sc.name ?? 'Coach'} · {sc.institution}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        {[sc.role, sc.division].filter(Boolean).join(' · ')}
                        {!sc.email && <span className="ml-1 italic">No email on file</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-medium shrink-0"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <Mail size={12} />
                      Draft email
                    </div>
                  </button>
                ))}
              </div>
              {isDemo && (
                <p className="text-[10px] mt-2 italic" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Demo: clicking opens the draft composer with the profile URL pre-inserted in the message body.
                </p>
              )}
            </div>
          )}

          {savedCoaches.length === 0 && onDraftWithLink && (
            <div className="mt-4 pt-4 flex items-start gap-2 text-[11px]"
              style={{ borderTop: '1px solid hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
              <Info size={11} className="mt-0.5 shrink-0" />
              <span>
                Save a coach in <strong>Coaches &amp; Colleges</strong> to send this link directly from an outreach draft.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 pt-4"
            style={{ borderTop: '1px solid hsl(var(--pp-border))' }}>
            <PpButton size="sm" variant="ghost" onClick={() => {
              setStep('fields');
              setCreatedShareUrl(null);
              setSelectedMatches(new Set());
              setSelectedEvents(new Set());
              setLinkLabel('');
              setExpiresInDays(30);
            }}>
              Create another
            </PpButton>
            <a
              href={createdShareUrl ?? '#'}
              data-testid="view-card-btn"
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'hsl(var(--pp-blue))', background: 'hsl(var(--pp-blue-light))' }}
            >
              <Eye size={11} />View card
            </a>
          </div>
        </PpCard>
      )}

      {links.length > 0 && (
        <PpCard>
          <button
            type="button"
            data-testid="active-links-toggle"
            className="flex items-center justify-between w-full"
            onClick={() => setShowLinks(v => !v)}
          >
            <PpSectionHeading
              icon={<Link2 size={14} />}
              title={`Active links (${links.filter(l => l.status === 'active').length})`}
            />
            {showLinks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLinks && (
            <div className="flex flex-col gap-2 mt-3">
              {links.map(link => (
                <LinkRow
                  key={link.id}
                  link={link}
                  onRevoke={id => void revokeLink(id)}
                  revoking={revoking === link.id}
                  onCreateReplacement={(l) => {
                    // Pre-fill the label from the replaced link and go to the fields step.
                    // The parent can adjust fields/settings before creating the new link.
                    setLinkLabel(l.label ?? '');
                    setStep('fields');
                    setCreatedShareUrl(null);
                  }}
                />
              ))}
            </div>
          )}
        </PpCard>
      )}
    </div>
  );
}

// CoachCardPreview and PreviewRow removed — preview now uses the shared
// CoachProfileCard component (src/components/portal/CoachProfileCard.tsx)
// so the parent's inline preview and the coach-facing page are identical.
