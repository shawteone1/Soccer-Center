/**
 * POST /api/parent/admin/seed-recruiting
 *
 * Idempotent import of college programs, coaches, ID camps, and showcases.
 *
 * DATA LOADING — SERVER-ONLY BUNDLED IMPORTS
 * ------------------------------------------
 * The four JSON files are imported statically at module load time. With
 * noExternal:true in the SSR build, Vite/Rollup inlines them directly into
 * server.bundle.mjs — no filesystem access at runtime, no dependency on src/
 * or process.cwd(), and no public/ exposure. The files are never reachable
 * via any HTTP route.
 *
 * Uses INSERT IGNORE (stable importKey) — safe to re-run.
 * Does NOT update existing rows — re-run after schema migration only.
 * Admin-only. Never exposed publicly.
 *
 * COACH VERIFICATION GATE
 * -----------------------
 * Coach records carry a _verificationStatus field:
 *   "corrected"        — name was wrong in a prior build; corrected from official source.
 *                        Safe to seed.
 *   "unverified-name"  — name sourced from prior session data, not confirmed against
 *                        the official staff page in this session. WITHHELD from seed.
 *                        The record is counted in withheld[] and skipped.
 *   (absent)           — legacy record; treated as unverified-name (withheld).
 *
 * Unverified-name coaches are NEVER seeded regardless of request body.
 * The response reports how many were withheld and which programs they belong to.
 * Programs and camps/showcases are always seeded (no coach-name dependency).
 *
 * Returns: { programs, coaches, camps, showcases } counts with created/skipped/error per table,
 *          plus fileCounts (source record counts) and coaches.withheld listing excluded records.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireAdmin } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Bundled recruiting data — inlined into server.bundle.mjs at build time.
// Never served over HTTP; not in dist/client/.
import {
  collegeProgramsData  as programsData,
  collegeCoachesData   as coachesData,
  idCampsData          as campsData,
  showcasesData,
  recruitingFileCounts as FILE_COUNTS,
} from '../../recruiting/_recruiting-data.js';

interface ImportResult {
  table: string;
  created: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
  // Programs: deactivated records (no-program-confirmed, duplicate-deactivated) seeded as active=0
  deactivated?: Array<{ importKey: string; institution: string; reason: string }>;
  // Coaches: unverified-name records withheld entirely (not seeded)
  withheld?: Array<{ importKey: string; name: string | null; staffPageUrl: string; reason: string }>;
}

async function tableExists(table: string): Promise<boolean> {
  try {
    const rows = await db.execute(sql.raw(`SHOW TABLES LIKE '${table}'`));
    // db.execute(sql.raw(...)) returns [rows, fields] — must extract index 0.
    const arr = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? []) as unknown[];
    return arr.length > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  // Guard: if any dataset is empty the bundle is corrupt or the import path is wrong.
  // Surface this immediately rather than silently seeding 0 rows and reporting success.
  if (programsData.length === 0) {
    res.status(500).json({
      ok: false,
      error: 'college-programs.json bundled with 0 records — rebuild required',
      fileCounts: FILE_COUNTS,
    });
    return;
  }

  const results: ImportResult[] = [];
  // ── Programs ──────────────────────────────────────────────────────────────
  {
    const r: ImportResult = { table: 'sc_college_programs', created: 0, skipped: 0, errors: 0, errorDetails: [], deactivated: [] };
    if (!(await tableExists('sc_college_programs'))) {
      r.errorDetails.push('Table does not exist — run run-schema-recruiting first');
      r.errors++;
    } else {
      for (const p of programsData) {
        try {
          const id = randomUUID();
          const esc = (v: unknown) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
          // active field: source JSON carries explicit 0 for three categories:
          //   no-program-confirmed    — official page confirms no program exists
          //   duplicate-deactivated   — duplicate of a canonical record
          //   held-pending-verification — program exists but URLs/coaches unverified
          // All others are 1. Never default to 1 blindly — read the source value so
          // ineligible programs are never shown to users.
          const activeVal = p['active'] === 0 ? 0 : 1;
          const verStatus = (p['_verificationStatus'] as string | undefined) ?? '';
          if (activeVal === 0) {
            const reason =
              verStatus === 'duplicate-deactivated'
                ? 'Duplicate of canonical record — seeded as active=0'
                : verStatus === 'held-pending-verification'
                  ? 'Held pending verification of program URLs/coaches — seeded as active=0'
                  : 'No program confirmed from official athletics page — seeded as active=0';
            r.deactivated!.push({
              importKey: String(p['importKey']),
              institution: String(p['institution'] ?? ''),
              reason,
            });
          }

          const result = await db.execute(sql.raw(`
            INSERT IGNORE INTO sc_college_programs
              (id, import_key, institution, short_name, gender, division, conference, city, state, regions, program_url, staff_url, checked_date, source_url, active)
            VALUES
              ('${id}', ${esc(p['importKey'])}, ${esc(p['institution'])}, ${esc(p['shortName'])},
               ${esc(p['gender'])}, ${esc(p['division'])}, ${esc(p['conference'])},
               ${esc(p['city'])}, ${esc(p['state'])}, ${esc(p['regions'])},
               ${esc(p['programUrl'])}, ${esc(p['staffUrl'])}, ${esc(p['checkedDate'])}, ${esc(p['sourceUrl'])},
               ${activeVal})
          `));
          // mysql2 ResultSetHeader uses affectedRows (not rowsAffected).
          // INSERT IGNORE returns affectedRows=0 when the row already exists (UNIQUE key conflict).
          const affected = (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
          if (affected > 0) {
            r.created++;
          } else {
            // Row exists — apply corrections to mutable fields (conference, URLs, checked_date, active).
            // importKey, institution, gender, division are stable identifiers and are not updated.
            await db.execute(sql.raw(`
              UPDATE sc_college_programs SET
                conference   = ${esc(p['conference'])},
                program_url  = ${esc(p['programUrl'])},
                staff_url    = ${esc(p['staffUrl'])},
                checked_date = ${esc(p['checkedDate'])},
                source_url   = ${esc(p['sourceUrl'])},
                active       = ${activeVal}
              WHERE import_key = ${esc(p['importKey'])}
            `));
            r.skipped++;
          }
        } catch (err) {
          r.errors++;
          r.errorDetails.push(`${p['importKey']}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    results.push(r);
  }

  // ── Coaches ───────────────────────────────────────────────────────────────
  {
    const r: ImportResult = { table: 'sc_college_coaches', created: 0, skipped: 0, errors: 0, errorDetails: [], withheld: [] };
    if (!(await tableExists('sc_college_coaches'))) {
      r.errorDetails.push('Table does not exist');
      r.errors++;
    } else {
      for (const c of coachesData) {
        try {
          const verStatus = (c['_verificationStatus'] as string | undefined) ?? 'unverified-name';

          // HARD GATE: never seed unverified-name coaches regardless of request body.
          // A coach with name=null and unverified-name is also withheld — the name
          // itself is unknown, so there is nothing accurate to present to users.
          if (verStatus === 'unverified-name') {
            r.withheld!.push({
              importKey: String(c['importKey']),
              name: c['name'] as string | null,
              staffPageUrl: String(c['staffPageUrl'] ?? ''),
              reason: c['name'] == null
                ? 'Name unknown — not confirmed from official staff page'
                : 'Name not confirmed against official staff page in this session',
            });
            r.skipped++;
            continue;
          }

          // Look up program id by importKey
          const progResult = await db.execute(sql.raw(`SELECT id FROM sc_college_programs WHERE import_key = '${String(c['programImportKey']).replace(/'/g, "''")}' LIMIT 1`));
          // db.execute returns [rows, fields] — extract index 0.
          const progRows = (Array.isArray(progResult) ? progResult[0] : (progResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
          if (!progRows.length) {
            r.skipped++;
            continue;
          }
          const programId = (progRows[0] as Record<string, unknown>)['id'] as string;
          const id = randomUUID();
          const esc = (v: unknown) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
          const emailIsPersonal = c['emailIsPersonal'] == null ? 'NULL' : c['emailIsPersonal'] ? '1' : '0';

          // INSERT IGNORE for new rows; then UPDATE the mutable fields for
          // corrected coaches so a previously-seeded row with a wrong or null
          // name is brought up to date. INSERT IGNORE alone silently skips
          // existing rows — it does not correct them.
          const insertResult = await db.execute(sql.raw(`
            INSERT IGNORE INTO sc_college_coaches
              (id, import_key, program_id, name, role, email, email_is_personal, phone, staff_page_url, checked_date, source_url)
            VALUES
              ('${id}', ${esc(c['importKey'])}, '${programId}', ${esc(c['name'])}, ${esc(c['role'])},
               ${esc(c['email'])}, ${emailIsPersonal}, ${esc(c['phone'])},
               ${esc(c['staffPageUrl'])}, ${esc(c['checkedDate'])}, ${esc(c['sourceUrl'])})
          `));
          // mysql2 ResultSetHeader uses affectedRows (not rowsAffected).
          const insertAffected = (insertResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;

          if (insertAffected > 0) {
            // New row inserted
            r.created++;
          } else {
            // Row already existed — update mutable fields so corrections land.
            // This is safe to re-run: it only touches corrected-status coaches.
            await db.execute(sql.raw(`
              UPDATE sc_college_coaches
              SET
                name              = ${esc(c['name'])},
                role              = ${esc(c['role'])},
                email             = ${esc(c['email'])},
                email_is_personal = ${emailIsPersonal},
                phone             = ${esc(c['phone'])},
                staff_page_url    = ${esc(c['staffPageUrl'])},
                checked_date      = ${esc(c['checkedDate'])},
                source_url        = ${esc(c['sourceUrl'])}
              WHERE import_key = ${esc(c['importKey'])}
            `));
            r.skipped++; // counted as skipped (not a new row) but fields were updated
          }
        } catch (err) {
          r.errors++;
          r.errorDetails.push(`${c['importKey']}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    results.push(r);
  }

  // ── ID Camps ──────────────────────────────────────────────────────────────
  {
    const r: ImportResult = { table: 'sc_id_camps', created: 0, skipped: 0, errors: 0, errorDetails: [] };
    if (!(await tableExists('sc_id_camps'))) {
      r.errorDetails.push('Table does not exist');
      r.errors++;
    } else {
      for (const c of campsData) {
        try {
          const esc = (v: unknown) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
          let programId = 'NULL';
          if (c['programImportKey']) {
            const progResult = await db.execute(sql.raw(`SELECT id FROM sc_college_programs WHERE import_key = '${String(c['programImportKey']).replace(/'/g, "''")}' LIMIT 1`));
            // db.execute returns [rows, fields] — extract index 0.
            const progRows = (Array.isArray(progResult) ? progResult[0] : (progResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
            if (progRows.length) programId = `'${progRows[0]['id']}'`;
          }
          const id = randomUUID();
          const result = await db.execute(sql.raw(`
            INSERT IGNORE INTO sc_id_camps
              (id, import_key, program_id, institution, camp_name, region, city, state, gender,
               age_eligibility, start_date, end_date, registration_opens, registration_deadline,
               price, registration_url, listing_status, estimate_evidence, source_url, checked_date)
            VALUES
              ('${id}', ${esc(c['importKey'])}, ${programId}, ${esc(c['institution'])}, ${esc(c['campName'])},
               ${esc(c['region'])}, ${esc(c['city'])}, ${esc(c['state'])}, ${esc(c['gender'])},
               ${esc(c['ageEligibility'])}, ${esc(c['startDate'])}, ${esc(c['endDate'])},
               ${esc(c['registrationOpens'])}, ${esc(c['registrationDeadline'])},
               ${esc(c['price'])}, ${esc(c['registrationUrl'])}, ${esc(c['listingStatus'])},
               ${esc(c['estimateEvidence'])}, ${esc(c['sourceUrl'])}, ${esc(c['checkedDate'])})
          `));
          // mysql2 ResultSetHeader uses affectedRows (not rowsAffected).
          const affected = (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
          if (affected > 0) r.created++; else r.skipped++;
        } catch (err) {
          r.errors++;
          r.errorDetails.push(`${c['importKey']}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    results.push(r);
  }

  // ── Showcases ─────────────────────────────────────────────────────────────
  {
    const r: ImportResult = { table: 'sc_showcases', created: 0, skipped: 0, errors: 0, errorDetails: [] };
    if (!(await tableExists('sc_showcases'))) {
      r.errorDetails.push('Table does not exist');
      r.errors++;
    } else {
      for (const s of showcasesData) {
        try {
          const esc = (v: unknown) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
          const id = randomUUID();
          const result = await db.execute(sql.raw(`
            INSERT IGNORE INTO sc_showcases
              (id, import_key, name, organizer, region, city, state, official_url, gender,
               age_groups, start_date, end_date, registration_deadline, entry_type,
               listing_status, recruiting_evidence, historical_attendance, source_url, checked_date)
            VALUES
              ('${id}', ${esc(s['importKey'])}, ${esc(s['name'])}, ${esc(s['organizer'])},
               ${esc(s['region'])}, ${esc(s['city'])}, ${esc(s['state'])}, ${esc(s['officialUrl'])},
               ${esc(s['gender'])}, ${esc(s['ageGroups'])}, ${esc(s['startDate'])}, ${esc(s['endDate'])},
               ${esc(s['registrationDeadline'])}, ${esc(s['entryType'])}, ${esc(s['listingStatus'])},
               ${esc(s['recruitingEvidence'])}, ${esc(s['historicalAttendance'])},
               ${esc(s['sourceUrl'])}, ${esc(s['checkedDate'])})
          `));
          // mysql2 ResultSetHeader uses affectedRows (not rowsAffected).
          const affected = (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
          if (affected > 0) r.created++; else r.skipped++;
        } catch (err) {
          r.errors++;
          r.errorDetails.push(`${s['importKey']}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    results.push(r);
  }

  const totalErrors = results.reduce((n, r) => n + r.errors, 0);
  const coachResult = results[1];
  const withheldCoaches = coachResult?.withheld ?? [];
  const deactivatedPrograms = results[0]?.deactivated ?? [];

  // Promote per-table results to top-level so the frontend RecruitingSeedResult
  // type can read seedResult.programs / .coaches / .camps / .showcases directly.
  // Previously these were nested under `summary`, causing the crash:
  //   "undefined is not an object (evaluating 'O.errors')"
  // because the UI read seedResult.programs (undefined) then accessed .errors on it.
  const programs  = results[0] ?? { table: 'sc_college_programs', created: 0, skipped: 0, errors: 0, errorDetails: [], deactivated: [] };
  const coaches   = results[1] ?? { table: 'sc_college_coaches',  created: 0, skipped: 0, errors: 0, errorDetails: [], withheld: [] };
  const camps     = results[2] ?? { table: 'sc_id_camps',         created: 0, skipped: 0, errors: 0, errorDetails: [] };
  const showcases = results[3] ?? { table: 'sc_showcases',        created: 0, skipped: 0, errors: 0, errorDetails: [] };

  const withheldMsg = withheldCoaches.length > 0
    ? `${withheldCoaches.length} coach record(s) withheld — names not confirmed against official staff pages. Verify each name at the staffPageUrl and update college-coaches.json with _verificationStatus: "corrected" before re-seeding.`
    : undefined;

  res.status(totalErrors > 0 ? 207 : 200).json({
    ok: totalErrors === 0,
    // Source record counts — confirms the bundled JSON was loaded correctly.
    // Non-zero values here mean the data files were present in the build.
    fileCounts: FILE_COUNTS,
    // Top-level per-table results — matches RecruitingSeedResult frontend type
    programs,
    coaches,
    camps,
    showcases,
    // Full results array for detailed per-row inspection
    results,
    // Legacy summary key preserved for any other consumers
    summary: { programs, coaches, camps, showcases },
    withheld: withheldCoaches.length > 0 ? {
      message: withheldMsg,
      coaches: withheldCoaches,
    } : undefined,
    deactivated: deactivatedPrograms.length > 0 ? {
      message: `${deactivatedPrograms.length} program record(s) seeded as active=0 — confirmed no program or duplicate. These will not appear in recruiting results.`,
      programs: deactivatedPrograms,
    } : undefined,
  });
}
