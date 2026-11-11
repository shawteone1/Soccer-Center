/**
 * src/server/lib/player-stats-aggregation.ts
 *
 * Shared server-side stats aggregation for the coach projection.
 *
 * RULES
 * ─────
 * - Only records with participated=true are counted toward gamesPlayed and
 *   stat totals. Non-participated records increment excludedCount.
 * - Records with seasonTotalsOverride=true are excluded entirely (they are
 *   season-level summary rows, not individual match records). They also
 *   increment excludedCount.
 * - When a season filter is provided, only records matching that season are
 *   included. Records from other seasons are silently excluded (not counted
 *   in excludedCount — they were never candidates).
 * - A stat column is null in the result when no included record has a non-null
 *   value for it. Once any record contributes a value, subsequent null values
 *   are treated as 0 for accumulation purposes.
 *
 * COVERAGE RULES
 * ──────────────
 * coverage: 'full'    — gamesPlayed>0, excludedCount=0, and every included
 *                       record has a non-null value for every metric that
 *                       appears at least once in the set (no partial totals).
 * coverage: 'partial' — gamesPlayed>0 AND at least one of:
 *                       • excludedCount>0 (some records were excluded), OR
 *                       • at least one metric has a partial total (some
 *                         included records recorded it, others did not).
 * coverage: 'none'    — gamesPlayed=0.
 *
 * This means a partial total (e.g. goals recorded in 2 of 3 matches) is
 * correctly flagged as 'partial' even when excludedCount=0.
 *
 * GOALKEEPER METRICS
 * ──────────────────
 * goalsAgainst, saves, shutouts are goalkeeper-specific. They are null for
 * outfield players — null here means "not applicable", not "not recorded".
 * Coverage does NOT penalise a set of outfield records for having null
 * goalkeeper metrics. A metric is only considered for coverage when at
 * least one included record has a non-null value for it.
 */

export interface RawMatchRecord {
  /** Optional match record ID — present when the row comes from sc_player_match_records */
  id?:                  string;
  statGp:               number | null;
  statGoals:            number | null;
  statAssists:          number | null;
  statShots:            number | null;
  statGa:               number | null;
  statSaves:            number | null;
  statSo:               number | null;
  participated:         boolean | null;
  seasonTotalsOverride: boolean | null;
  season:               string | null;
  positionPlayed:       string | null;
  matchDate:            string | null;
  opponent:             string | null;
}

export interface AggregatedStats {
  gamesPlayed:  number;
  goals:        number | null;
  assists:      number | null;
  shots:        number | null;
  goalsAgainst: number | null;
  saves:        number | null;
  shutouts:     number | null;
  season:       string | null;
  excludedCount: number;
  coverage:     'full' | 'partial' | 'none';
  /**
   * Per-metric recorded-match counts.
   * Present only when coverage='partial' so the UI can show "N of M" annotations.
   * A metric key is only included when its count is less than gamesPlayed
   * (i.e. it has a partial total). Absent when coverage='full'.
   */
  recordedCounts?: {
    goals?:        number;
    assists?:      number;
    shots?:        number;
    goalsAgainst?: number;
    saves?:        number;
    shutouts?:     number;
  };
}

/**
 * Accumulate a nullable integer stat.
 * Returns null when both acc and val are null.
 * Once either is non-null, treats null as 0.
 */
function accum(acc: number | null, val: number | null): number | null {
  if (acc === null && val === null) return null;
  return (acc ?? 0) + (val ?? 0);
}

/**
 * Aggregate match records into a single stats summary.
 *
 * @param records  All candidate records (already filtered to player+owner+approvedIds by caller).
 * @param season   When non-null, only records matching this season are included.
 *                 Records from other seasons are silently excluded (not counted in excludedCount).
 */
export function aggregateMatchRecords(
  records: RawMatchRecord[],
  season: string | null,
): AggregatedStats {
  let gamesPlayed  = 0;
  let goals:        number | null = null;
  let assists:      number | null = null;
  let shots:        number | null = null;
  let goalsAgainst: number | null = null;
  let saves:        number | null = null;
  let shutouts:     number | null = null;
  let excludedCount = 0;

  // Per-metric recorded counts — used to detect partial totals.
  // A metric is "partial" when recordedCount > 0 but recordedCount < gamesPlayed.
  let goalsRecorded   = 0;
  let assistsRecorded = 0;
  let shotsRecorded   = 0;
  let gaRecorded      = 0;
  let savesRecorded   = 0;
  let soRecorded      = 0;

  // Season-filter first (silent exclusion — not counted in excludedCount)
  const candidates = season != null
    ? records.filter(r => r.season === season)
    : records;

  for (const r of candidates) {
    // Exclude season-totals override rows and non-participated rows
    if (r.seasonTotalsOverride === true || r.participated !== true) {
      excludedCount++;
      continue;
    }

    gamesPlayed++;
    goals        = accum(goals,        r.statGoals);
    assists      = accum(assists,      r.statAssists);
    shots        = accum(shots,        r.statShots);
    goalsAgainst = accum(goalsAgainst, r.statGa);
    saves        = accum(saves,        r.statSaves);
    shutouts     = accum(shutouts,     r.statSo);

    if (r.statGoals   != null) goalsRecorded++;
    if (r.statAssists != null) assistsRecorded++;
    if (r.statShots   != null) shotsRecorded++;
    if (r.statGa      != null) gaRecorded++;
    if (r.statSaves   != null) savesRecorded++;
    if (r.statSo      != null) soRecorded++;
  }

  // A metric has a partial total when it was recorded in some but not all
  // included matches. Goalkeeper metrics (ga/saves/so) are only checked when
  // at least one included record has a non-null value — null for all records
  // means "not applicable" (outfield player), not "partially recorded".
  const hasPartialOutfield =
    (goalsRecorded   > 0 && goalsRecorded   < gamesPlayed) ||
    (assistsRecorded > 0 && assistsRecorded < gamesPlayed) ||
    (shotsRecorded   > 0 && shotsRecorded   < gamesPlayed);

  const hasPartialGk =
    (gaRecorded    > 0 && gaRecorded    < gamesPlayed) ||
    (savesRecorded > 0 && savesRecorded < gamesPlayed) ||
    (soRecorded    > 0 && soRecorded    < gamesPlayed);

  const coverage: 'full' | 'partial' | 'none' =
    gamesPlayed === 0 ? 'none'
    : (excludedCount > 0 || hasPartialOutfield || hasPartialGk) ? 'partial'
    : 'full';

  // Emit per-metric recorded counts only when coverage is partial.
  // A metric key is included only when its count is less than gamesPlayed
  // (i.e. it has a partial total that needs a "N of M" annotation in the UI).
  const recordedCounts: AggregatedStats['recordedCounts'] = coverage === 'partial'
    ? {
        ...(goalsRecorded   > 0 && goalsRecorded   < gamesPlayed ? { goals:        goalsRecorded   } : {}),
        ...(assistsRecorded > 0 && assistsRecorded < gamesPlayed ? { assists:      assistsRecorded } : {}),
        ...(shotsRecorded   > 0 && shotsRecorded   < gamesPlayed ? { shots:        shotsRecorded   } : {}),
        ...(gaRecorded      > 0 && gaRecorded      < gamesPlayed ? { goalsAgainst: gaRecorded      } : {}),
        ...(savesRecorded   > 0 && savesRecorded   < gamesPlayed ? { saves:        savesRecorded   } : {}),
        ...(soRecorded      > 0 && soRecorded      < gamesPlayed ? { shutouts:     soRecorded      } : {}),
      }
    : undefined;

  return {
    gamesPlayed,
    goals,
    assists,
    shots,
    goalsAgainst,
    saves,
    shutouts,
    season: season ?? null,
    excludedCount,
    coverage,
    ...(recordedCounts ? { recordedCounts } : {}),
  };
}
