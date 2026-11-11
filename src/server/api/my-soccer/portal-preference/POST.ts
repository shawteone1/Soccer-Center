/**
 * POST /api/my-soccer/portal-preference
 *
 * Saves the user's last portal preference ('fan' | 'parent').
 * Convenience only — never used for authorization.
 *
 * Uses raw SQL so only the columns that exist on the pre-migration
 * sc_member_profiles table are referenced. Drizzle's .insert().values()
 * expands to ALL schema columns, which breaks on production before
 * run-schema-fan-profile has been applied.
 *
 * Request body: { preference: 'fan' | 'parent' }
 * Response: { ok: true }
 *
 * Protected by requireFanAccess().
 */

import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { requireFanAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireFanAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const { preference } = req.body ?? {};
  if (preference !== 'fan' && preference !== 'parent') {
    return res.status(400).json({ error: 'preference must be "fan" or "parent"' });
  }

  // Raw SQL upsert — only touches columns that exist before any migration.
  // last_portal_preference is added by run-schema-fan-profile; if it doesn't
  // exist yet we catch and silently succeed (preference is a convenience hint only).
  try {
    await db.execute(sql`
      INSERT INTO sc_member_profiles (user_id, member_type, last_portal_preference)
      VALUES (${user.id}, 'fan', ${preference})
      ON DUPLICATE KEY UPDATE
        last_portal_preference = VALUES(last_portal_preference),
        updated_at = NOW()
    `);
  } catch (err) {
    const msg = String(err);
    // Column doesn't exist yet — migrations pending. Not fatal; preference is advisory only.
    if (msg.includes('last_portal_preference') || msg.includes('Unknown column')) {
      // Try upsert without the preference column so at least the row exists
      try {
        await db.execute(sql`
          INSERT INTO sc_member_profiles (user_id, member_type)
          VALUES (${user.id}, 'fan')
          ON DUPLICATE KEY UPDATE updated_at = NOW()
        `);
      } catch { /* row already exists or table schema differs — ignore */ }
    } else {
      throw err;
    }
  }

  res.json({ ok: true });
}
