/**
 * POST /api/calendar/outlook/disconnect
 * Removes the Outlook OAuth token and synced events for the signed-in user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scOauthTokens, scCalendarEvents } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../../../my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const token = await db
    .select()
    .from(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')))
    .limit(1);

  if (token.length === 0) return res.status(404).json({ error: 'Outlook not connected' });

  await db.delete(scOauthTokens)
    .where(and(eq(scOauthTokens.userId, userId), eq(scOauthTokens.provider, 'outlook')));

  await db.delete(scCalendarEvents)
    .where(and(eq(scCalendarEvents.userId, userId), eq(scCalendarEvents.provider, 'outlook')));

  return res.json({ ok: true });
}
