/**
 * GET /api/my-soccer/saved-tryouts
 * Returns the list of tryout IDs saved by the signed-in member.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scSavedTryouts } from '../../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const rows = await db
      .select({ tryoutId: scSavedTryouts.tryoutId, savedAt: scSavedTryouts.savedAt })
      .from(scSavedTryouts)
      .where(eq(scSavedTryouts.userId, user.id))
      .orderBy(desc(scSavedTryouts.savedAt));

    return res.json({ savedTryoutIds: rows.map((r) => r.tryoutId) });
  } catch (err) {
    console.error('[saved-tryouts GET]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
