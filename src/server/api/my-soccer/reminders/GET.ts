/**
 * GET /api/my-soccer/reminders/pending
 * Returns undelivered in-app reminders for the authenticated user
 * whose scheduledFor is in the past. Marks them delivered.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scReminders } from '../../../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const now = new Date().toISOString();

  const due = await db
    .select()
    .from(scReminders)
    .where(
      and(
        eq(scReminders.userId, userId),
        eq(scReminders.status, 'pending'),
        eq(scReminders.channel, 'in_app'),
        lte(scReminders.scheduledFor, now),
      ),
    );

  if (due.length > 0) {
    // Mark all as delivered
    for (const r of due) {
      await db.update(scReminders)
        .set({ status: 'delivered', deliveredAt: new Date() })
        .where(eq(scReminders.id, r.id));
    }
  }

  return res.json({ reminders: due });
}
