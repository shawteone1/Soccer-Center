/**
 * GET /api/fanzone/content
 * Returns the public Fan Zone catalog content (supporter groups, pubs, TV guide).
 * Public endpoint — no auth required.
 *
 * In production the container only has dist/ — src/ is not present.
 * fanzone-content.json is copied to public/ at build time so Vite includes it
 * in dist/client/, making it reachable at a known path relative to the bundle.
 *
 * Path resolution order:
 *   1. dist/client/fanzone-content.json — production (relative to server.bundle.mjs)
 *   2. process.cwd()/public/fanzone-content.json — dev server fallback
 */
import type { Request, Response } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findFanzoneJson(): string | null {
  const candidates = [
    // Production: bundle is at /app/dist/server.bundle.mjs → client/ is sibling of bundle dir
    join(__dirname, 'client/fanzone-content.json'),
    // Dev: cwd is project root
    join(process.cwd(), 'public/fanzone-content.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

let cached: unknown = null;

export default async function handler(_req: Request, res: Response): Promise<void> {
  try {
    if (!cached) {
      const filePath = findFanzoneJson();
      if (!filePath) {
        res.status(503).json({
          error: 'fanzone_content_unavailable',
          message: 'Content file not found.',
        });
        return;
      }
      cached = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    }
    res.json(cached);
  } catch (err) {
    console.error('[fanzone/content] read error:', err);
    res.status(500).json({ error: 'Failed to load fanzone content' });
  }
}
