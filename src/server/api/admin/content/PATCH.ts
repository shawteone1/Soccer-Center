/** PATCH /api/admin/content/:contentId — approve/unpublish/archive/flag */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

const VALID_STATUSES = new Set(['approved', 'unpublished', 'archived', 'pending']);

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const contentId = String(req.params.contentId);
  const { adminStatus, linkBroken, embedVerified, editorialPriority } = req.body as {
    adminStatus?: string;
    linkBroken?: boolean;
    embedVerified?: boolean;
    editorialPriority?: number;
  };

  if (adminStatus && !VALID_STATUSES.has(adminStatus)) {
    return res.status(400).json({ error: 'Invalid adminStatus' });
  }

  // Build a partial update object typed to match Drizzle's inferred insert type
  const updates: {
    adminStatus?: string;
    adminReviewedAt?: Date;
    adminReviewedBy?: string;
    linkBroken?: boolean;
    embedVerified?: boolean;
    editorialPriority?: number;
  } = {};

  if (adminStatus !== undefined) {
    updates.adminStatus = adminStatus;
    updates.adminReviewedAt = new Date();
    updates.adminReviewedBy = user.id;
  }
  if (linkBroken !== undefined) updates.linkBroken = linkBroken;
  if (embedVerified !== undefined) updates.embedVerified = embedVerified;
  if (editorialPriority !== undefined) updates.editorialPriority = editorialPriority;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  type UpdateRow = typeof scDevContent.$inferInsert;
  await db.update(scDevContent)
    .set(updates as Partial<UpdateRow>)
    .where(eq(scDevContent.contentId, contentId));
  res.json({ ok: true });
}
