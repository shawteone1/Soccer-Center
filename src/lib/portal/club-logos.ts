/**
 * Club logo mapping for the parent portal player cards.
 *
 * MAPPING RULES
 * ─────────────
 * - directoryId: the sc_soccer_directory row id (preferred key).
 * - clubName: exact display name match (fallback when no directory ID is exposed).
 * - asset: path under /public/, served at the same path in production.
 * - source: official page where the asset was located.
 * - checkedDate: ISO date the source was verified.
 * - status: 'verified' | 'blocked' | 'unresolved'
 *
 * Only 'verified' entries get an image. 'blocked' and 'unresolved' fall back to
 * the existing text-only treatment — no broken-image icon, no retry, no layout jump.
 *
 * ADDING A NEW LOGO
 * ─────────────────
 * 1. Download the asset from the official page listed in source.
 * 2. Inspect bytes: confirm SVG has no <script>, javascript:, onclick, onerror,
 *    onload, xlink:href, or data: URI patterns. For rasters, confirm MIME.
 * 3. Copy to public/club-logos/<id>.<ext>.
 * 4. Add an entry here with status: 'verified'.
 * 5. Run type-check and test at phone/tablet/desktop widths.
 */

export interface ClubLogoEntry {
  /** sc_soccer_directory row id, when available. */
  directoryId?: string;
  /** Exact clubName string as returned by the player API. */
  clubName?: string;
  /** Public asset path, e.g. /club-logos/co-004.svg */
  asset: string;
  /** Official page where the asset was located. */
  source: string;
  /** ISO date the source was verified. */
  checkedDate: string;
  status: 'verified' | 'blocked' | 'unresolved';
}

/**
 * Static club logo registry.
 *
 * Sources verified as of October 30, 2026.
 * Colorado United (colorado-84a99d75-…) and Rapids Youth (colorado-2f16ca97-…
 * and siblings) returned HTTP 403 during this review — text-only until verified.
 */
const CLUB_LOGOS: ClubLogoEntry[] = [
  {
    directoryId: 'co-004',
    clubName: 'Colorado Storm',
    asset: '/club-logos/co-004.svg',
    source: 'https://coloradostorm.com/img/logo.svg',
    checkedDate: '2026-10-30',
    status: 'verified',
  },
  // Colorado United — HTTP 403 during review; keep text-only until asset verified.
  {
    directoryId: 'colorado-84a99d75-ae7b-407d-b163-fac1f509b44a',
    clubName: 'Colorado United',
    asset: '',
    source: 'https://www.coloradounitedsoccer.com/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
  // Rapids Youth / legacy Storm regional listings — HTTP 403 during review.
  {
    directoryId: 'colorado-2f16ca97-87cb-40ee-9de9-b5ae85d85404',
    clubName: 'Colorado Storm - Castle Rock',
    asset: '',
    source: 'https://rapidsyouthsoccer.org/castle-rock/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
  {
    directoryId: 'colorado-6e5ecddb-4994-432d-92cf-62991182a590',
    clubName: 'Colorado Storm - Central',
    asset: '',
    source: 'https://rapidsyouthsoccer.org/central/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
  {
    directoryId: 'colorado-2e0b82be-d810-4583-b265-c30c1d001f84',
    clubName: 'Colorado Storm - Fort Collins',
    asset: '',
    source: 'https://rapidsyouthsoccer.org/fort-collins/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
  {
    directoryId: 'colorado-bf0ec227-a2a5-4780-a68b-5117170a7d00',
    clubName: 'Colorado Storm - North',
    asset: '',
    source: 'https://rapidsyouthsoccer.org/north/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
  {
    directoryId: 'colorado-ab1ca95b-c7a3-4fdf-9afc-e5a2210c2b60',
    clubName: 'Colorado Storm - South',
    asset: '',
    source: 'https://rapidsyouthsoccer.org/south/',
    checkedDate: '2026-10-30',
    status: 'blocked',
  },
];

/**
 * Returns the verified asset path for a club, or null if unverified/blocked.
 *
 * Matching priority:
 *   1. directoryId (exact)
 *   2. clubName (exact, case-sensitive — matches the API response)
 *
 * Returns null for any non-'verified' entry so callers render text-only.
 */
export function getClubLogoAsset(
  clubName: string | null | undefined,
  directoryId?: string | null,
): string | null {
  if (!clubName && !directoryId) return null;

  const byId = directoryId ? CLUB_LOGOS.find(e => e.directoryId === directoryId) : undefined;
  const entry = byId ?? (clubName ? CLUB_LOGOS.find(e => e.clubName === clubName) : undefined);

  if (!entry || entry.status !== 'verified' || !entry.asset) return null;
  return entry.asset;
}
