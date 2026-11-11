/**
 * POST /api/parent/pilot/reset
 *
 * Resets the in-memory demo store. Admin-only.
 * Clearly labeled as demo-only — does NOT affect production DB.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { resetDemo } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  resetDemo();
  res.json({ ok: true, message: 'Demo store reset. All pilot assignments and records cleared.' });
}
