/**
 * POST /api/parent/admin/seed-sources
 *
 * Idempotent upsert of the full sc_sources catalog.
 * Uses importKey as stable identity — safe to re-run.
 * Admin-only.
 *
 * Source definitions live in src/server/sources-catalog.ts (shared with
 * the startup auto-seed in entry.ts so both always use the same data).
 */
import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { upsertSourcesCatalog } from '@/server/sources-seed.js';

export default async function handler(req: Request, res: Response) {
  const isAdmin = await requireAdmin(req, res);
  if (!isAdmin) return;

  try {
    const { upserted, inserted, errors } = await upsertSourcesCatalog();
    res.json({
      ok: true,
      upserted,
      inserted,
      errors,
      message: `Sources catalog seeded: ${upserted} updated, ${inserted} inserted, ${errors} errors.`,
    });
  } catch (err) {
    console.error('[seed-sources] fatal error:', err);
    res.status(500).json({ error: 'Seed failed', detail: String(err) });
  }
}
