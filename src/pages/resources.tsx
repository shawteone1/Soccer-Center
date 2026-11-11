import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ExternalLink, MapPin } from 'lucide-react';
import { resources } from 'virtual:content';

const siteUrl = 'https://soccercenter.org';

type Article = {
  id: string;
  tag: string;
  heading: string;
  body: string;
  linkLabel: string;
  url: string;
};

type TvLink = {
  id: string;
  label: string;
  url: string;
};

type TvRow = {
  id: string;
  competition: string;
  streaming: string;
  tv: string;
  notes: string;
  links: TvLink[];
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

type Category = {
  id: string;
  title: string;
  type: string;
  articles: Article[];
  tvRows: TvRow[];
  tvIntro: string;
  tvOutro: string;
  tvTimingTip: string;
  pubs: Pub[];
  pubsIntro?: string;
  pubsOutro?: string;
  fansOutro?: string;
};

function ArticleCard({ article }: { article: Article }) {
  return (
    <article
      className="rounded-2xl border flex flex-col p-6 transition-shadow hover:shadow-lg"
      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
    >
      <span
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {article.tag}
      </span>
      <h3
        className="text-xl font-bold text-foreground mb-3 leading-snug"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {article.heading}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
        {article.body}
      </p>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${article.linkLabel} — ${article.heading} (opens in a new tab)`}
        className="inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
      >
        {article.linkLabel}
        <ExternalLink size={13} />
      </a>
    </article>
  );
}

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
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-3">
        {pub.description}
      </p>
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
          style={{
            background: 'hsl(var(--secondary))',
            color: 'hsl(var(--secondary-foreground))',
          }}
        >
          Google Maps
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}

function TvTable({ cat }: { cat: Category }) {
  const rows = cat.tvRows as TvRow[];
  return (
    <div>
      {cat.tvIntro && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{cat.tvIntro}</p>
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
              {['Competition', 'Streaming', 'TV / selected coverage', 'What to know', 'Official links'].map(
                (h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-left px-4 py-3 text-xs font-bold tracking-wide uppercase"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
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
                    {row.links.map((lnk) => (
                      <a
                        key={lnk.id}
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold hover:opacity-75 transition"
                        style={{ color: 'hsl(var(--primary))' }}
                      >
                        {lnk.label}
                        <ExternalLink size={11} />
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cat.tvOutro && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{cat.tvOutro}</p>
      )}
      {cat.tvTimingTip && (
        <p className="text-sm text-muted-foreground leading-relaxed">{cat.tvTimingTip}</p>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  const categories = resources.categories as Category[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${siteUrl}/resources#webpage`,
    name: 'Soccer Resources — Soccer Center Colorado',
    url: `${siteUrl}/resources`,
    description: 'Helpful starting points for players, parents, coaches, and referees in Colorado — city programs, education, financial assistance, player safety, TV viewing, and in-person soccer communities.',
    isPartOf: { '@id': `${siteUrl}/#website` },
    about: { '@id': `${siteUrl}/#organization` },
  };

  return (
    <>
      <Helmet>
        <title>Soccer Resources — Soccer Center Colorado</title>
        <meta
          name="description"
          content="Helpful starting points for players, parents, coaches, and referees in Colorado — city programs, education, financial assistance, player safety, TV viewing, and in-person soccer communities."
        />
        <link rel="canonical" href={`${siteUrl}/resources`} />
        <meta property="og:title" content="Soccer Resources — Soccer Center Colorado" />
        <meta
          property="og:description"
          content="Helpful starting points for players, parents, coaches, and referees in Colorado."
        />
        <meta property="og:url" content={`${siteUrl}/resources`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/resources/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Soccer Resources — Soccer Center Colorado" />
        <meta
          name="twitter:description"
          content="Helpful starting points for players, parents, coaches, and referees in Colorado."
        />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/resources/hero`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main>
        {/* ── HERO ── */}
        <section className="relative pt-36 pb-16 overflow-hidden">
          <img
            src="/airo-assets/images/pages/resources/hero"
            alt="Soccer training field"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(to bottom, hsl(var(--background) / 0.9) 0%, hsl(var(--background) / 0.78) 60%, hsl(var(--background)) 100%)',
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
                {resources.hero.eyebrow}
              </span>
              <h1
                className="text-6xl md:text-8xl font-bold text-foreground mb-5 leading-none"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {resources.hero.headline}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                {resources.hero.subtext}
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
            <nav aria-label="Resource categories" className="flex gap-2 min-w-max">
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    background: 'hsl(var(--card))',
                  }}
                >
                  {cat.title}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* ── RESOURCE SECTIONS ── */}
        <div className="bg-background py-xxl">
          <div className="max-w-5xl mx-auto px-6 flex flex-col gap-16">
            {categories.map((cat, ci) => (
              <motion.section
                key={cat.id}
                id={cat.id}
                aria-labelledby={`heading-${cat.id}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: ci * 0.04, ease: 'easeOut' as const }}
                style={{ scrollMarginTop: '80px' }}
              >
                <h2
                  id={`heading-${cat.id}`}
                  className="text-3xl md:text-4xl font-bold text-foreground mb-6"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {cat.title}
                </h2>

                {/* TV table */}
                {cat.type === 'tv' && <TvTable cat={cat} />}

                {/* Pubs */}
                {cat.type === 'pubs' && (
                  <>
                    {cat.pubsIntro && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                        {cat.pubsIntro}
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {(cat.pubs as Pub[]).map((pub) => (
                        <PubCard key={pub.id} pub={pub} />
                      ))}
                    </div>
                    {cat.pubsOutro && (
                      <p className="text-sm text-muted-foreground leading-relaxed mt-5">
                        {cat.pubsOutro}
                      </p>
                    )}
                  </>
                )}

                {/* Fans / standard cards with optional outro */}
                {(cat.type === 'cards' || cat.type === 'fans') && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {(cat.articles as Article[]).map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))}
                    </div>
                    {cat.fansOutro && (
                      <p className="text-sm text-muted-foreground leading-relaxed mt-5">
                        {cat.fansOutro}
                      </p>
                    )}
                  </>
                )}
              </motion.section>
            ))}

            {/* Disclaimer note */}
            <p
              className="text-sm leading-relaxed border-t pt-6"
              style={{
                color: 'hsl(var(--muted-foreground))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              {resources.note}
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
              Know a Resource We're Missing?
            </h2>
            <p className="text-muted-foreground text-base mb-8 leading-relaxed">
              Help us grow this list. If you know of a great soccer resource for the Colorado
              community, we'd love to hear about it.
            </p>
            <a
              href="/#contact"
              className="inline-block rounded-full font-semibold text-base px-8 py-4 transition hover:opacity-90"
              style={{
                background: 'hsl(var(--accent))',
                color: 'hsl(var(--accent-foreground))',
              }}
            >
              Suggest a Resource
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
