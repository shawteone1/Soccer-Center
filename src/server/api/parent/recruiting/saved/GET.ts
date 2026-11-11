/**
 * GET /api/parent/recruiting/saved?playerId=:id
 *
 * Returns all saved recruiting opportunities for a player, with resolved
 * display data for each item type (coach, camp, showcase).
 *
 * Each saved row is LEFT JOINed to its source table so the UI can render
 * a meaningful card without a second round-trip. If the source row has been
 * deleted the saved entry is still returned with resolved=false so the UI
 * can show a graceful "no longer available" state instead of a raw UUID.
 *
 * Enforces auth + player ownership. Available to all age groups.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingBaseAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const { playerId } = req.query as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: 'playerId is required' });
    return;
  }

  const access = await requireRecruitingBaseAccess(req, res, playerId);
  if (!access) return;

  try {
    // Guard: table may not exist yet on fresh deploys
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_recruiting_saved'`));
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ saved: [] });
      return;
    }

    const safeUserId   = access.userId.replace(/'/g, "''");
    const safePlayerId = playerId.replace(/'/g, "''");

    // ── Coach saves ──────────────────────────────────────────────────────────
    const coachResult = await db.execute(sql.raw(`
      SELECT
        s.id, s.item_type, s.item_id, s.status, s.calendar_event_id,
        s.notes, s.saved_at, s.updated_at,
        c.name         AS coach_name,
        c.role         AS coach_role,
        c.email        AS coach_email,
        c.email_is_personal AS coach_email_is_personal,
        c.phone        AS coach_phone,
        c.staff_page_url AS coach_staff_page_url,
        c.checked_date AS coach_checked_date,
        p.institution  AS program_institution,
        p.short_name   AS program_short_name,
        p.gender       AS program_gender,
        p.division     AS program_division,
        p.program_url  AS program_url
      FROM sc_recruiting_saved s
      LEFT JOIN sc_college_coaches c ON s.item_id = c.id
      LEFT JOIN sc_college_programs p ON c.program_id = p.id
      WHERE s.user_id = '${safeUserId}'
        AND s.player_id = '${safePlayerId}'
        AND s.item_type = 'coach'
      ORDER BY s.saved_at DESC
    `));
    const coachRows = (Array.isArray(coachResult) ? coachResult[0] : (coachResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    // ── Camp saves ───────────────────────────────────────────────────────────
    const campResult = await db.execute(sql.raw(`
      SELECT
        s.id, s.item_type, s.item_id, s.status, s.calendar_event_id,
        s.notes, s.saved_at, s.updated_at,
        c.camp_name    AS camp_name,
        c.institution  AS camp_institution,
        c.region       AS camp_region,
        c.city         AS camp_city,
        c.state        AS camp_state,
        c.gender       AS camp_gender,
        c.age_eligibility AS camp_age_eligibility,
        c.start_date   AS camp_start_date,
        c.end_date     AS camp_end_date,
        c.price        AS camp_price,
        c.registration_url AS camp_registration_url,
        c.listing_status   AS camp_listing_status
      FROM sc_recruiting_saved s
      LEFT JOIN sc_id_camps c ON s.item_id = c.id
      WHERE s.user_id = '${safeUserId}'
        AND s.player_id = '${safePlayerId}'
        AND s.item_type = 'camp'
      ORDER BY s.saved_at DESC
    `));
    const campRows = (Array.isArray(campResult) ? campResult[0] : (campResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    // ── Showcase saves ───────────────────────────────────────────────────────
    const showcaseResult = await db.execute(sql.raw(`
      SELECT
        s.id, s.item_type, s.item_id, s.status, s.calendar_event_id,
        s.notes, s.saved_at, s.updated_at,
        sh.name        AS showcase_name,
        sh.organizer   AS showcase_organizer,
        sh.region      AS showcase_region,
        sh.city        AS showcase_city,
        sh.state       AS showcase_state,
        sh.gender      AS showcase_gender,
        sh.age_groups  AS showcase_age_groups,
        sh.start_date  AS showcase_start_date,
        sh.end_date    AS showcase_end_date,
        sh.official_url AS showcase_official_url,
        sh.listing_status AS showcase_listing_status
      FROM sc_recruiting_saved s
      LEFT JOIN sc_showcases sh ON s.item_id = sh.id
      WHERE s.user_id = '${safeUserId}'
        AND s.player_id = '${safePlayerId}'
        AND s.item_type = 'showcase'
      ORDER BY s.saved_at DESC
    `));
    const showcaseRows = (Array.isArray(showcaseResult) ? showcaseResult[0] : (showcaseResult as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    // ── Merge and shape ──────────────────────────────────────────────────────
    type ResolvedSaved =
      | { id: string; itemType: 'coach';    itemId: string; status: string; calendarEventId: string | null; notes: string | null; savedAt: unknown; updatedAt: unknown; resolved: boolean; coach: { name: string | null; role: string | null; email: string | null; emailIsPersonal: boolean | null; phone: string | null; staffPageUrl: string | null; checkedDate: string | null }; program: { institution: string | null; shortName: string | null; gender: string | null; division: string | null; programUrl: string | null } }
      | { id: string; itemType: 'camp';     itemId: string; status: string; calendarEventId: string | null; notes: string | null; savedAt: unknown; updatedAt: unknown; resolved: boolean; camp: { name: string | null; institution: string | null; region: string | null; city: string | null; state: string | null; gender: string | null; ageEligibility: string | null; startDate: string | null; endDate: string | null; price: string | null; registrationUrl: string | null; listingStatus: string | null } }
      | { id: string; itemType: 'showcase'; itemId: string; status: string; calendarEventId: string | null; notes: string | null; savedAt: unknown; updatedAt: unknown; resolved: boolean; showcase: { name: string | null; organizer: string | null; region: string | null; city: string | null; state: string | null; gender: string | null; ageGroups: string | null; startDate: string | null; endDate: string | null; officialUrl: string | null; listingStatus: string | null } };

    const saved: ResolvedSaved[] = [
      ...coachRows.map(r => ({
        id: r['id'] as string,
        itemType: 'coach' as const,
        itemId: r['item_id'] as string,
        status: r['status'] as string,
        calendarEventId: (r['calendar_event_id'] ?? null) as string | null,
        notes: (r['notes'] ?? null) as string | null,
        savedAt: r['saved_at'],
        updatedAt: r['updated_at'],
        resolved: r['coach_name'] != null || r['program_institution'] != null,
        coach: {
          name:          (r['coach_name']          ?? null) as string | null,
          role:          (r['coach_role']           ?? null) as string | null,
          email:         (r['coach_email']          ?? null) as string | null,
          emailIsPersonal: r['coach_email_is_personal'] != null ? Boolean(r['coach_email_is_personal']) : null,
          phone:         (r['coach_phone']          ?? null) as string | null,
          staffPageUrl:  (r['coach_staff_page_url'] ?? null) as string | null,
          checkedDate:   (r['coach_checked_date']   ?? null) as string | null,
        },
        program: {
          institution: (r['program_institution'] ?? null) as string | null,
          shortName:   (r['program_short_name']  ?? null) as string | null,
          gender:      (r['program_gender']      ?? null) as string | null,
          division:    (r['program_division']    ?? null) as string | null,
          programUrl:  (r['program_url']         ?? null) as string | null,
        },
      })),
      ...campRows.map(r => ({
        id: r['id'] as string,
        itemType: 'camp' as const,
        itemId: r['item_id'] as string,
        status: r['status'] as string,
        calendarEventId: (r['calendar_event_id'] ?? null) as string | null,
        notes: (r['notes'] ?? null) as string | null,
        savedAt: r['saved_at'],
        updatedAt: r['updated_at'],
        resolved: r['camp_name'] != null,
        camp: {
          name:            (r['camp_name']            ?? null) as string | null,
          institution:     (r['camp_institution']     ?? null) as string | null,
          region:          (r['camp_region']          ?? null) as string | null,
          city:            (r['camp_city']            ?? null) as string | null,
          state:           (r['camp_state']           ?? null) as string | null,
          gender:          (r['camp_gender']          ?? null) as string | null,
          ageEligibility:  (r['camp_age_eligibility'] ?? null) as string | null,
          startDate:       (r['camp_start_date']      ?? null) as string | null,
          endDate:         (r['camp_end_date']        ?? null) as string | null,
          price:           (r['camp_price']           ?? null) as string | null,
          registrationUrl: (r['camp_registration_url']?? null) as string | null,
          listingStatus:   (r['camp_listing_status']  ?? null) as string | null,
        },
      })),
      ...showcaseRows.map(r => ({
        id: r['id'] as string,
        itemType: 'showcase' as const,
        itemId: r['item_id'] as string,
        status: r['status'] as string,
        calendarEventId: (r['calendar_event_id'] ?? null) as string | null,
        notes: (r['notes'] ?? null) as string | null,
        savedAt: r['saved_at'],
        updatedAt: r['updated_at'],
        resolved: r['showcase_name'] != null,
        showcase: {
          name:        (r['showcase_name']       ?? null) as string | null,
          organizer:   (r['showcase_organizer']  ?? null) as string | null,
          region:      (r['showcase_region']     ?? null) as string | null,
          city:        (r['showcase_city']       ?? null) as string | null,
          state:       (r['showcase_state']      ?? null) as string | null,
          gender:      (r['showcase_gender']     ?? null) as string | null,
          ageGroups:   (r['showcase_age_groups'] ?? null) as string | null,
          startDate:   (r['showcase_start_date'] ?? null) as string | null,
          endDate:     (r['showcase_end_date']   ?? null) as string | null,
          officialUrl: (r['showcase_official_url']?? null) as string | null,
          listingStatus:(r['showcase_listing_status']?? null) as string | null,
        },
      })),
    ];

    // Sort by savedAt DESC across all types
    saved.sort((a, b) => {
      const ta = a.savedAt ? new Date(a.savedAt as string).getTime() : 0;
      const tb = b.savedAt ? new Date(b.savedAt as string).getTime() : 0;
      return tb - ta;
    });

    res.json({ saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load saved items', detail: msg });
  }
}
