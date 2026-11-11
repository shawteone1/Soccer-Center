/** POST /api/my-soccer/saved — save a content item */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSavedItems, scDevContent } from '@/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { contentId } = req.body as { contentId?: string };
  if (!contentId) return res.status(400).json({ error: 'contentId required' });

  // Verify content exists and is approved
  const [content] = await db.select({ adminStatus: scDevContent.adminStatus })
    .from(scDevContent).where(eq(scDevContent.contentId, contentId)).limit(1);
  if (!content) return res.status(404).json({ error: 'Content not found' });
  if (content.adminStatus !== 'approved') return res.status(403).json({ error: 'Content not available' });

  // Idempotent — ignore if already saved
  const [existing] = await db.select({ id: scSavedItems.id })
    .from(scSavedItems)
    .where(and(eq(scSavedItems.userId, userId), eq(scSavedItems.contentId, contentId)))
    .limit(1);

  if (!existing) {
    await db.insert(scSavedItems).values({ id: randomUUID(), userId, contentId });
  }

  res.json({ ok: true });
}
