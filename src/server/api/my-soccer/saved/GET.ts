/** GET /api/my-soccer/saved — list saved content IDs for the signed-in user */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSavedItems, scDevContent } from '@/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const rows = await db
    .select({
      savedAt: scSavedItems.savedAt,
      contentId: scDevContent.contentId,
      title: scDevContent.title,
      description: scDevContent.description,
      source: scDevContent.source,
      contentType: scDevContent.contentType,
      ageMin: scDevContent.ageMin,
      ageMax: scDevContent.ageMax,
      positions: scDevContent.positions,
      interests: scDevContent.interests,
      tags: scDevContent.tags,
      audience: scDevContent.audience,
      trainingMode: scDevContent.trainingMode,
      access: scDevContent.access,
      youtubeVideoId: scDevContent.youtubeVideoId,
      url: scDevContent.url,
      adminStatus: scDevContent.adminStatus,
      editorialPriority: scDevContent.editorialPriority,
    })
    .from(scSavedItems)
    .innerJoin(scDevContent, eq(scSavedItems.contentId, scDevContent.contentId))
    .where(eq(scSavedItems.userId, userId))
    .orderBy(desc(scSavedItems.savedAt));

  // Filter out non-approved items
  const visible = rows.filter((r) => r.adminStatus === 'approved');

  res.json({
    saved: visible.map((r) => ({
      contentId: r.contentId,
      title: r.title,
      description: r.description,
      source: r.source,
      contentType: r.contentType,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      positions: parseJson(r.positions),
      interests: parseJson(r.interests),
      tags: parseJson(r.tags),
      audience: parseJson(r.audience),
      trainingMode: r.trainingMode,
      access: r.access,
      youtubeVideoId: r.youtubeVideoId,
      url: r.url,
      savedAt: r.savedAt,
    })),
  });
}
