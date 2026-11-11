/**
 * POST /api/parent/admin/seed-team-sources
 *
 * Populates sc_team_sources by matching sc_teams rows to sc_sources rows
 * using a stable importKey mapping table.
 *
 * Strategy:
 *   - Each mapping entry names a teamImportKey and one or more sourceImportKeys.
 *   - Both sides are resolved to UUIDs via their importKey columns.
 *   - Rows are inserted only when both sides exist and no duplicate is present.
 *   - Unresolved keys are reported but do not abort the run.
 *
 * Safe to re-run (idempotent). Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scTeams, scSources, scTeamSources } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';

// ── Mapping: teamImportKey → sourceImportKeys ─────────────────────────────────
// Each team is linked to every source that covers it.
// Pro teams → news + podcast sources that cover their league/club.
// Club teams → their own club source entry.
// National teams → national + news sources.

const TEAM_SOURCE_MAP: { teamKey: string; sourceKeys: string[] }[] = [
  // ── Colorado Rapids (pro) ─────────────────────────────────────────────────
  {
    teamKey: 'pro:colorado-rapids',
    sourceKeys: [
      'news:espn-fc',
      'news:mlssoccer',
      'news:cbs-sports-golazo',
      'podcast:extratime-mls',
      'podcast:american-soccer-analysis',
      'pro:colorado-rapids',
    ],
  },

  // ── Premier League ────────────────────────────────────────────────────────
  {
    teamKey: 'pro:premier-league',
    sourceKeys: [
      'news:sky-sports-football',
      'news:bbc-football',
      'news:espn-fc',
      'podcast:men-in-blazers',
      'podcast:tifo-football',
      'podcast:totally-football-show',
      'podcast:football-weekly-guardian',
      'podcast:espn-fc-podcast',
    ],
  },

  // ── La Liga ───────────────────────────────────────────────────────────────
  {
    teamKey: 'pro:laliga',
    sourceKeys: [
      'news:espn-fc',
      'news:cbs-sports-golazo',
      'news:bbc-football',
      'podcast:tifo-football',
      'podcast:espn-fc-podcast',
    ],
  },

  // ── Bundesliga ────────────────────────────────────────────────────────────
  {
    teamKey: 'pro:bundesliga',
    sourceKeys: [
      'news:espn-fc',
      'news:bbc-football',
      'podcast:tifo-football',
      'podcast:football-weekly-guardian',
    ],
  },

  // ── Serie A ───────────────────────────────────────────────────────────────
  {
    teamKey: 'pro:serie-a',
    sourceKeys: [
      'news:espn-fc',
      'news:bbc-football',
      'podcast:tifo-football',
    ],
  },

  // ── MLS (league) ─────────────────────────────────────────────────────────
  {
    teamKey: 'pro:mls',
    sourceKeys: [
      'news:mlssoccer',
      'news:espn-fc',
      'news:cbs-sports-golazo',
      'podcast:extratime-mls',
      'podcast:american-soccer-analysis',
    ],
  },

  // ── Champions League ─────────────────────────────────────────────────────
  {
    teamKey: 'pro:champions-league',
    sourceKeys: [
      'news:sky-sports-football',
      'news:bbc-football',
      'news:espn-fc',
      'podcast:tifo-football',
      'podcast:men-in-blazers',
    ],
  },

  // ── USMNT ─────────────────────────────────────────────────────────────────
  {
    teamKey: 'national:usmnt',
    sourceKeys: [
      'news:ussoccer',
      'news:espn-fc',
      'news:cbs-sports-golazo',
      'news:mlssoccer',
      'podcast:men-in-blazers',
      'podcast:american-soccer-analysis',
      'podcast:extratime-mls',
    ],
  },

  // ── USWNT ─────────────────────────────────────────────────────────────────
  {
    teamKey: 'national:uswnt',
    sourceKeys: [
      'news:ussoccer',
      'news:espn-fc',
      'news:cbs-sports-golazo',
      'podcast:american-soccer-analysis',
    ],
  },

  // ── US Youth Soccer ───────────────────────────────────────────────────────
  {
    teamKey: 'national:us-youth-soccer',
    sourceKeys: [
      'news:ussoccer',
      'national:us-youth-soccer',
    ],
  },

  // ── US Club Soccer ────────────────────────────────────────────────────────
  {
    teamKey: 'national:us-club-soccer',
    sourceKeys: [
      'national:us-club-soccer',
    ],
  },

  // ── Colorado Rapids Youth ─────────────────────────────────────────────────
  {
    teamKey: 'club:colorado-rapids-youth',
    sourceKeys: [
      'club:colorado-rapids-youth',
      'news:mlssoccer',
    ],
  },

  // ── FC Colorado ───────────────────────────────────────────────────────────
  {
    teamKey: 'club:fc-colorado',
    sourceKeys: ['club:fc-colorado'],
  },

  // ── Colorado Storm ────────────────────────────────────────────────────────
  {
    teamKey: 'club:colorado-storm',
    sourceKeys: ['club:colorado-storm'],
  },

  // ── Colorado Rush ─────────────────────────────────────────────────────────
  {
    teamKey: 'club:colorado-rush',
    sourceKeys: ['club:colorado-rush'],
  },

  // ── Real Colorado ─────────────────────────────────────────────────────────
  {
    teamKey: 'club:real-colorado',
    sourceKeys: ['club:real-colorado'],
  },

  // ── Colorado United ───────────────────────────────────────────────────────
  {
    teamKey: 'club:colorado-united',
    sourceKeys: ['club:colorado-united'],
  },

  // ── Altitude SC ───────────────────────────────────────────────────────────
  {
    teamKey: 'club:altitude-sc',
    sourceKeys: ['club:altitude-sc'],
  },

  // ── CSFC ─────────────────────────────────────────────────────────────────
  {
    teamKey: 'club:csfc',
    sourceKeys: ['club:csfc'],
  },
];

interface StepResult {
  teamKey: string;
  sourceKey: string;
  status: 'inserted' | 'skipped' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const results: StepResult[] = [];
  const unresolved: string[] = [];

  // Pre-load all team IDs by importKey
  const teamRows = await db
    .select({ id: scTeams.id, importKey: scTeams.importKey })
    .from(scTeams);
  const teamIdByKey = new Map(teamRows.map(r => [r.importKey, r.id]));

  // Pre-load all source IDs by importKey
  const sourceRows = await db
    .select({ id: scSources.id, importKey: scSources.importKey })
    .from(scSources);
  const sourceIdByKey = new Map(sourceRows.map(r => [r.importKey, r.id]));

  for (const mapping of TEAM_SOURCE_MAP) {
    const teamId = teamIdByKey.get(mapping.teamKey);
    if (!teamId) {
      unresolved.push(`team:${mapping.teamKey}`);
      continue;
    }

    for (const sourceKey of mapping.sourceKeys) {
      const sourceId = sourceIdByKey.get(sourceKey);
      if (!sourceId) {
        unresolved.push(`source:${sourceKey}`);
        results.push({ teamKey: mapping.teamKey, sourceKey, status: 'error', detail: 'source not found in sc_sources' });
        continue;
      }

      // Check for existing join row
      try {
        const existing = await db
          .select({ id: scTeamSources.id })
          .from(scTeamSources)
          .where(and(
            eq(scTeamSources.teamId, teamId),
            eq(scTeamSources.sourceId, sourceId),
          ))
          .limit(1);

        if (existing.length > 0) {
          results.push({ teamKey: mapping.teamKey, sourceKey, status: 'skipped' });
        } else {
          await db.insert(scTeamSources).values({
            id: randomUUID(),
            teamId,
            sourceId,
          });
          results.push({ teamKey: mapping.teamKey, sourceKey, status: 'inserted' });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        results.push({ teamKey: mapping.teamKey, sourceKey, status: 'error', detail });
      }
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  // Coverage summary: how many teams have at least one source mapped
  const coveredTeams = new Set(
    results.filter(r => r.status === 'inserted' || r.status === 'skipped').map(r => r.teamKey)
  );
  const totalTeams = TEAM_SOURCE_MAP.length;

  res.json({
    ok: errors === 0,
    summary: { inserted, skipped, errors, coveredTeams: coveredTeams.size, totalTeams },
    unresolved: [...new Set(unresolved)],
    results,
  });
}
