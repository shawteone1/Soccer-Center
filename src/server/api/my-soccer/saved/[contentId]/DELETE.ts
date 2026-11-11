/** DELETE /api/my-soccer/saved/:contentId — unsave a content item */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSavedItems } from '@/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { contentId } = req.params;
  await db.delete(scSavedItems)
    .where(sql`${scSavedItems.userId} = ${userId} AND ${scSavedItems.contentId} = ${contentId}`);

  res.json({ ok: true });
}
