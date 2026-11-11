/**
 * GET /api/build-info
 * Returns the current git commit hash and timestamp so the preview can be
 * verified against the expected HEAD without requiring authentication.
 */
import type { Request, Response } from 'express';
import { execSync } from 'child_process';

export default function handler(_req: Request, res: Response): void {
  let commit = 'unknown';
  let commitFull = 'unknown';
  let commitDate = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    commitFull = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    commitDate = execSync('git log -1 --format=%ci HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // git not available in production — that's fine
  }
  res.json({ commit, commitFull, commitDate, serverTime: new Date().toISOString() });
}
