/**
 * FanArenaProfile — Fan identity card for the My Soccer dashboard.
 *
 * Displays:
 *   - Stadium cover image (user-uploaded or stable default)
 *   - Avatar (uploaded photo or initials fallback)
 *   - Display name, bio, location
 *   - Followed-team logos strip (importKey chips)
 *   - Manage Interests button
 *   - Edit Profile modal (name, bio, location, avatar, cover)
 *
 * Design: blue/white/grey card palette matching the approved Canva design.
 * Persists to /api/my-soccer/profile (POST) and /api/my-soccer/media/upload.
 *
 * Cover image notes:
 *   - defaultCoverUrl is the stable stadium fallback (Getty stock, not a screenshot).
 *   - If the saved coverImageUrl fails to load (broken URL, private preview URL,
 *     deleted file), onError falls back to defaultCoverUrl automatically.
 *   - The edit modal lets the user upload a new cover OR remove a saved cover
 *     (saves coverImageUrl: null so the default is shown on next load).
 */

import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Loader2,
  CheckCircle,
  SlidersHorizontal,
  ImageIcon,
  Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FanProfile {
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  location: string | null;
  favTeams: string[];
  fanInterests: string[];
  region: string | null;
}

interface FanArenaProfileProps {
  profile: FanProfile;
  userEmail: string;
  defaultCoverUrl: string;
  /** Null while the GET response is still in-flight. False = columns absent in DB. */
  identityColumnsAvailable: boolean | null;
  onProfileSaved: (updated: Partial<FanProfile>) => void;
  onManageInterests: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: 'include', ...opts });
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({
  profile,
  userEmail,
  defaultCoverUrl,
  identityColumnsAvailable,
  onSave,
  onClose,
}: {
  profile: FanProfile;
  userEmail: string;
  defaultCoverUrl: string;
  /** Null = still loading; false = columns absent; true = columns present */
  identityColumnsAvailable: boolean | null;
  onSave: (updated: Partial<FanProfile>) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // Avatar
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(profile.avatarUrl ?? null);

  // Sync avatar state when the profile prop is updated from the server
  // (e.g. after a portal switch triggers a fresh profile fetch)
  useEffect(() => {
    if (profile.avatarUrl && !avatarFile) {
      setAvatarPreview(profile.avatarUrl);
      setUploadedAvatarUrl(profile.avatarUrl);
    }
  }, [profile.avatarUrl, avatarFile]);

  // Cover
  // coverMode: 'saved' = show saved URL, 'new' = show file preview, 'removed' = save null
  type CoverMode = 'saved' | 'new' | 'removed';
  const coverRef = useRef<HTMLInputElement>(null);
  // Start as 'removed' if no saved URL; probe will flip to 'saved' if URL loads
  const [coverMode, setCoverMode] = useState<CoverMode>(profile.coverImageUrl ? 'saved' : 'removed');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState<string | null>(profile.coverImageUrl ?? null);
  // Track if the saved cover failed to load (broken/private URL)
  const [savedCoverBroken, setSavedCoverBroken] = useState(false);

  // Probe the saved cover URL on mount — if it fails, switch to 'removed' so the
  // modal preview shows the default instead of a broken image placeholder.
  useEffect(() => {
    if (!profile.coverImageUrl || coverMode !== 'saved') return;
    const img = new Image();
    img.onload = () => { /* URL is valid — keep coverMode as 'saved' */ };
    img.onerror = () => {
      setSavedCoverBroken(true);
      setCoverMode('removed');
      setUploadedCoverUrl(null);
    };
    img.src = profile.coverImageUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initials = getInitials(displayName || profile.displayName, userEmail);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverMode('new');
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  function handleRemoveCover() {
    setCoverFile(null);
    setCoverPreview(null);
    setUploadedCoverUrl(null);
    setCoverMode('removed');
  }

  async function uploadFile(file: File, mediaType: 'avatar' | 'cover'): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mediaType', mediaType);
    const res = await apiFetch('/api/my-soccer/media/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(b.error ?? `${mediaType} upload failed`);
    }
    const data = await res.json() as { publicUrl?: string };
    return data.publicUrl ?? null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavedOk(false);
    setSaving(true);
    try {
      let resolvedAvatarUrl = uploadedAvatarUrl;
      let resolvedCoverUrl: string | null = null;

      if (avatarFile) {
        resolvedAvatarUrl = await uploadFile(avatarFile, 'avatar');
        setUploadedAvatarUrl(resolvedAvatarUrl);
      }

      if (coverMode === 'new' && coverFile) {
        resolvedCoverUrl = await uploadFile(coverFile, 'cover');
        setUploadedCoverUrl(resolvedCoverUrl);
      } else if (coverMode === 'saved') {
        resolvedCoverUrl = uploadedCoverUrl;
      } else {
        resolvedCoverUrl = null;
      }

      const body: Record<string, unknown> = {
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        avatarUrl: resolvedAvatarUrl,
        coverImageUrl: resolvedCoverUrl,
      };

      const res = await apiFetch('/api/my-soccer/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({})) as {
        ok?: boolean;
        migrationRequired?: boolean;
        message?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        const msg = resBody.detail ?? resBody.error ?? `Save failed (HTTP ${res.status})`;
        setError(msg);
        setSaving(false);
        return;
      }
      if (resBody.migrationRequired) {
        // Identity columns absent — preferences saved, identity fields dropped.
        // Form values are preserved so the user can try again after migration.
        setError('Your name, bio, and photo could not be saved — the profile storage migration has not run yet. Your other preferences were saved.');
        setSaving(false);
        return;
      }

      // Full success
      onSave({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        avatarUrl: resolvedAvatarUrl,
        coverImageUrl: resolvedCoverUrl,
      });
      setSavedOk(true);
      // Close after a brief confirmation flash
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // Determine what to show in the cover preview area
  let coverSrc: string;
  if (coverMode === 'new' && coverPreview) {
    coverSrc = coverPreview;
  } else if (coverMode === 'saved' && profile.coverImageUrl && !savedCoverBroken) {
    coverSrc = profile.coverImageUrl;
  } else {
    coverSrc = defaultCoverUrl;
  }

  return (
    <div className="fa-shell !min-h-0 !bg-transparent">
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Panel — inside .fa-shell wrapper so all tokens resolve to the fan light palette */}
        <div
          className="bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-border"
          onClick={e => e.stopPropagation()}
        >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-border">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Edit profile
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form id="fan-profile-edit-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {/* Cover image */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Cover image</p>
            <div className="relative h-28 rounded-xl overflow-hidden bg-muted">
              <img src={coverSrc} alt="Cover preview" className="w-full h-full object-cover"
                onError={() => { if (coverMode === 'saved') setSavedCoverBroken(true); }} />
              <button type="button" onClick={() => coverRef.current?.click()}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shadow bg-black/50 text-white hover:bg-black/70 transition-colors"
                aria-label="Change cover image">
                <ImageIcon size={12} /> Change
              </button>
              <input ref={coverRef} type="file" accept="image/*" className="sr-only" onChange={handleCoverChange} />
            </div>
            {(coverMode === 'saved' || coverMode === 'new') && (
              <button type="button" onClick={handleRemoveCover}
                className="flex items-center gap-1 text-xs mt-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <Trash2 size={11} />
                {coverMode === 'new' ? 'Cancel new cover' : 'Remove saved cover'}
              </button>
            )}
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar preview" className="h-16 w-16 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold border-2 border-border bg-muted text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}>
                  {initials}
                </div>
              )}
              <button type="button" onClick={() => avatarRef.current?.click()}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center shadow bg-primary text-primary-foreground border-2 border-card"
                title="Change photo" aria-label="Change profile photo">
                <Camera size={11} />
              </button>
              <input ref={avatarRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Profile photo</p>
              <p className="text-xs mt-0.5 text-muted-foreground">JPG, PNG or GIF · max 8 MB</p>
              {avatarFile && (
                <button type="button"
                  onClick={() => { setAvatarFile(null); setAvatarPreview(null); setUploadedAvatarUrl(null); }}
                  className="flex items-center gap-1 text-xs mt-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Trash2 size={11} /> Remove photo
                </button>
              )}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Display name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Short bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={300} rows={3}
              placeholder="Soccer fan, supporter, coach…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            <p className="text-[10px] text-right mt-0.5 text-muted-foreground">{bio.length}/300</p>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Location <span className="opacity-60">(optional)</span>
            </label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} maxLength={80}
              placeholder="e.g. Denver, CO"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Upfront notice when identity columns are confirmed absent */}
          {identityColumnsAvailable === false && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
              <p className="font-semibold text-amber-800 mb-1">Profile storage not yet set up</p>
              <p className="text-amber-700">
                Your name, bio, and photo cannot be saved until an administrator runs the fan profile schema migration. Your other preferences (leagues, teams) will still save.
              </p>
            </div>
          )}

          {/* Success flash */}
          {savedOk && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs flex items-center gap-2">
              <CheckCircle size={14} className="text-green-600 shrink-0" />
              <p className="font-semibold text-green-800">Profile saved successfully.</p>
            </div>
          )}
        </form>

        {/* Footer — pb-20 on mobile so the chat widget launcher doesn't overlap Save */}
        <div className="px-5 pt-4 pb-20 sm:pb-4 flex items-center justify-end gap-3 shrink-0 border-t border-border">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button type="submit" form="fan-profile-edit-form" disabled={saving || savedOk}
            className="inline-flex items-center gap-2 rounded-xl font-semibold py-2 px-5 text-sm bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : savedOk ? <CheckCircle size={14} /> : null}
            {saving ? 'Saving…' : savedOk ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

// ─── Team badge chip ──────────────────────────────────────────────────────────
// Resolves importKey to a proper display name via the catalog API.
// Falls back to slug-splitting if the catalog hasn't loaded yet.

function stringHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h % 360;
}

/** Shared catalog name cache — loaded once, shared across all TeamChip instances */
const catalogNameCache = new Map<string, string>();
let catalogLoadPromise: Promise<void> | null = null;

function loadCatalogNames(): Promise<void> {
  if (catalogLoadPromise) return catalogLoadPromise;
  catalogLoadPromise = (async () => {
    try {
      const res = await fetch('/api/catalog/teams', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as {
        teams: {
          clubs: Array<{ importKey: string; displayName: string }>;
          nationalTeams: Array<{ importKey: string; displayName: string }>;
          organizations: Array<{ importKey: string; displayName: string }>;
          leagues: Array<{ importKey: string; displayName: string }>;
        };
        competitions: Array<{ importKey: string; name: string }>;
      };
      for (const t of [...data.teams.clubs, ...data.teams.nationalTeams, ...data.teams.organizations, ...data.teams.leagues]) {
        catalogNameCache.set(t.importKey, t.displayName);
      }
      for (const c of data.competitions) {
        catalogNameCache.set(c.importKey, c.name);
      }
    } catch { /* non-fatal */ }
  })();
  return catalogLoadPromise;
}

function slugToLabel(importKey: string): string {
  const slug = importKey.replace(/^(club:|nt:|pro:|comp:)/, '');
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function TeamChip({ importKey, catalogNames }: { importKey: string; catalogNames: Map<string, string> }) {
  const label = catalogNames.get(importKey) ?? slugToLabel(importKey);
  const hue = stringHue(importKey);

  return (
    <span className="fa-team-chip">
      <span
        className="inline-flex items-center justify-center rounded-full text-[9px] font-bold shrink-0"
        style={{ width: 18, height: 18, background: `hsl(${hue} 55% 45%)`, color: '#fff' }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FanArenaProfile({
  profile,
  userEmail,
  defaultCoverUrl,
  identityColumnsAvailable,
  onProfileSaved,
  onManageInterests,
}: FanArenaProfileProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [saved, setSaved] = useState(false);
  // Track if the saved cover URL fails to load so we fall back to the default
  const [coverBroken, setCoverBroken] = useState(false);
  // Catalog names for proper team display (Arsenal, England, etc.)
  const [catalogNames, setCatalogNames] = useState<Map<string, string>>(new Map(catalogNameCache));

  // Reset broken state whenever the profile's coverImageUrl changes
  useEffect(() => {
    setCoverBroken(false);
  }, [profile.coverImageUrl]);

  // Load catalog names once on mount so TeamChips show proper names
  useEffect(() => {
    if (catalogNameCache.size > 0) {
      setCatalogNames(new Map(catalogNameCache));
      return;
    }
    void loadCatalogNames().then(() => {
      setCatalogNames(new Map(catalogNameCache));
    });
  }, []);

  const initials = getInitials(profile.displayName, userEmail);
  // Use saved URL if present and not broken; otherwise fall back to the stable default
  const coverSrc = (profile.coverImageUrl && !coverBroken)
    ? profile.coverImageUrl
    : defaultCoverUrl;
  const displayName = profile.displayName ?? userEmail.split('@')[0];

  function handleSave(updated: Partial<FanProfile>) {
    onProfileSaved(updated);
    // Reset broken state in case user uploaded a new valid cover
    setCoverBroken(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      {/* Profile card — light card matching approved Canva design */}
      <div className="rounded-2xl overflow-hidden shadow-sm bg-card border border-border w-full">
        {/* Cover — taller, with FAN ARENA · FIND YOUR GAME badge overlay */}
        <div className="relative h-40 sm:h-52 bg-muted">
          <img
            src={coverSrc}
            alt="Profile cover"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => {
              if (profile.coverImageUrl && !coverBroken) setCoverBroken(true);
            }}
          />
          {/* FAN ARENA · FIND YOUR GAME badge — top right */}
          <div className="absolute top-3 right-3 fa-arena-badge">
            FAN ARENA · FIND YOUR GAME
          </div>
          {/* Error notice — only shown when the image actually fails to load */}
          {coverBroken && (
            <div className="absolute bottom-0 inset-x-0 bg-black/60 px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-white/80">Cover image could not be loaded.</p>
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="text-[11px] font-semibold text-white underline underline-offset-2 hover:text-white/80 transition-colors"
              >
                Update cover
              </button>
            </div>
          )}
        </div>

        {/* Identity section */}
        <div className="px-5 pb-5">
          {/* Avatar row — overlaps cover */}
          <div className="flex items-end justify-between -mt-9 mb-4">
            <div className="relative">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={displayName}
                  className="h-[72px] w-[72px] rounded-full object-cover border-4 border-card shadow-md"
                />
              ) : (
                <div
                  className="h-[72px] w-[72px] rounded-full flex items-center justify-center text-2xl font-bold border-4 border-card shadow-md bg-muted text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {initials}
                </div>
              )}
            </div>
            {/* Edit profile button — dark filled pill matching Canva design */}
            <div className="flex items-center gap-2 mb-1">
              {saved && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <CheckCircle size={13} /> Saved
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="fa-edit-btn"
                aria-label="Edit profile"
              >
                Edit profile
              </button>
            </div>
          </div>
          {/* Name + subtitle + bio */}
          <div className="space-y-1 mb-4 min-w-0">
            <h2
              className="text-2xl font-bold leading-tight text-foreground break-words"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {displayName}
            </h2>
            {/* Subtitle: role · location */}
            <p className="text-sm text-muted-foreground">
              Soccer fan
              {profile.location && (
                <> · <span>{profile.location}</span></>
              )}
            </p>
            {profile.bio && (
              <p className="text-sm leading-relaxed pt-1 text-foreground break-words">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Followed teams row */}
          {profile.favTeams.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {profile.favTeams.slice(0, 6).map(t => (
                <TeamChip key={t} importKey={t} catalogNames={catalogNames} />
              ))}
              {profile.favTeams.length > 6 && (
                <span className="text-[11px] text-muted-foreground">
                  +{profile.favTeams.length - 6} more
                </span>
              )}
              <span className="text-xs mx-1 text-muted-foreground">·</span>
              <button
                type="button"
                onClick={onManageInterests}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Following · Manage teams
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onManageInterests}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
            >
              <SlidersHorizontal size={12} />
              Follow teams &amp; manage interests
            </button>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditProfileModal
          profile={profile}
          userEmail={userEmail}
          defaultCoverUrl={defaultCoverUrl}
          identityColumnsAvailable={identityColumnsAvailable}
          onSave={handleSave}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
