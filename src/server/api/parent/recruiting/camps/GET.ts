/**
 * GET /api/parent/recruiting/camps
 *
 * Returns college ID camps. Auth-gated — never public.
 *
 * Query params:
 *   region        — filter by region slug
 *   gender        — "mens" | "womens" | "coed"
 *   listingStatus — "confirmed_upcoming" | "historical" | "estimated" | "directory_only"
 *   q             — search by institution or camp name
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
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_id_camps'`));
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ camps: [], message: 'Recruiting schema not yet migrated.' });
      return;
    }

    const whereClauses: string[] = ['c.active = 1'];

    if (region) {
      whereClauses.push(`c.region = '${region.replace(/'/g, "''")}'`);
    }
    if (gender) {
      whereClauses.push(`(c.gender = '${gender.replace(/'/g, "''")}' OR c.gender = 'coed')`);
    }
    if (listingStatus) {
      whereClauses.push(`c.listing_status = '${listingStatus.replace(/'/g, "''")}'`);
    }
    if (q) {
      const safe = q.replace(/'/g, "''");
      whereClauses.push(`(c.institution LIKE '%${safe}%' OR c.camp_name LIKE '%${safe}%')`);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;

    const result = await db.execute(sql.raw(`
      SELECT
        c.id, c.import_key, c.institution, c.camp_name, c.region,
        c.city, c.state, c.gender, c.age_eligibility,
        c.start_date, c.end_date, c.registration_opens, c.registration_deadline,
        c.price, c.registration_url, c.listing_status, c.estimate_evidence,
        c.source_url, c.checked_date,
        p.import_key AS program_import_key, p.program_url, p.staff_url,
        p.division, p.conference
      FROM sc_id_camps c
      LEFT JOIN sc_college_programs p ON c.program_id = p.id
      ${where}
      ORDER BY
        CASE c.listing_status
          WHEN 'confirmed_upcoming' THEN 1
          WHEN 'estimated' THEN 2
          WHEN 'directory_only' THEN 3
          WHEN 'historical' THEN 4
          ELSE 5
        END,
        c.start_date ASC,
        c.institution ASC
      LIMIT 200
    `));

    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    const camps = rows.map(r => ({
      id: r['id'],
      institution: r['institution'],
      campName: r['camp_name'],
      region: r['region'],
      city: r['city'] ?? null,
      state: r['state'] ?? null,
      gender: r['gender'] ?? null,
      ageEligibility: r['age_eligibility'] ?? null,
      startDate: r['start_date'] ?? null,
      endDate: r['end_date'] ?? null,
      registrationOpens: r['registration_opens'] ?? null,
      registrationDeadline: r['registration_deadline'] ?? null,
      price: r['price'] ?? null,
      registrationUrl: r['registration_url'] ?? null,
      listingStatus: r['listing_status'],
      estimateEvidence: r['estimate_evidence'] ?? null,
      sourceUrl: r['source_url'] ?? null,
      checkedDate: r['checked_date'] ?? null,
      program: r['program_import_key'] ? {
        importKey: r['program_import_key'],
        programUrl: r['program_url'] ?? null,
        staffUrl: r['staff_url'] ?? null,
        division: r['division'] ?? null,
        conference: r['conference'] ?? null,
      } : null,
    }));

    res.json({ camps, total: camps.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load camps', detail: msg });
  }
}
