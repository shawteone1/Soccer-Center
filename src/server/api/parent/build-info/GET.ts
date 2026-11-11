/**
 * GET /api/parent/build-info
 * Returns the current server commit hash and timestamp.
 * Used by the portal header to display a visible build identifier
 * so the user can confirm which build they are testing.
 * Protected by requireParentAccess().
 */
import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { execSync } from 'child_process';

let cachedCommit: string | null = null;

function getCommit(): string {
  if (cachedCommit) return cachedCommit;
  try {
    cachedCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    cachedCommit = 'unknown';
  }
  return cachedCommit;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);
  res.json({
    commit: getCommit(),
    builtAt: new Date().toISOString(),
  });
}
