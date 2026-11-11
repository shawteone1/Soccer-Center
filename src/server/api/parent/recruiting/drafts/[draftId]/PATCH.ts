import { encodeDraftContent, decodeDraftContent } from '@/lib/portal/outreach-composition';
/**
 * PATCH /api/parent/recruiting/drafts/:draftId
 *
 * Update an outreach draft.
 * Body: { playerId, approvedFields?, selectedCollectionId?, selectedMedia?, selectedMatchRecords?, introduction? }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireRecruitingAccess } from '../../_guard.js';
import { sql, type SQL } from 'drizzle-orm';

const ALLOWED_FIELDS = new Set([
  'name', 'ageBand', 'positions', 'primaryPosition', 'secondaryPosition',
  'jersey', 'clubName', 'stats', 'developmentInterests',
]);

export default async function handler(req: Request, res: Response): Promise<void> {
  const { draftId } = req.params as { draftId: string };
  const body = req.body as Record<string, unknown>;
  const playerId = typeof body.playerId === 'string' ? body.playerId : null;

  if (!playerId) {
    res.status(400).json({ error: 'playerId is required' });
    return;
  }

  const access = await requireRecruitingAccess(req, res, playerId);
  if (!access) return;

  try {
    // Verify ownership.
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — must unwrap [0].
    // The old pattern (Array.isArray(ownerCheck) ? ownerCheck : ...) returned
    // the 2-element tuple, so .length was always 2 and ownership was never
    // enforced. Fixed: cast to unknown and destructure [0].
    const ownerCheck = await db.execute(sql`
      SELECT id, introduction FROM sc_outreach_drafts
      WHERE id = ${draftId} AND user_id = ${access.userId} AND player_id = ${playerId}
      LIMIT 1
    `) as unknown;
    const ownerRows = (Array.isArray(ownerCheck) ? ownerCheck[0] : (ownerCheck as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (!ownerRows.length) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    const sets: SQL[] = [];

    if (Array.isArray(body.approvedFields)) {
      const fields = body.approvedFields.filter((f): f is string => typeof f === 'string' && ALLOWED_FIELDS.has(f));
      sets.push(sql`approved_fields = ${JSON.stringify(fields)}`);
    }
    if ('selectedCollectionId' in body) sets.push(sql`selected_collection_id = ${typeof body.selectedCollectionId === 'string' ? body.selectedCollectionId : null}`);
    if (Array.isArray(body.selectedMedia)) sets.push(sql`selected_media = ${JSON.stringify(body.selectedMedia.filter(v => typeof v === 'string'))}`);
    if (Array.isArray(body.selectedMatchRecords)) sets.push(sql`selected_match_records = ${JSON.stringify(body.selectedMatchRecords.filter(v => typeof v === 'string'))}`);
    if ('introduction' in body || 'composition' in body) {
      const previous = decodeDraftContent((ownerRows[0] as {introduction?:unknown}).introduction);
      const message = typeof body.introduction === 'string' ? body.introduction.slice(0,2000) : previous.message;
      const composition = 'composition' in body ? body.composition : previous.composition;
      sets.push(sql`introduction = ${encodeDraftContent(message, composition)}`);
    }
    if ('subject' in body) sets.push(sql`subject = ${typeof body.subject === 'string' ? body.subject.slice(0,500) : null}`);
    if ('recipientName' in body) sets.push(sql`recipient_name = ${typeof body.recipientName === 'string' ? body.recipientName.slice(0,255) : null}`);
    if ('recipientEmail' in body) sets.push(sql`recipient_email = ${typeof body.recipientEmail === 'string' ? body.recipientEmail.slice(0,255) : null}`);
    // markSent: manual "Mark as sent" action — sets draft_status='sent' and sent_at=NOW().
    // Never auto-set; only triggered by explicit user action.
    if (body.markSent === true) {
      sets.push(sql`draft_status = 'sent'`);
      sets.push(sql`sent_at = CURRENT_TIMESTAMP`);
    } else if (body.markSent === false) {
      // Allow un-marking (revert to draft)
      sets.push(sql`draft_status = 'draft'`);
      sets.push(sql`sent_at = NULL`);
    }

    if (!sets.length) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await db.execute(sql`
      UPDATE sc_outreach_drafts
      SET ${sql.join(sets, sql`, `)}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${draftId} AND user_id = ${access.userId} AND player_id = ${playerId}
    `);

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to update draft', detail: msg });
  }
}
