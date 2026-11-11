import { encodeDraftContent } from '@/lib/portal/outreach-composition';
/**
 * POST /api/parent/recruiting/drafts
 *
 * Create a new outreach draft.
 * Body: { playerId, coachId, approvedFields?, selectedCollectionId?, selectedMedia?, selectedMatchRecords?, introduction? }
 *
 * No emails are sent. Drafts are labeled as such throughout.
 * Excludes: identity documents, full DOB, medical info, payment details, Locked In records.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingAccess } from '../_guard.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Fields that may be approved for sharing — excludes sensitive data
const ALLOWED_FIELDS = new Set([
  'name', 'ageBand', 'positions', 'primaryPosition', 'secondaryPosition',
  'jersey', 'clubName', 'stats', 'developmentInterests',
]);

export default async function handler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const playerId = typeof body.playerId === 'string' ? body.playerId : null;
  const coachId  = typeof body.coachId  === 'string' ? body.coachId  : null;

  if (!playerId || !coachId) {
    res.status(400).json({ error: 'playerId and coachId are required' });
    return;
  }

  const access = await requireRecruitingAccess(req, res, playerId);
  if (!access) return;

  // Validate and filter approvedFields
  const rawFields = Array.isArray(body.approvedFields) ? body.approvedFields : [];
  const approvedFields = rawFields
    .filter((f): f is string => typeof f === 'string' && ALLOWED_FIELDS.has(f));

  const selectedCollectionId = typeof body.selectedCollectionId === 'string' ? body.selectedCollectionId : null;
  const selectedMedia = Array.isArray(body.selectedMedia)
    ? (body.selectedMedia as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const selectedMatchRecords = Array.isArray(body.selectedMatchRecords)
    ? (body.selectedMatchRecords as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const introduction    = typeof body.introduction    === 'string' ? body.introduction.slice(0, 2000)    : null;
  const subject         = typeof body.subject         === 'string' ? body.subject.slice(0, 500)          : null;
  const recipientName   = typeof body.recipientName   === 'string' ? body.recipientName.slice(0, 255)    : null;
  const recipientEmail  = typeof body.recipientEmail  === 'string' ? body.recipientEmail.slice(0, 255)   : null;

  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — must unwrap [0].
    // The old pattern (Array.isArray(tableCheck) ? tableCheck : ...) returned
    // the 2-element tuple so .length was always 2 and the table check always
    // passed even when the table didn't exist. Fixed below.
    const tableCheck = await db.execute(sql.raw(`SHOW TABLES LIKE 'sc_outreach_drafts'`)) as unknown;
    const tableArr = (Array.isArray(tableCheck) ? tableCheck[0] : (tableCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!tableArr.length) {
      res.status(503).json({ error: 'Recruiting schema not yet migrated.' });
      return;
    }

    // Verify coach exists — same unwrap fix.
    const coachCheck = await db.execute(sql.raw(`SELECT id FROM sc_college_coaches WHERE id = '${coachId.replace(/'/g, "''")}' LIMIT 1`)) as unknown;
    const coachRows = (Array.isArray(coachCheck) ? coachCheck[0] : (coachCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!coachRows.length) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }

    const id = randomUUID();
    const storedIntroduction = body.composition ? encodeDraftContent(introduction ?? '', body.composition) : introduction;
    await db.execute(sql`
      INSERT INTO sc_outreach_drafts
        (id, user_id, player_id, coach_id, approved_fields, selected_collection_id,
         selected_media, selected_match_records, introduction,
         subject, recipient_name, recipient_email, draft_status)
      VALUES
        (${id}, ${access.userId}, ${playerId}, ${coachId},
         ${JSON.stringify(approvedFields)}, ${selectedCollectionId}, ${JSON.stringify(selectedMedia)},
         ${JSON.stringify(selectedMatchRecords)}, ${storedIntroduction}, ${subject}, ${recipientName}, ${recipientEmail}, 'draft')
    `);

    res.status(201).json({ ok: true, draftId: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create draft', detail: msg });
  }
}
