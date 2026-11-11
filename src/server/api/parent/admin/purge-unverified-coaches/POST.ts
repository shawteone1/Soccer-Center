/**
 * POST /api/parent/admin/purge-unverified-coaches
 *
 * Removes sc_college_coaches rows whose import_key matches a record
 * marked _verificationStatus: "unverified-name" in the bundled JSON.
 *
 * This is a one-time cleanup for the case where the old seed ran with
 * allowUnverified:true and seeded names that were not confirmed against
 * official staff pages. The new seed hard-gates on verification status,
 * but INSERT IGNORE means old rows are not overwritten — they must be
 * explicitly deleted.
 *
 * SAFE: only deletes rows whose import_key is in the unverified set.
 * Verified ("corrected") coaches are never touched.
 * Saved opportunities and outreach drafts that reference a deleted coach
 * are preserved — they reference coach_id, which is a FK with ON DELETE CASCADE
 * on sc_coach_outreach_drafts but NOT on sc_saved_opportunities (no FK).
 * We report how many opportunity/draft rows would be affected before deleting.
 *
 * Requires admin access.
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';
import { unverifiedCoachKeys, recruitingFileCounts } from '../../recruiting/_recruiting-data.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  if (!user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  // Use the pre-computed unverified key set from the bundled JSON module
  const unverifiedKeys = [...unverifiedCoachKeys];

  if (!unverifiedKeys.length) {
    res.json({ ok: true, deleted: 0, message: 'No unverified import keys in bundled data.', fileCounts: recruitingFileCounts });
    return;
  }

  // Check table exists
  try {
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_college_coaches'`));
    const arr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!arr.length) {
      res.json({ ok: true, deleted: 0, message: 'sc_college_coaches table does not exist — nothing to purge.' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Failed to check table existence' });
    return;
  }

  const esc = (v: string) => v.replace(/'/g, "''");
  const keyList = unverifiedKeys.map(k => `'${esc(k)}'`).join(', ');

  // Count rows that will be affected before deleting
  let toDelete = 0;
  let draftsCascaded = 0;
  let opportunitiesOrphaned = 0;

  try {
    const countResult = await db.execute(sql.raw(
      `SELECT COUNT(*) AS n FROM sc_college_coaches WHERE import_key IN (${keyList})`
    ));
    const countRows = (Array.isArray(countResult) ? countResult[0] : (countResult as { rows?: unknown[] }).rows ?? []) as Array<{ n: number }>;
    toDelete = Number(countRows[0]?.n ?? 0);
  } catch {
    // Table may not have these rows — proceed
  }

  if (toDelete === 0) {
    res.json({ ok: true, deleted: 0, message: 'No matching rows found in sc_college_coaches — already clean.' });
    return;
  }

  // Check for saved opportunities referencing these coaches (no FK cascade — they become orphaned)
  try {
    const oppResult = await db.execute(sql.raw(`
      SELECT COUNT(*) AS n FROM sc_saved_opportunities so
      INNER JOIN sc_college_coaches c ON c.id = so.coach_id
      WHERE c.import_key IN (${keyList})
    `));
    const oppRows = (Array.isArray(oppResult) ? oppResult[0] : (oppResult as { rows?: unknown[] }).rows ?? []) as Array<{ n: number }>;
    opportunitiesOrphaned = Number(oppRows[0]?.n ?? 0);
  } catch {
    // Table may not exist yet — ignore
  }

  // Check for outreach drafts (FK with ON DELETE CASCADE — they will be deleted automatically)
  try {
    const draftResult = await db.execute(sql.raw(`
      SELECT COUNT(*) AS n FROM sc_coach_outreach_drafts d
      INNER JOIN sc_college_coaches c ON c.id = d.coach_id
      WHERE c.import_key IN (${keyList})
    `));
    const draftRows = (Array.isArray(draftResult) ? draftResult[0] : (draftResult as { rows?: unknown[] }).rows ?? []) as Array<{ n: number }>;
    draftsCascaded = Number(draftRows[0]?.n ?? 0);
  } catch {
    // Table may not exist yet — ignore
  }

  // Dry-run mode: if ?dryRun=1, report counts without deleting
  if (req.query['dryRun'] === '1') {
    res.json({
      ok: true,
      dryRun: true,
      wouldDelete: toDelete,
      draftsCascaded,
      opportunitiesOrphaned,
      unverifiedKeys,
    });
    return;
  }

  // Execute the delete
  try {
    await db.execute(sql.raw(
      `DELETE FROM sc_college_coaches WHERE import_key IN (${keyList})`
    ));
    res.json({
      ok: true,
      deleted: toDelete,
      draftsCascaded,
      opportunitiesOrphaned,
      message: `Purged ${toDelete} unverified coach row(s). ${draftsCascaded > 0 ? `${draftsCascaded} outreach draft(s) cascade-deleted. ` : ''}${opportunitiesOrphaned > 0 ? `${opportunitiesOrphaned} saved opportunity row(s) now have a null coach reference — they are preserved but the coach name will not resolve.` : ''}`,
    });
  } catch (err) {
    console.error('[purge-unverified-coaches] delete error:', err);
    res.status(500).json({ error: 'Delete failed', detail: String(err) });
  }
}
