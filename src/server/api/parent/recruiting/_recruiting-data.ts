/**
 * Bundled recruiting data — server-only module.
 *
 * The four JSON files are imported statically here. With noExternal:true in
 * the SSR build, Vite/Rollup inlines them directly into server.bundle.mjs.
 * They are never written to dist/client/ and are not reachable via any HTTP
 * route. Unauthenticated requests cannot download them.
 *
 * All server handlers that need recruiting data import from this module rather
 * than reading the filesystem at request time.
 */

import rawPrograms  from '../../../../data/recruiting/college-programs.json';
import rawCoaches   from '../../../../data/recruiting/college-coaches.json';
import rawCamps     from '../../../../data/recruiting/id-camps.json';
import rawShowcases from '../../../../data/recruiting/showcases.json';

export type RecruitingRecord = Record<string, unknown>;

export const collegeProgramsData  = rawPrograms  as RecruitingRecord[];
export const collegeCoachesData   = rawCoaches   as RecruitingRecord[];
export const idCampsData          = rawCamps     as RecruitingRecord[];
export const showcasesData        = rawShowcases as RecruitingRecord[];

/**
 * The set of coach import_keys whose _verificationStatus is "unverified-name"
 * (or absent, which defaults to unverified). Pre-computed at module load time
 * so every request handler can use it without re-scanning the array.
 *
 * Used by the coaches and programs GET handlers to exclude unverified coaches
 * from query results without deleting any rows.
 */
export const unverifiedCoachKeys: ReadonlySet<string> = new Set(
  collegeCoachesData
    .filter(c => ((c['_verificationStatus'] as string | undefined) ?? 'unverified-name') === 'unverified-name')
    .map(c => String(c['importKey']))
);

/**
 * Source record counts — reported in seed/purge responses so the admin panel
 * can confirm the bundled JSON was loaded correctly (non-zero = good).
 */
export const recruitingFileCounts = {
  programs:  collegeProgramsData.length,
  coaches:   collegeCoachesData.length,
  camps:     idCampsData.length,
  showcases: showcasesData.length,
} as const;
