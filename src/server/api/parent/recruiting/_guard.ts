/**
 * Shared guards for recruiting endpoints.
 *
 * Two tiers of access:
 *
 *   requireRecruitingBaseAccess   — auth + player ownership only.
 *     Used by: camps, showcases, saved opportunities.
 *     Available to all age groups.
 *
 *   requireRecruitingOutreachAccess — auth + player ownership + U16+.
 *     Used by: coaches directory, outreach drafts.
 *     Restricted to U16, U17, U18, U19.
 *
 * All recruiting data is private — never exposed through public APIs,
 * public pages, or sitemaps.
 *
 * The U16+ gate is a product rule, not verified age or confirmation
 * that a coach may respond under recruiting rules.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { requireParentAccess } from '@/server/auth-policy.js';
import { sql } from 'drizzle-orm';

export const OUTREACH_AGE_GROUPS = new Set(['U16', 'U17', 'U18', 'U19']);

/** @deprecated Use OUTREACH_AGE_GROUPS. Kept for any callers that imported the old name. */
export const RECRUITING_AGE_GROUPS = OUTREACH_AGE_GROUPS;

export interface PlayerRow {
  id: string;
  userId: string;
  label: string | null;
  ageBand: string | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  positions: string | null;
  jersey: string | null;
  avatarInitials: string | null;
  avatarUrl: string | null;
  clubName: string | null;
  statGp: number | null;
  statGoals: number | null;
  statAssists: number | null;
  statShots: number | null;
  statGa: number | null;
  statSaves: number | null;
  statSo: number | null;
}

/** Fetch and ownership-verify a player row. Returns null and sends a response on failure.
 *
 * IMPORTANT: This query uses ONLY columns present in the base sc_player_profiles schema
 * (created by run-schema-foundation). It deliberately excludes columns added by later
 * migrations (avatar_url from v2, stat_* from run-schema-stats) so that the guard works
 * correctly even when those migrations have not yet been run. Callers that need those
 * columns must query them separately after the guard passes.
 */
async function fetchOwnedPlayer(
  req: Request,
  res: Response,
  playerId: string,
): Promise<{ userId: string; player: PlayerRow } | null> {
  const user = await requireParentAccess(req, res);
  if (!user) return null;
  const userId = user.id;

  let rows: unknown[];
  try {
    const result = await db.execute(
      sql.raw(`
        SELECT id, user_id, label, age_band, primary_position, secondary_position,
               positions, jersey, avatar_initials, club_name
        FROM sc_player_profiles
        WHERE id = '${playerId.replace(/'/g, "''")}'
        LIMIT 1
      `)
    );
    // db.execute(sql.raw(...)) returns [rows, fields] — must extract index 0.
    rows = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows ?? []) as unknown[];
  } catch {
    res.status(500).json({ error: 'Database error' });
    return null;
  }

  if (!rows.length) {
    res.status(404).json({ error: 'Player not found' });
    return null;
  }

  const row = rows[0] as Record<string, unknown>;

  if (row['user_id'] !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  const ageBand = (row['age_band'] as string | null) ?? null;

  const player: PlayerRow = {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    label: row['label'] as string | null,
    ageBand,
    primaryPosition: row['primary_position'] as string | null,
    secondaryPosition: row['secondary_position'] as string | null,
    positions: row['positions'] as string | null,
    jersey: row['jersey'] as string | null,
    avatarInitials: row['avatar_initials'] as string | null,
    // avatar_url and stat_* columns are added by later migrations (v2, run-schema-stats).
    // The guard does not select them — callers that need them query separately.
    avatarUrl: null,
    clubName: row['club_name'] as string | null,
    statGp: null,
    statGoals: null,
    statAssists: null,
    statShots: null,
    statGa: null,
    statSaves: null,
    statSo: null,
  };

  return { userId, player };
}

/**
 * Tier 1 — auth + player ownership only.
 * Camps, showcases, and saved opportunities use this guard.
 * Available to all age groups.
 */
export async function requireRecruitingBaseAccess(
  req: Request,
  res: Response,
  playerId: string,
): Promise<{ userId: string; player: PlayerRow } | null> {
  return fetchOwnedPlayer(req, res, playerId);
}

/**
 * Tier 2 — auth + player ownership + U16+ age group.
 * Coaches directory and outreach drafts use this guard.
 */
export async function requireRecruitingOutreachAccess(
  req: Request,
  res: Response,
  playerId: string,
): Promise<{ userId: string; player: PlayerRow } | null> {
  const result = await fetchOwnedPlayer(req, res, playerId);
  if (!result) return null;

  const { player } = result;
  if (!player.ageBand || !OUTREACH_AGE_GROUPS.has(player.ageBand)) {
    res.status(403).json({
      error: 'Coach outreach is available for U16, U17, U18, and U19 players only',
      ageBand: player.ageBand,
      code: 'OUTREACH_AGE_GATE',
    });
    return null;
  }

  return result;
}

/**
 * @deprecated Use requireRecruitingBaseAccess or requireRecruitingOutreachAccess.
 * Kept as an alias so existing callers that haven't been updated yet still compile.
 */
export const requireRecruitingAccess = requireRecruitingOutreachAccess;
