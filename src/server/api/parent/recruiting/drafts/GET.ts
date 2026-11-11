import { decodeDraftContent } from '@/lib/portal/outreach-composition';
/**
 * GET /api/parent/recruiting/drafts?playerId=:id
 *
 * Returns all outreach drafts for a player.
 * Enforces auth + player ownership + U16+ eligibility.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response): Promise<void> {
  const { playerId } = req.query as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: 'playerId is required' });
    return;
  }

  const access = await requireRecruitingAccess(req, res, playerId);
  if (!access) return;

  try {
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_outreach_drafts'`));
    // db.execute(sql.raw(...)) returns [rows, fields] — must extract index 0.
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.json({ drafts: [] });
      return;
    }

    const result = await db.execute(sql.raw(`
      SELECT
        d.id, d.player_id, d.coach_id, d.approved_fields,
        d.selected_collection_id, d.selected_media, d.selected_match_records,
        d.introduction, d.subject, d.recipient_name, d.recipient_email,
        d.draft_status, d.sent_at, d.created_at, d.updated_at,
        c.name AS coach_name, c.role AS coach_role, c.email AS coach_email,
        c.email_is_personal AS coach_email_is_personal, c.staff_page_url,
        p.institution, p.short_name, p.gender, p.division, p.program_url
      FROM sc_outreach_drafts d
      JOIN sc_college_coaches c ON d.coach_id = c.id
      JOIN sc_college_programs p ON c.program_id = p.id
      WHERE d.user_id = '${access.userId.replace(/'/g, "''")}' AND d.player_id = '${playerId.replace(/'/g, "''")}'
      ORDER BY d.updated_at DESC
    `));

    // db.execute(sql.raw(...)) returns [rows, fields] — must extract index 0.
    const rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];

    res.json({
      drafts: rows.map(r => ({
        id: r['id'],
        playerId: r['player_id'],
        coachId: r['coach_id'],
        approvedFields: r['approved_fields'] ? JSON.parse(r['approved_fields'] as string) : [],
        selectedCollectionId: r['selected_collection_id'] ?? null,
        selectedMedia: r['selected_media'] ? JSON.parse(r['selected_media'] as string) : [],
        selectedMatchRecords: r['selected_match_records'] ? JSON.parse(r['selected_match_records'] as string) : [],
        introduction: decodeDraftContent(r['introduction']).message || null,
        composition: decodeDraftContent(r['introduction']).composition,
        subject: r['subject'] ?? null,
        recipientName: r['recipient_name'] ?? null,
        recipientEmail: r['recipient_email'] ?? null,
        draftStatus: r['draft_status'],
        sentAt: r['sent_at'] ?? null,
        createdAt: r['created_at'],
        updatedAt: r['updated_at'],
        coach: {
          name: r['coach_name'] ?? null,
          role: r['coach_role'] ?? null,
          email: r['coach_email'] ?? null,
          emailIsPersonal: r['coach_email_is_personal'] ?? null,
          staffPageUrl: r['staff_page_url'] ?? null,
        },
        program: {
          institution: r['institution'],
          shortName: r['short_name'] ?? null,
          gender: r['gender'],
          division: r['division'] ?? null,
          programUrl: r['program_url'] ?? null,
        },
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load drafts', detail: msg });
  }
}
