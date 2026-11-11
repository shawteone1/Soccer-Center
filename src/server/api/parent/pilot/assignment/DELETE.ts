/**
 * DELETE /api/parent/pilot/assignment?playerId=
 *
 * Removes a player's pilot team assignment.
 * Admin-only.
 */

import type { Request, Response } from 'express';
import { requireAdmin } from '@/server/auth-policy.js';
import { removeAssignment } from '@/server/pilot/store.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const { playerId } = req.query as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: 'playerId required' });
    return;
  }

  removeAssignment(playerId);
  res.json({ ok: true });
}
