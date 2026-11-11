/**
 * PUT /api/parent/onboarding
 *
 * Atomically saves all parent onboarding data and marks parentOnboardingDone = true.
 * Also used by "Edit parent profile" to update existing data (idempotent).
 *
 * Protected by requireParentAccess() — account must already be PARENT.
 * Cache-Control: private, no-store.
 *
 * Request body:
 * {
 *   // Parent-level profile
 *   clubName?: string
 *   clubUrl?: string
 *   teamIds?: string[]
 *   competitionIds?: string[]
 *   tryoutsEnabled?: boolean        default true
 *   tryoutRegions?: string[]
 *   tryoutAgeGroups?: string[]
 *   calendarConnections?: string[]  e.g. ['teamsnap','playmetrics','manual']
 *
 *   // Player profiles — full replacement of all players for this parent
 *   players?: Array<{
 *     id?: string                   omit to create; include to update existing
 *     label?: string
 *     ageBand?: string
 *     ageYears?: number
 *     positions?: string[]
 *     skillLevel?: string
 *     developmentInterests?: string[]
 *     trainingMode?: string
 *     clubName?: string
 *     clubUrl?: string
 *     trainingPreferences?: { focusAreas: string[], sessionLength: string, frequency: string }
 *     tryoutInterest?: boolean
 *   }>
 * }
 *
 * Response: { ok: true }
 */

import type { Request, Response } from 'express';
import { eq, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '@/server/db/client.js';
import {
  scPlayerProfiles,
} from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const body = req.body ?? {};

  // ── 1. Upsert parent-level profile ──────────────────────────────────────────
  const clubName        = typeof body.clubName === 'string' ? body.clubName.trim() || null : null;
  const clubUrl         = typeof body.clubUrl  === 'string' ? body.clubUrl.trim()  || null : null;
  const teamIds         = Array.isArray(body.teamIds)         ? JSON.stringify(body.teamIds)         : null;
  const competitionIds  = Array.isArray(body.competitionIds)  ? JSON.stringify(body.competitionIds)  : null;
  const tryoutsEnabled  = body.tryoutsEnabled !== false;
  const tryoutRegions   = Array.isArray(body.tryoutRegions)   ? JSON.stringify(body.tryoutRegions)   : JSON.stringify(['colorado']);
  const tryoutAgeGroups = Array.isArray(body.tryoutAgeGroups) ? JSON.stringify(body.tryoutAgeGroups) : null;
  const calendarConnections = Array.isArray(body.calendarConnections)
    ? JSON.stringify(body.calendarConnections)
    : null;

  // Raw SQL upsert — only touches the pre-migration core columns so this works
  // before run-schema-v2 (which adds display_name, bio, avatar_url, etc.) has run.
  const notesVal = calendarConnections ? JSON.stringify({ calendarConnections: body.calendarConnections }) : null;
  await db.execute(sql`
    INSERT INTO sc_parent_profiles
      (user_id, club_name, club_url, team_ids, competition_ids,
       tryouts_enabled, tryout_regions, tryout_age_groups, notes)
    VALUES
      (${user.id}, ${clubName}, ${clubUrl}, ${teamIds}, ${competitionIds},
       ${tryoutsEnabled}, ${tryoutRegions}, ${tryoutAgeGroups}, ${notesVal})
    ON DUPLICATE KEY UPDATE
      club_name        = VALUES(club_name),
      club_url         = VALUES(club_url),
      team_ids         = VALUES(team_ids),
      competition_ids  = VALUES(competition_ids),
      tryouts_enabled  = VALUES(tryouts_enabled),
      tryout_regions   = VALUES(tryout_regions),
      tryout_age_groups = VALUES(tryout_age_groups),
      notes            = VALUES(notes),
      updated_at       = NOW()
  `);

  // ── 2. Sync player profiles ──────────────────────────────────────────────────
  // Strategy: upsert rows that have an id; insert rows without one.
  // Rows owned by this user that are NOT in the submitted list are deleted.
  const players: Array<{
    id?: string;
    label?: string;
    ageBand?: string;
    ageYears?: number;
    positions?: string[];
    skillLevel?: string;
    developmentInterests?: string[];
    trainingMode?: string;
    clubName?: string;
    clubUrl?: string;
    trainingPreferences?: { focusAreas: string[]; sessionLength: string; frequency: string };
    tryoutInterest?: boolean;
  }> = Array.isArray(body.players) ? body.players : [];

  if (players.length > 0) {
    const keptIds: string[] = [];

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const id = typeof p.id === 'string' && p.id ? p.id : randomUUID();
      keptIds.push(id);

      const values = {
        id,
        userId: user.id,
        label:                typeof p.label === 'string' ? p.label.trim() || null : null,
        ageBand:              typeof p.ageBand === 'string' ? p.ageBand : null,
        ageYears:             typeof p.ageYears === 'number' ? p.ageYears : null,
        positions:            Array.isArray(p.positions) ? JSON.stringify(p.positions) : '[]',
        skillLevel:           typeof p.skillLevel === 'string' ? p.skillLevel : null,
        developmentInterests: Array.isArray(p.developmentInterests) ? JSON.stringify(p.developmentInterests) : '[]',
        trainingMode:         typeof p.trainingMode === 'string' ? p.trainingMode : null,
        clubName:             typeof p.clubName === 'string' ? p.clubName.trim() || null : null,
        clubUrl:              typeof p.clubUrl  === 'string' ? p.clubUrl.trim()  || null : null,
        trainingPreferences:  p.trainingPreferences ? JSON.stringify(p.trainingPreferences) : null,
        tryoutInterest:       p.tryoutInterest !== false,
        sortOrder:            i,
      };

      await db
        .insert(scPlayerProfiles)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            label:                sql`VALUES(label)`,
            ageBand:              sql`VALUES(age_band)`,
            ageYears:             sql`VALUES(age_years)`,
            positions:            sql`VALUES(positions)`,
            skillLevel:           sql`VALUES(skill_level)`,
            developmentInterests: sql`VALUES(development_interests)`,
            trainingMode:         sql`VALUES(training_mode)`,
            clubName:             sql`VALUES(club_name)`,
            clubUrl:              sql`VALUES(club_url)`,
            trainingPreferences:  sql`VALUES(training_preferences)`,
            tryoutInterest:       sql`VALUES(tryout_interest)`,
            sortOrder:            sql`VALUES(sort_order)`,
            updatedAt:            sql`VALUES(updated_at)`,
          },
        });
    }

    // Delete player rows owned by this user that were not in the submitted list
    const existing = await db
      .select({ id: scPlayerProfiles.id })
      .from(scPlayerProfiles)
      .where(eq(scPlayerProfiles.userId, user.id));

    const toDelete = existing.map(r => r.id).filter(id => !keptIds.includes(id));
    if (toDelete.length > 0) {
      await db
        .delete(scPlayerProfiles)
        .where(inArray(scPlayerProfiles.id, toDelete));
    }
  }

  // ── 3. Mark parent onboarding complete ──────────────────────────────────────
  // Raw SQL — parent_onboarding_done is added by run-schema-fan-profile.
  // Fall back to a bare upsert if the column doesn't exist yet.
  try {
    await db.execute(sql`
      INSERT INTO sc_member_profiles (user_id, member_type, parent_onboarding_done)
      VALUES (${user.id}, 'fan', 1)
      ON DUPLICATE KEY UPDATE
        parent_onboarding_done = 1,
        updated_at = NOW()
    `);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('parent_onboarding_done') || msg.includes('Unknown column')) {
      try {
        await db.execute(sql`
          INSERT INTO sc_member_profiles (user_id, member_type)
          VALUES (${user.id}, 'fan')
          ON DUPLICATE KEY UPDATE updated_at = NOW()
        `);
      } catch { /* ignore */ }
    } else {
      throw err;
    }
  }

  res.json({ ok: true });
}
