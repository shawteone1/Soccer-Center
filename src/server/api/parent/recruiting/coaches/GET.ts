/**
 * GET /api/parent/recruiting/coaches?playerId=:id&region=...
 *
 * Returns college coaches and their programs.
 * Auth-gated + U16+ player ownership check — never public.
 * Coach contact details are NEVER exposed through public APIs.
 *
 * Query params:
 *   playerId — required; used to verify ownership and U16+ eligibility
 *   region   — filter by region slug (e.g. "colorado")
 *   gender   — "mens" | "womens"
 *   division — "NCAA D1" | "NCAA D2" | "NCAA D3" | "NAIA" | "NJCAA"
 *   q        — search by institution name or coach name
 *
 * Non-destructive exclusion of unverified coaches:
 *   Coaches whose import_key appears in the unverified set (loaded from
 *   college-coaches.json at request time) are excluded from results even if
 *   they are present in sc_college_coaches. This is non-destructive — the rows
 *   are never deleted. If a coach is later verified (status updated to
 *   "corrected"), it will automatically appear in results on the next request.
 *
 *   Existing outreach drafts and saved opportunities that reference an excluded
 *   coach are NOT affected by this endpoint — they are preserved in the database.
 *   The RecruitingTab UI labels those references "Verification pending."
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingOutreachAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';
import { unverifiedCoachKeys } from '../_recruiting-data.js';

interface CoachRow {
  coachId: string;
  coachImportKey: string;
  coachName: string | null;
  role: string | null;
  email: string | null;
  emailIsPersonal: number | null;
  phone: string | null;
  staffPageUrl: string | null;
  checkedDate: string | null;
  programId: string;
  programImportKey: string;
  institution: string;
  shortName: string | null;
  gender: string;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  regions: string;
  programUrl: string | null;
  staffUrl: string | null;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const { playerId, region, gender, division, q } = req.query as Record<string, string | undefined>;

  if (!playerId) {
    res.status(400).json({ error: 'playerId is required', code: 'MISSING_PLAYER_ID' });
    return;
  }

  // Verify auth + ownership + U16+ age gate
  const access = await requireRecruitingOutreachAccess(req, res, playerId);
  if (!access) return;

  try {
    // Check tables exist.
    // db.execute(sql.raw(...)) returns [rows, fields] for mysql2 — extract index 0.
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_college_coaches'`));
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ coaches: [], message: 'Recruiting schema not yet migrated. Run /api/parent/admin/run-schema-recruiting first.' });
      return;
    }

    let whereClauses: string[] = ['c.active = 1', 'p.active = 1'];

    // Non-destructive exclusion: exclude coaches whose import_key is in the
    // unverified set (pre-computed from the bundled JSON at module load time).
    // Rows are never deleted — existing drafts and saved opportunities are safe.
    if (unverifiedCoachKeys.size > 0) {
      const keyList = [...unverifiedCoachKeys].map(k => `'${k.replace(/'/g, "''")}'`).join(', ');
      whereClauses.push(`c.import_key NOT IN (${keyList})`);
    }

    if (region) {
      whereClauses.push(`FIND_IN_SET('${region.replace(/'/g, "''")}', p.regions) > 0`);
    }
    if (gender && (gender === 'mens' || gender === 'womens')) {
      whereClauses.push(`p.gender = '${gender}'`);
    }
    if (division) {
      whereClauses.push(`p.division = '${division.replace(/'/g, "''")}'`);
    }
    if (q) {
      const safe = q.replace(/'/g, "''");
      whereClauses.push(`(p.institution LIKE '%${safe}%' OR p.short_name LIKE '%${safe}%' OR c.name LIKE '%${safe}%')`);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await db.execute(sql.raw(`
      SELECT
        c.id            AS coachId,
        c.import_key    AS coachImportKey,
        c.name          AS coachName,
        c.role,
        c.email,
        c.email_is_personal AS emailIsPersonal,
        c.phone,
        c.staff_page_url AS staffPageUrl,
        c.checked_date  AS checkedDate,
        p.id            AS programId,
        p.import_key    AS programImportKey,
        p.institution,
        p.short_name    AS shortName,
        p.gender,
        p.division,
        p.conference,
        p.city,
        p.state,
        p.regions,
        p.program_url   AS programUrl,
        p.staff_url     AS staffUrl
      FROM sc_college_coaches c
      JOIN sc_college_programs p ON c.program_id = p.id
      ${where}
      ORDER BY p.institution ASC, c.role ASC, c.name ASC
      LIMIT 500
    `));

    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as CoachRow[];

    const coaches = rows.map(r => ({
      coachId: r.coachId,
      name: r.coachName ?? null,
      role: r.role ?? null,
      email: r.email ?? null,
      emailIsPersonal: r.emailIsPersonal === 1 ? true : r.emailIsPersonal === 0 ? false : null,
      phone: r.phone ?? null,
      staffPageUrl: r.staffPageUrl ?? null,
      checkedDate: r.checkedDate ?? null,
      program: {
        id: r.programId,
        institution: r.institution,
        shortName: r.shortName ?? null,
        gender: r.gender,
        division: r.division ?? null,
        conference: r.conference ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
        regions: r.regions.split(',').map((s: string) => s.trim()),
        programUrl: r.programUrl ?? null,
        staffUrl: r.staffUrl ?? null,
      },
    }));

    res.json({ coaches, total: coaches.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load coaches', detail: msg });
  }
}
