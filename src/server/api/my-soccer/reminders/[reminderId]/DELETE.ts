/**
 * DELETE /api/my-soccer/reminders/:reminderId
 * Cancel a pending reminder (ownership enforced).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scReminders } from '../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const reminderId = String(req.params.reminderId);

  const existing = await db
    .select({ id: scReminders.id })
    .from(scReminders)
    .where(and(eq(scReminders.id, reminderId), eq(scReminders.userId, userId)))
    .limit(1);

  if (existing.length === 0) return res.status(404).json({ error: 'Reminder not found or not owned by you' });

  await db.update(scReminders)
    .set({ status: 'cancelled' })
    .where(sql`${scReminders.id} = ${reminderId}`);

  return res.json({ ok: true });
}
