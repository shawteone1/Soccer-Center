/**
 * ClubSelector — searchable club directory picker for player forms.
 *
 * Features:
 * - Searches the directory_regions.json club list via /api/parent/clubs
 * - Region switcher (defaults to family's saved region)
 * - Shows city + region label to disambiguate same-name clubs
 * - "No club / Unattached" and "Not listed / Add manually" escape hatches
 * - Preserves legacy free-text clubName until the parent explicitly replaces it
 * - Debounced search (250ms) to avoid hammering the API
 *
 * Props:
 *   value          — current { directoryId, name } selection (null = unset)
 *   legacyName     — existing free-text club name from before directory was added
 *   defaultRegion  — region slug to pre-select (from parent's tryoutRegions[0])
 *   onChange       — called with { directoryId: string|null, name: string|null }
 *   inputStyle     — style object forwarded to the text input
 *   inputClassName — className forwarded to the text input
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, X, Check, MapPin } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClubSelection {
  directoryId: string | null;
  name: string | null;
}

interface ClubEntry {
  id: string;
  name: string;
  city: string;
  region: string;
  regionLabel: string;
}

interface RegionEntry {
  slug: string;
  label: string;
}

interface ClubSelectorProps {
  value: ClubSelection;
  legacyName?: string | null;
  defaultRegion?: string | null;
  onChange: (selection: ClubSelection) => void;
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClubSelector({
  value,
  legacyName,
  defaultRegion,
  onChange,
  inputStyle,
  inputClassName = '',
  disabled = false,
}: ClubSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Initialize from prop; sync when prop changes after async load (e.g. parent region loads late)
  const [region, setRegion] = useState(defaultRegion ?? 'colorado');
  const [clubs, setClubs] = useState<ClubEntry[]>([]);
  const [regions, setRegions] = useState<RegionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync region state when defaultRegion prop resolves (async parent profile load)
  useEffect(() => {
    if (defaultRegion && defaultRegion !== region) {
      setRegion(defaultRegion);
    }
  // Only sync when the prop itself changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRegion]);

  const debouncedQuery = useDebounce(query, 250);

  // Fetch clubs when query or region changes
  const fetchClubs = useCallback(async (q: string, r: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (r) params.set('region', r);
      const res = await fetch(`/api/parent/clubs?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { clubs: ClubEntry[]; regions: RegionEntry[] };
      setClubs(data.clubs ?? []);
      if (data.regions?.length) setRegions(data.regions);
    } catch {
      // silently ignore — user can still type manually
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchClubs(debouncedQuery, region);
    }
  }, [open, debouncedQuery, region, fetchClubs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setManualMode(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function openDropdown() {
    if (disabled) return;
    setQuery('');
    setManualMode(false);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function selectClub(club: ClubEntry) {
    onChange({ directoryId: club.id, name: club.name });
    setOpen(false);
    setQuery('');
  }

  function selectUnattached() {
    onChange({ directoryId: null, name: null });
    setOpen(false);
    setQuery('');
  }

  function confirmManual() {
    const name = manualText.trim();
    if (!name) return;
    onChange({ directoryId: null, name });
    setOpen(false);
    setManualMode(false);
    setManualText('');
    setQuery('');
  }

  function clearSelection() {
    onChange({ directoryId: null, name: null });
  }

  // What to display in the trigger button
  const displayName = value.name ?? legacyName ?? null;
  const isLegacy = !value.directoryId && !value.name && !!legacyName;
  const hasSelection = !!displayName;

  const baseInputStyle: React.CSSProperties = {
    borderColor: 'hsl(var(--pp-border))',
    background: 'hsl(var(--pp-white))',
    color: 'hsl(var(--pp-text))',
    ...inputStyle,
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${inputClassName}`}
        style={baseInputStyle}
      >
        <Search size={13} className="shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        <span className="flex-1 truncate" style={{ color: hasSelection ? 'hsl(var(--pp-text))' : 'hsl(var(--pp-text-muted))' }}>
          {hasSelection ? displayName : 'Search clubs…'}
        </span>
        {isLegacy && (
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}>
            legacy
          </span>
        )}
        {hasSelection && !disabled && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); clearSelection(); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
            style={{ color: 'hsl(var(--pp-text-muted))' }}
            aria-label="Clear club selection"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={13} className="shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
      </button>

      {/* Legacy notice */}
      {isLegacy && !open && (
        <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Previously entered: <strong>{legacyName}</strong>. Search above to link to the directory.
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl border shadow-xl overflow-hidden"
          style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
        >
          {/* Search input */}
          <div className="p-2 border-b" style={{ borderColor: 'hsl(var(--pp-border))' }}>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}>
              <Search size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type club name…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'hsl(var(--pp-text))' }}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="p-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Region selector */}
          {regions.length > 1 && (
            <div className="px-2 py-1.5 border-b flex items-center gap-2 overflow-x-auto" style={{ borderColor: 'hsl(var(--pp-border))' }}>
              <MapPin size={11} className="shrink-0" style={{ color: 'hsl(var(--pp-text-muted))' }} />
              {regions.map(r => (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => setRegion(r.slug)}
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors"
                  style={
                    region === r.slug
                      ? { background: 'hsl(var(--pp-blue))', color: 'hsl(var(--pp-white))', borderColor: 'hsl(var(--pp-blue))' }
                      : { background: 'transparent', color: 'hsl(var(--pp-text-muted))', borderColor: 'hsl(var(--pp-border))' }
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          <div className="max-h-52 overflow-y-auto">
            {/* No club option */}
            <button
              type="button"
              onClick={selectUnattached}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors border-b"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              <span className="flex-1 italic">No club / Unattached</span>
              {!value.directoryId && !value.name && !legacyName && <Check size={13} style={{ color: 'hsl(var(--pp-blue))' }} />}
            </button>

            {loading && (
              <div className="px-3 py-4 text-xs text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                Searching…
              </div>
            )}

            {!loading && clubs.map(club => {
              const isSelected = value.directoryId === club.id;
              return (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => selectClub(club)}
                  className="w-full flex items-start gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                  style={{ background: isSelected ? 'hsl(var(--pp-blue-light))' : undefined }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: 'hsl(var(--pp-text))' }}>{club.name}</p>
                    {club.city && (
                      <p className="text-[11px] truncate" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        {club.city}{club.regionLabel !== club.city ? ` · ${club.regionLabel}` : ''}
                      </p>
                    )}
                  </div>
                  {isSelected && <Check size={13} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--pp-blue))' }} />}
                </button>
              );
            })}

            {!loading && clubs.length === 0 && query.length > 0 && (
              <div className="px-3 py-3 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No clubs found for "{query}"
              </div>
            )}

            {/* Manual entry option */}
            {!manualMode ? (
              <button
                type="button"
                onClick={() => { setManualMode(true); setManualText(query); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors border-t"
                style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-blue))' }}
              >
                + Club not listed / Add manually
              </button>
            ) : (
              <div className="px-3 py-2.5 border-t space-y-2" style={{ borderColor: 'hsl(var(--pp-border))' }}>
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--pp-text-muted))' }}>Enter club name manually</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmManual(); } }}
                    placeholder="e.g. Colorado Rush"
                    autoFocus
                    className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-white))', color: 'hsl(var(--pp-text))' }}
                  />
                  <button
                    type="button"
                    onClick={confirmManual}
                    disabled={!manualText.trim()}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
