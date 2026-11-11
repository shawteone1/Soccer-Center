import { useRef, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ExternalLink, ShoppingBag, Building2, Construction } from 'lucide-react';
import { community } from 'virtual:content';
import InclusiveSoccerSection, { type InclusiveSoccerData } from '@/components/InclusiveSoccerSection';

const siteUrl = 'https://soccercenter.org';

type Resource = {
  id: string;
  tag: string;
  name: string;
  description: string;
  linkLabel: string;
  url: string;
};

type Category = {
  id: string;
  label: string;
  resources: Resource[];
};

type Region = {
  id: string;
  label: string;
  categories: Category[];
};

const REGION_ID_TO_SLUG: Record<string, string> = {
  'region-colorado':  'colorado',
  'region-arizona':   'arizona',
  'region-socal':     'cal-south',
  'region-norcal':    'cal-north',
  'region-oregon':    'oregon',
  'region-washington':'washington',
  'region-nevada':    'nevada',
};

const ACCENT_COLORS: string[] = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  'hsl(var(--primary))',
];

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <article
      className="rounded-2xl border flex flex-col transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="p-6 flex flex-col flex-1">
        <span
          className="text-xs font-bold tracking-widest uppercase mb-3 block"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {resource.tag}
        </span>
        <h3
          className="text-xl font-bold text-foreground mb-3 leading-snug"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {resource.name}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
          {resource.description}
        </p>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${resource.linkLabel} — ${resource.name} (opens in a new tab)`}
          className="inline-flex items-center gap-1.5 self-start text-sm font-bold rounded-lg px-4 py-2.5 transition hover:opacity-85"
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
          }}
        >
          {resource.linkLabel}
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}

export default function CommunityPage() {
  const regions = community.regions as Region[];
  const inclusiveData = (community as { inclusiveSoccer?: InclusiveSoccerData }).inclusiveSoccer;
  const [activeRegion, setActiveRegion] = useState(regions[0]?.id ?? '');
  const jumpNavRef = useRef<HTMLDivElement>(null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${siteUrl}/community#webpage`,
    name: 'Soccer Community Resources — Clubs, Coaching & Player Support',
    url: `${siteUrl}/community`,
    description:
      'State associations, city programs, coaching education, and financial assistance for the soccer community across Colorado, Arizona, California, Oregon, Washington, and Nevada.',
    isPartOf: { '@id': `${siteUrl}/#website` },
    about: { '@id': `${siteUrl}/#organization` },
  };

  return (
    <>
      <Helmet>
        <title>Soccer Community Resources — Clubs, Coaching &amp; Player Support</title>
        <meta
          name="description"
          content="State associations, city programs, coaching education, and financial assistance for the soccer community across Colorado, Arizona, California, Oregon, Washington, and Nevada."
        />
        <link rel="canonical" href={`${siteUrl}/community`} />
        <meta property="og:title" content="Soccer Community Resources — Clubs, Coaching &amp; Player Support" />
        <meta
          property="og:description"
          content="State associations, city programs, coaching education, and financial assistance for players, parents, and coaches across the West."
        />
        <meta property="og:url" content={`${siteUrl}/community`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/resources/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Soccer Community Resources — Clubs, Coaching &amp; Player Support" />
        <meta name="twitter:description" content="State associations, city programs, coaching education, and financial assistance for players, parents, and coaches across the West." />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/resources/hero`} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* ── HERO ── */}
        <section
          className="pt-32 pb-12 border-b"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' as const }}
            >
              <span
                className="text-xs font-bold tracking-widest uppercase mb-3 block"
                style={{ color: 'hsl(var(--primary))' }}
              >
                {community.eyebrow}
              </span>
              <h1
                className="text-6xl md:text-8xl font-bold text-foreground leading-none mb-4"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {community.headline}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                {community.body}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── REGION TABS ── */}
        <div
          className="sticky top-16 md:top-20 z-30 border-b"
          style={{
            background: 'hsl(var(--background) / 0.97)',
            backdropFilter: 'blur(12px)',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <div className="max-w-6xl mx-auto px-6">
            <nav aria-label="Select region" className="flex gap-1 overflow-x-auto py-3">
              {regions.map((region: Region) => {
                const isActive = activeRegion === region.id;
                return (
                  <button
                    key={region.id}
                    id={`region-tab-${region.id}`}
                    onClick={() => setActiveRegion(region.id)}
                    aria-pressed={isActive}
                    className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all shrink-0"
                    style={
                      isActive
                        ? {
                            background: 'hsl(var(--primary))',
                            color: 'hsl(var(--primary-foreground))',
                          }
                        : {
                            background: 'hsl(var(--card))',
                            color: 'hsl(var(--muted-foreground))',
                            border: '1px solid hsl(var(--border))',
                          }
                    }
                  >
                    {region.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* ── REGION CONTENT ── */}
        {regions.map((region: Region) => (
          <div key={region.id} hidden={activeRegion !== region.id} aria-labelledby={`region-tab-${region.id}`}>
            {/* ── CATEGORY JUMP NAV ── */}
            <div
              ref={activeRegion === region.id ? jumpNavRef : undefined}
              className="border-b"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="max-w-6xl mx-auto px-6 py-3">
                <nav aria-label={`${region.label} resource categories`} className="flex gap-2 overflow-x-auto">
                  {region.categories.map((cat: Category, i: number) => (
                    <a
                      key={cat.id}
                      href={`#${cat.id}`}
                      className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors shrink-0 hover:opacity-80"
                      style={{
                        background: 'hsl(var(--card))',
                        color: ACCENT_COLORS[i % ACCENT_COLORS.length],
                        border: `1px solid ${ACCENT_COLORS[i % ACCENT_COLORS.length]}`,
                      }}
                    >
                      {cat.label}
                    </a>
                  ))}
                  {inclusiveData && (
                    <a
                      href="#inclusive-soccer"
                      className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors shrink-0 hover:opacity-80"
                      style={{
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--primary))',
                        border: '1px solid hsl(var(--primary))',
                      }}
                    >
                      Inclusive Soccer
                    </a>
                  )}
                </nav>
              </div>
            </div>

            {/* ── CATEGORY SECTIONS ── */}
            <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-16">
              {region.categories.map((cat: Category, i: number) => (
                <motion.section
                  key={cat.id}
                  id={cat.id}
                  aria-labelledby={`heading-${cat.id}`}
                  style={{ scrollMarginTop: '160px' }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.45, ease: 'easeOut' as const }}
                >
                  <div
                    className="flex items-center gap-4 mb-8 pb-4 border-b"
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    <div
                      className="w-1 rounded-full self-stretch shrink-0"
                      style={{ background: ACCENT_COLORS[i % ACCENT_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <h2
                      id={`heading-${cat.id}`}
                      className="text-3xl md:text-4xl font-bold text-foreground"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {cat.label}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {cat.resources.map((resource: Resource) => (
                      <ResourceCard key={resource.id} resource={resource} />
                    ))}
                  </div>
                </motion.section>
              ))}

              <p
                className="text-xs text-muted-foreground pt-6 border-t"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                {community.datasetNote}
              </p>

              {inclusiveData && (
                <InclusiveSoccerSection
                  data={inclusiveData}
                  regionSlug={REGION_ID_TO_SLUG[region.id] ?? region.id}
                />
              )}
            </div>
          </div>
        ))}

        {/* ── GET IN TOUCH ── */}
        <motion.section
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
          className="border-t"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
            <div
              className="rounded-3xl p-10 md:p-14 flex flex-col md:flex-row md:items-center gap-10"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-bold tracking-widest uppercase mb-3"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Help us grow
                </p>
                <h2
                  className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  We'd like to hear from you
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed max-w-lg">
                  Know a club, facility, pub, or supporters group we should add? Soccer Center is built by the community, for the community. If something's missing, let us know and we'll get it listed.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    { label: 'A club', color: 'hsl(var(--primary))' },
                    { label: 'A facility', color: 'hsl(var(--secondary))' },
                    { label: 'A pub', color: 'hsl(var(--accent))' },
                    { label: 'A supporters group', color: 'hsl(var(--primary))' },
                  ].map(({ label, color }) => (
                    <span
                      key={label}
                      className="rounded-full px-4 py-1.5 text-sm font-semibold"
                      style={{
                        background: 'hsl(var(--background))',
                        color,
                        border: `1px solid ${color}`,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-start md:items-center gap-4">
                <a
                  href="mailto:hello@soccercenter.org"
                  className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold transition hover:opacity-90 active:scale-95"
                  style={{
                    background: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                  }}
                >
                  Get in touch
                </a>
                <p className="text-xs text-muted-foreground text-center">
                  hello@soccercenter.org
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Vendors ─────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="py-16 md:py-20"
          aria-labelledby="vendors-heading"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            {/* Section header */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2
                id="vendors-heading"
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Vendors
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <Construction size={11} />
                Under construction
              </span>
            </div>
            <p className="text-muted-foreground text-base mb-10 max-w-2xl">
              Trusted gear and training partners for Colorado soccer players and families. Active links coming soon.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Gear */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingBag size={16} style={{ color: 'hsl(var(--primary))' }} />
                  <h3
                    className="text-sm font-bold uppercase tracking-widest"
                    style={{ color: 'hsl(var(--primary))' }}
                  >
                    Gear
                  </h3>
                </div>
                <ul className="space-y-2">
                  {[
                    'Soccer.com Team Store',
                    'Nike Team Store',
                    'Adidas Team Store',
                    'Capelli Team Store',
                    'New Balance Soccer',
                    'Mizuno Soccer',
                    'Reusch',
                    'Uhlsport',
                    'JustKeepers.com',
                  ].map((name) => (
                    <li
                      key={name}
                      className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-foreground"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: 'hsl(var(--primary) / 0.4)' }}
                      />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Facilities / Training */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={16} style={{ color: 'hsl(var(--secondary))' }} />
                  <h3
                    className="text-sm font-bold uppercase tracking-widest"
                    style={{ color: 'hsl(var(--secondary))' }}
                  >
                    Facilities &amp; Training
                  </h3>
                </div>
                <ul className="space-y-2">
                  {[
                    'TOCA Soccer',
                    'Soccer IQ',
                    'Sogility',
                  ].map((name) => (
                    <li
                      key={name}
                      className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-foreground"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: 'hsl(var(--secondary) / 0.4)' }}
                      />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </>
  );
}
