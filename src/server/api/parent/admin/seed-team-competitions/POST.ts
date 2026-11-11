/**
 * POST /api/parent/admin/seed-team-competitions
 *
 * Idempotent upsert of sc_team_competitions join rows.
 * Maps every club in the catalog to its parent competition.
 *
 * Requires:
 *   - sc_teams populated by seed-catalog-teams (importKey: "club:<slug>")
 *   - sc_competitions populated by seed-competitions (importKey: "comp:<slug>")
 *
 * Skips clubs whose competition is not found in sc_competitions (flags them).
 * Safe to re-run. Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scTeams, scCompetitions, scTeamCompetitions } from '@/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';
import { ALL_PRO_SOURCES } from '../../../../../data/pro-sources.js';

interface StepResult {
  teamImportKey: string;
  compImportKey: string;
  status: 'inserted' | 'skipped' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  // Pre-load all team IDs by importKey
  const teamRows = await db
    .select({ id: scTeams.id, importKey: scTeams.importKey })
    .from(scTeams);
  const teamIdByKey = new Map(teamRows.map(r => [r.importKey, r.id]));

  // Pre-load all competition IDs by importKey
  const compRows = await db
    .select({ id: scCompetitions.id, importKey: scCompetitions.importKey })
    .from(scCompetitions);
  const compIdByKey = new Map(compRows.map(r => [r.importKey, r.id]));

  const results: StepResult[] = [];
  const missing: string[] = [];

  // Only clubs have a competition field
  const clubs = ALL_PRO_SOURCES.filter(s => s.kind === 'club' && s.competition);

  for (const club of clubs) {
    const teamImportKey = `club:${club.id}`;
    const compImportKey = `comp:${club.competition}`;

    const teamId = teamIdByKey.get(teamImportKey);
    const compId = compIdByKey.get(compImportKey);

    if (!teamId) {
      missing.push(`team:${teamImportKey}`);
      continue;
    }
    if (!compId) {
      missing.push(`comp:${compImportKey}`);
      continue;
    }

    try {
      const existing = await db
        .select({ id: scTeamCompetitions.id })
        .from(scTeamCompetitions)
        .where(and(
          eq(scTeamCompetitions.teamId, teamId),
          eq(scTeamCompetitions.competitionId, compId),
        ))
        .limit(1);

      if (existing.length > 0) {
        results.push({ teamImportKey, compImportKey, status: 'skipped' });
      } else {
        await db.insert(scTeamCompetitions).values({
          id: randomUUID(),
          teamId,
          competitionId: compId,
          season: '2026/27',
          membershipStatus: 'catalog_imported',
          evidenceUrl: null,
        });
        results.push({ teamImportKey, compImportKey, status: 'inserted' });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ teamImportKey, compImportKey, status: 'error', detail });
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  const skipped  = results.filter(r => r.status === 'skipped').length;
  const errors   = results.filter(r => r.status === 'error').length;

  res.json({
    ok: errors === 0,
    summary: { inserted, skipped, errors, total: clubs.length },
    missing: [...new Set(missing)],
    results,
  });
}
