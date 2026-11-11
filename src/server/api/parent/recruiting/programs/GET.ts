/**
 * GET /api/parent/recruiting/programs?playerId=:id&region=...
 *
 * Returns college programs with their verified coaches (if any).
 * Programs with no verified coach rows are still returned — the UI
 * shows "Coach verification pending" for those programs.
 *
 * This is the correct endpoint for the Coaches & Colleges tab.
 * The old /coaches endpoint (INNER JOIN) was replaced by this one
 * because it silently returned nothing when all coaches were withheld.
 *
 * Auth-gated + U16+ player ownership check — never public.
 * Coach contact details are NEVER exposed through public APIs.
 *
 * Query params:
 *   playerId — required; used to verify ownership and U16+ eligibility
 *   region   — filter by region slug (e.g. "colorado")
 *   gender   — "mens" | "womens"
 *   division — "NCAA D1" | "NCAA D2" | "NCAA D3" | "NAIA" | "NJCAA"
 *   q        — search by institution name or coach name
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingOutreachAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';
import { unverifiedCoachKeys } from '../_recruiting-data.js';

interface ProgramRow {
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
  // LEFT JOIN coach fields — null when no verified coach row exists
  coachId: string | null;
  coachImportKey: string | null;
  coachName: string | null;
  role: string | null;
  email: string | null;
  emailIsPersonal: number | null;
  phone: string | null;
  staffPageUrl: string | null;
  checkedDate: string | null;
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
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_college_programs'`));
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ programs: [], message: 'Recruiting schema not yet migrated. Run /api/parent/admin/run-schema-recruiting first.' });
      return;
    }

    // Build the unverified coach import_key exclusion list from the bundled JSON.
    // Coaches whose import_key is in this set are excluded from the LEFT JOIN result
    // even if they are present in sc_college_coaches. Non-destructive — rows are never deleted.
    let unverifiedKeyClause = '';
    if (unverifiedCoachKeys.size > 0) {
      const keyList = [...unverifiedCoachKeys].map(k => `'${k.replace(/'/g, "''")}'`).join(', ');
      unverifiedKeyClause = `AND c.import_key NOT IN (${keyList})`;
    }

    // Build program WHERE clauses
    const programWhere: string[] = ['p.active = 1'];

    if (region) {
      programWhere.push(`FIND_IN_SET('${region.replace(/'/g, "''")}', p.regions) > 0`);
    }
    if (gender && (gender === 'mens' || gender === 'womens')) {
      programWhere.push(`p.gender = '${gender}'`);
    }
    if (division) {
      programWhere.push(`p.division = '${division.replace(/'/g, "''")}'`);
    }
    if (q) {
      const safe = q.replace(/'/g, "''");
      // Search matches institution name, short name, or any verified coach name
      programWhere.push(`(p.institution LIKE '%${safe}%' OR p.short_name LIKE '%${safe}%')`);
    }

    const where = `WHERE ${programWhere.join(' AND ')}`;

    // LEFT JOIN: programs are returned even when no verified coach row exists.
    // The unverifiedKeyClause is applied to the JOIN condition, not the WHERE,
    // so programs with only unverified coaches still appear (with null coach fields).
    const result = await db.execute(sql.raw(`
      SELECT
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
        p.staff_url     AS staffUrl,
        c.id            AS coachId,
        c.import_key    AS coachImportKey,
        c.name          AS coachName,
        c.role,
        c.email,
        c.email_is_personal AS emailIsPersonal,
        c.phone,
        c.staff_page_url AS staffPageUrl,
        c.checked_date  AS checkedDate
      FROM sc_college_programs p
      LEFT JOIN sc_college_coaches c
        ON c.program_id = p.id
        AND c.active = 1
        ${unverifiedKeyClause}
      ${where}
      ORDER BY p.institution ASC, c.role ASC, c.name ASC
      LIMIT 1000
    `));

    // db.execute(sql.raw(...)) returns [rows, fields] — extract index 0.
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as ProgramRow[];

    // Group coach rows by program — one program row per coach from the LEFT JOIN.
    const programMap = new Map<string, {
      id: string;
      institution: string;
      shortName: string | null;
      gender: string;
      division: string | null;
      conference: string | null;
      city: string | null;
      state: string | null;
      regions: string[];
      programUrl: string | null;
      staffUrl: string | null;
      coaches: Array<{
        coachId: string;
        name: string | null;
        role: string | null;
        email: string | null;
        emailIsPersonal: boolean | null;
        phone: string | null;
        staffPageUrl: string | null;
        checkedDate: string | null;
      }>;
    }>();

    for (const r of rows) {
      if (!programMap.has(r.programId)) {
        programMap.set(r.programId, {
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
          coaches: [],
        });
      }
      // Only add a coach entry if the LEFT JOIN matched a real coach row
      if (r.coachId) {
        programMap.get(r.programId)!.coaches.push({
          coachId: r.coachId,
          name: r.coachName ?? null,
          role: r.role ?? null,
          email: r.email ?? null,
          emailIsPersonal: r.emailIsPersonal === 1 ? true : r.emailIsPersonal === 0 ? false : null,
          phone: r.phone ?? null,
          staffPageUrl: r.staffPageUrl ?? null,
          checkedDate: r.checkedDate ?? null,
        });
      }
    }

    const programs = Array.from(programMap.values());
    res.json({ programs, total: programs.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load programs', detail: msg });
  }
}
