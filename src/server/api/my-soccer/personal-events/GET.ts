/**
 * GET /api/my-soccer/personal-events
 * Returns the authenticated user's personal calendar events.
 * Query: start (ISO date), end (ISO date)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scPersonalEvents } from '../../../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { requireAuth } from '../auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0, 10);

  const startParam = (req.query.start as string | undefined) ?? defaultStart;
  const endParam   = (req.query.end   as string | undefined) ?? defaultEnd;

  const conditions = [
    eq(scPersonalEvents.userId, userId),
    gte(scPersonalEvents.startAt, startParam),
    lte(scPersonalEvents.startAt, endParam + 'T23:59:59'),
  ];

  const rows = await db
    .select()
    .from(scPersonalEvents)
    .where(and(...conditions))
    .orderBy(scPersonalEvents.startAt);

  return res.json({ events: rows });
}
