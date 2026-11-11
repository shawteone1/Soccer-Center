/**
 * POST /api/my-soccer/saved-tryouts
 * Body: { tryoutId: string }
 * Idempotent — silently succeeds if already saved.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scSavedTryouts } from '../../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { tryoutId } = req.body as { tryoutId?: string };
  if (!tryoutId?.trim()) return res.status(400).json({ error: 'tryoutId required' });

  try {
    const [existing] = await db
      .select({ id: scSavedTryouts.id })
      .from(scSavedTryouts)
      .where(and(eq(scSavedTryouts.userId, user.id), eq(scSavedTryouts.tryoutId, tryoutId)))
      .limit(1);

    if (!existing) {
      await db.insert(scSavedTryouts).values({
        id: randomUUID(),
        userId: user.id,
        tryoutId,
      });
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[saved-tryouts POST]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
