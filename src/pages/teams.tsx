import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { teams } from 'virtual:content';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
} as const;

const TIER_COLORS: Record<string, string> = {
  MLS: 'var(--tag-green)',
  NWSL: 'var(--tag-amber)',
  'USL Championship': 'var(--tag-teal)',
  'USL Super League': 'var(--tag-amber)',
  'USL League One': 'var(--tag-teal)',
  Professional: 'var(--tag-green)',
};

const DIV_COLORS: Record<string, string> = {
  'NCAA Division I': 'var(--tag-green)',
  'NCAA Division II': 'var(--tag-teal)',
  'NCAA Division III': 'var(--tag-amber)',
};

const REGION_COLORS: Record<string, string> = {
  colorado: '#22c55e',
  arizona: '#f59e0b',
  socal: '#3b82f6',
  norcal: '#8b5cf6',
  oregon: '#22c5b0',
  washington: '#06b6d4',
  nevada: '#ef4444',
};

interface ProTeam {
  id: string;
  tier: string;
  name: string;
  location: string;
  venue: string;
  description: string;
  linkLabel: string;
  url: string;
}

interface CollegeTeam {
  id: string;
  division: string;
  conference: string;
  name: string;
  school: string;
  location: string;
  description: string;
  linkLabel: string;
  url: string;
}

interface Region {
  id: string;
  name: string;
  proTeams: ProTeam[];
  collegeTeams: CollegeTeam[];
}

function ProTeamCard({ team }: { team: ProTeam }) {
  const tagColor = TIER_COLORS[team.tier] ?? 'var(--tag-teal)';
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3"
    >
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full self-start"
        style={{ background: tagColor, color: 'hsl(var(--background))' }}
      >
        {team.tier}
      </span>
      <div>
        <h4 className="font-heading text-lg font-bold text-foreground leading-tight">{team.name}</h4>
        <p className="text-sm text-muted-foreground mt-0.5">
          {team.location}{team.venue ? ` · ${team.venue}` : ''}
        </p>
      </div>
      <p className="text-sm text-muted-foreground flex-1">{team.description}</p>
      <a
        href={team.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mt-auto"
      >
        <span>{team.linkLabel}</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </motion.div>
  );
}

function CollegeTeamCard({ team }: { team: CollegeTeam }) {
  const divColor = DIV_COLORS[team.division] ?? 'var(--tag-teal)';
  const divShort = team.division.replace('NCAA Division I', 'D1').replace('NCAA Division II', 'D2').replace('NCAA Division III', 'D3');
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: divColor, color: 'hsl(var(--background))' }}
        >
          {divShort}
        </span>
        <span className="text-xs text-muted-foreground font-medium">{team.conference}</span>
      </div>
      <div>
        <h4 className="font-heading text-lg font-bold text-foreground leading-tight">{team.name}</h4>
        <p className="text-sm text-muted-foreground mt-0.5">{team.school} · {team.location}</p>
      </div>
      <p className="text-sm text-muted-foreground flex-1">{team.description}</p>
      <a
        href={team.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mt-auto"
      >
        <span>{team.linkLabel}</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </motion.div>
  );
}

function RegionSection({ region }: { region: Region }) {
  const [proOpen, setProOpen] = useState(true);
  const [collegeOpen, setCollegeOpen] = useState(true);
  const accentColor = REGION_COLORS[region.id] ?? 'var(--tag-teal)';

  return (
    <section id={`region-${region.id}`} className="py-xl border-b border-border last:border-0">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        {/* Region header */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-1 h-8 rounded-full"
            style={{ background: accentColor }}
          />
          <h2 className="font-heading text-3xl font-bold text-foreground">{region.name}</h2>
        </div>

        {/* Professional Teams */}
        <div className="mb-8">
          <button
            onClick={() => setProOpen((v) => !v)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h3 className="font-heading text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {teams.proTitle}
            </h3>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${proOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {proOpen && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-base"
            >
              {region.proTeams.map((team) => (
                <ProTeamCard key={team.id} team={team} />
              ))}
            </motion.div>
          )}
        </div>

        {/* College Teams */}
        <div>
          <button
            onClick={() => setCollegeOpen((v) => !v)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h3 className="font-heading text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {teams.collegeTitle}
            </h3>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${collegeOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {collegeOpen && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-base"
            >
              {region.collegeTeams.map((team) => (
                <CollegeTeamCard key={team.id} team={team} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function TeamsPage() {
  const regions = teams.regions as Region[];
  const [activeRegion, setActiveRegion] = useState('colorado');

  const siteUrl = 'https://soccercenter.org';
  const pageUrl = `${siteUrl}/teams`;
  const title = 'Soccer Teams by Region — Pro, NWSL & College Programs';
  const description = 'Professional and college soccer teams across Colorado, Arizona, California, Oregon, Washington, and Nevada. MLS, NWSL, USL, and NCAA programs.';
  const ogImage = `${siteUrl}/airo-assets/images/pages/home/hero`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${pageUrl}#webpage`,
    name: title,
    url: pageUrl,
    description,
    isPartOf: { '@id': `${siteUrl}/#website` },
    about: { '@id': `${siteUrl}/#organization` },
    hasPart: [
      {
        '@type': 'ItemList',
        name: 'Professional Soccer Teams',
        description: 'MLS, NWSL, and USL professional soccer teams across the Western United States.',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Colorado Rapids (MLS)' },
          { '@type': 'ListItem', position: 2, name: 'Colorado Rapids 2 (MLS Next Pro)' },
          { '@type': 'ListItem', position: 3, name: 'Colorado Switchbacks FC (USL Championship)' },
          { '@type': 'ListItem', position: 4, name: 'Colorado FC (USL Super League)' },
        ],
      },
    ],
  };

  const currentRegion = regions.find((r) => r.id === activeRegion) ?? regions[0];

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
        {/* Hero */}
        <section className="py-xxl border-b border-border">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
              <motion.p variants={fadeUp} className="text-xs font-semibold tracking-wide text-primary mb-3">
                {teams.eyebrow}
              </motion.p>
              <motion.h1 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-bold text-foreground mb-4">
                {teams.headline}
              </motion.h1>
              <motion.p variants={fadeUp} className="text-muted-foreground text-lg">
                {teams.body}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Sticky region tab bar */}
        <div className="sticky top-16 md:top-20 z-30 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <nav aria-label="Teams by region" className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
              {regions.map((region) => {
                const isActive = activeRegion === region.id;
                const color = REGION_COLORS[region.id] ?? 'var(--tag-teal)';
                return (
                  <a
                    key={region.id}
                    href={`#region-${region.id}`}
                    onClick={(e) => { e.preventDefault(); setActiveRegion(region.id); document.getElementById(`region-${region.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      isActive
                        ? 'text-background'
                        : 'text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted'
                    }`}
                    style={isActive ? { background: color } : {}}
                  >
                    {region.name}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Region sections — show only active region */}
        <RegionSection key={currentRegion.id} region={currentRegion} />

        {/* Footer note */}
        <div className="border-t border-border py-lg">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">{teams.collegeNote}</p>
          </div>
        </div>
      </main>
    </>
  );
}
