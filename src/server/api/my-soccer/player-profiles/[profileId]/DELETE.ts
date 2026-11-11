/** DELETE /api/my-soccer/player-profiles/:profileId */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { profileId } = req.params;
  await db.delete(scPlayerProfiles)
    .where(sql`${scPlayerProfiles.id} = ${profileId} AND ${scPlayerProfiles.userId} = ${userId}`);

  res.json({ ok: true });
}
