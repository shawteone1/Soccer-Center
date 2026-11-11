/**
 * GET /api/parent/clubs
 *
 * Returns club directory entries from directory_regions.json, filtered by
 * optional query params. Used by the ClubSelector in player forms.
 *
 * Query params:
 *   q       — search by club name (case-insensitive, min 1 char)
 *   region  — region slug, e.g. "colorado" (default: all regions)
 *
 * Response: { clubs: ClubEntry[], regions: RegionEntry[] }
 *
 * Protected by requireParentAccess().
 */

import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

interface DirectoryListing {
  id: string;
  name: string;
  city?: string;
  type?: string;
  level?: string;
  url?: string;
}

interface DirectoryRegion {
  id: string;
  slug: string;
  label: string;
  listings: DirectoryListing[];
}

interface ClubEntry {
  id: string;
  name: string;
  city: string;
  region: string;
  regionLabel: string;
}

interface RegionEntry {
  slug: string;
  label: string;
}

let _regions: DirectoryRegion[] | null = null;

function loadRegions(): DirectoryRegion[] {
  if (_regions) return _regions;
  // In production the server runs from /app; public/ is copied to dist/client/
  // by Vite so the file is reliably at dist/client/data/directory_regions.json.
  // In dev, process.cwd() points at the project root where public/ lives directly.
  const candidates = [
    join(process.cwd(), 'dist/client/data/directory_regions.json'),
    join(process.cwd(), 'public/data/directory_regions.json'),
    '/app/dist/client/data/directory_regions.json',
  ];
  for (const p of candidates) {
    try {
      _regions = JSON.parse(readFileSync(p, 'utf-8')) as DirectoryRegion[];
      return _regions;
    } catch {
      // try next
    }
  }
  _regions = [];
  return _regions;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const { q, region } = req.query as Record<string, string | undefined>;
  const searchTerm = q?.trim().toLowerCase() ?? '';
  const regionFilter = region?.trim().toLowerCase() ?? '';

  const allRegions = loadRegions();

  // Build region list for the selector
  const regions: RegionEntry[] = allRegions.map(r => ({ slug: r.slug, label: r.label }));

  // Flatten listings across matching regions
  const clubs: ClubEntry[] = [];
  for (const r of allRegions) {
    if (regionFilter && r.slug !== regionFilter) continue;
    for (const listing of r.listings) {
      if (searchTerm && !listing.name.toLowerCase().includes(searchTerm)) continue;
      clubs.push({
        id: listing.id,
        name: listing.name,
        city: listing.city ?? '',
        region: r.slug,
        regionLabel: r.label,
      });
    }
  }

  // Sort: exact prefix matches first, then alphabetical
  if (searchTerm) {
    clubs.sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(searchTerm) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(searchTerm) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.name.localeCompare(b.name);
    });
  } else {
    clubs.sort((a, b) => a.name.localeCompare(b.name));
  }

  res
    .set('Cache-Control', 'private, max-age=300')
    .json({ clubs: clubs.slice(0, 50), regions, total: clubs.length });
}
