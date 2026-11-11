/**
 * POST /api/parent/admin/seed-teams
 *
 * Idempotent upsert of the canonical sc_teams catalog rows.
 * Covers:
 *   - Pro teams / leagues followed in the Fan portal (Rapids, PL, La Liga, etc.)
 *   - National teams (USMNT, USWNT, US Youth Soccer, US Club Soccer)
 *   - Colorado youth clubs (8 entries matching the sc_sources club catalog)
 *
 * importKey format mirrors sc_sources: "<entityType>:<slug>"
 * Safe to re-run — existing rows are updated via ON DUPLICATE KEY UPDATE.
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scTeams } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';

interface TeamSeed {
  importKey: string;
  organizationKey: string;
  entityType: string;
  displayName: string;
  gender?: string;
  associationCode?: string;
  officialWebsite?: string;
  mediaCoverage?: string;
}

const TEAMS: TeamSeed[] = [
  // ── Pro teams / leagues ───────────────────────────────────────────────────
  {
    importKey: 'pro:colorado-rapids',
    organizationKey: 'colorado-rapids',
    entityType: 'club_team',
    displayName: 'Colorado Rapids',
    gender: 'male',
    associationCode: 'USA',
    officialWebsite: 'https://www.coloradorapids.com',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:premier-league',
    organizationKey: 'premier-league',
    entityType: 'league',
    displayName: 'Premier League',
    associationCode: 'ENG',
    officialWebsite: 'https://www.premierleague.com',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:laliga',
    organizationKey: 'laliga',
    entityType: 'league',
    displayName: 'La Liga',
    associationCode: 'ESP',
    officialWebsite: 'https://www.laliga.com',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:bundesliga',
    organizationKey: 'bundesliga',
    entityType: 'league',
    displayName: 'Bundesliga',
    associationCode: 'GER',
    officialWebsite: 'https://www.bundesliga.com',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:serie-a',
    organizationKey: 'serie-a',
    entityType: 'league',
    displayName: 'Serie A',
    associationCode: 'ITA',
    officialWebsite: 'https://www.legaseriea.it',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:mls',
    organizationKey: 'mls',
    entityType: 'league',
    displayName: 'Major League Soccer',
    associationCode: 'USA',
    officialWebsite: 'https://www.mlssoccer.com',
    mediaCoverage: 'full',
  },
  {
    importKey: 'pro:champions-league',
    organizationKey: 'champions-league',
    entityType: 'competition',
    displayName: 'UEFA Champions League',
    officialWebsite: 'https://www.uefa.com/uefachampionsleague',
    mediaCoverage: 'full',
  },

  // ── National teams ────────────────────────────────────────────────────────
  {
    importKey: 'national:usmnt',
    organizationKey: 'us-soccer',
    entityType: 'national_team',
    displayName: 'USMNT',
    gender: 'male',
    associationCode: 'USA',
    officialWebsite: 'https://www.ussoccer.com/mens-national-team',
    mediaCoverage: 'full',
  },
  {
    importKey: 'national:uswnt',
    organizationKey: 'us-soccer',
    entityType: 'national_team',
    displayName: 'USWNT',
    gender: 'female',
    associationCode: 'USA',
    officialWebsite: 'https://www.ussoccer.com/womens-national-team',
    mediaCoverage: 'full',
  },
  {
    importKey: 'national:us-youth-soccer',
    organizationKey: 'us-youth-soccer',
    entityType: 'organization',
    displayName: 'US Youth Soccer',
    associationCode: 'USA',
    officialWebsite: 'https://www.usyouthsoccer.org',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'national:us-club-soccer',
    organizationKey: 'us-club-soccer',
    entityType: 'organization',
    displayName: 'US Club Soccer',
    associationCode: 'USA',
    officialWebsite: 'https://www.usclubsoccer.org',
    mediaCoverage: 'partial',
  },

  // ── Colorado youth clubs ──────────────────────────────────────────────────
  {
    importKey: 'club:colorado-rapids-youth',
    organizationKey: 'colorado-rapids',
    entityType: 'club_team',
    displayName: 'Colorado Rapids Youth Soccer Club',
    associationCode: 'USA',
    officialWebsite: 'https://www.coloradorapidsyouth.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:fc-colorado',
    organizationKey: 'fc-colorado',
    entityType: 'club_team',
    displayName: 'FC Colorado',
    associationCode: 'USA',
    officialWebsite: 'https://www.fccolorado.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:colorado-storm',
    organizationKey: 'colorado-storm',
    entityType: 'club_team',
    displayName: 'Colorado Storm Soccer Club',
    associationCode: 'USA',
    officialWebsite: 'https://www.coloradostormsoccer.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:colorado-rush',
    organizationKey: 'colorado-rush',
    entityType: 'club_team',
    displayName: 'Colorado Rush Soccer Club',
    associationCode: 'USA',
    officialWebsite: 'https://www.coloradorush.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:real-colorado',
    organizationKey: 'real-colorado',
    entityType: 'club_team',
    displayName: 'Real Colorado',
    associationCode: 'USA',
    officialWebsite: 'https://www.realcolorado.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:colorado-united',
    organizationKey: 'colorado-united',
    entityType: 'club_team',
    displayName: 'Colorado United Soccer Club',
    associationCode: 'USA',
    officialWebsite: 'https://www.coloradounited.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:altitude-sc',
    organizationKey: 'altitude-sc',
    entityType: 'club_team',
    displayName: 'Altitude SC',
    associationCode: 'USA',
    officialWebsite: 'https://www.altitudesc.com',
    mediaCoverage: 'partial',
  },
  {
    importKey: 'club:csfc',
    organizationKey: 'csfc',
    entityType: 'club_team',
    displayName: 'Colorado Soccer FC (CSFC)',
    associationCode: 'USA',
    officialWebsite: 'https://www.csfc.com',
    mediaCoverage: 'partial',
  },
];

interface StepResult {
  importKey: string;
  status: 'inserted' | 'updated' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const results: StepResult[] = [];

  for (const team of TEAMS) {
    try {
      // Check if row exists
      const existing = await db
        .select({ id: scTeams.id })
        .from(scTeams)
        .where(eq(scTeams.importKey, team.importKey))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(scTeams)
          .set({
            organizationKey: team.organizationKey,
            entityType: team.entityType,
            displayName: team.displayName,
            gender: team.gender ?? null,
            associationCode: team.associationCode ?? null,
            officialWebsite: team.officialWebsite ?? null,
            mediaCoverage: team.mediaCoverage ?? null,
          })
          .where(eq(scTeams.importKey, team.importKey));
        results.push({ importKey: team.importKey, status: 'updated' });
      } else {
        await db.insert(scTeams).values({
          id: randomUUID(),
          importKey: team.importKey,
          organizationKey: team.organizationKey,
          entityType: team.entityType,
          displayName: team.displayName,
          gender: team.gender ?? null,
          associationCode: team.associationCode ?? null,
          officialWebsite: team.officialWebsite ?? null,
          mediaCoverage: team.mediaCoverage ?? null,
        });
        results.push({ importKey: team.importKey, status: 'inserted' });
      }
    } catch (err) {
      const detail = err instanceof Error
        ? ((err as { cause?: { sqlMessage?: string } }).cause?.sqlMessage ?? err.message)
        : String(err);
      results.push({ importKey: team.importKey, status: 'error', detail });
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const errors = results.filter(r => r.status === 'error').length;

  res.json({
    ok: errors === 0,
    summary: { inserted, updated, errors, total: TEAMS.length },
    results,
  });
}
