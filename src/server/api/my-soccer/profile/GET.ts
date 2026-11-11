/** GET /api/my-soccer/profile — fetch member profile for the signed-in user
 *
 * Fan identity columns (display_name, bio, avatar_url, cover_image_url, location)
 * are added by run-schema-fan-profile. If that migration hasn't run yet on
 * production the wildcard select() throws; we catch and retry with core columns
 * only so the profile page never 500s.
 *
 * Returns identityColumnsAvailable: boolean so the client can show a definitive
 * status rather than discovering the missing columns only on a failed save.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scMemberProfiles, user as userTable } from '@/server/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

/** Probe whether all five fan identity columns exist in sc_member_profiles. */
async function checkIdentityColumns(): Promise<boolean> {
  const IDENTITY_COLS = ['display_name', 'bio', 'avatar_url', 'cover_image_url', 'location'];
  try {
    // mysql2 execute() returns [ResultRows[], FieldPacket[]] — a 2-element tuple.
    // We must unwrap [0] to get the actual result rows; the raw tuple always has
    // length 2, so Array.isArray(result) && result.length > 0 is always true and
    // cannot be used as a column-existence check.
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

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

const CORE_COLS = {
  userId:               scMemberProfiles.userId,
  memberType:           scMemberProfiles.memberType,
  region:               scMemberProfiles.region,
  city:                 scMemberProfiles.city,
  interests:            scMemberProfiles.interests,
  favLeagues:           scMemberProfiles.favLeagues,
  favTeams:             scMemberProfiles.favTeams,
  fanInterests:         scMemberProfiles.fanInterests,
  favPublishers:        scMemberProfiles.favPublishers,
  onboardingDone:       scMemberProfiles.onboardingDone,
};

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  // Probe column availability upfront so the client gets a definitive answer
  // without needing to attempt a save first.
  const identityColumnsAvailable = await checkIdentityColumns();

  let row: Record<string, unknown> | undefined;
  let fanColsAvailable = identityColumnsAvailable;

  if (identityColumnsAvailable) {
    try {
      const rows = await db
        .select({
          ...CORE_COLS,
          displayName:    scMemberProfiles.displayName,
          bio:            scMemberProfiles.bio,
          avatarUrl:      scMemberProfiles.avatarUrl,
          coverImageUrl:  scMemberProfiles.coverImageUrl,
          location:       scMemberProfiles.location,
        })
        .from(scMemberProfiles)
        .where(eq(scMemberProfiles.userId, userId))
        .limit(1) as Array<Record<string, unknown>>;
      row = rows[0];
    } catch {
      fanColsAvailable = false;
      const rows = await db
        .select(CORE_COLS)
        .from(scMemberProfiles)
        .where(eq(scMemberProfiles.userId, userId))
        .limit(1) as Array<Record<string, unknown>>;
      row = rows[0];
    }
  } else {
    const rows = await db
      .select(CORE_COLS)
      .from(scMemberProfiles)
      .where(eq(scMemberProfiles.userId, userId))
      .limit(1) as Array<Record<string, unknown>>;
    row = rows[0];
  }

  // Also fetch BetterAuth user.name as displayName fallback
  const [userRow] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!row) return res.json({ profile: null, identityColumnsAvailable });

  res.json({
    identityColumnsAvailable,
    profile: {
      userId:       row.userId,
      memberType:   row.memberType,
      region:       row.region,
      city:         row.city,
      interests:    parseJson(row.interests as string | null),
      favLeagues:   parseJson(row.favLeagues as string | null),
      favTeams:     parseJson(row.favTeams as string | null),
      fanInterests: parseJson(row.fanInterests as string | null),
      favPublishers: parseJson(row.favPublishers as string | null),
      onboardingDone: row.onboardingDone,
      // Fan identity fields — null until run-schema-fan-profile has run
      displayName:    fanColsAvailable ? ((row.displayName as string | null) ?? userRow?.name ?? null) : (userRow?.name ?? null),
      bio:            fanColsAvailable ? ((row.bio as string | null) ?? null) : null,
      avatarUrl:      fanColsAvailable ? ((row.avatarUrl as string | null) ?? null) : null,
      coverImageUrl:  fanColsAvailable ? ((row.coverImageUrl as string | null) ?? null) : null,
      location:       fanColsAvailable ? ((row.location as string | null) ?? null) : null,
    },
  });
}
