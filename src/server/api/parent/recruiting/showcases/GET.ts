/**
 * GET /api/parent/recruiting/showcases
 *
 * Returns established showcases and tournaments with recruiting relevance.
 * Auth-gated — never public.
 *
 * Query params:
 *   region        — filter by region slug
 *   gender        — "mens" | "womens" | "coed"
 *   listingStatus — "confirmed" | "historical" | "estimated" | "tbd"
 *   q             — search by name or organizer
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireParentAccess } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const { region, gender, listingStatus, q } = req.query as Record<string, string | undefined>;

  try {
    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_showcases'`));
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ showcases: [], message: 'Recruiting schema not yet migrated.' });
      return;
    }

    const whereClauses: string[] = ['active = 1'];

    if (region) {
      whereClauses.push(`region = '${region.replace(/'/g, "''")}'`);
    }
    if (gender) {
      whereClauses.push(`(gender = '${gender.replace(/'/g, "''")}' OR gender = 'coed')`);
    }
    if (listingStatus) {
      whereClauses.push(`listing_status = '${listingStatus.replace(/'/g, "''")}'`);
    }
    if (q) {
      const safe = q.replace(/'/g, "''");
      whereClauses.push(`(name LIKE '%${safe}%' OR organizer LIKE '%${safe}%')`);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;

    const result = await db.execute(sql.raw(`
      SELECT
        id, import_key, name, organizer, region, city, state, official_url,
        gender, age_groups, start_date, end_date, registration_deadline,
        entry_type, listing_status, recruiting_evidence, historical_attendance,
        source_url, checked_date
      FROM sc_showcases
      ${where}
      ORDER BY
        CASE listing_status
          WHEN 'confirmed' THEN 1
          WHEN 'estimated' THEN 2
          WHEN 'tbd' THEN 3
          WHEN 'historical' THEN 4
          ELSE 5
        END,
        start_date ASC,
        name ASC
      LIMIT 200
    `));

    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    const showcases = rows.map(r => ({
      id: r['id'],
      name: r['name'],
      organizer: r['organizer'] ?? null,
      region: r['region'],
      city: r['city'] ?? null,
      state: r['state'] ?? null,
      officialUrl: r['official_url'] ?? null,
      gender: r['gender'] ?? null,
      ageGroups: r['age_groups'] ?? null,
      startDate: r['start_date'] ?? null,
      endDate: r['end_date'] ?? null,
      registrationDeadline: r['registration_deadline'] ?? null,
      entryType: r['entry_type'] ?? null,
      listingStatus: r['listing_status'],
      recruitingEvidence: r['recruiting_evidence'] ?? null,
      historicalAttendance: r['historical_attendance'] ?? null,
      sourceUrl: r['source_url'] ?? null,
      checkedDate: r['checked_date'] ?? null,
    }));

    res.json({ showcases, total: showcases.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load showcases', detail: msg });
  }
}
