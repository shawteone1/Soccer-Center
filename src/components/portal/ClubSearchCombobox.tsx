/**
 * ClubSearchCombobox — searchable club picker for the affiliations wizard step.
 *
 * Fetches from GET /api/parent/clubs?q=&region=
 * Falls back to manual entry clearly labeled as parent-entered.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronDown, AlertCircle, PenLine } from 'lucide-react';

const REGIONS = [
  { slug: 'colorado',   label: 'Colorado' },
  { slug: 'arizona',    label: 'Arizona' },
  { slug: 'cal-south',  label: 'Southern California' },
  { slug: 'cal-north',  label: 'Northern California' },
  { slug: 'oregon',     label: 'Oregon' },
  { slug: 'washington', label: 'Washington' },
  { slug: 'nevada',     label: 'Nevada' },
];

interface ClubResult {
  name: string;
  city: string | null;
  region: string;
}

interface Props {
  value: string;
  onChange: (name: string, isManual: boolean) => void;
  defaultRegion?: string;
  placeholder?: string;
  required?: boolean;
}

export default function ClubSearchCombobox({
  value,
  onChange,
  defaultRegion = 'colorado',
  placeholder = 'Search clubs…',
  required,
}: Props) {
  const [query,       setQuery]       = useState(value);
  const [region,      setRegion]      = useState(defaultRegion);
  const [results,     setResults]     = useState<ClubResult[]>([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [manualMode,  setManualMode]  = useState(false);
  const [selected,    setSelected]    = useState<ClubResult | null>(null);

  // Sync region when defaultRegion prop resolves after async parent profile load
  useEffect(() => {
    if (defaultRegion && defaultRegion !== region) {
      setRegion(defaultRegion);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRegion]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchClubs = useCallback(async (q: string, reg: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ region: reg, limit: '40' });
      if (q.length >= 2) params.set('q', q);
      const res = await fetch(`/api/parent/clubs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { clubs: ClubResult[] };
      setResults(data.clubs ?? []);
    } catch {
      setError('Could not load clubs. You can enter manually below.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (manualMode) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchClubs(query, region);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, region, manualMode, fetchClubs]);

  function selectClub(club: ClubResult) {
    setSelected(club);
    setQuery(club.name);
    setOpen(false);
    onChange(club.name, false);
  }

  function clearSelection() {
    setSelected(null);
    setQuery('');
    onChange('', false);
    setManualMode(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const regionLabel = REGIONS.find(r => r.slug === region)?.label ?? region;

  // ── Manual entry mode ──────────────────────────────────────────────────────
  if (manualMode) {
    return (
      <div className="space-y-2">
        <div
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full w-fit"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <PenLine size={10} />
          Manual entry — parent-provided, not verified against directory
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); onChange(e.target.value, true); }}
            placeholder="Enter club name"
            required={required}
            autoFocus
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background:  'hsl(var(--pp-page-bg))',
              color:       'hsl(var(--pp-text))',
            }}
          />
          <button
            type="button"
            onClick={() => { setManualMode(false); setQuery(''); onChange('', false); }}
            className="text-xs px-3 py-2 rounded-xl border transition-colors"
            style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
          >
            Search instead
          </button>
        </div>
      </div>
    );
  }

  // ── Search mode ────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {/* Region selector */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>Region:</span>
        <div className="relative">
          <select
            value={region}
            onChange={e => { setRegion(e.target.value); setSelected(null); setQuery(''); }}
            className="text-xs rounded-lg border pl-2 pr-6 py-1 appearance-none focus:outline-none"
            style={{
              borderColor: 'hsl(var(--pp-border))',
              background:  'hsl(var(--pp-page-bg))',
              color:       'hsl(var(--pp-navy))',
            }}
          >
            {REGIONS.map(r => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        </div>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pp-text-muted))' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required && !selected}
          className="w-full rounded-xl border pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
          style={{
            borderColor: selected ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))',
            background:  'hsl(var(--pp-page-bg))',
            color:       'hsl(var(--pp-text))',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label="Clear"
          >
            <X size={13} style={{ color: 'hsl(var(--pp-text-muted))' }} />
          </button>
        )}
      </div>

      {/* Selected badge */}
      {selected && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--pp-navy))' }}>
          <span className="font-medium">{selected.name}</span>
          {selected.city && <span style={{ color: 'hsl(var(--pp-text-muted))' }}>· {selected.city}</span>}
          <span
            className="ml-1 px-1.5 py-0.5 rounded text-xs"
            style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
          >
            {regionLabel} directory
          </span>
        </div>
      )}

      {/* Dropdown */}
      {open && !selected && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ background: 'hsl(var(--pp-card-bg))', borderColor: 'hsl(var(--pp-border))' }}
        >
          {/* Loading */}
          {loading && (
            <div className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Searching {regionLabel} clubs…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="px-4 py-3 flex items-start gap-2 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {!loading && !error && results.length > 0 && (
            <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
              {results.map((club, i) => (
                <li key={i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => selectClub(club)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-opacity-60"
                    style={{ color: 'hsl(var(--pp-text))' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--pp-blue-light))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="font-medium">{club.name}</span>
                    {club.city && (
                      <span className="ml-1.5 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                        {club.city}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Empty */}
          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No clubs found in {regionLabel}{query.length >= 2 ? ` matching "${query}"` : ''}.
            </div>
          )}

          {/* Manual entry option — always shown at bottom */}
          <div
            className="border-t px-4 py-2.5"
            style={{ borderColor: 'hsl(var(--pp-border))' }}
          >
            <button
              type="button"
              onClick={() => { setManualMode(true); setOpen(false); }}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'hsl(var(--pp-blue))' }}
            >
              <PenLine size={11} />
              Not listed — enter manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
