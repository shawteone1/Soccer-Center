/** POST /api/my-soccer/profile — upsert member profile */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scMemberProfiles } from '@/server/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

/**
 * Probe whether all five fan identity columns exist in sc_member_profiles.
 * mysql2 execute() returns [ResultRows[], FieldPacket[]] — unwrap [0] for rows.
 */
async function identityColumnsExist(): Promise<boolean> {
  const IDENTITY_COLS = ['display_name', 'bio', 'avatar_url', 'cover_image_url', 'location'];
  try {
    const result = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`sc_member_profiles\` WHERE Field IN ('display_name','bio','avatar_url','cover_image_url','location')`)
    ) as unknown;
    const [resultRows] = result as [unknown[], unknown];
    const arr = Array.isArray(resultRows) ? resultRows : [];
    return arr.length >= IDENTITY_COLS.length;
  } catch {
    return false;
  }
}

/**
 * Sanitise a raw database/Drizzle error into a safe client message.
 * Never sends SQL text, table names, column names, file paths, or stack frames
 * to the browser.  Full error is always logged server-side first.
 */
function safeClientMessage(err: unknown): string {
  const candidates: string[] = [String(err)];
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.cause)       candidates.push(String(e.cause));
    if (e.sqlMessage)  candidates.push(String(e.sqlMessage));
    if (e.message)     candidates.push(String(e.message));
    if (e.cause && typeof e.cause === 'object') {
      const c = e.cause as Record<string, unknown>;
      if (c.message)    candidates.push(String(c.message));
      if (c.sqlMessage) candidates.push(String(c.sqlMessage));
    }
  }
  const combined = candidates.join('\n');
  if (/Duplicate entry/i.test(combined))       return 'A profile already exists for this account.';
  if (/Data too long/i.test(combined))         return 'One of the fields is too long. Please shorten it and try again.';
  if (/cannot be null|NOT NULL/i.test(combined)) return 'A required field is missing.';
  if (/foreign key constraint/i.test(combined)) return 'Your account could not be found. Please sign out and back in.';
  if (/connect ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(combined)) return 'Database connection failed. Please try again in a moment.';
  if (/Access denied/i.test(combined))         return 'Database access error. Please contact support.';
  return 'Profile save failed. Please try again or contact support if this persists.';
}

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const {
    memberType, region, city, interests,
    favLeagues, favTeams, fanInterests, favPublishers, onboardingDone, fanOnboardingDone,
    lastPortalPreference,
    // Fan identity fields
    displayName, bio, avatarUrl, coverImageUrl, location,
  } = req.body as {
    memberType?: string;
    region?: string;
    city?: string;
    interests?: string[];
    favLeagues?: string[];
    favTeams?: string[];
    fanInterests?: string[];
    favPublishers?: string[];
    onboardingDone?: boolean;
    fanOnboardingDone?: boolean;
    lastPortalPreference?: 'fan' | 'parent' | null;
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    coverImageUrl?: string | null;
    location?: string | null;
  };

  const VALID_TYPES = new Set(['fan', 'player', 'both']);
  if (memberType && !VALID_TYPES.has(memberType)) {
    return res.status(400).json({ error: 'Invalid memberType' });
  }

  // Determine whether identity columns exist BEFORE building the ORM update.
  // The previous catch-and-retry approach failed because Drizzle's prepared
  // statement cache re-uses the same SQL even after we deleted the fields from
  // the update object, so the retry still referenced the missing columns.
  // Probing upfront and simply omitting the fields avoids the ORM entirely.
  const hasIdentityColumns = await identityColumnsExist();

  // Determine whether the request includes any identity fields
  const wantsIdentity = ['displayName', 'bio', 'avatarUrl', 'coverImageUrl', 'location']
    .some(k => k in req.body);
  const identityFieldsDropped = wantsIdentity && !hasIdentityColumns;

  const [existing] = await db.select({ userId: scMemberProfiles.userId })
    .from(scMemberProfiles).where(eq(scMemberProfiles.userId, userId)).limit(1);

  if (existing) {
    // Partial update — only include fields that were explicitly provided
    type UpdateSet = Partial<typeof scMemberProfiles.$inferInsert>;
    const update: UpdateSet = {};

    if ('memberType'    in req.body) update.memberType    = memberType ?? 'fan';
    if ('region'        in req.body) update.region        = region ?? null;
    if ('city'          in req.body) update.city          = city ?? null;
    if ('interests'     in req.body) update.interests     = JSON.stringify(interests ?? []);
    if ('favLeagues'    in req.body) update.favLeagues    = JSON.stringify(favLeagues ?? []);
    if ('favTeams'      in req.body) update.favTeams      = JSON.stringify(favTeams ?? []);
    if ('fanInterests'  in req.body) update.fanInterests  = JSON.stringify(fanInterests ?? []);
    if ('favPublishers' in req.body) update.favPublishers = JSON.stringify(favPublishers ?? []);
    if ('onboardingDone' in req.body) update.onboardingDone = onboardingDone ?? false;
    if ('fanOnboardingDone' in req.body) update.fanOnboardingDone = fanOnboardingDone ?? false;
    if ('lastPortalPreference' in req.body) {
      const pref = lastPortalPreference;
      update.lastPortalPreference = (pref === 'fan' || pref === 'parent') ? pref : null;
    }
    // Identity fields — only included when columns are confirmed present
    if (hasIdentityColumns) {
      if ('displayName'   in req.body) update.displayName   = typeof displayName === 'string' ? displayName.trim() || null : null;
      if ('bio'           in req.body) update.bio           = typeof bio === 'string' ? bio.trim() || null : null;
      if ('avatarUrl'     in req.body) update.avatarUrl     = typeof avatarUrl === 'string' ? avatarUrl.trim() || null : null;
      if ('coverImageUrl' in req.body) update.coverImageUrl = typeof coverImageUrl === 'string' ? coverImageUrl.trim() || null : null;
      if ('location'      in req.body) update.location      = typeof location === 'string' ? location.trim() || null : null;
    }

    if (Object.keys(update).length > 0) {
      try {
        await db.update(scMemberProfiles).set(update).where(eq(scMemberProfiles.userId, userId));
      } catch (err) {
        const ref = `ERR-${Date.now().toString(36).toUpperCase()}`;
        console.error(`[profile POST] update error [${ref}]:`, err);
        return res.status(500).json({
          error: 'Profile save failed',
          detail: safeClientMessage(err),
          ref,
        });
      }
    }
  } else {
    // New row — use raw SQL so only pre-migration columns are referenced.
    const coreValues = {
      userId,
      memberType: memberType ?? 'fan',
      region: region ?? null,
      city: city ?? null,
      interests: JSON.stringify(interests ?? []),
      favLeagues: JSON.stringify(favLeagues ?? []),
      favTeams: JSON.stringify(favTeams ?? []),
      fanInterests: JSON.stringify(fanInterests ?? []),
      favPublishers: JSON.stringify(favPublishers ?? []),
      onboardingDone: onboardingDone ?? false,
      fanOnboardingDone: fanOnboardingDone ?? false,
    };

    try {
      if (hasIdentityColumns) {
        await db.execute(sql`
          INSERT INTO sc_member_profiles
            (user_id, member_type, region, city, interests, fav_leagues, fav_teams,
             fan_interests, onboarding_done, fan_onboarding_done,
             display_name, bio, avatar_url, cover_image_url, location)
          VALUES
            (${coreValues.userId}, ${coreValues.memberType}, ${coreValues.region},
             ${coreValues.city}, ${coreValues.interests}, ${coreValues.favLeagues},
             ${coreValues.favTeams}, ${coreValues.fanInterests},
             ${coreValues.onboardingDone}, ${coreValues.fanOnboardingDone},
             ${typeof displayName === 'string' ? displayName.trim() || null : null},
             ${typeof bio === 'string' ? bio.trim() || null : null},
             ${typeof avatarUrl === 'string' ? avatarUrl.trim() || null : null},
             ${typeof coverImageUrl === 'string' ? coverImageUrl.trim() || null : null},
             ${typeof location === 'string' ? location.trim() || null : null})
        `);
      } else {
        await db.execute(sql`
          INSERT INTO sc_member_profiles
            (user_id, member_type, region, city, interests, fav_leagues, fav_teams,
             fan_interests, onboarding_done, fan_onboarding_done)
          VALUES
            (${coreValues.userId}, ${coreValues.memberType}, ${coreValues.region},
             ${coreValues.city}, ${coreValues.interests}, ${coreValues.favLeagues},
             ${coreValues.favTeams}, ${coreValues.fanInterests},
             ${coreValues.onboardingDone}, ${coreValues.fanOnboardingDone})
        `);
      }
    } catch (err) {
      const ref = `ERR-${Date.now().toString(36).toUpperCase()}`;
      console.error(`[profile POST] insert error [${ref}]:`, err);
      return res.status(500).json({
        error: 'Profile save failed',
        detail: safeClientMessage(err),
        ref,
      });
    }
  }

  if (identityFieldsDropped) {
    return res.json({
      ok: false,
      migrationRequired: true,
      message: 'Profile saved without identity fields — fan profile schema migration has not run yet.',
    });
  }

  res.json({ ok: true });
}
