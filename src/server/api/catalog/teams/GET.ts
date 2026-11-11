/**
 * GET /api/catalog/teams
 *
 * Returns the full team/competition/organization/media catalog for both portals.
 * Used by Fan and Parent pickers to populate follow/team-selection UIs.
 *
 * Response shape:
 *   {
 *     teams: {
 *       clubs: TeamEntry[]          // entityType = 'club_team', grouped by competition
 *       nationalTeams: TeamEntry[]  // entityType = 'national_team'
 *       organizations: TeamEntry[]  // entityType = 'organization'
 *       leagues: TeamEntry[]        // entityType = 'league' (legacy rows, kept for compat)
 *     }
 *     competitions: CompEntry[]
 *     media: SourceEntry[]          // format = 'news' | 'podcast'
 *     byCompetition: Record<compImportKey, TeamEntry[]>
 *   }
 *
 * Query params:
 *   q           — search by displayName (case-insensitive)
 *   entityType  — filter sc_teams by entityType
 *   competition — filter clubs by competition importKey (e.g. "comp:premier-league")
 *
 * Authenticated (any logged-in user). 5-min cache.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scTeams, scCompetitions, scSources, scTeamCompetitions } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireFanAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireFanAccess(req, res);
  if (!userId) return;

  const { q, entityType, competition } = req.query as Record<string, string | undefined>;

  try {
    // ── Fetch teams ────────────────────────────────────────────────────────────
    let teamsQuery = db
      .select({
        id: scTeams.id,
        importKey: scTeams.importKey,
        organizationKey: scTeams.organizationKey,
        entityType: scTeams.entityType,
        displayName: scTeams.displayName,
        gender: scTeams.gender,
        associationCode: scTeams.associationCode,
        officialWebsite: scTeams.officialWebsite,
        mediaCoverage: scTeams.mediaCoverage,
      })
      .from(scTeams);

    const allTeams = await teamsQuery;

    // Apply filters in JS (simpler than building dynamic Drizzle where clauses)
    let filtered = allTeams;
    if (q) {
      const lc = q.toLowerCase();
      filtered = filtered.filter(t => t.displayName.toLowerCase().includes(lc));
    }
    if (entityType) {
      filtered = filtered.filter(t => t.entityType === entityType);
    }

    // ── Fetch team→competition memberships ────────────────────────────────────
    const memberships = await db
      .select({
        teamId: scTeamCompetitions.teamId,
        competitionId: scTeamCompetitions.competitionId,
        season: scTeamCompetitions.season,
      })
      .from(scTeamCompetitions);

    // Build teamId → competitionId[] map
    const teamCompMap = new Map<string, string[]>();
    for (const m of memberships) {
      const existing = teamCompMap.get(m.teamId) ?? [];
      existing.push(m.competitionId);
      teamCompMap.set(m.teamId, existing);
    }

    // ── Fetch competitions ─────────────────────────────────────────────────────
    const competitions = await db
      .select({
        id: scCompetitions.id,
        importKey: scCompetitions.importKey,
        name: scCompetitions.name,
        type: scCompetitions.type,
      })
      .from(scCompetitions);

    // Build competitionId → importKey map for grouping
    const compById = new Map(competitions.map(c => [c.id, c]));

    // ── Fetch media sources ────────────────────────────────────────────────────
    const mediaSources = await db
      .select({
        id: scSources.id,
        importKey: scSources.importKey,
        label: scSources.label,
        url: scSources.url,
        format: scSources.format,
        authority: scSources.authority,
        feedEndpoint: scSources.feedEndpoint,
        connectorEnabled: scSources.connectorEnabled,
      })
      .from(scSources)
      .where(eq(scSources.format, 'news'));

    const podcastSources = await db
      .select({
        id: scSources.id,
        importKey: scSources.importKey,
        label: scSources.label,
        url: scSources.url,
        format: scSources.format,
        authority: scSources.authority,
        feedEndpoint: scSources.feedEndpoint,
        connectorEnabled: scSources.connectorEnabled,
      })
      .from(scSources)
      .where(eq(scSources.format, 'podcast'));

    // ── Categorize teams ──────────────────────────────────────────────────────
    const clubs         = filtered.filter(t => t.entityType === 'club_team');
    const nationalTeams = filtered.filter(t => t.entityType === 'national_team');
    const organizations = filtered.filter(t => t.entityType === 'organization');
    const leagues       = filtered.filter(t => t.entityType === 'league' || t.entityType === 'competition');

    // ── Group clubs by competition importKey ──────────────────────────────────
    const byCompetition: Record<string, typeof clubs> = {};
    for (const club of clubs) {
      const compIds = teamCompMap.get(club.id) ?? [];
      for (const compId of compIds) {
        const comp = compById.get(compId);
        if (!comp) continue;
        const key = comp.importKey;
        if (!byCompetition[key]) byCompetition[key] = [];
        byCompetition[key].push(club);
      }
    }

    // Apply competition filter after grouping
    let filteredByComp = byCompetition;
    if (competition) {
      filteredByComp = competition in byCompetition
        ? { [competition]: byCompetition[competition] }
        : {};
    }

    res
      .set('Cache-Control', 'private, max-age=300')
      .json({
        teams: {
          clubs,
          nationalTeams,
          organizations,
          leagues,
        },
        competitions,
        media: {
          news: mediaSources,
          podcasts: podcastSources,
        },
        byCompetition: filteredByComp,
        counts: {
          clubs: clubs.length,
          nationalTeams: nationalTeams.length,
          organizations: organizations.length,
          leagues: leagues.length,
          competitions: competitions.length,
          newsSources: mediaSources.length,
          podcastSources: podcastSources.length,
        },
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'catalog_fetch_failed', message });
  }
}
