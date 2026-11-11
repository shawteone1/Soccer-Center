import ExploreCompareEntry from '@/components/intelligence/ExploreCompareEntry';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { MapPin, ArrowRight } from 'lucide-react';
import { directory_regions } from 'virtual:content';
import { soccer_directory } from 'virtual:content';
import { ContentListContext } from '@airo/content';

const siteUrl = 'https://soccercenter.org';
const pageUrl = `${siteUrl}/soccer-directory`;
const title = 'Soccer Directory — Seven Regions. One Love of the Game.';
const description =
  'Find soccer clubs, leagues, and facilities across Colorado, Arizona, California, Nevada, Washington, and Oregon. Browse freely — no account needed.';
const ogImage = `${siteUrl}/airo-assets/images/pages/home/hero`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SearchResultsPage',
  '@id': `${pageUrl}#webpage`,
  name: title,
  url: pageUrl,
  description,
  isPartOf: { '@id': `${siteUrl}/#website` },
  about: { '@id': `${siteUrl}/#organization` },
};

const COLOR_MAP: Record<string, string> = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  accent: 'hsl(var(--accent))',
};

export default function SoccerDirectoryPage() {
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
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── HERO ── */}
        <section
          className="relative pt-32 pb-20 overflow-hidden border-b"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <img
            src="/airo-assets/images/pages/home/hero"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 pointer-events-none directory-hero-overlay" />

          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: 'hsl(var(--primary))' }}
            >
              <span>{soccer_directory.eyebrow}</span>
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="font-heading text-5xl sm:text-6xl md:text-7xl font-bold text-white mb-4 leading-tight"
            >
              <span>{soccer_directory.headline}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="text-xl mb-6 directory-hero-subtitle"
            >
              <span>Seven Regions. One Love of the Game.</span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-sm"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              Your game. Your community. Find clubs, fields, local teams and people to watch with.
            </motion.p>
          </div>
        </section>

        {/* ── PLAY · CONNECT · SUPPORT strip ── */}
        <div
          className="border-b py-3"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        >
          <p
            className="text-center text-xs font-bold tracking-[0.3em] uppercase"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            ⚽ Play · Connect · Support
          </p>
        </div>

        <ExploreCompareEntry />

        {/* ── REGION CARDS ── */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center text-sm font-semibold uppercase tracking-widest mb-10"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Choose Your Soccer Center
          </motion.p>

          <ContentListContext field="directory_regions">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {directory_regions.map((region, i) => {
                const color = COLOR_MAP[region.colorToken] ?? 'hsl(var(--primary))';
                return (
                  <motion.div
                    key={region.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.07 }}
                  >
                    <Link
                      to={`/soccer-directory/${region.slug}`}
                      className="group flex flex-col rounded-2xl p-6 h-full transition-all hover:scale-[1.02] active:scale-[0.99]"
                      style={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between mb-4">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                          style={{ background: `${color}22`, color }}
                        >
                          <MapPin size={11} />
                          {region.abbr}
                        </span>
                        <span
                          className="font-heading text-3xl font-bold tabular-nums"
                          style={{ color }}
                        >
                          {region.listingCount}
                        </span>
                      </div>

                      {/* Name */}
                      <h2
                        className="font-heading text-2xl font-bold leading-tight mb-2"
                        style={{ color: 'hsl(var(--foreground))' }}
                      >
                        {region.label}
                      </h2>

                      {/* Tagline */}
                      <p
                        className="text-sm leading-relaxed flex-1 mb-5"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {region.tagline}
                      </p>

                      {/* Sub-regions */}
                      <div className="flex flex-wrap gap-1.5 mb-5">
                        {region.subRegions.map((sub) => (
                          <span
                            key={sub}
                            className="rounded-full px-2.5 py-0.5 text-xs"
                            style={{
                              background: 'hsl(var(--muted))',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {sub}
                          </span>
                        ))}
                      </div>

                      {/* CTA row */}
                      <div
                        className="flex items-center justify-between pt-4 border-t"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {region.listingCount} club / league listings
                        </span>
                        <span
                          className="flex items-center gap-1 text-xs font-semibold transition-all group-hover:gap-2"
                          style={{ color }}
                        >
                          Explore <ArrowRight size={13} />
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </ContentListContext>
        </section>

        {/* ── SUB-DIRECTORY LISTS ── */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center text-sm font-semibold uppercase tracking-widest mb-10"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Explore the Directory
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* For the Player */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
              className="rounded-2xl border p-6 flex flex-col gap-4"
              style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-lg"
                  style={{ background: 'hsl(var(--primary) / 0.15)' }}
                >
                  ⚽
                </span>
                <h2
                  className="font-heading text-2xl font-bold"
                  style={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-heading)' }}
                >
                  For the Player
                </h2>
              </div>

              {[
                { label: 'Directory', to: '/soccer-directory', desc: 'Clubs, leagues & facilities by region' },
                { label: 'Youth Tryouts', to: '/tryouts', desc: 'Upcoming tryout events near you' },
                { label: 'Community Resources', to: '/community', desc: 'Coaching, parks, financial assistance & more' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center justify-between rounded-xl px-4 py-3 transition-all hover:scale-[1.01]"
                  style={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                >
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      {item.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {item.desc}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 transition-transform group-hover:translate-x-1"
                    style={{ color: 'hsl(var(--primary))' }}
                  />
                </Link>
              ))}
            </motion.div>

            {/* For the Fan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="rounded-2xl border p-6 flex flex-col gap-4"
              style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-lg"
                  style={{ background: 'hsl(var(--accent) / 0.15)' }}
                >
                  🏟️
                </span>
                <h2
                  className="font-heading text-2xl font-bold"
                  style={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-heading)' }}
                >
                  For the Fan
                </h2>
              </div>

              {[
                { label: 'Teams', to: '/teams', desc: 'Pro & college teams across 7 regions' },
                { label: 'Fan Zone', to: '/fanzone', desc: 'Soccer bars, supporter groups & how to watch' },
                { label: 'Highlights', to: '/fanzone/highlights', desc: 'Latest clips from 21 club channels' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center justify-between rounded-xl px-4 py-3 transition-all hover:scale-[1.01]"
                  style={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                >
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      {item.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {item.desc}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 transition-transform group-hover:translate-x-1"
                    style={{ color: 'hsl(var(--accent))' }}
                  />
                </Link>
              ))}
            </motion.div>

          </div>
        </section>

        {/* ── FOOTER NOTE ── */}
        <div
          className="border-t py-8 text-center px-6"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
            The Soccer Center
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Find a team. Find your people. Find your game. Browse freely — no account needed.
          </p>
          <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Starting coverage varies by region. Listings link to official sources — confirm programs, access and dates with the organizer.
          </p>
        </div>
      </main>
    </>
  );
}
