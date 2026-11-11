import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { home } from 'virtual:content';
import ContactForm from '@/components/ContactForm';
import { useState, type FormEvent, type ElementType } from 'react';
import { ChevronDown, MapPin, Users, Tv, BookOpen, ArrowRight } from 'lucide-react';
import ArenaSection from '@/components/ArenaSection';


const siteUrl = 'https://soccercenter.org';

function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }
  return submitted ? (
    <p className="text-primary font-semibold text-lg">You're subscribed — check your inbox!</p>
  ) : (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <label htmlFor="nl-email" className="sr-only">
        Email
      </label>
      <input
        id="nl-email"
        name="email"
        type="email"
        required
        placeholder="Enter your email"
        className="flex-1 rounded-full px-5 py-3 bg-background/80 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
      />
      <button
        type="submit"
        className="rounded-full bg-background text-foreground font-semibold px-6 py-3 text-sm hover:bg-background/80 transition whitespace-nowrap"
      >
        Sign up
      </button>
    </form>
  );
}

const REGIONS = [
  { id: 'colorado',         label: 'Colorado',           abbr: 'CO', colorToken: 'primary',   slug: 'colorado' },
  { id: 'arizona',          label: 'Arizona',            abbr: 'AZ', colorToken: 'accent',    slug: 'arizona' },
  { id: 'california-south', label: 'Southern California',abbr: 'CA-S', colorToken: 'secondary', slug: 'california-south' },
  { id: 'california-north', label: 'Northern California',abbr: 'CA-N', colorToken: 'secondary', slug: 'california-north' },
  { id: 'oregon',           label: 'Oregon',             abbr: 'OR', colorToken: 'primary',   slug: 'oregon' },
  { id: 'washington',       label: 'Washington',         abbr: 'WA', colorToken: 'secondary', slug: 'washington' },
  { id: 'nevada',           label: 'Nevada',             abbr: 'NV', colorToken: 'accent',    slug: 'nevada' },
];

const COLOR_MAP: Record<string, string> = {
  primary:   'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  accent:    'hsl(var(--accent))',
};

const SECTION_OPTIONS: {
  label: string;
  icon: ElementType;
  path: (slug: string) => string;
  description: (regionLabel: string) => string;
}[] = [
  {
    label: 'Directory',
    icon: MapPin,
    path: (slug) => `/soccer-directory/${slug}`,
    description: (r) => `Clubs, leagues & facilities in ${r}`,
  },
  {
    label: 'Fan Zone',
    icon: Tv,
    path: (slug) => `/fanzone`,
    description: (r) => `Where to watch & supporter groups${r === 'Colorado' ? ' in CO' : ''}`,
  },
  {
    label: 'Teams',
    icon: Users,
    path: () => `/teams`,
    description: (r) => r === 'Colorado' ? 'Pro clubs & college programs in CO' : 'Colorado pro & college programs',
  },
  {
    label: 'Community',
    icon: BookOpen,
    path: () => `/community`,
    description: (r) => r === 'Colorado' ? 'Resources, groups & events in CO' : 'Colorado soccer community resources',
  },
];

function RegionSelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<typeof REGIONS[0] | null>(null);

  return (
    <section id="region-selector" className="py-xxl bg-background">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' as const }}
          className="text-center mb-10"
        >
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Local information. A wider world of soccer.
          </span>
          <h2
            className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Choose Your Region
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            Start where you live. Explore where you play.
          </p>
        </motion.div>

        {/* Dropdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' as const }}
          className="relative max-w-sm mx-auto mb-10"
        >
          <button
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="w-full flex items-center justify-between gap-3 rounded-2xl px-6 py-4 text-base font-semibold transition-all"
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              color: selected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            }}
          >
            <span className="flex items-center gap-2.5">
              <MapPin size={18} style={{ color: 'hsl(var(--primary))' }} />
              {selected ? (
                <span>
                  {selected.label}
                  <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {selected.abbr}
                  </span>
                </span>
              ) : (
                'Choose a region…'
              )}
            </span>
            <ChevronDown
              size={18}
              className="shrink-0 transition-transform duration-200"
              style={{
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          </button>

          <AnimatePresence>
            {open && (
              <motion.ul
                role="listbox"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="absolute z-50 mt-2 w-full rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                {REGIONS.map((region) => {
                  const color = COLOR_MAP[region.colorToken];
                  return (
                    <li key={region.id} role="option" aria-selected={selected?.id === region.id}>
                      <button
                        onClick={() => { setSelected(region); setOpen(false); }}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted"
                        style={{ borderBottom: '1px solid hsl(var(--border))' }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                          {region.label}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {region.abbr}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Section options — appear after region is chosen */}
        <AnimatePresence>
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.35, ease: 'easeOut' as const }}
            >
              <p
                className="text-center text-sm font-semibold mb-6"
                style={{ color: COLOR_MAP[selected.colorToken] }}
              >
                {selected.label} — where do you want to go?
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {SECTION_OPTIONS.map((opt, i) => {
                  const Icon = opt.icon;
                  const color = COLOR_MAP[selected.colorToken];
                  return (
                    <motion.div
                      key={opt.label}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                    >
                      <Link
                        to={opt.path(selected.slug)}
                        className="group flex flex-col items-center text-center rounded-2xl p-6 h-full transition-all hover:scale-[1.03] active:scale-[0.98]"
                        style={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                        }}
                      >
                        <span
                          className="flex items-center justify-center w-12 h-12 rounded-xl mb-4 transition-colors"
                          style={{ background: `${color}22` }}
                        >
                          <Icon size={22} style={{ color }} />
                        </span>
                        <span
                          className="font-heading font-bold text-lg mb-1"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          {opt.label}
                        </span>
                        <span
                          className="text-xs leading-relaxed flex-1"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          {opt.description(selected.label)}
                        </span>
                        <span
                          className="flex items-center gap-1 text-xs font-semibold mt-4 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color }}
                        >
                          Go <ArrowRight size={12} />
                        </span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'SportsOrganization'],
        '@id': `${siteUrl}/#organization`,
        name: 'Soccer Center',
        url: siteUrl,
        logo: `${siteUrl}/airo-assets/images/logo/horizontal`,
        description: 'The region\'s hub for soccer clubs, youth leagues, training programs, fan culture, and community.',
        areaServed: {
          '@type': 'Country',
          name: 'United States',
        },
        sport: 'Soccer',
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'Soccer Center',
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/soccer-directory?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${siteUrl}/#webpage`,
        url: siteUrl,
        name: 'Soccer Center — The Hub for Soccer',
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': `${siteUrl}/#organization` },
        datePublished: '2024-01-01',
        dateModified: '2026-10-04',
      },
    ],
  };

  return (
    <>
      <Helmet>
        <title>Soccer Center — Clubs, Leagues, Training &amp; Community</title>
        <meta
          name="description"
          content="The region's most complete soccer resource. Find youth clubs, adult leagues, training programs, facilities, and fan communities across the West."
        />
        <link rel="canonical" href={siteUrl} />
        <meta property="og:title" content="Soccer Center — Clubs, Leagues, Training &amp; Community" />
        <meta
          property="og:description"
          content="The region's most complete soccer resource. Find youth clubs, adult leagues, training programs, facilities, and fan communities."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Soccer Center — Clubs, Leagues, Training &amp; Community" />
        <meta
          name="twitter:description"
          content="The region's most complete soccer resource. Find youth clubs, adult leagues, training programs, and fan communities."
        />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <link rel="apple-touch-icon" href="/assets/other/ecb11d77584d0c50352134852b00aa91.svg" sizes="180x180" />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── HERO ── */}
        <section className="relative min-h-screen flex items-end overflow-hidden">
          <img
            src="/airo-assets/images/pages/home/hero"
            alt="Soccer field at golden hour"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--background) / 0.92) 0%, hsl(var(--background) / 0.6) 50%, transparent 100%)',
            }}
          />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, hsl(var(--background) / 0.85) 0%, transparent 50%)' }}
          />

          <div className="relative z-10 max-w-7xl mx-auto px-6 pb-24 pt-32 w-full">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' as const }}
              className="max-w-2xl"
            >
              <span
                className="inline-block text-xs font-semibold tracking-widest uppercase mb-5 px-3 py-1.5 rounded-full border"
                style={{
                  color: 'hsl(var(--accent))',
                  borderColor: 'hsl(var(--accent) / 0.4)',
                  background: 'hsl(var(--accent) / 0.1)',
                }}
              >
                {home.hero.eyebrow}
              </span>
              <h1
                className="text-6xl md:text-8xl font-bold leading-none tracking-tight text-foreground mb-6"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {home.hero.headline}
              </h1>
              <p className="text-lg md:text-xl text-foreground/75 mb-10 max-w-lg leading-relaxed">
                {home.hero.subtext}
              </p>
              <Link
                to="/#contact"
                className="inline-block rounded-full font-semibold text-base px-8 py-4 transition hover:opacity-90 hover:scale-105"
                style={{
                  background: 'hsl(var(--accent))',
                  color: 'hsl(var(--accent-foreground))',
                }}
              >
                {home.hero.cta}
              </Link>
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-50"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' as const }}
          >
            <div className="w-px h-10 bg-foreground/40" />
          </motion.div>
        </section>

        {/* ── CHOOSE YOUR ARENA ── */}
        <ArenaSection />

        {/* ── CHOOSE YOUR REGION ── */}
        <RegionSelector />


        {/* ── MISSION ── */}
        <section className="py-xxl bg-card">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              {/* Logo image — has embedded text, display as-is */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' as const }}
                className="flex justify-center"
              >
                <div
                  className="rounded-2xl overflow-hidden border p-8 flex items-center justify-center bg-white"
                  style={{
                    borderColor: 'hsl(var(--primary) / 0.3)',
                    boxShadow: '0 0 40px hsl(var(--primary) / 0.08)',
                  }}
                >
                  <img
                    src="/airo-assets/images/logo/horizontal?v=2"
                    alt="Soccer Center — Find the Game."
                    className="w-full max-w-xs h-auto object-contain"
                    loading="lazy"
                    width={592}
                    height={296}
                  />
                </div>
              </motion.div>

              {/* Mission text */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' as const }}
              >
                <span
                  className="text-xs font-semibold tracking-widest uppercase mb-4 block"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  {home.mission.label}
                </span>
                <h2
                  className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.mission.headline}
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {home.mission.body}
                </p>
                <div
                  className="mt-8 h-1 w-16 rounded-full"
                  style={{ background: 'hsl(var(--primary))' }}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── WELCOME / ABOUT ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              {/* Text block */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' as const }}
              >
                <h2
                  className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.welcome.headline}
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                  {home.welcome.body}
                </p>
                <a
                  href="#"
                  className="inline-block rounded-full border font-semibold text-base px-8 py-3.5 transition hover:bg-foreground hover:text-background"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {home.welcome.cta}
                </a>
              </motion.div>

              {/* Action photo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' as const }}
                className="relative"
              >
                <div className="rounded-2xl overflow-hidden aspect-[4/3]">
                  <img
                    src="/airo-assets/images/pages/home/welcome-action"
                    alt="Soccer players celebrating"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

              </motion.div>
            </div>
          </div>
        </section>

        {/* ── ABOUT / FOUNDER MESSAGE ── */}
        <section id="about" className="py-xxl bg-card">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' as const }}
              >
                {/* Eyebrow */}
                <span
                  className="text-xs font-semibold tracking-widest uppercase mb-5 block"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  {home.about.eyebrow}
                </span>

                {/* Site title */}
                <h2
                  className="text-4xl md:text-5xl font-bold text-foreground mb-8 leading-tight"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.about.siteTitle}
                </h2>

                {/* Divider */}
                <div
                  className="h-1 w-16 rounded-full mb-10"
                  style={{ background: 'hsl(var(--primary))' }}
                />

                {/* Body paragraphs */}
                <div className="flex flex-col gap-5 mb-10">
                  {home.about.paragraphs.map((p) => (
                    <p key={p.id} className="text-muted-foreground text-lg leading-relaxed">
                      <span>{p.text}</span>
                    </p>
                  ))}
                </div>

                {/* Signature */}
                <div
                  className="border-l-4 pl-5 mb-10"
                  style={{ borderColor: 'hsl(var(--primary))' }}
                >
                  <p
                    className="text-foreground text-xl font-bold leading-snug"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    <span>{home.about.signatureName}</span>
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    <span>{home.about.signatureTitle}</span>
                  </p>
                </div>

                {/* Region CTA */}
                <a
                  href="#region-selector"
                  className="inline-flex items-center gap-2 rounded-full font-semibold text-base px-8 py-3.5 transition"
                  style={{
                    background: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.opacity = '1';
                  }}
                >
                  {home.about.regionCta}
                </a>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section id="contact" className="py-xxl bg-card">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' as const }}
                className="text-center mb-12"
              >
                <span
                  className="text-xs font-semibold tracking-widest uppercase mb-4 block"
                  style={{ color: 'hsl(var(--accent))' }}
                >
                  Get in Touch
                </span>
                <h2
                  className="text-4xl md:text-5xl font-bold text-foreground mb-5"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.contact.headline}
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed">
                  {home.contact.subheading}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' as const }}
                className="rounded-2xl border p-8 md:p-10"
                style={{
                  background: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <ContactForm />
                <p className="text-xs text-muted-foreground mt-5 text-center">
                  {home.contact.recaptchaNote}
                </p>
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Or email us directly at{' '}
                  <a
                    href="mailto:players@soccercenter.org"
                    className="font-medium hover:text-primary transition-colors"
                    style={{ color: 'hsl(var(--primary))' }}
                  >
                    players@soccercenter.org
                  </a>
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── NEWSLETTER ── */}
        <section
          className="py-xl"
          style={{ background: 'hsl(var(--accent))' }}
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <h2
                  className="text-4xl md:text-5xl font-bold mb-2"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    color: 'hsl(var(--accent-foreground))',
                  }}
                >
                  {home.newsletter.headline}
                </h2>
                <p style={{ color: 'hsl(var(--accent-foreground) / 0.85)' }} className="text-base">
                  {home.newsletter.body}
                </p>
              </div>
              <div className="w-full md:w-auto">
                <NewsletterForm />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
