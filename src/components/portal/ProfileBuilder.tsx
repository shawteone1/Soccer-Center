/**
 * ProfileBuilder — real-player recruiting profile editor.
 *
 * Loads the four coach-profile fields from GET /api/parent/players/:id
 * and saves them via PATCH /api/parent/players/:id.
 *
 * DEMO MODE
 * ─────────
 * When isDemo=true the component falls back to the original localStorage
 * behaviour so the /demo/parent-portal experience is completely unchanged.
 *
 * FIELD CONTRACT
 * ──────────────
 * graduationYear      — integer 2020–2050
 * profileIntroduction — free text, max 5000 chars
 * achievements        — string[], one per line in the textarea
 * playingLevel        — short string, max 64 chars
 *
 * These are the only fields this component writes. All other player fields
 * are managed by the existing player-edit wizard and are not touched here.
 */

import UkEducationEditor from './UkEducationEditor';
import { emptyUkEducation, type UkEducation } from '@/lib/portal/uk-education';
import { useState, useEffect, useCallback } from 'react';
import { DEMO_BASE_PROFILE, type DemoBaseProfile } from './coach-demo-store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RealProfile {
  ukEducation?: UkEducation | null;
  graduationYear:      number | null;
  profileIntroduction: string;
  achievements:        string[];
  playingLevel:        string;
  // v4 fields
  gpa:           string;
  gpaScale:      string;
  gpaWeighted:   'weighted' | 'unweighted' | '';
  intendedMajor: string;
  collegeGoals:  string;
  contactEmail:  string;
  highSchool:    string;
  schoolCity:    string;
  schoolState:   string;
}

const EMPTY_REAL: RealProfile = {
  graduationYear:      null,
  profileIntroduction: '',
  achievements:        [],
  playingLevel:        '',
  gpa:           '',
  gpaScale:      '4.0',
  gpaWeighted:   '',
  intendedMajor: '',
  collegeGoals:  '',
  contactEmail:  '',
  highSchool:    '',
  schoolCity:    '',
  schoolState:   '',
};

// ── Demo fallback (original behaviour, unchanged) ─────────────────────────────

function DemoProfileBuilder({
  playerId,
  editing,
  onSaved,
}: {
  playerId: string;
  editing: boolean;
  onEdit?: () => void;
  onSaved: (p: DemoBaseProfile) => void;
}) {
  const key = `sc_demo_profile_${playerId}`;
  const [profile, setProfile] = useState<DemoBaseProfile>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || structuredClone(DEMO_BASE_PROFILE);
    } catch {
      return structuredClone(DEMO_BASE_PROFILE);
    }
  });
  const [error, setError] = useState('');

  if (!editing) return null;

  const input = 'w-full rounded-lg border p-2 text-sm bg-white text-slate-900';
  const textFields = [
    ['label',            'Player name'],
    ['graduationYear',   'Graduation year'],
    ['primaryPosition',  'Primary position'],
    ['secondaryPosition','Secondary position'],
    ['clubName',         'Club / team'],
    ['playingLevel',     'Highest playing level'],
    ['foot',             'Dominant foot'],
  ] as const;

  return (
    <form
      className="rounded-xl border bg-white p-5 text-slate-900 space-y-5"
      onSubmit={e => {
        e.preventDefault();
        try {
          localStorage.setItem(key, JSON.stringify({ ...profile, demoPlayerId: playerId }));
          setError('');
          onSaved(structuredClone({ ...profile, demoPlayerId: playerId }));
        } catch {
          setError('Profile could not be saved. Your edits remain here; please try again.');
        }
      }}
    >
      <div>
        <h2 className="text-xl font-bold">Build your recruiting profile</h2>
        <p className="text-sm text-slate-600">
          Synthetic review profile · saved only in this browser. Existing links retain their approved snapshot.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {textFields.map(([k, label]) => (
          <label key={k} className="text-sm">
            {label}
            <input
              required
              className={input}
              value={String(profile[k])}
              type={k === 'graduationYear' ? 'number' : 'text'}
              min={k === 'graduationYear' ? 2026 : undefined}
              max={k === 'graduationYear' ? 2045 : undefined}
              onChange={e =>
                setProfile({
                  ...profile,
                  [k]: k === 'graduationYear' ? Number(e.target.value) : e.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
      <fieldset className="grid sm:grid-cols-3 gap-3">
        <legend className="font-bold mb-2">Academics</legend>
        <label>
          GPA
          <input required type="number" min={0} max={profile.academics.scale} step={0.01} className={input}
            value={profile.academics.gpa}
            onChange={e => setProfile({ ...profile, academics: { ...profile.academics, gpa: Number(e.target.value) } })} />
        </label>
        <label>
          Scale
          <input required type="number" min={1} max={10} step={0.1} className={input}
            value={profile.academics.scale}
            onChange={e => setProfile({ ...profile, academics: { ...profile.academics, scale: Number(e.target.value) } })} />
        </label>
        <label>
          GPA type
          <select className={input} value={String(profile.academics.weighted)}
            onChange={e => setProfile({ ...profile, academics: { ...profile.academics, weighted: e.target.value === 'true' } })}>
            <option value="false">Unweighted</option>
            <option value="true">Weighted</option>
          </select>
        </label>
      </fieldset>
      <label className="block">
        Academic interests / intended major
        <input className={input} value={profile.academics.intendedMajor || ''}
          onChange={e => setProfile({ ...profile, academics: { ...profile.academics, intendedMajor: e.target.value } })} />
      </label>
      {(['profileIntroduction', 'collegeGoals'] as const).map(k => (
        <label className="block" key={k}>
          {k === 'profileIntroduction' ? 'About me' : 'College goals'}
          <textarea maxLength={2000} rows={4} className={input}
            value={profile[k]}
            onChange={e => setProfile({ ...profile, [k]: e.target.value })} />
        </label>
      ))}
      <label className="block">
        Achievements (one per line)
        <textarea rows={4} className={input}
          value={profile.achievements.join('\n')}
          onChange={e => setProfile({ ...profile, achievements: e.target.value.split('\n') })} />
      </label>
      {(['highlights', 'upcomingEvents'] as const).map(kind => (
        <fieldset key={kind}>
          <legend className="font-bold mb-2">
            {kind === 'highlights' ? 'Select highlights' : 'Select upcoming events'}
          </legend>
          {DEMO_BASE_PROFILE[kind].map(item => (
            <label key={item.id} className="block py-2">
              <input type="checkbox"
                checked={profile[kind].some(v => v.id === item.id)}
                onChange={e =>
                  setProfile({
                    ...profile,
                    [kind]: e.target.checked
                      ? [...profile[kind], item]
                      : profile[kind].filter(v => v.id !== item.id),
                  })
                }
              />
              {' '}{item.title}
            </label>
          ))}
        </fieldset>
      ))}
      <p className="text-sm">
        Coach requests appear in the synthetic inbox below. No messages are delivered externally.
      </p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button className="rounded-lg bg-slate-900 text-white px-5 py-3" type="submit">
        Save profile and choose sharing
      </button>
    </form>
  );
}

// ── Real-player implementation ────────────────────────────────────────────────

// Identity fields loaded from the DB at mount time.
// Kept separate from RealProfile (the form state) so the form only manages
// the fields it writes. Used as fallback in buildSaved when the post-save
// reload fails — we never replace a previously-loaded value with ''.
interface IdentitySnapshot {
  label:             string;
  ageBand:           string;
  primaryPosition:   string;
  secondaryPosition: string;
  foot:              string;
  positions:         string[];
  skillLevel:        string;
  clubName:          string;
  affiliations:      DemoBaseProfile['affiliations'];
  avatarInitials:    string;
}

const EMPTY_IDENTITY: IdentitySnapshot = {
  label: '', ageBand: '', primaryPosition: '', secondaryPosition: '',
  foot: '', positions: [], skillLevel: '', clubName: '',
  affiliations: [], avatarInitials: '',
};

function RealProfileBuilder({
  playerId,
  editing,
  onSaved,
}: {
  playerId: string;
  editing: boolean;
  onEdit?: () => void;
  onSaved: (p: DemoBaseProfile) => void;
}) {
  const [profile, setProfile] = useState<RealProfile>(EMPTY_REAL);
  // Identity fields are loaded once at mount and used as fallback in buildSaved.
  // They are never written by this form — the wizard manages them.
  const [identity, setIdentity] = useState<IdentitySnapshot>(EMPTY_IDENTITY);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    setSaveOk(false);
    setSaveError('');
    try {
      const res = await fetch(`/api/parent/players/${playerId}`);
      if (!res.ok) { setLoadState('error'); return; }
      const data = await res.json() as {
        player: {
          label?:            string | null;
          ageBand?:          string | null;
          primaryPosition?:  string | null;
          secondaryPosition?: string | null;
          foot?:             string | null;
          positions?:        string[];
          skillLevel?:       string | null;
          clubName?:         string | null;
          affiliations?:     DemoBaseProfile['affiliations'];
          avatarInitials?:   string | null;
          graduationYear?:      number | null;
          profileIntroduction?: string | null;
          achievements?:        string[];
          playingLevel?:        string | null;
          ukEducation?: UkEducation | null;
          gpa?:           string | null;
          gpaScale?:      string | null;
          gpaWeighted?:   string | null;
          intendedMajor?: string | null;
          collegeGoals?:  string | null;
          contactEmail?:  string | null;
          highSchool?:    string | null;
          schoolCity?:    string | null;
          schoolState?:   string | null;
        };
      };
      const p = data.player;
      // Store identity fields separately so they survive a failed post-save reload.
      setIdentity({
        label:             p.label             ?? '',
        ageBand:           p.ageBand           ?? '',
        primaryPosition:   p.primaryPosition   ?? '',
        secondaryPosition: p.secondaryPosition ?? '',
        foot:              p.foot              ?? '',
        positions:         Array.isArray(p.positions) ? p.positions : [],
        skillLevel:        p.skillLevel        ?? '',
        clubName:          p.clubName          ?? '',
        affiliations:      Array.isArray(p.affiliations) ? p.affiliations : [],
        avatarInitials:    p.avatarInitials    ?? '',
      });
      setProfile({
        graduationYear:      p.graduationYear      ?? null,
        profileIntroduction: p.profileIntroduction ?? '',
        achievements:        Array.isArray(p.achievements) ? p.achievements : [],
        playingLevel:        p.playingLevel         ?? '',
        ukEducation: p.ukEducation ?? undefined,
        gpa:           p.gpa           ?? '',
        gpaScale:      p.gpaScale      ?? '4.0',
        gpaWeighted:   (p.gpaWeighted === 'weighted' || p.gpaWeighted === 'unweighted') ? p.gpaWeighted : '',
        intendedMajor: p.intendedMajor ?? '',
        collegeGoals:  p.collegeGoals  ?? '',
        contactEmail:  p.contactEmail  ?? '',
        highSchool:    p.highSchool    ?? '',
        schoolCity:    p.schoolCity    ?? '',
        schoolState:   p.schoolState   ?? '',
      });
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [playerId]);

  useEffect(() => {
    if (editing && loadState === 'idle') void load();
  }, [editing, loadState, load]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const res = await fetch(`/api/parent/players/${playerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graduationYear:      profile.graduationYear,
          profileIntroduction: profile.profileIntroduction.trim() || null,
          achievements:        profile.achievements.map(s => s.trim()).filter(Boolean),
          playingLevel:        profile.playingLevel.trim() || null,
          ...(profile.ukEducation !== undefined ? { ukEducation: profile.ukEducation } : {}),
          gpa:           profile.gpa.trim() || null,
          gpaScale:      profile.gpaScale.trim() || null,
          gpaWeighted:   profile.gpaWeighted || null,
          intendedMajor: profile.intendedMajor.trim() || null,
          collegeGoals:  profile.collegeGoals.trim() || null,
          contactEmail:  profile.contactEmail.trim() || null,
          highSchool:    profile.highSchool.trim()    || null,
          schoolCity:    profile.schoolCity.trim()    || null,
          schoolState:   profile.schoolState.trim()   || null,
        }),
      });
      if (!res.ok) {
        let errMsg = 'Save failed. Please try again.';
        try {
          const data = await res.json() as { error?: string; message?: string; missingColumns?: string[] };
          if (data.error === 'MIGRATION_REQUIRED') {
            errMsg = (data.message ?? 'Coach profile fields are not yet available.') +
              ' An admin can apply the migration at /admin/settings → "Recruiting profile fields — v4". Your entered values are preserved above.';
          } else {
            errMsg = data.message ?? data.error ?? errMsg;
          }
        } catch { /* ignore parse error */ }
        setSaveError(errMsg);
        return;
      }
      setSaveOk(true);
      // Reload the player record from the authenticated owner endpoint
      // (GET /api/parent/players/:id) — always available, not gated by
      // COACH_PROFILE_LINKS_ENABLED. Returns the full DB row including
      // label, ageBand, positions, clubName, affiliations, and every field
      // this form writes.
      //
      // Identity fields come from the reloaded row when available.
      // When the reload fails, the `identity` snapshot (loaded at mount) is
      // used as fallback — we never replace a previously-loaded value with ''.
      type PlayerRow = {
        label?: string | null;
        ageBand?: string | null;
        primaryPosition?: string | null;
        secondaryPosition?: string | null;
        foot?: string | null;
        positions?: string[];
        skillLevel?: string | null;
        clubName?: string | null;
        affiliations?: DemoBaseProfile['affiliations'];
        avatarInitials?: string | null;
        graduationYear?: number | null;
      };
      // buildSaved merges a reloaded DB row with the in-memory form values.
      // Identity fields (label, ageBand, etc.) come from the DB row when available.
      // When the reload fails, the `identity` snapshot (loaded at mount) is used
      // as fallback — we never replace a previously-loaded value with ''.
      // Extend PlayerRow type to include v5 school fields
      type PlayerRowWithSchool = PlayerRow & { highSchool?: string | null; schoolCity?: string | null; schoolState?: string | null };
      const buildSaved = (p: PlayerRowWithSchool): DemoBaseProfile => ({
        demoPlayerId:        playerId,
        label:               p.label               ?? identity.label,
        ageBand:             p.ageBand             ?? identity.ageBand,
        primaryPosition:     p.primaryPosition     ?? identity.primaryPosition,
        secondaryPosition:   p.secondaryPosition   ?? identity.secondaryPosition,
        foot:                p.foot                ?? identity.foot,
        positions:           Array.isArray(p.positions) ? p.positions : identity.positions,
        skillLevel:          p.skillLevel          ?? identity.skillLevel,
        clubName:            p.clubName            ?? identity.clubName,
        affiliations:        Array.isArray(p.affiliations) ? p.affiliations : identity.affiliations,
        avatarInitials:      p.avatarInitials      ?? identity.avatarInitials,
        // graduationYear: prefer the reloaded DB value; fall back to what the
        // form had (the form writes this field, so the PATCH already persisted it).
        graduationYear:      typeof p.graduationYear === 'number' ? p.graduationYear : (profile.graduationYear ?? 2026),
        // Fields written by this form — use the in-memory values directly
        // because the PATCH just persisted them and the DB reload may not
        // have completed yet.
        profileIntroduction: profile.profileIntroduction.trim() || '',
        achievements:        profile.achievements.map(s => s.trim()).filter(Boolean),
        playingLevel:        profile.playingLevel.trim() || '',
        ukEducation: profile.ukEducation ? { system: profile.ukEducation.system, completionYear: profile.ukEducation.completionYear, entryYear: profile.ukEducation.entryYear, exams: profile.ukEducation.exams } : null,
        academics: {
          gpa:           profile.gpa ? Number(profile.gpa) : 0,
          scale:         profile.gpaScale ? Number(profile.gpaScale) : 4.0,
          weighted:      profile.gpaWeighted === 'weighted',
          intendedMajor: profile.intendedMajor.trim() || null,
        },
        collegeGoals:  profile.collegeGoals.trim() || '',
        contactEmail:  profile.contactEmail.trim() || '',
        highlights:     [],
        upcomingEvents: [],
      });
      let saved: DemoBaseProfile;
      try {
        const playerRes = await fetch(`/api/parent/players/${playerId}`);
        if (playerRes.ok) {
          const playerData = await playerRes.json() as { player: PlayerRow };
          saved = buildSaved(playerData.player ?? {});
        } else {
          // Reload failed — preserve the identity values the parent already saw.
          // Show a non-blocking warning; the PATCH succeeded so the data is saved.
          setSaveError('Profile saved. Could not refresh display — reload the page to see updated values.');
          saved = buildSaved({});
        }
      } catch {
        setSaveError('Profile saved. Could not refresh display — reload the page to see updated values.');
        saved = buildSaved({});
      }
      onSaved(saved);
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [playerId, profile, identity, onSaved]);

  if (!editing) return null;

  const input = 'w-full rounded-lg border p-2 text-sm bg-white text-slate-900';

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <div className="rounded-xl border bg-white p-5 text-slate-900 text-sm text-slate-500">
        Loading profile…
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="rounded-xl border bg-white p-5 text-slate-900">
        <p className="text-sm text-red-700 mb-3">Could not load profile. Please try again.</p>
        <button
          type="button"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm"
          onClick={() => { setLoadState('idle'); }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border bg-white p-5 text-slate-900 space-y-5"
      onSubmit={(e: React.FormEvent) => { void handleSubmit(e); }}
    >
      <div>
        <h2 className="text-xl font-bold">Build your recruiting profile</h2>
        <p className="text-sm text-slate-600">
          Saved to your player record. Existing coach links retain their approved snapshot until you create a new one.
        </p>
      </div>

      <label className="block text-sm">
        Graduation year
        <input
          type="number"
          min={2020}
          max={2050}
          className={input}
          value={profile.graduationYear ?? ''}
          onChange={e => setProfile({ ...profile, graduationYear: e.target.value ? Number(e.target.value) : null })}
        />
      </label>

      <label className="block text-sm">
        Highest playing level <span className="text-slate-400">(e.g. ECNL, NPL, Club — State)</span>
        <input
          type="text"
          maxLength={64}
          className={input}
          value={profile.playingLevel}
          onChange={e => setProfile({ ...profile, playingLevel: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        About me <span className="text-slate-400">(introduction for coaches)</span>
        <textarea
          rows={5}
          maxLength={5000}
          className={input}
          value={profile.profileIntroduction}
          onChange={e => setProfile({ ...profile, profileIntroduction: e.target.value })}
        />
      </label>


      <label className="block text-sm">
        College goals <span className="text-slate-400">(academic and soccer aspirations)</span>
        <textarea
          rows={4}
          maxLength={2000}
          className={input}
          value={profile.collegeGoals}
          onChange={e => setProfile({ ...profile, collegeGoals: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Achievements <span className="text-slate-400">(one per line)</span>
        <textarea
          rows={4}
          className={input}
          value={profile.achievements.join('\n')}
          onChange={e => setProfile({ ...profile, achievements: e.target.value.split('\n') })}
        />
      </label>


      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Academics</legend>
        <label>Education pathway<select className={input} value={profile.ukEducation ? 'UK' : 'US'} onChange={e => setProfile({ ...profile, ukEducation: e.target.value === 'UK' ? emptyUkEducation() : null })}><option value="US">US — GPA</option><option value="UK">UK — exams and qualifications</option></select></label>
        {profile.ukEducation ? <UkEducationEditor value={profile.ukEducation} onChange={ukEducation => setProfile({ ...profile, ukEducation })}/> : <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            GPA
            <input
              type="text"
              inputMode="decimal"
              maxLength={8}
              placeholder="e.g. 3.85"
              className={input}
              value={profile.gpa}
              onChange={e => setProfile({ ...profile, gpa: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Scale
            <input
              type="text"
              inputMode="decimal"
              maxLength={8}
              placeholder="e.g. 4.0"
              className={input}
              value={profile.gpaScale}
              onChange={e => setProfile({ ...profile, gpaScale: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Weighting
            <select
              className={input}
              value={profile.gpaWeighted}
              onChange={e => setProfile({ ...profile, gpaWeighted: e.target.value as RealProfile['gpaWeighted'] })}
            >
              <option value="">Not specified</option>
              <option value="unweighted">Unweighted</option>
              <option value="weighted">Weighted</option>
            </select>
          </label>
        </div>
        </>}
        <label className="block text-sm">
          Intended major / academic interest
          <input
            type="text"
            maxLength={128}
            placeholder="e.g. Exercise Science, Business, Undecided"
            className={input}
            value={profile.intendedMajor}
            onChange={e => setProfile({ ...profile, intendedMajor: e.target.value })}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">School &amp; academics</legend>
        <p className="text-xs text-slate-500">Optional — leave blank for younger players. Never inferred from club.</p>
        <label className="block text-sm">
          High school name
          <input
            type="text"
            maxLength={128}
            placeholder="e.g. Cherry Creek High School"
            className={input}
            value={profile.highSchool}
            onChange={e => setProfile({ ...profile, highSchool: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            City
            <input
              type="text"
              maxLength={64}
              placeholder="e.g. Greenwood Village"
              className={input}
              value={profile.schoolCity}
              onChange={e => setProfile({ ...profile, schoolCity: e.target.value })}
            />
          </label>
          <label className="text-sm">
            State
            <input
              type="text"
              maxLength={32}
              placeholder="e.g. CO"
              className={input}
              value={profile.schoolState}
              onChange={e => setProfile({ ...profile, schoolState: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      <label className="block text-sm">
        Contact email for coaches <span className="text-slate-400">(shown on your profile when you choose to share it)</span>
        <input
          type="email"
          maxLength={255}
          placeholder="e.g. parent@email.com"
          className={input}
          value={profile.contactEmail}
          onChange={e => setProfile({ ...profile, contactEmail: e.target.value })}
        />
      </label>
      {saveError && (
        <p role="alert" className="text-sm text-red-700">{saveError}</p>
      )}
      {saveOk && (
        <p role="status" className="text-sm text-green-700">Profile saved.</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-slate-900 text-white px-5 py-3 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

// ── Public export — routes to demo or real based on isDemo prop ───────────────

export default function ProfileBuilder(props: {
  playerId: string;
  editing: boolean;
  onEdit: () => void;
  onSaved: (p: DemoBaseProfile) => void;
  isDemo?: boolean;
}) {
  if (props.isDemo) {
    return <DemoProfileBuilder {...props} />;
  }
  return <RealProfileBuilder {...props} />;
}
