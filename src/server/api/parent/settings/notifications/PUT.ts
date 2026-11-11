/**
 * PUT /api/parent/settings/notifications
 * Updates the parent's notification preferences.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const body = req.body ?? {};
  const settings = {
    emailEnabled:           !!body.emailEnabled,
    pushEnabled:            !!body.pushEnabled,
    digestEnabled:          !!body.digestEnabled,
    quietHoursEnabled:      body.quietHoursEnabled !== false,
    trainingConsentEnabled: !!body.trainingConsentEnabled,
  };

  // Read existing notes, merge notifications key
  const [row] = await db
    .select({ notes: scParentProfiles.notes })
    .from(scParentProfiles)
    .where(eq(scParentProfiles.userId, user.id))
    .limit(1);

  let existing: Record<string, unknown> = {};
  if (row?.notes) {
    try { existing = JSON.parse(row.notes) as Record<string, unknown>; } catch { /* ignore */ }
  }
  const merged = { ...existing, notifications: settings };

  await db
    .insert(scParentProfiles)
    .values({ userId: user.id, notes: JSON.stringify(merged) })
    .onDuplicateKeyUpdate({
      set: {
        notes: sql`VALUES(notes)`,
        updatedAt: sql`VALUES(updated_at)`,
      },
    });

  res.json({ ok: true, settings });
}
