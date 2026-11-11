/**
 * DELETE /api/my-soccer/saved-tryouts/:tryoutId
 * Removes a saved tryout for the signed-in member.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { scSavedTryouts } from '../../../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const tryoutId = (req.params as Record<string, string>).tryoutId;
  if (!tryoutId) return res.status(400).json({ error: 'tryoutId required' });

  try {
    await db
      .delete(scSavedTryouts)
      .where(and(eq(scSavedTryouts.userId, user.id), eq(scSavedTryouts.tryoutId, tryoutId)));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[saved-tryouts DELETE]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
