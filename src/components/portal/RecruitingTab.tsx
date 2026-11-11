import OutreachProfilePicker from './OutreachProfilePicker';
import { emptyComposition, type DraftComposition } from '@/lib/portal/outreach-composition';
import { useRecruitingData } from './RecruitingData';
/**
 * RecruitingTab — private recruiting section inside the Parent Portal.
 *
 * Access tiers:
 *   All authenticated parents with any player age:
 *     - College ID Camps
 *     - Showcases & Tournaments
 *     - Saved Opportunities
 *
 *   U16–U19 only (outreach tier):
 *     - Coaches & Colleges contact directory
 *     - "Reach out to coaches" / outreach drafts
 *     - Coach-sharing invitations and coach-view previews
 *
 * All data is private — never exposed publicly.
 * No emails are sent. Drafts are clearly labeled.
 * The U16+ gate is a product rule, not verified age.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, Tent, Trophy, Bookmark, Mail, Share2,
  ExternalLink, Search, ChevronDown, ChevronUp,
  AlertCircle, Loader2, Check, Star, Info, X, Eye, Lock,
  Send, RotateCcw, ArrowLeft,
} from 'lucide-react';
import CoachShareTab from '@/components/portal/CoachShareTab';

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTREACH_AGE_GROUPS = new Set(['U16', 'U17', 'U18', 'U19']);

type RecruitingSection = 'coaches' | 'camps' | 'showcases' | 'saved' | 'drafts' | 'share';

const SECTIONS: { id: RecruitingSection; label: string; icon: React.ReactNode; outreachOnly: boolean }[] = [
  { id: 'coaches',   label: 'Coaches & Colleges',     icon: <GraduationCap size={14} />, outreachOnly: true  },
  { id: 'camps',     label: 'College ID Camps',        icon: <Tent size={14} />,          outreachOnly: false },
  { id: 'showcases', label: 'Showcases & Tournaments', icon: <Trophy size={14} />,        outreachOnly: false },
  { id: 'saved',     label: 'Saved Opportunities',     icon: <Bookmark size={14} />,      outreachOnly: false },
  { id: 'drafts',    label: 'Outreach Drafts',         icon: <Mail size={14} />,          outreachOnly: true  },
  { id: 'share',     label: 'Build Profile',         icon: <Share2 size={14} />,        outreachOnly: true  },
];

const REGIONS = [
  { value: '',           label: 'All regions' },
  { value: 'colorado',   label: 'Colorado' },
  { value: 'arizona',    label: 'Arizona' },
  { value: 'cal-south',  label: 'Cal South' },
  { value: 'cal-north',  label: 'Cal North' },
  { value: 'oregon',     label: 'Oregon' },
  { value: 'washington', label: 'Washington' },
  { value: 'nevada',     label: 'Nevada' },
];

const DIVISIONS = [
  { value: '',        label: 'All divisions' },
  { value: 'NCAA D1', label: 'NCAA D1' },
  { value: 'NCAA D2', label: 'NCAA D2' },
  { value: 'NCAA D3', label: 'NCAA D3' },
  { value: 'NAIA',    label: 'NAIA' },
  { value: 'NJCAA',   label: 'NJCAA' },
];

const GENDERS = [
  { value: '',       label: 'All programs' },
  { value: 'womens', label: "Women's" },
  { value: 'mens',   label: "Men's" },
];

const LISTING_STATUS_LABELS: Record<string, string> = {
  confirmed_upcoming: 'Confirmed upcoming',
  confirmed:          'Confirmed',
  estimated:          'Planning estimate',
  directory_only:     'Directory listing',
  historical:         'Historical',
  tbd:                'Dates TBD',
};

// Descriptions for each listing status — shown once in the collapsible guide.
const LISTING_STATUS_DESCRIPTIONS: Record<string, string> = {
  confirmed_upcoming: 'Dates and registration confirmed by the organizer for an upcoming event.',
  confirmed:          'Confirmed event with verified details.',
  estimated:          'Dates estimated from documented historical patterns — not confirmed by organizer.',
  directory_only:     'Program listed in a recruiting directory; no confirmed event dates available.',
  historical:         'Past event included for reference. Future occurrence not confirmed.',
  tbd:                'Event is planned but dates have not been announced.',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachProgram {
  id: string;
  institution: string;
  shortName: string | null;
  gender: string;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  regions: string[];
  programUrl: string | null;
  staffUrl: string | null;
}

interface Coach {
  coachId: string;
  name: string | null;
  role: string | null;
  email: string | null;
  emailIsPersonal: boolean | null;
  phone: string | null;
  staffPageUrl: string | null;
  checkedDate: string | null;
  program: CoachProgram;
}

// Program with its verified coaches (may be empty when all coaches are withheld).
// Returned by GET /api/parent/recruiting/programs — LEFT JOIN, so programs always appear.
interface RecruitingProgram {
  id: string;
  institution: string;
  shortName: string | null;
  gender: string;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  regions: string[];
  programUrl: string | null;
  staffUrl: string | null;
  coaches: Array<{
    coachId: string;
    name: string | null;
    role: string | null;
    email: string | null;
    emailIsPersonal: boolean | null;
    phone: string | null;
    staffPageUrl: string | null;
    checkedDate: string | null;
  }>;
}

interface Camp {
  id: string;
  institution: string;
  campName: string;
  region: string;
  city: string | null;
  state: string | null;
  gender: string | null;
  ageEligibility: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationOpens: string | null;
  registrationDeadline: string | null;
  price: string | null;
  registrationUrl: string | null;
  listingStatus: string;
  estimateEvidence: string | null;
  sourceUrl: string | null;
  checkedDate: string | null;
  program: { programUrl: string | null; division: string | null; conference: string | null } | null;
}

interface Showcase {
  id: string;
  name: string;
  organizer: string | null;
  region: string;
  city: string | null;
  state: string | null;
  officialUrl: string | null;
  gender: string | null;
  ageGroups: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationDeadline: string | null;
  entryType: string | null;
  listingStatus: string;
  recruitingEvidence: string | null;
  historicalAttendance: string | null;
  sourceUrl: string | null;
  checkedDate: string | null;
}

interface SavedItem {
  id: string;
  playerId?: string;
  itemType: 'coach' | 'camp' | 'showcase';
  itemId: string;
  status: string;
  calendarEventId: string | null;
  notes: string | null;
  savedAt: string;
  updatedAt?: string;
  resolved?: boolean;
  // Resolved coach fields (itemType === 'coach')
  coach?: {
    name: string | null;
    role: string | null;
    email: string | null;
    emailIsPersonal: boolean | null;
    phone: string | null;
    staffPageUrl: string | null;
    checkedDate: string | null;
  };
  program?: {
    institution: string | null;
    shortName: string | null;
    gender: string | null;
    division: string | null;
    programUrl: string | null;
  };
  // Resolved camp fields (itemType === 'camp')
  camp?: {
    name: string | null;
    institution: string | null;
    region: string | null;
    city: string | null;
    state: string | null;
    gender: string | null;
    ageEligibility: string | null;
    startDate: string | null;
    endDate: string | null;
    price: string | null;
    registrationUrl: string | null;
    listingStatus: string | null;
  };
  // Resolved showcase fields (itemType === 'showcase')
  showcase?: {
    name: string | null;
    organizer: string | null;
    region: string | null;
    city: string | null;
    state: string | null;
    gender: string | null;
    ageGroups: string | null;
    startDate: string | null;
    endDate: string | null;
    officialUrl: string | null;
    listingStatus: string | null;
  };
}

interface OutreachDraft {
  composition?: DraftComposition;
  id: string;
  playerId: string;
  coachId: string;
  approvedFields: string[];
  selectedCollectionId: string | null;
  selectedMedia: string[];
  selectedMatchRecords: string[];
  introduction: string | null;
  subject: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  draftStatus: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  coach: {
    name: string | null;
    role: string | null;
    email: string | null;
    emailIsPersonal: boolean | null;
    staffPageUrl: string | null;
  };
  program: { institution: string; shortName: string | null; gender: string; division: string | null; programUrl: string | null };
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function FieldSelect({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isConfirmed = status === 'confirmed_upcoming' || status === 'confirmed';
  const isEstimate  = status === 'estimated';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: isConfirmed
          ? 'hsl(var(--pp-green) / 0.12)'
          : isEstimate
            ? 'hsl(var(--pp-amber) / 0.12)'
            : 'hsl(var(--pp-border))',
        color: isConfirmed
          ? 'hsl(var(--pp-green))'
          : isEstimate
            ? 'hsl(var(--pp-amber-dark))'
            : 'hsl(var(--pp-text-muted))',
      }}
    >
      {LISTING_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Badge shown when age eligibility is unknown for a camp or showcase. */
function EligibilityUnknownBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'hsl(var(--pp-amber) / 0.10)', color: 'hsl(var(--pp-amber-dark))' }}
    >
      <AlertCircle size={9} />
      Check organizer eligibility
    </span>
  );
}

function SaveButton({
  isSaved, saving, onSave, onUnsave,
}: {
  isSaved: boolean;
  saving: boolean;
  onSave: () => void;
  onUnsave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={isSaved ? onUnsave : onSave}
      disabled={saving}
      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors disabled:opacity-50"
      style={{
        background: isSaved ? 'hsl(var(--pp-navy))' : 'transparent',
        color: isSaved ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
        borderColor: isSaved ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
      }}
    >
      {saving ? <Loader2 size={11} className="animate-spin" /> : <Bookmark size={11} />}
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="opacity-30">{icon}</div>
      <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={20} className="animate-spin" style={{ color: 'hsl(var(--pp-blue))' }} />
    </div>
  );
}

// Bug fix: ErrorState now accepts an optional onRetry prop so failed requests
// show a Retry button instead of a dead "No camps found" empty state.
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: 'hsl(var(--destructive) / 0.08)' }}>
      <div className="flex items-center gap-2" style={{ color: 'hsl(var(--destructive))' }}>
        <AlertCircle size={14} className="shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'hsl(var(--destructive) / 0.4)', color: 'hsl(var(--destructive))', background: 'transparent' }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function NotMigratedBanner() {
  return (
    <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}>
      <div className="flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
        <div style={{ color: 'hsl(var(--pp-text))' }}>
          <p className="font-medium">Recruiting data not yet loaded</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            An admin needs to run the recruiting schema migration and seed import before data appears here.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Shown in place of outreach-only content for players below U16. */
function OutreachGateNotice() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
    >
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
      >
        <Lock size={18} style={{ color: 'hsl(var(--pp-blue))' }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
          Coach outreach becomes available at U16
        </p>
        <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          The Coaches &amp; Colleges directory and outreach drafts unlock when this player reaches U16.
          You can still browse camps, showcases, and save opportunities now.
        </p>
      </div>
    </div>
  );
}

// ─── Collapsible listing-status guide ────────────────────────────────────────
// Bug fix: replaces the old grid that rendered both StatusBadge (which already
// contains the label text) AND a duplicate <span> with the same label — causing
// every entry to show its name twice on mobile.

function ListingStatusGuide({ statuses }: { statuses: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border text-xs overflow-hidden" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        style={{ color: 'hsl(var(--pp-text))' }}
      >
        <span className="font-medium">Listing status guide</span>
        {open ? <ChevronUp size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} /> : <ChevronDown size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          {statuses.map(k => (
            <div key={k} className="flex flex-col gap-0.5 pt-2">
              <StatusBadge status={k} />
              <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {LISTING_STATUS_DESCRIPTIONS[k] ?? LISTING_STATUS_LABELS[k] ?? k}
              </p>
            </div>
          ))}
          <p className="text-[10px] pt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Planning estimates are based on documented historical dates only. Saving interest does not mean registration is complete.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Email Draft Composer ─────────────────────────────────────────────────────
// Replaces the old OutreachModal. Handles both create (no existingDraft) and
// continue (existingDraft pre-filled). Saves to sc_outreach_drafts via POST or
// PATCH. "Open in email app" uses mailto: with the reviewed recipient — never
// marks sent automatically. "Mark as sent" is a separate explicit action.

interface EmailDraftComposerProps {
  playerId: string;
  coach: Coach;
  existingDraft: OutreachDraft | null;
  onClose: () => void;
  onSaved: (draft: OutreachDraft) => void;
  /** If set, shows an "Attach profile link" banner and pre-inserts the URL into the body */
  profileLinkUrl?: string | null;
}

function buildDefaultSubject(coach: Coach): string {
  const inst = coach.program.shortName ?? coach.program.institution;
  return `Recruiting inquiry — ${inst} ${coach.program.gender === 'womens' ? "Women's" : "Men's"} Soccer`;
}

function buildDefaultBody(coach: Coach, introduction: string): string {
  const coachName = coach.name ? `Coach ${coach.name.split(' ').pop() ?? coach.name}` : 'Coach';
  const role = coach.role ? ` (${coach.role})` : '';
  const inst = coach.program.institution;
  const header = `Dear ${coachName}${role},\n\n`;
  const body = introduction.trim() || `I am writing to express my interest in the ${inst} soccer program.`;
  const footer = '\n\nThank you for your time and consideration.';
  return header + body + footer;
}

function EmailDraftComposer({ playerId, coach, existingDraft, onClose, onSaved, profileLinkUrl }: EmailDraftComposerProps) {
  const {request, demo} = useRecruitingData();
  // Pre-fill from existing draft or derive from directory data
  const [subject, setSubject] = useState(
    existingDraft?.subject ?? buildDefaultSubject(coach)
  );
  const profileLinkDefault = profileLinkUrl
    ? `Please find my player profile here:\n${profileLinkUrl}`
    : '';
  const [body, setBody] = useState(
    profileLinkUrl && !existingDraft?.introduction?.includes(profileLinkUrl)
      ? [existingDraft?.introduction, profileLinkDefault].filter(Boolean).join('\n\n')
      : existingDraft?.introduction ?? profileLinkDefault
  );
  const [recipientName, setRecipientName] = useState(
    existingDraft?.recipientName ?? coach.name ?? ''
  );
  const [recipientEmail, setRecipientEmail] = useState(
    existingDraft?.recipientEmail ?? coach.email ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [composition,setComposition]=useState<DraftComposition>(existingDraft?.composition ?? emptyComposition());
  const [profileText,setProfileText]=useState('');
  const [contentReady,setContentReady]=useState(!existingDraft?.composition?.fields.length);
  const [copyFallback,setCopyFallback]=useState(false);
  const assembledBody = [body,profileText].filter(Boolean).join('\n\n');

  // Staleness: directory details changed since draft was saved
  const nameMismatch  = !!existingDraft && !!coach.name  && existingDraft.recipientName  !== null && existingDraft.recipientName  !== coach.name;
  const emailMismatch = !!existingDraft && !!coach.email && existingDraft.recipientEmail !== null && existingDraft.recipientEmail !== coach.email;
  const hasMismatch = nameMismatch || emailMismatch;

  const hasEmail = recipientEmail.trim().length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let savedDraft: OutreachDraft;
      if (existingDraft) {
        // PATCH existing
        const res = await request(`/api/parent/recruiting/drafts/${encodeURIComponent(existingDraft.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId,
            composition,
            subject: subject.trim() || null,
            introduction: body.trim() || null,
            recipientName: recipientName.trim() || null,
            recipientEmail: recipientEmail.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
        savedDraft = {
          ...existingDraft,
          composition,
          subject: subject.trim() || null,
          introduction: body.trim() || null,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // POST new
        const res = await request('/api/parent/recruiting/drafts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId,
            coachId: coach.coachId,
            composition,
            approvedFields: ['name', 'ageBand', 'primaryPosition', 'clubName'],
            selectedMedia: [],
            selectedMatchRecords: [],
            subject: subject.trim() || null,
            introduction: body.trim() || null,
            recipientName: recipientName.trim() || null,
            recipientEmail: recipientEmail.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
        const d = await res.json() as { draftId: string };
        savedDraft = {
          id: d.draftId,
          composition,
          playerId,
          coachId: coach.coachId,
          approvedFields: ['name', 'ageBand', 'primaryPosition', 'clubName'],
          selectedCollectionId: null,
          selectedMedia: [],
          selectedMatchRecords: [],
          introduction: body.trim() || null,
          subject: subject.trim() || null,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          draftStatus: 'draft',
          sentAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          coach: {
            name: coach.name,
            role: coach.role,
            email: coach.email,
            emailIsPersonal: coach.emailIsPersonal,
            staffPageUrl: coach.staffPageUrl,
          },
          program: {
            institution: coach.program.institution,
            shortName: coach.program.shortName,
            gender: coach.program.gender,
            division: coach.program.division,
            programUrl: coach.program.programUrl,
          },
        };
      }
      onSaved(savedDraft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInEmailApp = () => {
    if (!contentReady) { setError('Wait for the selected content to load or resolve the selection warning.'); return; }
    const to = encodeURIComponent(recipientEmail.trim());
    const subj = encodeURIComponent(subject.trim());
    const bodyText = encodeURIComponent(buildDefaultBody(coach, assembledBody));
    if (demo) { window.alert('Synthetic draft saved for review. Demo links cannot be emailed to another browser.'); return; }
    const mailto = `mailto:${to}?subject=${subj}&body=${bodyText}`;
    if (mailto.length > 1800) { setCopyFallback(true); setError('This email is too long for a reliable email-app link. Copy the email below.'); return; }
    window.location.href = mailto;
    // Do NOT mark as sent — user must do that explicitly
  };

  const previewBody = buildDefaultBody(coach, assembledBody);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'hsl(var(--pp-modal-backdrop))' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        style={{ background: 'hsl(var(--pp-card-bg))', border: '1px solid hsl(var(--pp-border))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: 'hsl(var(--pp-text))' }}>
              {existingDraft ? 'Continue draft' : 'Draft email'}
            </p>
            <p className="text-xs truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              {coach.name ?? 'Coach'} · {coach.program.institution}
              {coach.program.division ? ` · ${coach.program.division}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreview(p => !p)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              <Eye size={11} /> {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded" style={{ color: 'hsl(var(--pp-text-muted))' }} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Staleness warning */}
        {hasMismatch && (
          <div className="px-4 py-2.5 border-b shrink-0 space-y-1" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-amber) / 0.08)' }}>
            <div className="flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-amber-dark))' }} />
              <div className="text-xs" style={{ color: 'hsl(var(--pp-amber-dark))' }}>
                <p className="font-medium">Directory details changed since this draft was saved.</p>
                {nameMismatch  && <p>Name: saved "{existingDraft!.recipientName}" → now "{coach.name}"</p>}
                {emailMismatch && <p>Email: saved "{existingDraft!.recipientEmail}" → now "{coach.email}"</p>}
                <p className="mt-1">Review the recipient fields below before sending.</p>
              </div>
            </div>
          </div>
        )}

        {/* Missing email notice */}
        {!hasEmail && !showPreview && (
          <div className="px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}>
            <div className="flex items-start gap-2">
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}>
                No email address is published for this coach on the official staff page. You can still draft and copy the message. Enter an email address manually if you have one, or use the staff directory link to find current contact details.
              </p>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
          {showPreview ? (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 space-y-2 text-xs" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
                <div className="flex items-center gap-2">
                  <Eye size={12} style={{ color: 'hsl(var(--pp-blue))' }} />
                  <span className="font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Email preview</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'hsl(var(--pp-amber) / 0.12)', color: 'hsl(var(--pp-amber-dark))' }}>Draft — not sent</span>
                </div>
                <div style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span className="font-medium">To: </span>
                  <span style={{ color: 'hsl(var(--pp-text))' }}>
                    {recipientName.trim() || '(no name)'}{recipientEmail.trim() ? ` <${recipientEmail.trim()}>` : ' (no email)'}
                  </span>
                </div>
                <div style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <span className="font-medium">Subject: </span>
                  <span style={{ color: 'hsl(var(--pp-text))' }}>{subject.trim() || '(no subject)'}</span>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-xs rounded-lg border p-3" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))', fontFamily: 'inherit' }}>
                {previewBody}
              </pre>
            </div>
          ) : (
            <>
              {/* Recipient */}
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>Recipient</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Name</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      placeholder="Coach name"
                      className="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      Email {!coach.email && <span style={{ color: 'hsl(var(--pp-amber-dark))' }}>(not published)</span>}
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      placeholder="coach@university.edu"
                      className="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                    />
                  </div>
                </div>
                {coach.staffPageUrl && (
                  <a href={coach.staffPageUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'hsl(var(--pp-blue))' }}>
                    <ExternalLink size={10} /> Find contact on staff page
                  </a>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                />
              </div>

              {/* Profile link banner */}
              {profileLinkUrl && body.includes(profileLinkUrl) && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px]"
                  style={{ background: 'hsl(var(--pp-green-light))', border: '1px solid hsl(var(--pp-green))' }}>
                  <Share2 size={11} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-green))' }} />
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: 'hsl(var(--pp-green))' }}>Player profile link attached</p>
                    <p className="mt-0.5 font-mono truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>{profileLinkUrl}</p>
                    <p className="mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                      The link is included in the message body. Edit the body below to adjust placement.
                    </p>
                  </div>
                </div>
              )}

              <OutreachProfilePicker playerId={playerId} value={composition} onChange={setComposition} onContent={(text,ready)=>{setProfileText(text);setContentReady(ready);}} demo={demo} />
              {/* Body */}
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Message body <span className="font-normal">(greeting and sign-off added automatically in preview)</span>
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="I am writing to express my interest in your program…"
                  rows={6}
                  maxLength={2000}
                  className="w-full rounded-lg border px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                />
                <p className="text-[10px] text-right mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{body.length}/2000</p>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
              <AlertCircle size={12} />{error}
            </div>
          )}

          <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            This is a draft — no message is sent until you open your email app and send it yourself. Opening the email app does not mark this as sent.
          </p>
        </div>

        {copyFallback && <textarea aria-label="Copy email text" readOnly value={`Subject: ${subject}\n\n${previewBody}`} className="w-full min-h-32 p-3 text-sm" onFocus={e=>e.currentTarget.select()} />}
        {/* Footer */}
        <div className="px-4 py-3 border-t flex flex-wrap gap-2 shrink-0" style={{ borderColor: 'hsl(var(--pp-border))' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={handleOpenInEmailApp}
            disabled={!hasEmail || !contentReady}
            title={!hasEmail ? 'Enter an email address to open in email app' : undefined}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-40"
            style={{ borderColor: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
          >
            <Send size={12} /> Open in email app
          </button>
          <button type="button" disabled={!contentReady} className="border rounded-lg px-3 py-2 text-xs" onClick={async()=>{try{await navigator.clipboard.writeText(`Subject: ${subject}\n\n${previewBody}`);setError('Email copied.');}catch{setCopyFallback(true);}}}>Copy email</button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border text-xs font-medium ml-auto"
            style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Coaches & Colleges ───────────────────────────────────────────────────────

function CoachesSection({ playerId, isOutreachEligible, savedItems, drafts, onSaveToggle, onDraftSaved }: {
  playerId: string;
  isOutreachEligible: boolean;
  savedItems: SavedItem[];
  drafts: OutreachDraft[];
  onSaveToggle: (itemType: string, itemId: string, currentlySaved: boolean, savedId?: string) => Promise<void>;
  onDraftSaved: (draft: OutreachDraft) => void;
}) {
  const {request} = useRecruitingData();
  const [programs, setPrograms] = useState<RecruitingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notMigrated, setNotMigrated] = useState(false);
  const [region, setRegion] = useState('colorado');
  const [gender, setGender] = useState('');
  const [division, setDivision] = useState('');
  const [q, setQ] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composerCoach, setComposerCoach] = useState<{ coach: Coach; existingDraft: OutreachDraft | null } | null>(null);

  useEffect(() => {
    if (!isOutreachEligible) setComposerCoach(null);
  }, [isOutreachEligible]);

  const load = useCallback(async () => {
    if (!isOutreachEligible) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ playerId });
      if (region) params.set('region', region);
      if (gender) params.set('gender', gender);
      if (division) params.set('division', division);
      if (q.trim()) params.set('q', q.trim());
      // Use /programs (LEFT JOIN) so programs appear even when all coaches are withheld.
      // The old /coaches endpoint used INNER JOIN and returned nothing when no verified
      // coach rows existed, making the tab appear empty after a successful seed.
      const res = await request(`/api/parent/recruiting/programs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { programs?: RecruitingProgram[]; message?: string };
      const msg = data.message ?? '';
      if (msg.includes('not yet migrated')) { setNotMigrated(true); setPrograms([]); }
      else { setNotMigrated(false); setPrograms(data.programs ?? []); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, [playerId, isOutreachEligible, region, gender, division, q]);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!isOutreachEligible) return <OutreachGateNotice />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FieldSelect value={region} onChange={setRegion} options={REGIONS} label="Region" />
        <FieldSelect value={gender} onChange={setGender} options={GENDERS} label="Gender" />
        <FieldSelect value={division} onChange={setDivision} options={DIVISIONS} label="Division" />
        <div className="relative flex-1 min-w-[140px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pp-text-muted))' }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search institution…"
            className="w-full rounded-lg border pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
          />
        </div>
      </div>

      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
        <p style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Contact information is sourced from official institutional staff pages only. Missing contact details mean the information was not published — not that no contact exists. Coach names are pending verification against current official sources.
        </p>
      </div>

      {notMigrated && <NotMigratedBanner />}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && !notMigrated && programs.length === 0 && (
        <EmptyState icon={<GraduationCap size={32} />} message="No programs found for these filters." />
      )}

      {composerCoach && (
        <EmailDraftComposer
          playerId={playerId}
          coach={composerCoach.coach}
          existingDraft={composerCoach.existingDraft}
          onClose={() => setComposerCoach(null)}
          onSaved={draft => { setComposerCoach(null); onDraftSaved(draft); }}
        />
      )}

      {!loading && !error && programs.map(program => {
        const isExpanded = expanded.has(program.id);
        const hasCoaches = program.coaches.length > 0;
        return (
          <div
            key={program.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
          >
            <div className="flex items-start gap-3 p-3">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))' }}
              >
                {(program.shortName ?? program.institution).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                  {program.institution}
                </p>
                <p className="text-xs truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {[program.city, program.state].filter(Boolean).join(', ')}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {program.division && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}>
                      {program.division}
                    </span>
                  )}
                  {program.gender && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
                      {program.gender === 'womens' ? "Women's" : "Men's"}
                    </span>
                  )}
                  {program.conference && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
                      {program.conference}
                    </span>
                  )}
                  {!hasCoaches && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--pp-text-muted))' }}>
                      Coach verification pending
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleExpand(program.id)}
                className="p-1 rounded shrink-0"
                style={{ color: 'hsl(var(--pp-text-muted))' }}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 pt-0 border-t space-y-3" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                <div className="flex flex-wrap gap-3 mt-2">
                  {program.programUrl && (
                    <a href={program.programUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <ExternalLink size={11} /> Program page
                    </a>
                  )}
                  {program.staffUrl && (
                    <a href={program.staffUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <ExternalLink size={11} /> Staff directory
                    </a>
                  )}
                </div>

                {hasCoaches ? (
                  <div className="space-y-2">
                    {program.coaches.map(coach => {
                      const coachForModal: Coach = {
                        coachId: coach.coachId,
                        name: coach.name,
                        role: coach.role,
                        email: coach.email,
                        emailIsPersonal: coach.emailIsPersonal,
                        phone: coach.phone,
                        staffPageUrl: coach.staffPageUrl,
                        checkedDate: coach.checkedDate,
                        program: {
                          id: program.id,
                          institution: program.institution,
                          shortName: program.shortName,
                          gender: program.gender,
                          division: program.division,
                          conference: program.conference,
                          city: program.city,
                          state: program.state,
                          regions: program.regions,
                          programUrl: program.programUrl,
                          staffUrl: program.staffUrl,
                        },
                      };
                      const savedItem = savedItems.find(s => s.itemType === 'coach' && s.itemId === coach.coachId);
                      // Find any existing draft for this player+coach combination
                      const existingDraft = drafts.find(d => d.coachId === coach.coachId) ?? null;
                      return (
                        <div key={coach.coachId} className="rounded-lg p-2.5 space-y-1.5" style={{ background: 'hsl(var(--pp-page-bg))' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>
                                {coach.name ?? <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Name not published</span>}
                              </p>
                              <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{coach.role ?? 'Coach'}</p>
                            </div>
                            <SaveButton
                              isSaved={!!savedItem}
                              saving={savingId === coach.coachId}
                              onSave={async () => { setSavingId(coach.coachId); await onSaveToggle('coach', coach.coachId, false); setSavingId(null); }}
                              onUnsave={async () => { setSavingId(coach.coachId); await onSaveToggle('coach', coach.coachId, true, savedItem?.id); setSavingId(null); }}
                            />
                          </div>
                          {coach.email ? (
                            <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}>
                              <span className="font-medium">Email: </span>{coach.email}
                              {coach.emailIsPersonal === false && (
                                <span className="ml-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>(program inbox)</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Email not published on official staff page</p>
                          )}
                          {coach.phone && (
                            <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}><span className="font-medium">Phone: </span>{coach.phone}</p>
                          )}
                          {coach.staffPageUrl && (
                            <a href={coach.staffPageUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium"
                              style={{ color: 'hsl(var(--pp-blue))' }}>
                              <ExternalLink size={11} /> Staff profile
                            </a>
                          )}
                          {coach.checkedDate && (
                            <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Last checked: {coach.checkedDate}</p>
                          )}

                          {/* Draft status inline on saved card */}
                          {existingDraft && (
                            <div className="flex items-center gap-1.5 text-[10px] pt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                              <Mail size={10} />
                              {existingDraft.draftStatus === 'sent'
                                ? <span style={{ color: 'hsl(var(--pp-green))' }}>Marked as sent {existingDraft.sentAt ? `· ${new Date(existingDraft.sentAt).toLocaleDateString()}` : ''}</span>
                                : <span>Draft saved · {new Date(existingDraft.updatedAt).toLocaleDateString()}</span>
                              }
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setComposerCoach({ coach: coachForModal, existingDraft })}
                            className="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors"
                            style={{ borderColor: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
                          >
                            <Mail size={12} />
                            {existingDraft ? 'Continue draft' : 'Draft email'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'hsl(var(--pp-page-bg))' }}>
                    <Info size={13} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text))' }}>Coach verification pending</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        Coach names for this program have not yet been confirmed against the official staff page.
                        Use the staff directory link above to find current contacts directly.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && programs.length > 0 && (
        <p className="text-[10px] text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {programs.length} program{programs.length !== 1 ? 's' : ''} shown · Contact info from official institutional sources only · Missing info is unknown, not omitted
        </p>
      )}
    </div>
  );
}

// ─── College ID Camps ─────────────────────────────────────────────────────────

function CampsSection({ playerId, savedItems, onSaveToggle }: {
  playerId: string;
  savedItems: SavedItem[];
  onSaveToggle: (itemType: string, itemId: string, currentlySaved: boolean, savedId?: string) => Promise<void>;
}) {
  const {request} = useRecruitingData();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notMigrated, setNotMigrated] = useState(false);
  const [region, setRegion] = useState('');
  const [gender, setGender] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (region) params.set('region', region);
      if (gender) params.set('gender', gender);
      const res = await request(`/api/parent/recruiting/camps?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { camps?: Camp[]; message?: string };
      const msg = data.message ?? '';
      if (msg.includes('not yet migrated')) { setNotMigrated(true); setCamps([]); }
      else { setNotMigrated(false); setCamps(data.camps ?? []); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load camps');
    } finally {
      setLoading(false);
    }
  }, [region, gender]);

  useEffect(() => { void load(); }, [load]);

  // Statuses actually present in the camps data
  const campStatuses = ['confirmed_upcoming', 'estimated', 'directory_only', 'historical', 'tbd'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FieldSelect value={region} onChange={setRegion} options={REGIONS} label="Region" />
        <FieldSelect value={gender} onChange={setGender} options={GENDERS} label="Gender" />
      </div>

      {/* Bug fix: replaced the old grid that duplicated each label (StatusBadge already
          contains the label text, so the adjacent <span> was redundant and caused
          double-label display on mobile). Now uses a single collapsible guide. */}
      <ListingStatusGuide statuses={campStatuses} />

      {notMigrated && <NotMigratedBanner />}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && !notMigrated && camps.length === 0 && (
        <EmptyState icon={<Tent size={32} />} message="No camps found for these filters." />
      )}

      {!loading && !error && camps.map(camp => {
        const savedItem = savedItems.find(s => s.itemType === 'camp' && s.itemId === camp.id);
        const hasEligibility = !!camp.ageEligibility;
        return (
          <div
            key={camp.id}
            className="rounded-xl border p-3 space-y-2"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{camp.campName}</p>
                  <StatusBadge status={camp.listingStatus} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {camp.institution} · {[camp.city, camp.state].filter(Boolean).join(', ')}
                </p>
              </div>
              <SaveButton
                isSaved={!!savedItem}
                saving={savingId === camp.id}
                onSave={async () => { setSavingId(camp.id); await onSaveToggle('camp', camp.id, false); setSavingId(null); }}
                onUnsave={async () => { setSavingId(camp.id); await onSaveToggle('camp', camp.id, true, savedItem?.id); setSavingId(null); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Ages: </span>
                {hasEligibility
                  ? <span style={{ color: 'hsl(var(--pp-text))' }}>{camp.ageEligibility}</span>
                  : <EligibilityUnknownBadge />
                }
              </div>
              {camp.gender && (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Program: </span><span style={{ color: 'hsl(var(--pp-text))' }}>{camp.gender === 'womens' ? "Women's" : camp.gender === 'mens' ? "Men's" : 'Coed'}</span></div>
              )}
              {camp.startDate ? (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Dates: </span><span style={{ color: 'hsl(var(--pp-text))' }}>{camp.startDate}{camp.endDate && camp.endDate !== camp.startDate ? ` – ${camp.endDate}` : ''}</span></div>
              ) : (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Dates: </span><span style={{ color: 'hsl(var(--pp-text-muted))' }}>Not confirmed</span></div>
              )}
              {camp.price && (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Price: </span><span style={{ color: 'hsl(var(--pp-text))' }}>{camp.price}</span></div>
              )}
              {camp.registrationDeadline && (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Deadline: </span><span style={{ color: 'hsl(var(--pp-text))' }}>{camp.registrationDeadline}</span></div>
              )}
              {camp.program && camp.program.division && (
                <div><span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Division: </span><span style={{ color: 'hsl(var(--pp-text))' }}>{camp.program.division}</span></div>
              )}
            </div>

            {camp.estimateEvidence && (
              <div className="rounded p-2 text-[11px]" style={{ background: 'hsl(var(--pp-amber) / 0.08)', color: 'hsl(var(--pp-amber-dark))' }}>
                <span className="font-medium">Estimate basis: </span>{camp.estimateEvidence}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-1">
              {camp.registrationUrl && (
                <a href={camp.registrationUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'hsl(var(--pp-blue))' }}>
                  <ExternalLink size={11} /> Registration / details
                </a>
              )}
              {camp.checkedDate && (
                <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Checked {camp.checkedDate}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Showcases & Tournaments ──────────────────────────────────────────────────

function ShowcasesSection({ playerId, savedItems, onSaveToggle }: {
  playerId: string;
  savedItems: SavedItem[];
  onSaveToggle: (itemType: string, itemId: string, currentlySaved: boolean, savedId?: string) => Promise<void>;
}) {
  const {request} = useRecruitingData();
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notMigrated, setNotMigrated] = useState(false);
  const [region, setRegion] = useState('');
  const [gender, setGender] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (region) params.set('region', region);
      if (gender) params.set('gender', gender);
      const res = await request(`/api/parent/recruiting/showcases?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { showcases?: Showcase[]; message?: string };
      const msg = data.message ?? '';
      if (msg.includes('not yet migrated')) { setNotMigrated(true); setShowcases([]); }
      else { setNotMigrated(false); setShowcases(data.showcases ?? []); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load showcases');
    } finally {
      setLoading(false);
    }
  }, [region, gender]);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const showcaseStatuses = ['confirmed', 'estimated', 'tbd', 'historical'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FieldSelect value={region} onChange={setRegion} options={REGIONS} label="Region" />
        <FieldSelect value={gender} onChange={setGender} options={GENDERS} label="Gender" />
      </div>

      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
        <p style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Recruiting relevance is based on documented evidence only. Historical college attendance does not guarantee future attendance. No exposure, attendance, or recruitment is promised.
        </p>
      </div>

      <ListingStatusGuide statuses={showcaseStatuses} />

      {notMigrated && <NotMigratedBanner />}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && !notMigrated && showcases.length === 0 && (
        <EmptyState icon={<Trophy size={32} />} message="No showcases found for these filters." />
      )}

      {!loading && !error && showcases.map(showcase => {
        const savedItem = savedItems.find(s => s.itemType === 'showcase' && s.itemId === showcase.id);
        const isExpanded = expanded.has(showcase.id);
        const hasAgeGroups = !!showcase.ageGroups;
        return (
          <div
            key={showcase.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
          >
            <div className="flex items-start gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))' }}>{showcase.name}</p>
                  <StatusBadge status={showcase.listingStatus} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {showcase.organizer && `${showcase.organizer} · `}
                  {[showcase.city, showcase.state].filter(Boolean).join(', ')}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {hasAgeGroups
                    ? <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' }}>{showcase.ageGroups}</span>
                    : <EligibilityUnknownBadge />
                  }
                  {showcase.entryType && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
                      {showcase.entryType === 'team' ? 'Team entry' : showcase.entryType === 'individual' ? 'Individual' : 'Team or individual'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <SaveButton
                  isSaved={!!savedItem}
                  saving={savingId === showcase.id}
                  onSave={async () => { setSavingId(showcase.id); await onSaveToggle('showcase', showcase.id, false); setSavingId(null); }}
                  onUnsave={async () => { setSavingId(showcase.id); await onSaveToggle('showcase', showcase.id, true, savedItem?.id); setSavingId(null); }}
                />
                <button type="button" onClick={() => toggleExpand(showcase.id)} className="p-1 rounded" style={{ color: 'hsl(var(--pp-text-muted))' }} aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 border-t space-y-2" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                {showcase.startDate && (
                  <p className="text-xs pt-2" style={{ color: 'hsl(var(--pp-text))' }}>
                    <span className="font-medium">Dates: </span>
                    {showcase.startDate}{showcase.endDate && showcase.endDate !== showcase.startDate ? ` – ${showcase.endDate}` : ''}
                  </p>
                )}
                {showcase.recruitingEvidence && (
                  <div className="rounded p-2 text-[11px]" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-text))' }}>
                    <span className="font-medium">Recruiting relevance: </span>{showcase.recruitingEvidence}
                  </div>
                )}
                {showcase.historicalAttendance && (
                  <div className="rounded p-2 text-[11px]" style={{ background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text-muted))' }}>
                    <span className="font-medium">Historical attendance note: </span>{showcase.historicalAttendance}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  {showcase.officialUrl && (
                    <a href={showcase.officialUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <ExternalLink size={11} /> Official website
                    </a>
                  )}
                  {showcase.checkedDate && (
                    <span className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Checked {showcase.checkedDate}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Saved Opportunities ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  interested:   'Interested',
  reminder_set: 'Reminder set',
  registered:   'Registered',
};

// ─── Saved Opportunities ──────────────────────────────────────────────────────

/** Format a date range like "Jan 15–17, 2026" or "Jan 15 – Feb 2, 2026" */
function fmtDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  try {
    const s = new Date(start + 'T12:00:00');
    const e = end ? new Date(end + 'T12:00:00') : null;
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const optsY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (!e) return s.toLocaleDateString('en-US', optsY);
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
      return `${s.toLocaleDateString('en-US', opts)}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', optsY)}`;
  } catch { return start; }
}

function SavedSection({ savedItems, loading, error, drafts, playerId, isOutreachEligible, onStatusChange, onRemove, onDraftSaved }: {
  savedItems: SavedItem[];
  loading: boolean;
  error: string | null;
  drafts: OutreachDraft[];
  playerId: string;
  isOutreachEligible: boolean;
  onStatusChange: (savedId: string, status: string) => Promise<void>;
  onRemove: (savedId: string) => Promise<void>;
  onDraftSaved: (draft: OutreachDraft) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [composerCoach, setComposerCoach] = useState<{ coach: Coach; existingDraft: OutreachDraft | null } | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!savedItems.length) return (
    <EmptyState icon={<Bookmark size={32} />} message="No saved opportunities yet. Browse camps, showcases, and coaches to save items." />
  );

  return (
    <div className="space-y-3">
      {composerCoach && (
        <EmailDraftComposer
          playerId={playerId}
          coach={composerCoach.coach}
          existingDraft={composerCoach.existingDraft}
          onClose={() => setComposerCoach(null)}
          onSaved={draft => { setComposerCoach(null); onDraftSaved(draft); }}
        />
      )}
      <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {savedItems.length} saved item{savedItems.length !== 1 ? 's' : ''}. Saving interest does not mean registration is complete — use "Registered" only after you have completed registration directly with the organizer.
      </p>

      {savedItems.map(item => {
        const isUpdating = updatingId === item.id;

        // ── Coach card ───────────────────────────────────────────────────────
        if (item.itemType === 'coach') {
          const c = item.coach;
          const p = item.program;
          const hasEmail = !!c?.email?.trim();
          const displayName = c?.name ?? null;
          const institution = p?.institution ?? null;
          const genderLabel = p?.gender === 'womens' ? "Women's" : p?.gender === 'mens' ? "Men's" : null;
          const divLabel = p?.division ?? null;

          return (
            <div key={item.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}>
              <div className="p-3 space-y-1.5">
                {/* Type badge + title */}
                <div className="flex items-start gap-2">
                  <GraduationCap size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: 'hsl(var(--pp-text))' }}>
                      {displayName ?? <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Name pending verification</span>}
                    </p>
                    {(institution || genderLabel || divLabel) && (
                      <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        {[institution, genderLabel ? `${genderLabel} Soccer` : null, divLabel].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {c?.role && (
                      <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{c.role}</p>
                    )}
                  </div>
                </div>

                {/* Contact details */}
                {hasEmail ? (
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}>
                    <span className="font-medium">Email: </span>{c!.email}
                    {c?.emailIsPersonal === false && (
                      <span className="ml-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>(program inbox)</span>
                    )}
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Email not published on official staff page</p>
                )}
                {c?.phone && (
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}><span className="font-medium">Phone: </span>{c.phone}</p>
                )}

                {/* Links */}
                <div className="flex flex-wrap gap-3">
                  {c?.staffPageUrl && (
                    <a href={c.staffPageUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <ExternalLink size={10} /> Staff profile
                    </a>
                  )}
                  {p?.programUrl && (
                    <a href={p.programUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: 'hsl(var(--pp-blue))' }}>
                      <ExternalLink size={10} /> Program page
                    </a>
                  )}
                </div>

                {!item.resolved && (
                  <p className="text-[10px] rounded px-2 py-1" style={{ background: 'hsl(var(--pp-amber) / 0.10)', color: 'hsl(var(--pp-amber-dark))' }}>
                    This coach is no longer in the directory. Your saved status is preserved.
                  </p>
                )}

                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Saved {new Date(item.savedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Controls — stacked on mobile */}
              <div className="px-3 pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                <select
                  value={item.status}
                  disabled={isUpdating}
                  onChange={async e => {
                    setUpdatingId(item.id);
                    await onStatusChange(item.id, e.target.value);
                    setUpdatingId(null);
                  }}
                  className="w-full sm:w-auto rounded-lg border px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {isOutreachEligible && item.itemType === 'coach' && item.coach && (() => {
                  // Build a Coach object from the saved item so we can open the composer
                  const coachForComposer: Coach = {
                    coachId: item.itemId,
                    name: item.coach.name ?? null,
                    role: item.coach.role ?? null,
                    email: item.coach.email ?? null,
                    emailIsPersonal: item.coach.emailIsPersonal ?? null,
                    phone: null,
                    staffPageUrl: item.coach.staffPageUrl ?? null,
                    checkedDate: null,
                    program: {
                      id: '',
                      institution: item.program?.institution ?? '',
                      shortName: item.program?.shortName ?? null,
                      gender: item.program?.gender ?? '',
                      division: item.program?.division ?? null,
                      conference: null,
                      city: null,
                      state: null,
                      regions: [],
                      programUrl: item.program?.programUrl ?? null,
                      staffUrl: null,
                    },
                  };
                  const existingDraft = drafts.find(d => d.coachId === item.itemId) ?? null;
                  return (
                    <button
                      type="button"
                      onClick={() => setComposerCoach({ coach: coachForComposer, existingDraft })}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
                    >
                      <Mail size={11} />
                      {existingDraft ? 'Continue draft' : 'Draft email'}
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={async () => { setUpdatingId(item.id); await onRemove(item.id); setUpdatingId(null); }}
                  disabled={isUpdating}
                  className="w-full sm:w-auto flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                >
                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
                  Remove
                </button>
              </div>
            </div>
          );
        }

        // ── Camp card ────────────────────────────────────────────────────────
        if (item.itemType === 'camp') {
          const c = item.camp;
          const dateRange = fmtDateRange(c?.startDate ?? null, c?.endDate ?? null);
          const location = [c?.city, c?.state].filter(Boolean).join(', ');

          return (
            <div key={item.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}>
              <div className="p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Tent size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-green))' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: 'hsl(var(--pp-text))' }}>
                      {c?.name ?? <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Camp name unavailable</span>}
                    </p>
                    {c?.institution && (
                      <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{c.institution}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {dateRange && <span>{dateRange}</span>}
                  {location && <span>{location}</span>}
                  {c?.ageEligibility && <span>{c.ageEligibility}</span>}
                  {c?.price && <span>{c.price}</span>}
                </div>

                {c?.registrationUrl && (
                  <a href={c.registrationUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'hsl(var(--pp-blue))' }}>
                    <ExternalLink size={10} /> Registration page
                  </a>
                )}

                {!item.resolved && (
                  <p className="text-[10px] rounded px-2 py-1" style={{ background: 'hsl(var(--pp-amber) / 0.10)', color: 'hsl(var(--pp-amber-dark))' }}>
                    This camp is no longer in the directory. Your saved status is preserved.
                  </p>
                )}

                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Saved {new Date(item.savedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="px-3 pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                <select
                  value={item.status}
                  disabled={isUpdating}
                  onChange={async e => {
                    setUpdatingId(item.id);
                    await onStatusChange(item.id, e.target.value);
                    setUpdatingId(null);
                  }}
                  className="w-full sm:w-auto rounded-lg border px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button
                  type="button"
                  onClick={async () => { setUpdatingId(item.id); await onRemove(item.id); setUpdatingId(null); }}
                  disabled={isUpdating}
                  className="w-full sm:w-auto flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                >
                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
                  Remove
                </button>
              </div>
            </div>
          );
        }

        // ── Showcase card ────────────────────────────────────────────────────
        if (item.itemType === 'showcase') {
          const s = item.showcase;
          const dateRange = fmtDateRange(s?.startDate ?? null, s?.endDate ?? null);
          const location = [s?.city, s?.state].filter(Boolean).join(', ');

          return (
            <div key={item.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}>
              <div className="p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Trophy size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-amber-dark))' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: 'hsl(var(--pp-text))' }}>
                      {s?.name ?? <span style={{ color: 'hsl(var(--pp-text-muted))' }}>Showcase name unavailable</span>}
                    </p>
                    {s?.organizer && (
                      <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>{s.organizer}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {dateRange && <span>{dateRange}</span>}
                  {location && <span>{location}</span>}
                  {s?.ageGroups && <span>{s.ageGroups}</span>}
                </div>

                {s?.officialUrl && (
                  <a href={s.officialUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'hsl(var(--pp-blue))' }}>
                    <ExternalLink size={10} /> Official page
                  </a>
                )}

                {!item.resolved && (
                  <p className="text-[10px] rounded px-2 py-1" style={{ background: 'hsl(var(--pp-amber) / 0.10)', color: 'hsl(var(--pp-amber-dark))' }}>
                    This showcase is no longer in the directory. Your saved status is preserved.
                  </p>
                )}

                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Saved {new Date(item.savedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="px-3 pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                <select
                  value={item.status}
                  disabled={isUpdating}
                  onChange={async e => {
                    setUpdatingId(item.id);
                    await onStatusChange(item.id, e.target.value);
                    setUpdatingId(null);
                  }}
                  className="w-full sm:w-auto rounded-lg border px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button
                  type="button"
                  onClick={async () => { setUpdatingId(item.id); await onRemove(item.id); setUpdatingId(null); }}
                  disabled={isUpdating}
                  className="w-full sm:w-auto flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                >
                  {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
                  Remove
                </button>
              </div>
            </div>
          );
        }

        // ── Fallback for unknown type ─────────────────────────────────────────
        return (
          <div key={item.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}>
            <p className="text-xs font-medium capitalize" style={{ color: 'hsl(var(--pp-text-muted))' }}>{item.itemType}</p>
            <p className="text-[11px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Details unavailable</p>
            <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>Saved {new Date(item.savedAt).toLocaleDateString()}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={item.status}
                disabled={isUpdating}
                onChange={async e => {
                  setUpdatingId(item.id);
                  await onStatusChange(item.id, e.target.value);
                  setUpdatingId(null);
                }}
                className="w-full sm:w-auto rounded-lg border px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button
                type="button"
                onClick={async () => { setUpdatingId(item.id); await onRemove(item.id); setUpdatingId(null); }}
                disabled={isUpdating}
                className="w-full sm:w-auto flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
              >
                {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Outreach Drafts ──────────────────────────────────────────────────────────

function DraftsSection({ playerId, isOutreachEligible, drafts, savedItems, loading, error, onDelete, onDraftUpdated, onDraftSaved, pendingProfileLink, onPendingProfileLinkConsumed }: {
  playerId: string;
  isOutreachEligible: boolean;
  drafts: OutreachDraft[];
  savedItems: SavedItem[];
  loading: boolean;
  error: string | null;
  onDelete: (draftId: string) => Promise<void>;
  onDraftUpdated: (draft: OutreachDraft) => void;
  onDraftSaved: (draft: OutreachDraft) => void;
  /** When set, auto-opens the composer for this coach with the profile URL pre-inserted */
  pendingProfileLink?: { coachId: string; url: string } | null;
  onPendingProfileLinkConsumed?: () => void;
}) {
  const {request, demo} = useRecruitingData();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<OutreachDraft | null>(null);
  // Picker: open a composer for a saved coach from the empty state
  const [pickerCoach, setPickerCoach] = useState<{ coach: Coach; existingDraft: OutreachDraft | null; profileLinkUrl?: string } | null>(null);

  // Auto-open the composer when navigated here from "Draft email with this link" in CoachShareTab
  useEffect(() => {
    if (!pendingProfileLink) return;
    const savedCoach = savedItems.find(
      s => s.itemType === 'coach' && s.itemId === pendingProfileLink.coachId && s.coach
    );
    if (!savedCoach?.coach) return;
    const existingDraft = drafts.find(d => d.coachId === pendingProfileLink.coachId) ?? null;
    setPickerCoach({
      coach: {
        coachId: pendingProfileLink.coachId,
        name: savedCoach.coach.name,
        role: savedCoach.coach.role,
        email: savedCoach.coach.email,
        emailIsPersonal: savedCoach.coach.emailIsPersonal,
        phone: null,
        staffPageUrl: savedCoach.coach.staffPageUrl,
        checkedDate: null,
        program: {
          id: '',
          institution: savedCoach.program?.institution ?? '—',
          shortName: savedCoach.program?.shortName ?? null,
          gender: savedCoach.program?.gender ?? '',
          division: savedCoach.program?.division ?? null,
          conference: null,
          city: null,
          state: null,
          regions: [],
          programUrl: savedCoach.program?.programUrl ?? null,
          staffUrl: null,
        },
      },
      existingDraft,
      profileLinkUrl: pendingProfileLink.url,
    });
    onPendingProfileLinkConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProfileLink]);

  if (!isOutreachEligible) return <OutreachGateNotice />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const handleMarkSent = async (draft: OutreachDraft, sent: boolean) => {
    setMarkingId(draft.id);
    try {
      const res = await request(`/api/parent/recruiting/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, markSent: sent }),
      });
      if (res.ok) {
        onDraftUpdated({
          ...draft,
          draftStatus: sent ? 'sent' : 'draft',
          sentAt: sent ? new Date().toISOString() : null,
        });
      }
    } finally {
      setMarkingId(null);
    }
  };

  const handleOpenInEmailApp = (draft: OutreachDraft) => {
    const to = encodeURIComponent(draft.recipientEmail?.trim() ?? '');
    const subj = encodeURIComponent(draft.subject?.trim() ?? '');
    const bodyText = encodeURIComponent(
      draft.introduction?.trim()
        ? `Dear ${draft.recipientName ?? 'Coach'},\n\n${draft.introduction.trim()}\n\nThank you for your time and consideration.`
        : ''
    );
    if (demo) { window.alert('Synthetic draft saved for review. Demo links cannot be emailed to another browser.'); return; }
    window.location.href = `mailto:${to}?subject=${subj}&body=${bodyText}`;
    // Do NOT mark as sent — user must do that explicitly
  };

  // Build a synthetic Coach object from a draft for the composer
  const draftToCoach = (draft: OutreachDraft): Coach => ({
    coachId: draft.coachId,
    name: draft.coach.name,
    role: draft.coach.role,
    email: draft.coach.email,
    emailIsPersonal: draft.coach.emailIsPersonal,
    phone: null,
    staffPageUrl: draft.coach.staffPageUrl,
    checkedDate: null,
    program: {
      id: '',
      institution: draft.program.institution,
      shortName: draft.program.shortName,
      gender: draft.program.gender,
      division: draft.program.division,
      conference: null,
      city: null,
      state: null,
      regions: [],
      programUrl: draft.program.programUrl,
      staffUrl: null,
    },
  });

  return (
    <div className="space-y-4">
      {composerDraft && (
        <EmailDraftComposer
          playerId={playerId}
          coach={draftToCoach(composerDraft)}
          existingDraft={composerDraft}
          onClose={() => setComposerDraft(null)}
          onSaved={updated => { setComposerDraft(null); onDraftUpdated(updated); }}
        />
      )}

      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-blue-light))' }}>
        <div className="flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
          <p style={{ color: 'hsl(var(--pp-text))' }}>
            <span className="font-medium">Drafts only — no emails are sent automatically.</span> Use "Open in email app" to send from your own email client, then mark as sent manually.
          </p>
        </div>
      </div>

      {/* Picker composer — opened from the empty state "Choose a saved coach" */}
      {pickerCoach && (
        <EmailDraftComposer
          playerId={playerId}
          coach={pickerCoach.coach}
          existingDraft={pickerCoach.existingDraft}
          profileLinkUrl={pickerCoach.profileLinkUrl}
          onClose={() => setPickerCoach(null)}
          onSaved={draft => { setPickerCoach(null); onDraftSaved(draft); }}
        />
      )}

      {!drafts.length && (
        (() => {
          // Saved coaches the user can start a draft for directly from this empty state
          const savedCoaches = savedItems.filter(
            s => s.itemType === 'coach' && s.coach
          );
          return (
            <div className="space-y-4">
              <div
                className="rounded-xl border p-4 text-center"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
              >
                <Mail size={28} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
                  No outreach drafts yet
                </p>
                <p className="text-xs mb-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  Find a coach in Coaches &amp; Colleges or Saved Opportunities and use &ldquo;Draft email&rdquo; to start.
                </p>
                {savedCoaches.length > 0 && (
                  <div className="text-left">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--pp-text))' }}>
                      Or start a draft from a saved coach:
                    </p>
                    <div className="space-y-1.5">
                      {savedCoaches.map(s => {
                        const coachForComposer: Coach = {
                          coachId: s.itemId,
                          name: s.coach?.name ?? null,
                          role: s.coach?.role ?? null,
                          email: s.coach?.email ?? null,
                          emailIsPersonal: s.coach?.emailIsPersonal ?? null,
                          phone: null,
                          staffPageUrl: s.coach?.staffPageUrl ?? null,
                          checkedDate: null,
                          program: {
                            id: '',
                            institution: s.program?.institution ?? '',
                            shortName: s.program?.shortName ?? null,
                            gender: s.program?.gender ?? '',
                            division: s.program?.division ?? null,
                            conference: null,
                            city: null,
                            state: null,
                            regions: [],
                            programUrl: s.program?.programUrl ?? null,
                            staffUrl: null,
                          },
                        };
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setPickerCoach({ coach: coachForComposer, existingDraft: null })}
                            className="w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted/30"
                            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
                          >
                            <GraduationCap size={13} style={{ color: 'hsl(var(--pp-blue))' }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                                {s.coach?.name ?? 'Coach'} — {s.program?.institution ?? 'Program'}
                              </p>
                              {s.program?.division && (
                                <p className="text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                                  {s.program.division}
                                </p>
                              )}
                            </div>
                            <Mail size={11} style={{ color: 'hsl(var(--pp-blue))' }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {drafts.map(draft => {
        const hasEmail = !!draft.recipientEmail?.trim();
        const isSent = draft.draftStatus === 'sent';
        // Staleness: current directory email differs from what was captured in the draft
        const emailMismatch = !!draft.coach.email && !!draft.recipientEmail && draft.recipientEmail !== draft.coach.email;
        const nameMismatch  = !!draft.coach.name  && !!draft.recipientName  && draft.recipientName  !== draft.coach.name;

        return (
          <div
            key={draft.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
          >
            {/* Card header */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--pp-text))' }}>
                      {draft.coach.name ?? 'Coach'}
                    </p>
                    <span
                      className="text-[10px] rounded-full px-1.5 py-0.5 font-medium"
                      style={{
                        background: isSent ? 'hsl(var(--pp-green) / 0.12)' : 'hsl(var(--pp-amber) / 0.12)',
                        color: isSent ? 'hsl(var(--pp-green))' : 'hsl(var(--pp-amber-dark))',
                      }}
                    >
                      {isSent ? 'Sent' : 'Draft'}
                    </span>
                    {draft.coach.name == null && (
                      <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
                        Verification pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                    {draft.coach.role ?? 'Coach'} · {draft.program.institution}
                    {draft.program.division ? ` · ${draft.program.division}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => { setDeletingId(draft.id); await onDelete(draft.id); setDeletingId(null); }}
                  disabled={deletingId === draft.id}
                  className="text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 shrink-0"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
                >
                  {deletingId === draft.id ? <Loader2 size={11} className="animate-spin" /> : 'Delete'}
                </button>
              </div>

              {/* Recipient row */}
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>To:</span>
                  <span style={{ color: 'hsl(var(--pp-text))' }}>
                    {draft.recipientName ?? draft.coach.name ?? '(no name)'}
                    {draft.recipientEmail ? ` <${draft.recipientEmail}>` : ' (no email)'}
                  </span>
                  {!hasEmail && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: 'hsl(var(--pp-amber) / 0.10)', color: 'hsl(var(--pp-amber-dark))' }}>
                      No email
                    </span>
                  )}
                </div>
                {/* Staleness flags */}
                {(nameMismatch || emailMismatch) && (
                  <div className="flex items-start gap-1.5 rounded p-1.5 text-[10px]" style={{ background: 'hsl(var(--pp-amber) / 0.08)', color: 'hsl(var(--pp-amber-dark))' }}>
                    <AlertCircle size={10} className="mt-0.5 shrink-0" />
                    <span>
                      Directory details changed since this draft was saved.
                      {nameMismatch  && ` Name now: "${draft.coach.name}".`}
                      {emailMismatch && ` Email now: "${draft.coach.email}".`}
                      {' '}Open the draft to review.
                    </span>
                  </div>
                )}
              </div>

              {/* Subject */}
              {draft.subject && (
                <p className="text-xs" style={{ color: 'hsl(var(--pp-text))' }}>
                  <span className="font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Subject: </span>{draft.subject}
                </p>
              )}

              {/* Body preview */}
              {draft.introduction && (
                <p className="text-xs rounded p-2" style={{ background: 'hsl(var(--pp-page-bg))', color: 'hsl(var(--pp-text))' }}>
                  {draft.introduction.slice(0, 200)}{draft.introduction.length > 200 ? '…' : ''}
                </p>
              )}

              {/* Meta */}
              <div className="flex flex-wrap gap-2 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                {draft.approvedFields.length > 0 && (
                  <span className="flex items-center gap-1"><Check size={10} /> {draft.approvedFields.length} profile field{draft.approvedFields.length !== 1 ? 's' : ''}</span>
                )}
                {isSent && draft.sentAt && (
                  <span className="flex items-center gap-1" style={{ color: 'hsl(var(--pp-green))' }}>
                    <Check size={10} /> Sent {new Date(draft.sentAt).toLocaleDateString()}
                  </span>
                )}
                {!isSent && (
                  <span>Updated {new Date(draft.updatedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Back-link to program */}
              <div className="flex flex-wrap gap-3">
                {draft.program.programUrl && (
                  <a href={draft.program.programUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'hsl(var(--pp-blue))' }}>
                    <ArrowLeft size={10} /> {draft.program.institution} program page
                  </a>
                )}
                {draft.coach.staffPageUrl && (
                  <a href={draft.coach.staffPageUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'hsl(var(--pp-blue))' }}>
                    <ExternalLink size={10} /> Coach staff profile
                  </a>
                )}
              </div>
            </div>

            {/* Action row */}
            <div className="px-3 pb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setComposerDraft(draft)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ borderColor: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-navy))', background: 'transparent' }}
              >
                <Mail size={11} /> Continue draft
              </button>
              <button
                type="button"
                onClick={() => handleOpenInEmailApp(draft)}
                disabled={!hasEmail}
                title={!hasEmail ? 'No email address saved — open the draft to add one' : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))', background: 'transparent' }}
              >
                <Send size={11} /> Open in email app
              </button>
              {isSent ? (
                <button
                  type="button"
                  onClick={() => void handleMarkSent(draft, false)}
                  disabled={markingId === draft.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))', background: 'transparent' }}
                >
                  {markingId === draft.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Unmark sent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleMarkSent(draft, true)}
                  disabled={markingId === draft.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'hsl(var(--pp-green))', color: 'hsl(var(--pp-white))' }}
                >
                  {markingId === draft.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Mark as sent
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main RecruitingTab ───────────────────────────────────────────────────────

export default function RecruitingTab({ playerId, ageBand }: {
  playerId: string;
  ageBand: string | null;
}) {
  const {request, demo} = useRecruitingData();
  const isOutreachEligible = !!ageBand && OUTREACH_AGE_GROUPS.has(ageBand);

  // Default to camps for all ages; coaches for U16+
  const [activeSection, setActiveSection] = useState<RecruitingSection>(
    isOutreachEligible ? 'coaches' : 'camps'
  );
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  // Pending profile-link draft: when parent clicks "Draft email with this link" from CoachShareTab
  const [pendingProfileLink, setPendingProfileLink] = useState<{ coachId: string; url: string } | null>(null);

  // When the player changes, reset to a safe default section
  useEffect(() => {
    setActiveSection(isOutreachEligible ? 'coaches' : 'camps');
    setDrafts([]);
  }, [playerId, isOutreachEligible]);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await request(`/api/parent/recruiting/saved?playerId=${encodeURIComponent(playerId)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { saved?: SavedItem[] };
      setSavedItems(data.saved ?? []);
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : 'Failed to load saved items');
    } finally {
      setSavedLoading(false);
    }
  }, [playerId]);

  const loadDrafts = useCallback(async () => {
    if (!isOutreachEligible) { setDrafts([]); return; }
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const res = await request(`/api/parent/recruiting/drafts?playerId=${encodeURIComponent(playerId)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { drafts?: OutreachDraft[] };
      setDrafts(data.drafts ?? []);
    } catch (e) {
      setDraftsError(e instanceof Error ? e.message : 'Failed to load drafts');
    } finally {
      setDraftsLoading(false);
    }
  }, [playerId, isOutreachEligible]);

  useEffect(() => { void loadSaved(); void loadDrafts(); }, [loadSaved, loadDrafts]);

  // Optimistic draft update — avoids a full reload after save/mark-sent
  const handleDraftUpdated = useCallback((updated: OutreachDraft) => {
    setDrafts(prev => {
      const idx = prev.findIndex(d => d.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  }, []);

  const handleSaveToggle = useCallback(async (
    itemType: string,
    itemId: string,
    currentlySaved: boolean,
    savedId?: string,
  ) => {
    if (currentlySaved && savedId) {
      await request(`/api/parent/recruiting/saved/${encodeURIComponent(savedId)}?playerId=${encodeURIComponent(playerId)}`, {
        method: 'DELETE', credentials: 'include',
      });
    } else {
      await request('/api/parent/recruiting/saved', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, itemType, itemId, status: 'interested' }),
      });
    }
    await loadSaved();
  }, [playerId, loadSaved]);

  const handleStatusChange = useCallback(async (savedId: string, status: string) => {
    const item = savedItems.find(s => s.id === savedId);
    if (!item) return;
    await request('/api/parent/recruiting/saved', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, itemType: item.itemType, itemId: item.itemId, status }),
    });
    await loadSaved();
  }, [playerId, savedItems, loadSaved]);

  const handleRemoveSaved = useCallback(async (savedId: string) => {
    await request(`/api/parent/recruiting/saved/${encodeURIComponent(savedId)}?playerId=${encodeURIComponent(playerId)}`, {
      method: 'DELETE', credentials: 'include',
    });
    await loadSaved();
  }, [playerId, loadSaved]);

  const handleDeleteDraft = useCallback(async (draftId: string) => {
    await request(`/api/parent/recruiting/drafts/${encodeURIComponent(draftId)}?playerId=${encodeURIComponent(playerId)}`, {
      method: 'DELETE', credentials: 'include',
    });
    await loadDrafts();
  }, [playerId, loadDrafts]);

  /**
   * Called from CoachShareTab when the parent clicks "Draft email with this link".
   * Navigates to the Drafts section and opens the composer for that coach with
   * the profile URL pre-inserted into the body.
   */
  const handleDraftWithLink = useCallback((coachId: string, profileUrl: string) => {
    setPendingProfileLink({ coachId, url: profileUrl });
    setActiveSection('drafts');
  }, []);

  // Section-specific privacy notice text — avoids showing coach-contact language on Camps/Showcases.
  const privacyNotice = (() => {
    if (activeSection === 'coaches' || activeSection === 'drafts') {
      return 'This section is private and only visible to you. Coach contact information is from official institutional sources only.';
    }
    if (activeSection === 'camps') {
      return 'This section is private and only visible to you. Camp listings are sourced from official program and recruiting directories.';
    }
    if (activeSection === 'showcases') {
      return 'This section is private and only visible to you. Showcase listings are sourced from official event and recruiting directories.';
    }
    return 'This section is private and only visible to you.';
  })();

  return (
    <div className="space-y-4">
      {/* Sub-section nav */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {SECTIONS.map(s => {
          const isLocked = s.outreachOnly && !isOutreachEligible;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
              style={{
                background: activeSection === s.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-page-bg))',
                color: activeSection === s.id
                  ? 'hsl(var(--pp-white))'
                  : isLocked
                    ? 'hsl(var(--pp-text-muted) / 0.6)'
                    : 'hsl(var(--pp-text-muted))',
                border: `1px solid ${activeSection === s.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))'}`,
              }}
              aria-label={isLocked ? `${s.label} — available at U16` : s.label}
            >
              {isLocked ? <Lock size={11} /> : s.icon}
              {s.label}
              {s.id === 'saved' && savedItems.length > 0 && (
                <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}>
                  {savedItems.length}
                </span>
              )}
              {s.id === 'drafts' && drafts.length > 0 && (
                <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))' }}>
                  {drafts.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Section-specific privacy notice — Bug fix: no longer shows coach-contact
          language on Camps and Showcases tabs where it is irrelevant. */}
      <div className="flex items-start gap-2 rounded-lg p-2.5 text-[11px]" style={{ background: 'hsl(var(--pp-page-bg))', border: '1px solid hsl(var(--pp-border))' }}>
        <Star size={11} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--pp-blue))' }} />
        <p style={{ color: 'hsl(var(--pp-text-muted))' }}>
          {privacyNotice}
          {!isOutreachEligible && ' Coach outreach features unlock at U16.'}
        </p>
      </div>

      {activeSection === 'coaches' && (
        <CoachesSection
          playerId={playerId}
          isOutreachEligible={isOutreachEligible}
          savedItems={savedItems}
          drafts={drafts}
          onSaveToggle={handleSaveToggle}
          onDraftSaved={handleDraftUpdated}
        />
      )}
      {activeSection === 'camps' && (
        <CampsSection playerId={playerId} savedItems={savedItems} onSaveToggle={handleSaveToggle} />
      )}
      {activeSection === 'showcases' && (
        <ShowcasesSection playerId={playerId} savedItems={savedItems} onSaveToggle={handleSaveToggle} />
      )}
      {activeSection === 'saved' && (
        <SavedSection
          savedItems={savedItems}
          loading={savedLoading}
          error={savedError}
          drafts={drafts}
          playerId={playerId}
          isOutreachEligible={isOutreachEligible}
          onStatusChange={handleStatusChange}
          onRemove={handleRemoveSaved}
          onDraftSaved={handleDraftUpdated}
        />
      )}
      {activeSection === 'drafts' && (
        <DraftsSection
          playerId={playerId}
          isOutreachEligible={isOutreachEligible}
          drafts={drafts}
          savedItems={savedItems}
          loading={draftsLoading}
          error={draftsError}
          onDelete={handleDeleteDraft}
          onDraftUpdated={handleDraftUpdated}
          onDraftSaved={handleDraftUpdated}
          pendingProfileLink={pendingProfileLink}
          onPendingProfileLinkConsumed={() => setPendingProfileLink(null)}
        />
      )}
      {activeSection === 'share' && (
        isOutreachEligible
          ? <CoachShareTab
              key={playerId}
              playerId={playerId}
              isDemoMode={demo}
              savedCoaches={savedItems
                .filter(s => s.itemType === 'coach' && s.coach)
                .map(s => ({
                  coachId: s.itemId,
                  name: s.coach?.name ?? null,
                  role: s.coach?.role ?? null,
                  email: s.coach?.email ?? null,
                  institution: s.program?.institution ?? '—',
                  division: s.program?.division ?? null,
                }))}
              onDraftWithLink={handleDraftWithLink}
            />
          : <OutreachGateNotice />
      )}
    </div>
  );
}
