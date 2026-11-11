import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ExternalLink, MapPin, Shield, Tv, Users } from 'lucide-react';
import { fanzone } from 'virtual:content';

const siteUrl = 'https://soccercenter.org';

type TvRow = {
  id: string;
  competition: string;
  streaming: string;
  tv: string;
  notes: string;
  link1Label: string;
  link1Url: string;
  link2Label: string;
  link2Url: string;
};

type Pub = {
  id: string;
  tag: string;
  name: string;
  description: string;
  address: string;
  venueUrl: string;
  mapsUrl: string;
};

type PubRegion = {
  id: string;
  label: string;
  pubs: Pub[];
};

type FanGroup = {
  id: string;
  tag: string;
  heading: string;
  body: string;
  linkLabel: string;
  url: string;
  barName?: string;
  barAddress?: string;
  barUrl?: string;
};

function PubCard({ pub }: { pub: Pub }) {
  return (
    <article
      className="rounded-2xl border flex flex-col p-6 transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <span
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {pub.tag}
      </span>
      <h3
        className="text-xl font-bold text-foreground mb-2 leading-snug"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {pub.name}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-3">{pub.description}</p>
      <p
        className="text-xs font-semibold mb-4 flex items-start gap-1.5"
        style={{ color: 'hsl(var(--foreground))' }}
      >
        <MapPin size={13} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
        {pub.address}
      </p>
      <div className="flex flex-col gap-2">
        <a
          href={pub.venueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
        >
          Venue &amp; match information
          <ExternalLink size={13} />
        </a>
        <a
          href={pub.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
          style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))' }}
        >
          Google Maps
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}

function FanGroupCard({ group }: { group: FanGroup }) {
  return (
    <article
      className="rounded-2xl border flex flex-col p-6 transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <span
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {group.tag}
      </span>
      <h3
        className="text-xl font-bold text-foreground mb-3 leading-snug"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {group.heading}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">{group.body}</p>

      {group.barName && (
        <div
          className="rounded-xl p-3 mb-4 flex flex-col gap-1"
          style={{ background: 'hsl(var(--secondary) / 0.1)', borderLeft: '3px solid hsl(var(--secondary))' }}
        >
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'hsl(var(--secondary))' }}>
            Watch here
          </span>
          <span className="text-sm font-semibold text-foreground">{group.barName}</span>
          {group.barAddress && (
            <span className="text-xs text-muted-foreground flex items-start gap-1">
              <MapPin size={11} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--secondary))' }} />
              {group.barAddress}
            </span>
          )}
          {group.barUrl && (
            <a
              href={group.barUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold inline-flex items-center gap-1 mt-0.5 hover:opacity-75 transition"
              style={{ color: 'hsl(var(--secondary))' }}
            >
              Venue info <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      <a
        href={group.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${group.linkLabel} — ${group.heading} (opens in a new tab)`}
        className="inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
      >
        {group.linkLabel}
        <ExternalLink size={13} />
      </a>
    </article>
  );
}

type PlSupportersGroup = {
  id: string;
  plTeam: string;
  name: string;
  area: string;
  description: string;
  venueLabel: string;
  venueNote: string;
  links: { label: string; url: string }[];
};

function PlSupportersCard({ group }: { group: PlSupportersGroup }) {
  return (
    <article
      className="rounded-2xl border flex flex-col p-6 transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <span
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {group.plTeam}
      </span>
      <h3
        className="text-xl font-bold text-foreground mb-1 leading-snug"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {group.name}
      </h3>
      <p
        className="text-xs font-semibold mb-3 flex items-center gap-1"
        style={{ color: 'hsl(var(--secondary))' }}
      >
        <MapPin size={11} className="shrink-0" />
        {group.area}
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">{group.description}</p>

      {(group.venueLabel || group.venueNote) && (
        <div
          className="rounded-xl p-3 mb-4 flex flex-col gap-1"
          style={{ background: 'hsl(var(--secondary) / 0.1)', borderLeft: '3px solid hsl(var(--secondary))' }}
        >
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'hsl(var(--secondary))' }}>
            Watch here
          </span>
          {group.venueLabel && (
            <span className="text-sm font-semibold text-foreground">{group.venueLabel}</span>
          )}
          {group.venueNote && (
            <span className="text-xs text-muted-foreground italic">{group.venueNote}</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {group.links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${link.label} — ${group.name} (opens in a new tab)`}
            className="inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
            style={
              i === 0
                ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }
                : { background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))' }
            }
          >
            {link.label}
            <ExternalLink size={13} />
          </a>
        ))}
      </div>
    </article>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${siteUrl}/fanzone#webpage`,
      name: 'Colorado Soccer Fan Zone — Where to Watch, Pubs & Supporter Groups',
      url: `${siteUrl}/fanzone`,
      description: 'Find soccer bars, streaming guides, and supporter groups across Colorado. Watch MLS, USL, and international soccer at venues in Denver, Colorado Springs, Boulder, Fort Collins, and the Western Slope.',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'ItemList',
      '@id': `${siteUrl}/fanzone#pub-regions`,
      name: 'Soccer Bars and Pubs in Colorado',
      description: 'Soccer-friendly bars and pubs across Colorado organized by region.',
      url: `${siteUrl}/fanzone#soccer-pubs`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Soccer Pubs — Denver Metro' },
        { '@type': 'ListItem', position: 2, name: 'Soccer Pubs — Colorado Springs' },
        { '@type': 'ListItem', position: 3, name: 'Soccer Pubs — Boulder' },
        { '@type': 'ListItem', position: 4, name: 'Soccer Pubs — Fort Collins / Northern Colorado' },
        { '@type': 'ListItem', position: 5, name: 'Soccer Pubs — Western Slope' },
      ],
    },
  ],
};

// Map pubRegion id → the region prefix used in fanGroup tags
const REGION_TAG_PREFIX: Record<string, string> = {
  'region-colorado':   'Colorado',
  'region-arizona':    'Arizona',
  'region-socal':      'Southern California',
  'region-norcal':     'Northern California',
  'region-oregon':     'Oregon',
  'region-washington': 'Washington',
  'region-nevada':     'Nevada',
};

export default function FanZonePage() {
  const tvRows = fanzone.tvRows as TvRow[];
  const pubRegions = fanzone.pubRegions as PubRegion[];
  const fanGroups = fanzone.fanGroups as FanGroup[];
  const plGroups = fanzone.plSupportersGroups as PlSupportersGroup[];
  const [activeRegion, setActiveRegion] = useState(pubRegions[0]?.id ?? '');
  const [plTeamFilter, setPlTeamFilter] = useState('');

  // Derive sorted unique PL team names for the filter
  const plTeams = Array.from(new Set(plGroups.map((g) => g.plTeam))).sort();
  const filteredPlGroups = (plTeamFilter && plTeamFilter !== '__all__') ? plGroups.filter((g) => g.plTeam === plTeamFilter) : plGroups;



  return (
    <>
      <Helmet>
        <title>Colorado Soccer Fan Zone — Where to Watch, Soccer Bars &amp; Supporter Groups</title>
        <meta
          name="description"
          content="Find soccer bars, streaming guides, and supporter groups across Colorado. Watch MLS, USL, and international soccer at venues in Denver, Colorado Springs, Boulder, Fort Collins, and the Western Slope."
        />
        <link rel="canonical" href={`${siteUrl}/fanzone`} />
        <meta property="og:title" content="Colorado Soccer Fan Zone — Where to Watch, Soccer Bars &amp; Supporter Groups" />
        <meta
          property="og:description"
          content="Find soccer bars, streaming guides, and supporter groups across Colorado. Watch MLS, USL, and international soccer at venues statewide."
        />
        <meta property="og:url" content={`${siteUrl}/fanzone`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Colorado Soccer Fan Zone — Where to Watch, Soccer Bars &amp; Supporter Groups" />
        <meta
          name="twitter:description"
          content="Find soccer bars, streaming guides, and supporter groups across Colorado."
        />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── HERO ── */}
        <section className="relative pt-36 pb-16 overflow-hidden">
          <img
            src="/airo-assets/images/pages/home/hero"
            alt="Soccer stadium atmosphere"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(to bottom, hsl(var(--background) / 0.88) 0%, hsl(var(--background) / 0.75) 60%, hsl(var(--background)) 100%)',
            }}
          />
          <div className="relative z-10 max-w-5xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' as const }}
            >
              <span
                className="inline-block text-xs font-semibold tracking-widest uppercase mb-4 px-3 py-1.5 rounded-full border"
                style={{
                  color: 'hsl(var(--accent))',
                  borderColor: 'hsl(var(--accent) / 0.4)',
                  background: 'hsl(var(--accent) / 0.1)',
                }}
              >
                {fanzone.hero.eyebrow}
              </span>
              <h1
                className="text-6xl md:text-8xl font-bold text-foreground mb-5 leading-none"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {fanzone.hero.headline}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                {fanzone.hero.subtext}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── JUMP NAV ── */}
        <div
          className="sticky top-16 md:top-20 z-30 border-b"
          style={{
            background: 'hsl(var(--background) / 0.95)',
            backdropFilter: 'blur(12px)',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <div className="max-w-5xl mx-auto px-6 py-3 overflow-x-auto">
            <nav aria-label="Fan Zone sections" className="flex gap-2 min-w-max">
              {fanzone.jumpSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    background: 'hsl(var(--card))',
                  }}
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="bg-background py-xxl">
          <div className="max-w-5xl mx-auto px-6 flex flex-col gap-16">

            {/* ── SOCCER BARS BY REGION ── */}
            <motion.section
              id="soccer-pubs"
              aria-labelledby="heading-soccer-pubs"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut' as const }}
              style={{ scrollMarginTop: '80px' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ background: 'hsl(var(--secondary) / 0.15)' }}
                >
                  <MapPin size={20} style={{ color: 'hsl(var(--secondary))' }} />
                </span>
                <h2
                  id="heading-soccer-pubs"
                  className="text-3xl md:text-4xl font-bold text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {fanzone.pubsTitle}
                </h2>
              </div>

              {fanzone.pubsIntro && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">{fanzone.pubsIntro}</p>
              )}

              {/* Region tab strip */}
              <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Regions">
                {pubRegions.map((region: PubRegion) => {
                  const isActive = activeRegion === region.id;
                  return (
                    <button
                      key={region.id}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`region-panel-${region.id}`}
                      id={`region-tab-${region.id}`}
                      onClick={() => setActiveRegion(region.id)}
                      className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                      style={{
                        background: isActive ? 'hsl(var(--secondary))' : 'hsl(var(--card))',
                        color: isActive ? 'hsl(var(--secondary-foreground))' : 'hsl(var(--foreground))',
                        borderColor: isActive ? 'hsl(var(--secondary))' : 'hsl(var(--border))',
                      }}
                    >
                      {region.label}
                    </button>
                  );
                })}
              </div>

              {/* Active region pub grid */}
              {pubRegions.map((region: PubRegion) => (
                <div
                  key={region.id}
                  id={`region-panel-${region.id}`}
                  role="tabpanel"
                  aria-labelledby={`region-tab-${region.id}`}
                  className={activeRegion === region.id ? undefined : 'hidden'}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {region.pubs.map((pub: Pub) => (
                      <PubCard key={pub.id} pub={pub} />
                    ))}
                  </div>
                </div>
              ))}

              {fanzone.pubsOutro && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-5">{fanzone.pubsOutro}</p>
              )}
            </motion.section>

            {/* ── FAN GROUPS ── */}
            <motion.section
              id="fan-groups"
              aria-labelledby="heading-fan-groups"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut' as const }}
              style={{ scrollMarginTop: '80px' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ background: 'hsl(var(--accent) / 0.15)' }}
                >
                  <Users size={20} style={{ color: 'hsl(var(--accent))' }} />
                </span>
                <h2
                  id="heading-fan-groups"
                  className="text-3xl md:text-4xl font-bold text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {fanzone.fansTitle}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Supporter group regions">
                {pubRegions.map((region: PubRegion) => {
                  const isActive = activeRegion === region.id;
                  return (
                    <button
                      key={region.id}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`fan-group-panel-${region.id}`}
                      id={`fan-group-tab-${region.id}`}
                      onClick={() => setActiveRegion(region.id)}
                      className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                      style={{
                        background: isActive ? 'hsl(var(--accent))' : 'hsl(var(--card))',
                        color: isActive ? 'hsl(var(--accent-foreground))' : 'hsl(var(--foreground))',
                        borderColor: isActive ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                      }}
                    >
                      {region.label}
                    </button>
                  );
                })}
              </div>

              {pubRegions.map((region: PubRegion) => {
                const regionGroups = fanGroups.filter((g) =>
                  g.tag.startsWith(REGION_TAG_PREFIX[region.id] ?? ''),
                );
                const isVisible = activeRegion === region.id;
                return (
                  <div
                    key={region.id}
                    id={`fan-group-panel-${region.id}`}
                    role="tabpanel"
                    aria-labelledby={`fan-group-tab-${region.id}`}
                    className={isVisible ? undefined : 'hidden'}
                  >
                    {regionGroups.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {regionGroups.map((group: FanGroup) => (
                          <FanGroupCard key={group.id} group={group} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-6">
                        No supporter groups listed for this region yet.
                      </p>
                    )}
                  </div>
                );
              })}

              {fanzone.fansOutro && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-5">{fanzone.fansOutro}</p>
              )}
            </motion.section>

            {/* ── PREMIER LEAGUE SUPPORTERS' GROUPS ── */}
            <motion.section
              id="pl-supporters"
              aria-labelledby="heading-pl-supporters"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut' as const }}
              style={{ scrollMarginTop: '80px' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ background: 'hsl(var(--primary) / 0.15)' }}
                >
                  <Shield size={20} style={{ color: 'hsl(var(--primary))' }} />
                </span>
                <h2
                  id="heading-pl-supporters"
                  className="text-3xl md:text-4xl font-bold text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {fanzone.plSupportersTitle}
                </h2>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{fanzone.plSupportersIntro}</p>

              {/* Team filter — scoped to this subsection only */}
              <div className="mb-6">
                <label htmlFor="pl-team-filter" className="sr-only">Filter by Premier League team</label>
                <select
                  id="pl-team-filter"
                  value={plTeamFilter}
                  onChange={(e) => setPlTeamFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                  style={{
                    background: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  <option value="">Choose a team</option>
                  <option value="__all__">Show all groups</option>
                  {plTeams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
                {filteredPlGroups.map((group) => (
                  <PlSupportersCard key={group.id} group={group} />
                ))}
              </div>

              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: 'hsl(var(--muted))', borderLeft: '3px solid hsl(var(--accent))' }}
              >
                <span style={{ color: 'hsl(var(--accent))' }}>ⓘ</span>
                <p className="text-sm text-muted-foreground leading-relaxed">{fanzone.plSupportersNote}</p>
              </div>
            </motion.section>

            {/* ── HOW TO WATCH ── */}
            <motion.section
              id="how-to-watch"
              aria-labelledby="heading-how-to-watch"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut' as const }}
              style={{ scrollMarginTop: '80px' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ background: 'hsl(var(--primary) / 0.15)' }}
                >
                  <Tv size={20} style={{ color: 'hsl(var(--primary))' }} />
                </span>
                <h2
                  id="heading-how-to-watch"
                  className="text-3xl md:text-4xl font-bold text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {fanzone.tvTitle}
                </h2>
              </div>

              {fanzone.tvIntro && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">{fanzone.tvIntro}</p>
              )}

              <div
                className="overflow-x-auto rounded-2xl border mb-5"
                style={{ borderColor: 'hsl(var(--border))' }}
                tabIndex={0}
                role="region"
                aria-label="U.S. soccer TV and streaming guide"
              >
                <table className="w-full text-sm border-collapse" style={{ minWidth: '800px' }}>
                  <thead>
                    <tr style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                      {['Competition', 'Streaming', 'TV / selected coverage', 'What to know', 'Official links'].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="text-left px-4 py-3 text-xs font-bold tracking-wide uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tvRows.map((row: TvRow, i: number) => (
                      <tr
                        key={row.id}
                        style={{
                          background: i % 2 === 0 ? 'hsl(var(--card))' : 'hsl(var(--background))',
                          borderTop: '1px solid hsl(var(--border))',
                        }}
                      >
                        <th
                          scope="row"
                          className="text-left px-4 py-3 font-semibold text-foreground align-top"
                          style={{ minWidth: '160px' }}
                        >
                          {row.competition}
                        </th>
                        <td className="px-4 py-3 text-muted-foreground align-top">{row.streaming}</td>
                        <td className="px-4 py-3 text-muted-foreground align-top">{row.tv}</td>
                        <td className="px-4 py-3 text-muted-foreground align-top">{row.notes}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1.5">
                            {row.link1Label && (
                              <a
                                href={row.link1Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold hover:opacity-75 transition"
                                style={{ color: 'hsl(var(--primary))' }}
                              >
                                {row.link1Label}
                                <ExternalLink size={11} />
                              </a>
                            )}
                            {row.link2Label && (
                              <a
                                href={row.link2Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold hover:opacity-75 transition"
                                style={{ color: 'hsl(var(--primary))' }}
                              >
                                {row.link2Label}
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {fanzone.tvOutro && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{fanzone.tvOutro}</p>
              )}
              {fanzone.tvTimingTip && (
                <p className="text-sm text-muted-foreground leading-relaxed">{fanzone.tvTimingTip}</p>
              )}
            </motion.section>

            {/* Disclaimer */}
            <p
              className="text-sm leading-relaxed border-t pt-6"
              style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
            >
              {fanzone.note}
            </p>
          </div>
        </div>

        {/* ── CTA STRIP ── */}
        <section style={{ background: 'hsl(var(--card))' }} className="py-xl">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Know a Pub or Fan Group We're Missing?
            </h2>
            <p className="text-muted-foreground text-base mb-8 leading-relaxed">
              Help us grow the Fan Zone. If you know of a great soccer pub or supporter group in
              Colorado, we'd love to hear about it.
            </p>
            <a
              href="/#contact"
              className="inline-block rounded-full font-semibold text-base px-8 py-4 transition hover:opacity-90"
              style={{ background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}
            >
              Suggest a Venue or Group
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
