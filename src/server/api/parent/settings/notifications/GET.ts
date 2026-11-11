/**
 * GET /api/parent/settings/notifications
 * Returns the parent's notification preferences.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const [row] = await db
    .select({ notes: scParentProfiles.notes })
    .from(scParentProfiles)
    .where(eq(scParentProfiles.userId, user.id))
    .limit(1);

  // Notification settings are stored as JSON in the notes field (temporary)
  // until a dedicated table is added in a future migration.
  let settings = {
    emailEnabled: false,
    pushEnabled: false,
    digestEnabled: false,
    quietHoursEnabled: true,
    trainingConsentEnabled: false,
  };

  if (row?.notes) {
    try {
      const parsed = JSON.parse(row.notes) as Record<string, unknown>;
      if (parsed.notifications && typeof parsed.notifications === 'object') {
        settings = { ...settings, ...(parsed.notifications as typeof settings) };
      }
    } catch { /* use defaults */ }
  }

  res.json({ settings });
}
