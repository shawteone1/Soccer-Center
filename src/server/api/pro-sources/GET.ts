/**
 * GET /api/pro-sources
 *
 * Returns the full professional source catalog grouped by competition.
 * Public — no auth required.
 *
 * Query params:
 *   competition — filter by competition slug (e.g. "premier-league")
 *   kind        — filter by kind: 'club' | 'league' | 'competition' | 'national_team' | 'media'
 *   status      — filter by status: 'youtube-live' | 'link-only' | 'unresolved'
 *   q           — search by name (case-insensitive)
 */
import type { Request, Response } from 'express';
import {
  ALL_PRO_SOURCES,
  PRO_COMPETITIONS,
  getCoverageReport,
  type ProSource,
} from '../../../data/pro-sources.js';

export default function handler(req: Request, res: Response): void {
  const { competition, kind, status, q } = req.query as Record<string, string | undefined>;

  let sources: ProSource[] = ALL_PRO_SOURCES;

  if (competition) sources = sources.filter(s => s.competition === competition);
  if (kind) sources = sources.filter(s => s.kind === kind);
  if (status) sources = sources.filter(s => s.status === status);
  if (q) {
    const lc = q.toLowerCase();
    sources = sources.filter(s => s.name.toLowerCase().includes(lc));
  }

  // Group by competition for clubs; national teams and media are top-level groups
  const byCompetition: Record<string, ProSource[]> = {};
  for (const s of sources) {
    if (s.kind === 'club' && s.competition) {
      if (!byCompetition[s.competition]) byCompetition[s.competition] = [];
      byCompetition[s.competition].push(s);
    }
  }

  const nationalTeams = sources.filter(s => s.kind === 'national_team');
  const media = sources.filter(s => s.kind === 'media');

  res
    .set('Cache-Control', 'public, max-age=300')
    .json({
      competitions: PRO_COMPETITIONS,
      byCompetition,
      nationalTeams,
      media,
      coverage: getCoverageReport(),
      total: sources.length,
    });
}
