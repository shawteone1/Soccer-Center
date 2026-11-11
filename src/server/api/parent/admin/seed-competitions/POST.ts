/**
 * POST /api/parent/admin/seed-competitions
 *
 * Idempotent upsert of the canonical sc_competitions catalog rows.
 * Source: PRO_COMPETITIONS from src/data/pro-sources.ts (12 entries).
 *
 * Mapping:
 *   ProCompetition.kind === 'league'      → type = 'domestic_league'
 *   ProCompetition.kind === 'competition' → type = 'continental_cup'
 *   confederation + country preserved in association_code
 *
 * importKey format: "comp:<slug>"
 * Safe to re-run — existing rows are updated via ON DUPLICATE KEY logic.
 * Admin-only.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scCompetitions } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth-policy.js';
import { randomUUID } from 'crypto';
import { PRO_COMPETITIONS } from '../../../../../data/pro-sources.js';

interface StepResult {
  importKey: string;
  status: 'inserted' | 'updated' | 'error';
  detail?: string;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const results: StepResult[] = [];

  for (const comp of PRO_COMPETITIONS) {
    const importKey = `comp:${comp.slug}`;
    const type = comp.kind === 'league' ? 'domestic_league' : 'continental_cup';

    try {
      const existing = await db
        .select({ id: scCompetitions.id })
        .from(scCompetitions)
        .where(eq(scCompetitions.importKey, importKey))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(scCompetitions)
          .set({
            name: comp.name,
            type,
          })
          .where(eq(scCompetitions.importKey, importKey));
        results.push({ importKey, status: 'updated' });
      } else {
        await db.insert(scCompetitions).values({
          id: randomUUID(),
          importKey,
          name: comp.name,
          type,
        });
        results.push({ importKey, status: 'inserted' });
      }
    } catch (err) {
      const detail = err instanceof Error
        ? ((err as { cause?: { sqlMessage?: string } }).cause?.sqlMessage ?? err.message)
        : String(err);
      results.push({ importKey, status: 'error', detail });
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  const updated  = results.filter(r => r.status === 'updated').length;
  const errors   = results.filter(r => r.status === 'error').length;

  res.json({
    ok: errors === 0,
    summary: { inserted, updated, errors, total: PRO_COMPETITIONS.length },
    results,
  });
}
