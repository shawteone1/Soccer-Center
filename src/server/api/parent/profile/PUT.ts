/**
 * PUT /api/parent/profile
 *
 * Creates or updates the authenticated parent's profile (v2).
 * All fields are optional — omitted fields are not overwritten on update.
 * Protected by requireParentAccess().
 *
 * Request body (all optional):
 * {
 *   // v2 identity
 *   displayName?: string
 *   bio?: string
 *   avatarInitials?: string
 *   coverStyle?: string
 *   city?: string
 *   timezone?: string
 *   privacyPrivate?: boolean
 *   marketingOptIn?: boolean
 *   onboardingStage?: string
 *   onboardingStepsCompleted?: string[]
 *   // club/team follows
 *   clubName?: string
 *   clubUrl?: string
 *   teamIds?: string[]
 *   competitionIds?: string[]
 *   // tryout prefs
 *   tryoutsEnabled?: boolean
 *   tryoutRegions?: string[]
 *   tryoutAgeGroups?: string[]
 * }
 */

import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scParentProfiles, scMemberProfiles } from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  setPrivateCacheHeaders(res);

  const body = req.body ?? {};

  // Build the update set — only include fields that were explicitly provided
  type UpdateSet = Partial<typeof scParentProfiles.$inferInsert>;
  const update: UpdateSet = {};

  if ('displayName'    in body) update.displayName    = typeof body.displayName === 'string' ? body.displayName.trim() || null : null;
  if ('bio'            in body) update.bio            = typeof body.bio === 'string' ? body.bio.trim() || null : null;
  if ('avatarInitials' in body) update.avatarInitials = typeof body.avatarInitials === 'string' ? body.avatarInitials.trim().toUpperCase().slice(0, 4) || null : null;
  if ('avatarUrl'      in body) update.avatarUrl      = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() || null : null;
  if ('coverStyle'     in body) update.coverStyle     = typeof body.coverStyle === 'string' ? body.coverStyle.trim() || null : null;
  if ('city'           in body) update.city           = typeof body.city === 'string' ? body.city.trim() || null : null;
  if ('timezone'       in body) update.timezone       = typeof body.timezone === 'string' ? body.timezone.trim() || 'America/Denver' : 'America/Denver';
  if ('privacyPrivate' in body) update.privacyPrivate = body.privacyPrivate !== false;
  if ('marketingOptIn' in body) update.marketingOptIn = body.marketingOptIn === true;
  if ('onboardingStage' in body) update.onboardingStage = typeof body.onboardingStage === 'string' ? body.onboardingStage.trim() || null : null;
  if ('onboardingStepsCompleted' in body) update.onboardingStepsCompleted = Array.isArray(body.onboardingStepsCompleted) ? JSON.stringify(body.onboardingStepsCompleted) : null;

  if ('clubName'        in body) update.clubName        = typeof body.clubName === 'string' ? body.clubName.trim() || null : null;
  if ('clubUrl'         in body) update.clubUrl         = typeof body.clubUrl === 'string' ? body.clubUrl.trim() || null : null;
  if ('teamIds'         in body) update.teamIds         = Array.isArray(body.teamIds) ? JSON.stringify(body.teamIds) : null;
  if ('competitionIds'  in body) update.competitionIds  = Array.isArray(body.competitionIds) ? JSON.stringify(body.competitionIds) : null;
  if ('tryoutsEnabled'  in body) update.tryoutsEnabled  = body.tryoutsEnabled !== false;
  if ('tryoutRegions'   in body) update.tryoutRegions   = Array.isArray(body.tryoutRegions) ? JSON.stringify(body.tryoutRegions) : null;
  if ('tryoutAgeGroups' in body) update.tryoutAgeGroups = Array.isArray(body.tryoutAgeGroups) ? JSON.stringify(body.tryoutAgeGroups) : null;

  // Check if row exists
  const [existing] = await db
    .select({ userId: scParentProfiles.userId })
    .from(scParentProfiles)
    .where(eq(scParentProfiles.userId, user.id))
    .limit(1);

  if (existing) {
    if (Object.keys(update).length > 0) {
      // UPDATE path — Drizzle generates only the columns in `update`, safe regardless of migration state.
      // But if v2 identity columns (display_name etc.) are in the update and don't exist yet, catch and retry.
      try {
        await db
          .update(scParentProfiles)
          .set(update)
          .where(eq(scParentProfiles.userId, user.id));
      } catch (err) {
        const msg = String(err);
        if (msg.includes('Unknown column') || msg.includes('display_name') || msg.includes('avatar_url') || msg.includes('cover_style')) {
          // v2 identity columns not yet on production — if the caller was trying to save
          // an avatar URL, return a clear 503 so the UI can surface a migration-pending notice
          // rather than silently discarding the photo.
          const wantsIdentity = 'avatarUrl' in update || 'displayName' in update || 'bio' in update || 'coverStyle' in update || 'avatarInitials' in update;
          if (wantsIdentity) {
            return res.status(503).json({
              error: 'Profile identity columns are not yet available on this server. An admin must run the v2 schema migration before photos and display names can be saved.',
              migrationRequired: 'run-schema-v2',
            });
          }
          // Strip v2 identity columns and retry with whatever remains
          const safeUpdate = { ...update };
          delete safeUpdate.displayName;
          delete safeUpdate.bio;
          delete safeUpdate.avatarUrl;
          delete safeUpdate.avatarInitials;
          delete safeUpdate.coverStyle;
          if (Object.keys(safeUpdate).length > 0) {
            await db.update(scParentProfiles).set(safeUpdate).where(eq(scParentProfiles.userId, user.id));
          }
        } else {
          throw err;
        }
      }
    }
  } else {
    // INSERT path — use raw SQL with only the pre-migration core columns so this
    // works before run-schema-v2 has been applied on production.
    try {
      await db.execute(sql`
        INSERT INTO sc_parent_profiles
          (user_id, tryouts_enabled, privacy_private, marketing_opt_in, timezone,
           display_name, bio, avatar_initials, avatar_url, cover_style,
           city, onboarding_stage, club_name, club_url)
        VALUES
          (${user.id}, ${update.tryoutsEnabled ?? true}, ${update.privacyPrivate ?? true},
           ${update.marketingOptIn ?? false}, ${update.timezone ?? 'America/Denver'},
           ${update.displayName ?? null}, ${update.bio ?? null},
           ${update.avatarInitials ?? null}, ${update.avatarUrl ?? null},
           ${update.coverStyle ?? null}, ${update.city ?? null},
           ${update.onboardingStage ?? null}, ${update.clubName ?? null},
           ${update.clubUrl ?? null})
      `);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('Unknown column') || msg.includes('display_name') || msg.includes('avatar_url') || msg.includes('cover_style')) {
        // v2 columns not yet on production — insert with only the original columns
        await db.execute(sql`
          INSERT INTO sc_parent_profiles (user_id, tryouts_enabled, privacy_private, marketing_opt_in, timezone)
          VALUES (${user.id}, ${update.tryoutsEnabled ?? true}, ${update.privacyPrivate ?? true},
                  ${update.marketingOptIn ?? false}, ${update.timezone ?? 'America/Denver'})
        `);
      } else {
        throw err;
      }
    }
  }

  // If coverImageUrl is explicitly passed (null to clear, or a URL to set),
  // write it to scMemberProfiles.cover_image_url — that's where the cover upload stores it.
  if ('coverImageUrl' in body) {
    const newCoverImageUrl = body.coverImageUrl === null ? null
      : (typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() || null : null);
    try {
      await db
        .insert(scMemberProfiles)
        .values({ userId: user.id, coverImageUrl: newCoverImageUrl })
        .onDuplicateKeyUpdate({ set: { coverImageUrl: newCoverImageUrl } });
    } catch {
      return res.status(500).json({ error: 'The cover could not be saved. Please try again.' });
    }
  }

  res.json({ ok: true });
}
