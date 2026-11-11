/**
 * GET /api/my-soccer/content
 * Returns approved development content.
 * Query params: category (defending|attacking|midfield|goalkeeping|fitness), limit, offset
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent } from '@/server/db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const {
    category,
    limit: limitStr,
    offset: offsetStr,
  } = req.query as Record<string, string | undefined>;

  const limit = Math.min(parseInt(limitStr ?? '50', 10), 100);
  const offset = parseInt(offsetStr ?? '0', 10);

  const rows = await db.select().from(scDevContent)
    .where(eq(scDevContent.adminStatus, 'approved'))
    .orderBy(asc(scDevContent.editorialPriority), asc(scDevContent.title));

  let filtered = rows;
  if (category) {
    filtered = filtered.filter((r) => r.devCategory === category);
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  res.json({
    total,
    items: page.map((r) => ({
      contentId: r.contentId,
      title: r.title,
      description: r.description,
      source: r.source,
      contentType: r.contentType,
      devCategory: r.devCategory,
      youtubeVideoId: r.youtubeVideoId,
      embedVerified: r.embedVerified,
      playbackStatus: r.playbackStatus,
      url: r.url,
      editorialPriority: r.editorialPriority,
    })),
  });
}
