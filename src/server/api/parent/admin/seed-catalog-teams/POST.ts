/**
 * POST /api/parent/admin/seed-catalog-teams
 *
 * Idempotent upsert of the full professional club and national team catalog
 * into sc_teams, sourced from ALL_PRO_SOURCES in src/data/pro-sources.ts.
 *
 * What this seeds:
 *   - 20 Premier League clubs
 *   - 20 LaLiga clubs
 *   - 18 Bundesliga clubs
 *   - 18 Ligue 1 clubs
 *   - 20 Serie A clubs
 *   - 16 national teams
 *   - Colorado Rapids (pro club — already in seed-teams as pro:colorado-rapids)
 *   Total: 113 rows (deduplicates against existing pro:colorado-rapids)
 *
 * importKey format: "club:<slug>" for clubs, "nt:<id>" for national teams.
 * The 6 legacy league rows (pro:premier-league, pro:laliga, etc.) already in
 * sc_teams are corrected to entityType='league' but NOT deleted — existing
 * sc_team_sources FK references are preserved.
 *
 * Safe to re-run. Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scTeams } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';
import { ALL_PRO_SOURCES } from '../../../../../data/pro-sources.js';

interface TeamRow {
  importKey: string;
  organizationKey: string;
  entityType: string;
  displayName: string;
  gender: string | null;
  associationCode: string;
  officialWebsite: string | null;
  mediaCoverage: string;
}

interface StepResult {
  importKey: string;
  status: 'inserted' | 'updated' | 'skipped' | 'error';
  detail?: string;
}

// ── Build rows from pro-sources catalog ───────────────────────────────────────

const CATALOG_ROWS: TeamRow[] = [];

for (const src of ALL_PRO_SOURCES) {
  if (src.kind === 'club') {
    CATALOG_ROWS.push({
      importKey: `club:${src.id}`,
      organizationKey: src.id,
      entityType: 'club_team',
      displayName: src.name,
      gender: 'male',   // all current catalog entries are men's clubs
      associationCode: src.country,
      officialWebsite: src.website ?? null,
      mediaCoverage: src.status === 'youtube-live' ? 'full' : 'partial',
    });
  } else if (src.kind === 'national_team') {
    CATALOG_ROWS.push({
      importKey: `nt:${src.id}`,
      organizationKey: src.id,
      entityType: 'national_team',
      displayName: src.name,
      gender: null,   // mixed — USMNT/USWNT differentiated by name
      associationCode: src.country,
      officialWebsite: src.website ?? null,
      mediaCoverage: 'partial',
    });
  }
  // 'media' and 'league'/'competition' kinds are excluded — they belong in
  // sc_sources and sc_competitions respectively.
}

// ── Legacy league rows to correct (entityType fix, no delete) ─────────────────

const LEGACY_LEAGUE_CORRECTIONS: { importKey: string; entityType: string }[] = [
  { importKey: 'pro:premier-league',  entityType: 'league' },
  { importKey: 'pro:laliga',          entityType: 'league' },
  { importKey: 'pro:bundesliga',      entityType: 'league' },
  { importKey: 'pro:serie-a',         entityType: 'league' },
  { importKey: 'pro:mls',             entityType: 'league' },
  { importKey: 'pro:champions-league', entityType: 'competition' },
];

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const results: StepResult[] = [];

  // ── Step 1: Upsert catalog rows ──────────────────────────────────────────────
  for (const row of CATALOG_ROWS) {
    try {
      const existing = await db
        .select({ id: scTeams.id })
        .from(scTeams)
        .where(eq(scTeams.importKey, row.importKey))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(scTeams)
          .set({
            organizationKey: row.organizationKey,
            entityType: row.entityType,
            displayName: row.displayName,
            gender: row.gender,
            associationCode: row.associationCode,
            officialWebsite: row.officialWebsite,
            mediaCoverage: row.mediaCoverage,
          })
          .where(eq(scTeams.importKey, row.importKey));
        results.push({ importKey: row.importKey, status: 'updated' });
      } else {
        await db.insert(scTeams).values({
          id: randomUUID(),
          importKey: row.importKey,
          organizationKey: row.organizationKey,
          entityType: row.entityType,
          displayName: row.displayName,
          gender: row.gender,
          associationCode: row.associationCode,
          officialWebsite: row.officialWebsite,
          mediaCoverage: row.mediaCoverage,
        });
        results.push({ importKey: row.importKey, status: 'inserted' });
      }
    } catch (err) {
      const detail = err instanceof Error
        ? ((err as { cause?: { sqlMessage?: string } }).cause?.sqlMessage ?? err.message)
        : String(err);
      results.push({ importKey: row.importKey, status: 'error', detail });
    }
  }

  // ── Step 2: Correct legacy league rows ───────────────────────────────────────
  const correctionResults: { importKey: string; status: string; detail?: string }[] = [];

  for (const fix of LEGACY_LEAGUE_CORRECTIONS) {
    try {
      const existing = await db
        .select({ id: scTeams.id, entityType: scTeams.entityType })
        .from(scTeams)
        .where(eq(scTeams.importKey, fix.importKey))
        .limit(1);

      if (existing.length === 0) {
        correctionResults.push({ importKey: fix.importKey, status: 'not_found' });
        continue;
      }

      if (existing[0].entityType === fix.entityType) {
        correctionResults.push({ importKey: fix.importKey, status: 'already_correct' });
        continue;
      }

      await db
        .update(scTeams)
        .set({ entityType: fix.entityType })
        .where(eq(scTeams.importKey, fix.importKey));
      correctionResults.push({ importKey: fix.importKey, status: 'corrected' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      correctionResults.push({ importKey: fix.importKey, status: 'error', detail });
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  const updated  = results.filter(r => r.status === 'updated').length;
  const errors   = results.filter(r => r.status === 'error').length;

  // Breakdown by category
  const clubs        = CATALOG_ROWS.filter(r => r.entityType === 'club_team').length;
  const nationalTeams = CATALOG_ROWS.filter(r => r.entityType === 'national_team').length;

  res.json({
    ok: errors === 0,
    summary: { inserted, updated, errors, total: CATALOG_ROWS.length, clubs, nationalTeams },
    legacyCorrections: correctionResults,
    results,
  });
}
