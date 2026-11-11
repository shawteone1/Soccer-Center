/**
 * /pro-sources-coverage — Professional source coverage report.
 *
 * Public page. Shows per-competition club coverage (total, YouTube-live, link-only, unresolved),
 * plus national teams and media source totals.
 */

import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, Wifi, Globe, HelpCircle, CheckCircle2 } from 'lucide-react';
import { pro_sources_coverage } from 'virtual:content';

const siteUrl = 'https://soccercenter.org';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitionInfo {
  slug: string;
  name: string;
  shortName: string;
  kind: string;
  confederation: string;
  country?: string;
}

interface CompetitionCoverage {
  competition: CompetitionInfo;
  total: number;
  youtubeLive: number;
  linkOnly: number;
  unresolved: number;
}

interface GroupCoverage {
  total: number;
  youtubeLive: number;
  linkOnly: number;
  unresolved: number;
}

interface CoverageResponse {
  competitions: CompetitionCoverage[];
  nationalTeams: GroupCoverage;
  media: GroupCoverage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function StatusPill({ count, kind }: { count: number; kind: 'live' | 'link' | 'unresolved' }) {
  if (count === 0) return null;

  const cfg = {
    live:       { bgVar: '--status-live-bg',  fgVar: '--status-live-fg',  icon: <Wifi size={10} />,        label: 'Live' },
    link:       { bgVar: '--status-link-bg',  fgVar: '--status-link-fg',  icon: <Globe size={10} />,       label: 'Link' },
    unresolved: { bgVar: '--status-unres-bg', fgVar: '--status-unres-fg', icon: <HelpCircle size={10} />,  label: '?' },
  }[kind];

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: `hsl(var(${cfg.bgVar}))`, color: `hsl(var(${cfg.fgVar}))` }}
    >
      {cfg.icon}
      {count} {cfg.label}
    </span>
  );
}

function ProgressBar({ live, link, unresolved, total }: { live: number; link: number; unresolved: number; total: number }) {
  if (total === 0) return null;
  const livePct = (live / total) * 100;
  const linkPct = (link / total) * 100;
  const unresPct = (unresolved / total) * 100;

  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full" style={{ background: 'hsl(var(--muted))' }}>
      {livePct > 0 && (
        <div style={{ width: `${livePct}%`, background: 'hsl(var(--status-live-bar))' }} />
      )}
      {linkPct > 0 && (
        <div style={{ width: `${linkPct}%`, background: 'hsl(var(--status-link-bar))' }} />
      )}
      {unresPct > 0 && (
        <div style={{ width: `${unresPct}%`, background: 'hsl(var(--status-unres-bar))' }} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProSourcesCoveragePage() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/pro-sources/coverage');
        if (!res.ok) throw new Error('Failed to load coverage data');
        setData(await res.json() as CoverageResponse);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalClubs = data?.competitions.reduce((s, c) => s + c.total, 0) ?? 0;
  const totalLive = data?.competitions.reduce((s, c) => s + c.youtubeLive, 0) ?? 0;
  const totalLink = data?.competitions.reduce((s, c) => s + c.linkOnly, 0) ?? 0;
  const totalUnres = data?.competitions.reduce((s, c) => s + c.unresolved, 0) ?? 0;

  return (
    <>
      <Helmet>
        <title>Pro Soccer Source Coverage Report | Soccer Center</title>
        <meta name="description" content="See which professional soccer clubs and competitions have YouTube-connected highlights, link-only sources, and unresolved entries — tracked by Soccer Center." />
        <link rel="canonical" href={`${siteUrl}/pro-sources-coverage`} />
        <meta property="og:title" content="Pro Soccer Source Coverage Report | Soccer Center" />
        <meta property="og:description" content="Track which pro soccer clubs have YouTube-connected highlights vs link-only or unresolved sources, broken down by competition." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/pro-sources-coverage`} />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pro Soccer Source Coverage Report | Soccer Center" />
        <meta name="twitter:description" content="Track which pro soccer clubs have YouTube-connected highlights vs link-only or unresolved sources." />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/home/hero`} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${siteUrl}/pro-sources-coverage#webpage`,
          name: 'Pro Soccer Source Coverage Report',
          url: `${siteUrl}/pro-sources-coverage`,
          description: 'Coverage report for professional soccer clubs and competitions tracked by Soccer Center — YouTube live, link-only, and unresolved sources.',
          isPartOf: { '@id': `${siteUrl}/#website` },
          about: { '@id': `${siteUrl}/#organization` },
        }).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-28 pb-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--primary))' }}>
              {pro_sources_coverage.hero.eyebrow}
            </p>
            <h1
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
            >
              {pro_sources_coverage.hero.title}
            </h1>
            <p className="text-sm max-w-xl" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {pro_sources_coverage.hero.description}
            </p>
          </div>

          {/* Legend */}
          <div
            className="flex items-center gap-4 flex-wrap mb-6 p-3 rounded-xl border text-xs"
            style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
          >
            <span className="font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{pro_sources_coverage.legend.label}</span>
            <span className="inline-flex items-center gap-1.5" style={{ color: 'hsl(var(--status-live-fg))' }}>
              <Wifi size={12} /> <strong>{pro_sources_coverage.legend.live}</strong> — <span>{pro_sources_coverage.legend.liveDetail}</span>
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: 'hsl(var(--status-link-fg))' }}>
              <Globe size={12} /> <strong>{pro_sources_coverage.legend.link}</strong> — <span>{pro_sources_coverage.legend.linkDetail}</span>
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: 'hsl(var(--status-unres-fg))' }}>
              <HelpCircle size={12} /> <strong>{pro_sources_coverage.legend.unresolved}</strong> — <span>{pro_sources_coverage.legend.unresolvedDetail}</span>
            </span>
          </div>

          {loading && (
            <div className="py-16 flex justify-center">
              <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
          )}

          {error && (
            <p className="py-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{error}</p>
          )}

          {data && (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  { label: pro_sources_coverage.summary.totalClubs, value: totalClubs, icon: null },
                  { label: pro_sources_coverage.summary.liveFeed, value: totalLive, icon: <Wifi size={14} style={{ color: 'hsl(var(--status-live-fg))' }} /> },
                  { label: pro_sources_coverage.summary.linkOnly, value: totalLink, icon: <Globe size={14} style={{ color: 'hsl(var(--status-link-fg))' }} /> },
                  { label: pro_sources_coverage.summary.unresolvedLabel, value: totalUnres, icon: <HelpCircle size={14} style={{ color: 'hsl(var(--status-unres-fg))' }} /> },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-xl border p-4"
                    style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {stat.icon}
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Per-competition table */}
              <div
                className="rounded-xl border overflow-hidden mb-6"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'hsl(var(--muted))' }}>
                      <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{pro_sources_coverage.table.colCompetition}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{pro_sources_coverage.table.colTotal}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold hidden sm:table-cell" style={{ color: 'hsl(var(--muted-foreground))' }}>{pro_sources_coverage.table.colCoverage}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold hidden md:table-cell" style={{ color: 'hsl(var(--muted-foreground))' }}>{pro_sources_coverage.table.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitions.map((row, i) => (
                      <tr
                        key={row.competition.slug}
                        style={{
                          background: i % 2 === 0 ? 'hsl(var(--card))' : 'hsl(var(--background))',
                          borderTop: '1px solid hsl(var(--border))',
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.youtubeLive === row.total && row.total > 0 && (
                              <CheckCircle2 size={13} style={{ color: 'hsl(var(--status-live-fg))' }} />
                            )}
                            <div>
                              <p className="font-medium text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                {row.competition.name}
                              </p>
                              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {row.competition.confederation} · {row.competition.country ?? '—'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                          {row.total}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <ProgressBar live={row.youtubeLive} link={row.linkOnly} unresolved={row.unresolved} total={row.total} />
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {pct(row.youtubeLive, row.total)} {pro_sources_coverage.table.liveSuffix}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            <StatusPill count={row.youtubeLive} kind="live" />
                            <StatusPill count={row.linkOnly} kind="link" />
                            <StatusPill count={row.unresolved} kind="unresolved" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* National teams + media */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: pro_sources_coverage.groups.nationalTeams, group: data.nationalTeams },
                  { label: pro_sources_coverage.groups.media, group: data.media },
                ].map(({ label, group }) => (
                  <div
                    key={label}
                    className="rounded-xl border p-4"
                    style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
                  >
                    <p className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <ProgressBar live={group.youtubeLive} link={group.linkOnly} unresolved={group.unresolved} total={group.total} />
                      <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>{group.total} total</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <StatusPill count={group.youtubeLive} kind="live" />
                      <StatusPill count={group.linkOnly} kind="link" />
                      <StatusPill count={group.unresolved} kind="unresolved" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
