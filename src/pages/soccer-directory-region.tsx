import { useState, useMemo } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useParams } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowLeft, Search, ExternalLink, MapPin, Users,
  Building2, Layers, Zap, ChevronRight, Mail, Phone,
} from 'lucide-react';
import { directory_regions } from 'virtual:content';

// ─── Constants ────────────────────────────────────────────────────────────────

const siteUrl = 'https://soccercenter.org';

const COLOR_MAP: Record<string, string> = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  accent: 'hsl(var(--accent))',
};

const TYPE_COLORS: Record<string, string> = {
  Club: 'hsl(var(--primary))',
  League: 'hsl(var(--secondary))',
  Facility: 'hsl(var(--accent))',
};

const LEVELS = ['All', 'Youth', 'Adult', 'Semi-Pro', 'Pro', 'All Ages'];

const PROGRAM_COLORS: Record<string, string> = {
  'Adult Leagues': 'hsl(var(--primary))',
  'Youth Leagues': 'hsl(var(--secondary))',
  'Futsal': 'hsl(var(--accent))',
  'Futsal Leagues': 'hsl(var(--accent))',
  'Open Play': 'hsl(var(--muted-foreground))',
  'Drop-In': 'hsl(var(--muted-foreground))',
  'Camps': 'hsl(var(--secondary))',
  'Clinics': 'hsl(var(--secondary))',
  'Tournaments': 'hsl(var(--primary))',
  'Skills Training': 'hsl(var(--accent))',
};

// ─── Indoor facility type ─────────────────────────────────────────────────────

interface DirectoryListing {
  id: string;
  importId: string;
  name: string;
  type: string;
  level: string;
  city: string;
  programTypes: string;
  directoryArea: string;
  websiteStatus: string;
  sourceUrl: string;
  checkedDate: string;
  url: string;
  email: string;
  phone?: string;
}

interface IndoorFacility {
  id: string;
  name: string;
  city: string;
  address?: string;
  url?: string;
  fields?: number;
  surface?: string;
  programs?: string[];
  notes?: string;
}

// ─── Futsal entry type ────────────────────────────────────────────────────────

interface FutsalEntry {
  id: string;
  name: string;
  city: string;
  type: string;
  level?: string;
  url?: string;
  notes?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SoccerDirectoryRegionPage() {
  const { slug } = useParams<{ slug: string }>();
  const [activeTab, setActiveTab] = useState<'directory' | 'indoor' | 'futsal'>('directory');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [levelFilter, setLevelFilter] = useState('All');
  const [indoorSearch, setIndoorSearch] = useState('');
  const [futsalSearch, setFutsalSearch] = useState('');

  const region = directory_regions.find((r) => r.slug === slug);

  // Directory filtered listings
  const filtered = useMemo(() => {
    if (!region) return [];
    return region.listings.filter((l) => {
      const matchSearch =
        !search ||
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.city.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'All' || l.type === typeFilter;
      const matchLevel = levelFilter === 'All' || l.level === levelFilter;
      return matchSearch && matchType && matchLevel;
    });
  }, [region, search, typeFilter, levelFilter]);

  // Indoor filtered facilities
  const filteredIndoor = useMemo(() => {
    if (!region) return [];
    const facilities = (region as unknown as { indoorFacilities?: IndoorFacility[] }).indoorFacilities ?? [];
    if (!indoorSearch) return facilities;
    const q = indoorSearch.toLowerCase();
    return facilities.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q) ||
        (f.programs ?? []).some((p: string) => p.toLowerCase().includes(q)),
    );
  }, [region, indoorSearch]);

  if (!region) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-32 text-center">
        <p className="font-heading text-2xl font-bold mb-4" style={{ color: 'hsl(var(--foreground))' }}>
          Region not found
        </p>
        <Link
          to="/soccer-directory"
          className="text-sm font-semibold"
          style={{ color: 'hsl(var(--primary))' }}
        >
          ← Back to Directory
        </Link>
      </main>
    );
  }

  const color = COLOR_MAP[region.colorToken] ?? 'hsl(var(--primary))';
  const pageUrl = `${siteUrl}/soccer-directory/${region.slug}`;
  const title = `${region.label} Soccer Directory — Clubs, Leagues & Indoor Facilities`;
  const description = `Browse ${region.listingCount} soccer clubs, leagues, and indoor facilities in ${region.label}. ${region.tagline}.`;

  const types = ['All', ...Array.from(new Set(region.listings.map((l) => l.type)))];
  const levels = ['All', ...Array.from(new Set(region.listings.map((l) => l.level))).filter((l) => LEVELS.includes(l))];

  const indoorFacilities: IndoorFacility[] =
    (region as unknown as { indoorFacilities?: IndoorFacility[] }).indoorFacilities ?? [];

  const futsalEntries: FutsalEntry[] =
    (region as unknown as { futsalEntries?: FutsalEntry[] }).futsalEntries ?? [];

  // Futsal filtered entries
  const filteredFutsal = useMemo(() => {
    if (!futsalSearch) return futsalEntries;
    const q = futsalSearch.toLowerCase();
    return futsalEntries.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q) ||
        (f.level ?? '').toLowerCase().includes(q),
    );
  }, [futsalEntries, futsalSearch]);

  const tabs = [
    { id: 'directory' as const, label: 'Directory' },
    { id: 'indoor' as const, label: 'Indoor', badge: indoorFacilities.length > 0 ? String(indoorFacilities.length) : undefined },
    { id: 'futsal' as const, label: 'Futsal', badge: futsalEntries.length > 0 ? String(futsalEntries.length) : undefined },
  ];

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': `${pageUrl}#webpage`,
          name: title,
          url: pageUrl,
          description,
          isPartOf: { '@id': `${siteUrl}/#website` },
          about: { '@id': `${siteUrl}/#organization` },
        }).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── HEADER ── */}
        <section
          className="pt-28 pb-12 border-b"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        >
          <div className="max-w-6xl mx-auto px-6">
            <Link
              to="/soccer-directory"
              className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-80"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <ArrowLeft size={14} />
              All Regions
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
              <div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold mb-3"
                  style={{ background: `${color}22`, color }}
                >
                  <MapPin size={11} />
                  {region.abbr}
                </span>
                <h1
                  className="font-heading text-4xl sm:text-5xl font-bold leading-tight mb-2"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  {region.label}
                </h1>
                <p className="text-base" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {region.tagline}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-heading text-5xl font-bold tabular-nums" style={{ color }}>
                  {region.listingCount}
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  club / league listings
                </p>
              </div>
            </div>

            {/* Sub-region pills */}
            <div className="flex flex-wrap gap-2 mt-5">
              {region.subRegions.map((sub) => (
                <span
                  key={sub}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                >
                  {sub}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── TABS + TRYOUTS LINK ── */}
        <div
          className="border-b"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        >
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
            <div className="flex gap-0" role="tablist" aria-label="Directory sections">
              {tabs.map(({ id, label, badge }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${id}`}
                    id={`tab-${id}`}
                    onClick={() => setActiveTab(id)}
                    className="relative px-5 py-4 text-sm font-semibold transition-colors"
                    style={{
                      color: isActive ? color : 'hsl(var(--muted-foreground))',
                      borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                    }}
                  >
                    {label}
                    {badge && (
                      <span
                        className="ml-2 rounded-full px-1.5 py-0.5 text-xs font-bold"
                        style={{ background: `${color}22`, color }}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tryouts link — passes the current region so the tryouts page opens on the right tab */}
            <Link
              to={`/tryouts?region=${region.slug}`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all hover:opacity-80"
              style={{ background: `${color}18`, color }}
            >
              Tryouts <ChevronRight size={12} />
            </Link>
          </div>
        </div>

        {/* ── DIRECTORY TAB ── */}
        <div id="panel-directory" role="tabpanel" aria-labelledby="tab-directory" hidden={activeTab !== 'directory'}>
          <section className="max-w-6xl mx-auto px-6 py-10">
            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
                <input
                  type="search"
                  placeholder="Search clubs, cities…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition-all"
                  style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {types.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className="rounded-full px-4 py-2 text-xs font-semibold transition-all"
                    style={
                      typeFilter === t
                        ? { background: color, color: 'hsl(var(--primary-foreground))', border: `1px solid ${color}` }
                        : { background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {levels.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevelFilter(l)}
                    className="rounded-full px-4 py-2 text-xs font-semibold transition-all"
                    style={
                      levelFilter === l
                        ? { background: 'hsl(var(--muted-foreground))', color: 'hsl(var(--background))', border: '1px solid hsl(var(--muted-foreground))' }
                        : { background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Showing {filtered.length} of {region.listings.length} listings
              {search && ` for "${search}"`}
            </p>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="font-heading text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  No listings match your search
                </p>
                <button
                  onClick={() => { setSearch(''); setTypeFilter('All'); setLevelFilter('All'); }}
                  className="text-sm font-semibold mt-2"
                  style={{ color }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((rawListing, i) => {
                  const listing = rawListing as DirectoryListing;
                  const typeColor = TYPE_COLORS[listing.type] ?? color;
                  const hasUrl = !!listing.url;
                  const CardEl = hasUrl ? motion.a : motion.div;
                  const cardProps = hasUrl
                    ? { href: listing.url, target: '_blank', rel: 'noopener noreferrer' }
                    : {};
                  return (
                    <CardEl
                      key={listing.id}
                      {...cardProps}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                      className={`group flex flex-col rounded-xl p-5 transition-all${hasUrl ? ' hover:scale-[1.02] active:scale-[0.99]' : ''}`}
                      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ background: `${typeColor}22`, color: typeColor }}
                        >
                          {listing.type}
                        </span>
                        {listing.programTypes && (
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs"
                            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {listing.programTypes}
                          </span>
                        )}
                      </div>
                      <p
                        className="font-heading font-bold text-lg leading-tight mb-1 flex-1"
                        style={{ color: 'hsl(var(--foreground))' }}
                      >
                        {listing.name}
                      </p>
                      {/* Contact row */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {listing.email && (
                          <a
                            href={`mailto:${listing.email}`}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs hover:underline"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                          >
                            <Mail size={10} />
                            {listing.email}
                          </a>
                        )}
                        {listing.phone && (
                          <a
                            href={`tel:${listing.phone}`}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs hover:underline"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                          >
                            <Phone size={10} />
                            {listing.phone}
                          </a>
                        )}
                      </div>
                      <div
                        className="flex items-center justify-between mt-3 pt-3 border-t"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <span
                          className="flex items-center gap-1 text-xs"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <MapPin size={11} />
                          {listing.city}
                        </span>
                        {hasUrl && (
                          <span
                            className="flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: typeColor }}
                          >
                            Visit <ExternalLink size={11} />
                          </span>
                        )}
                      </div>
                    </CardEl>
                  );
                })}
              </div>
            )}

            <p
              className="text-xs mt-10 pt-6 border-t"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Listings link to official sources. Confirm programs, access, and dates directly with the organizer.
            </p>
          </section>
        </div>

        {/* ── INDOOR TAB ── */}
        <div id="panel-indoor" role="tabpanel" aria-labelledby="tab-indoor" hidden={activeTab !== 'indoor'}>
          <section className="max-w-6xl mx-auto px-6 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2
                  className="font-heading text-2xl font-bold mb-1"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  Indoor Soccer Facilities — {region.label}
                </h2>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {indoorFacilities.length} indoor venue{indoorFacilities.length !== 1 ? 's' : ''} with leagues, open play, and training programs
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
                <input
                  type="search"
                  placeholder="Search facilities, programs…"
                  value={indoorSearch}
                  onChange={(e) => setIndoorSearch(e.target.value)}
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-all"
                  style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
            </div>

            {indoorFacilities.length === 0 ? (
              <div className="text-center py-20">
                <Building2 size={36} className="mx-auto mb-4 opacity-30" style={{ color: 'hsl(var(--foreground))' }} />
                <p className="font-heading text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  No indoor facilities listed yet
                </p>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Know a facility we should add? Let us know via the Community page.
                </p>
              </div>
            ) : filteredIndoor.length === 0 ? (
              <div className="text-center py-20">
                <p className="font-heading text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  No facilities match your search
                </p>
                <button
                  onClick={() => setIndoorSearch('')}
                  className="text-sm font-semibold mt-2"
                  style={{ color }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredIndoor.map((facility, i) => (
                  <motion.div
                    key={facility.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.35) }}
                    className="rounded-xl p-5 flex flex-col gap-4"
                    style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                            style={{ background: `${color}22`, color }}
                          >
                            <Building2 size={10} />
                            Indoor
                          </span>
                          {facility.surface && (
                            <span
                              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                            >
                              {facility.surface}
                            </span>
                          )}
                        </div>
                        <h3
                          className="font-heading font-bold text-lg leading-tight"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          {facility.name}
                        </h3>
                      </div>
                      {facility.url && (
                        <a
                          href={facility.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
                          style={{ color }}
                        >
                          Visit <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {facility.address && (
                        <div
                          className="flex items-start gap-2 text-xs"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--accent))' }} />
                          <span>{facility.address}</span>
                        </div>
                      )}
                      {facility.fields != null && (
                        <div
                          className="flex items-center gap-2 text-xs"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <Layers size={12} className="shrink-0" style={{ color: 'hsl(var(--secondary))' }} />
                          <span>{facility.fields} field{facility.fields !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>

                    {facility.programs && facility.programs.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <p
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          Programs
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {facility.programs.map((prog: string) => {
                            const progColor = PROGRAM_COLORS[prog] ?? 'hsl(var(--muted-foreground))';
                            return (
                              <span
                                key={prog}
                                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium"
                                style={{ background: `${progColor}18`, color: progColor }}
                              >
                                <Users size={10} />
                                {prog}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {facility.notes && (
                      <p
                        className="text-xs leading-relaxed border-t pt-3"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                      >
                        {facility.notes}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            <p
              className="text-xs mt-10 pt-6 border-t"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Facility listings are for informational purposes. Confirm hours, programs, and availability directly with each venue.
            </p>
          </section>
        </div>

        {/* ── FUTSAL TAB ── */}
        <div id="panel-futsal" role="tabpanel" aria-labelledby="tab-futsal" hidden={activeTab !== 'futsal'}>
          <section className="max-w-6xl mx-auto px-6 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2
                  className="font-heading text-2xl font-bold mb-1"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  Futsal — {region.label}
                </h2>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {futsalEntries.length} futsal club{futsalEntries.length !== 1 ? 's' : ''} and venue{futsalEntries.length !== 1 ? 's' : ''} offering leagues, open play, and development programs
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
                <input
                  type="search"
                  placeholder="Search clubs, cities, levels…"
                  value={futsalSearch}
                  onChange={(e) => setFutsalSearch(e.target.value)}
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-all"
                  style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>
            </div>

            <div
              className="rounded-xl px-5 py-4 mb-8 flex items-start gap-3"
              style={{ background: `${color}12`, border: `1px solid ${color}30` }}
            >
              <Zap size={16} className="shrink-0 mt-0.5" style={{ color }} />
              <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
                <span className="font-semibold">Futsal</span> is a fast-paced, small-sided variant played on a hard court with a smaller, low-bounce ball. It's widely recognized as one of the best technical development tools in the game — used by Ronaldo, Messi, and Neymar growing up — and is played competitively at the national and international level.
              </p>
            </div>

            {futsalEntries.length === 0 ? (
              <div className="text-center py-20">
                <Zap size={36} className="mx-auto mb-4 opacity-30" style={{ color: 'hsl(var(--foreground))' }} />
                <p className="font-heading text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  No futsal listings yet
                </p>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Know a club or facility we should add? Let us know via the Community page.
                </p>
              </div>
            ) : filteredFutsal.length === 0 ? (
              <div className="text-center py-20">
                <p className="font-heading text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  No entries match your search
                </p>
                <button
                  onClick={() => setFutsalSearch('')}
                  className="text-sm font-semibold mt-2"
                  style={{ color }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFutsal.map((entry, i) => {
                  const isClub = entry.type === 'Club';
                  const entryColor = isClub ? color : 'hsl(var(--accent))';
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.35) }}
                      className="rounded-xl p-5 flex flex-col gap-3"
                      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ background: `${entryColor}22`, color: entryColor }}
                        >
                          <Zap size={10} />
                          {entry.type}
                        </span>
                        {entry.level && (
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {entry.level}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2 flex-1">
                        <h3
                          className="font-heading font-bold text-lg leading-tight"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          {entry.name}
                        </h3>
                        {entry.url && (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
                            style={{ color: entryColor }}
                          >
                            Visit <ExternalLink size={11} />
                          </a>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        <MapPin size={11} style={{ color: 'hsl(var(--accent))' }} />
                        <span>{entry.city}</span>
                      </div>

                      {entry.notes && (
                        <p
                          className="text-xs leading-relaxed border-t pt-3"
                          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                        >
                          {entry.notes}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}

            <p
              className="text-xs mt-10 pt-6 border-t"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Futsal listings are for informational purposes. Confirm schedules, programs, and registration directly with each club or venue.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
