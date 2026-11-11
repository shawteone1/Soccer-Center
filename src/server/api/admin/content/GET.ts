/** GET /api/admin/content — admin-only content list with optional adminStatus filter */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent } from '@/server/db/schema.js';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { adminStatus } = req.query as { adminStatus?: string };
  const all = await db.select().from(scDevContent);
  const filtered = adminStatus ? all.filter((i) => i.adminStatus === adminStatus) : all;

  res.json(filtered.map((i) => ({
    contentId: i.contentId,
    title: i.title,
    description: i.description,
    source: i.source,
    url: i.url,
    contentType: i.contentType,
    ageMin: i.ageMin,
    ageMax: i.ageMax,
    positions: parseJson(i.positions),
    interests: parseJson(i.interests),
    tags: parseJson(i.tags),
    audience: parseJson(i.audience),
    trainingMode: i.trainingMode,
    access: i.access,
    youtubeVideoId: i.youtubeVideoId,
    embedVerified: i.embedVerified,
    linkBroken: i.linkBroken,
    reviewStatus: i.reviewStatus,
    playbackStatus: i.playbackStatus,
    deliveryMode: i.deliveryMode,
    checkedDate: i.checkedDate,
    reviewNotes: i.reviewNotes,
    recommendationStatus: i.recommendationStatus,
    adminStatus: i.adminStatus,
    adminReviewedAt: i.adminReviewedAt,
    editorialPriority: i.editorialPriority,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  })));
}
