/**
 * GET /api/parent/profile
 *
 * Returns the authenticated parent's full profile (v2: includes identity fields).
 * Protected by requireParentAccess().
 *
 * Uses an explicit column select so the query succeeds even if v2 identity
 * columns (display_name, bio, avatar_url, etc.) haven't been migrated yet on
 * production. Falls back to core columns on error so the parent portal never 500s.
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles, scMemberProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

const CORE_COLS = {
  userId:                   scParentProfiles.userId,
  familyId:                 scParentProfiles.familyId,
  city:                     scParentProfiles.city,
  timezone:                 scParentProfiles.timezone,
  privacyPrivate:           scParentProfiles.privacyPrivate,
  marketingOptIn:           scParentProfiles.marketingOptIn,
  onboardingStage:          scParentProfiles.onboardingStage,
  onboardingStepsCompleted: scParentProfiles.onboardingStepsCompleted,
  clubName:                 scParentProfiles.clubName,
  clubUrl:                  scParentProfiles.clubUrl,
  teamIds:                  scParentProfiles.teamIds,
  competitionIds:           scParentProfiles.competitionIds,
  tryoutsEnabled:           scParentProfiles.tryoutsEnabled,
  tryoutRegions:            scParentProfiles.tryoutRegions,
  tryoutAgeGroups:          scParentProfiles.tryoutAgeGroups,
  notes:                    scParentProfiles.notes,
  createdAt:                scParentProfiles.createdAt,
  updatedAt:                scParentProfiles.updatedAt,
};

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  let profile: Record<string, unknown> | undefined;
  let v2ColsAvailable = true;

  try {
    const rows = await db
      .select({
        ...CORE_COLS,
        displayName:    scParentProfiles.displayName,
        bio:            scParentProfiles.bio,
        avatarInitials: scParentProfiles.avatarInitials,
        avatarUrl:      scParentProfiles.avatarUrl,
        coverStyle:     scParentProfiles.coverStyle,
      })
      .from(scParentProfiles)
      .where(eq(scParentProfiles.userId, user.id))
      .limit(1) as Array<Record<string, unknown>>;
    profile = rows[0];
  } catch {
    v2ColsAvailable = false;
    const rows = await db
      .select(CORE_COLS)
      .from(scParentProfiles)
      .where(eq(scParentProfiles.userId, user.id))
      .limit(1) as Array<Record<string, unknown>>;
    profile = rows[0];
  }

  if (!profile) {
    return res.json({ profile: null });
  }

  // Read coverImageUrl from scMemberProfiles (stored there by the cover upload endpoint)
  let coverImageUrl: string | null = null;
  try {
    const memberRows = await db
      .select({ coverImageUrl: scMemberProfiles.coverImageUrl })
      .from(scMemberProfiles)
      .where(eq(scMemberProfiles.userId, user.id))
      .limit(1);
    coverImageUrl = memberRows[0]?.coverImageUrl ?? null;
  } catch {
    // Table may not exist yet — degrade gracefully
  }

  res.json({
    v2ColsAvailable,
    profile: {
      displayName:    v2ColsAvailable ? ((profile.displayName as string | null) ?? null) : null,
      bio:            v2ColsAvailable ? ((profile.bio as string | null) ?? null) : null,
      avatarInitials: v2ColsAvailable ? ((profile.avatarInitials as string | null) ?? null) : null,
      avatarUrl:      v2ColsAvailable ? ((profile.avatarUrl as string | null) ?? null) : null,
      coverStyle:     v2ColsAvailable ? ((profile.coverStyle as string | null) ?? 'stadium-blue') : 'stadium-blue',
      coverImageUrl,
      city:           (profile.city as string | null) ?? null,
      timezone:       (profile.timezone as string | null) ?? 'America/Denver',
      privacyPrivate: (profile.privacyPrivate as boolean | null) ?? true,
      marketingOptIn: (profile.marketingOptIn as boolean | null) ?? false,
      onboardingStage: (profile.onboardingStage as string | null) ?? null,
      onboardingStepsCompleted: profile.onboardingStepsCompleted
        ? (JSON.parse(profile.onboardingStepsCompleted as string) as string[])
        : [],
      clubName:       (profile.clubName as string | null) ?? null,
      clubUrl:        (profile.clubUrl as string | null) ?? null,
      teamIds:        profile.teamIds ? (JSON.parse(profile.teamIds as string) as string[]) : [],
      competitionIds: profile.competitionIds ? (JSON.parse(profile.competitionIds as string) as string[]) : [],
      tryoutsEnabled: (profile.tryoutsEnabled as boolean | null) ?? true,
      tryoutRegions:  profile.tryoutRegions ? (JSON.parse(profile.tryoutRegions as string) as string[]) : [],
      tryoutAgeGroups: profile.tryoutAgeGroups ? (JSON.parse(profile.tryoutAgeGroups as string) as string[]) : [],
    },
  });
}
