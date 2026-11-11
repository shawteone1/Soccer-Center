import { calendarDate } from '@/lib/portal/calendar-display';
/**
 * GET /api/parent/players/:playerId/coach-preview
 *
 * Returns the owner-parent's preview of what a coach would see for this player.
 *
 * This is a READ-ONLY owner preview — it does NOT create a link or expose a token.
 * The response shape is the strict coach projection produced by buildCoachProjection()
 * in src/server/lib/coach-projection.ts — that function is the single source of truth
 * for what fields are included or excluded.
 *
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true' in secrets.
 * When disabled, returns 403 {} — same as any other disabled feature.
 *
 * Protected by requireParentAccess() + player ownership check.
 *
 * Stats policy: the owner preview passes approvedMatchRecordIds=[] so stats
 * always show { available: false } in the preview. The parent must explicitly
 * select match records when creating a share link (Step 3). This is intentional:
 * the preview shows the coach projection shape, not a pre-approved stats view.
 */

import { filterCoachProfile } from '@/lib/portal/coach-sharing';
import { readUkEducation } from '@/server/lib/uk-education';
import type { Request, Response } from 'express';
import { and, eq, asc, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import {
  scPlayerProfiles,
  scPlayerAffiliations,
  scPlayerMatchRecords,
} from '@/server/db/schema.js';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { buildCoachProjection, type HighlightProjectionRow, type UpcomingEventProjectionRow } from '@/server/lib/coach-projection.js';



export default async function handler(req: Request, res: Response) {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  if (!isCoachProfileEnabled()) {
    res.status(403).json({});
    return;
  }

  setPrivateCacheHeaders(res);

  const playerId = String(req.params.playerId);

  // ── Fetch player (ownership enforced) ────────────────────────────────────
  // Only projection-safe fields are selected — private fields (birthYear,
  // clubUrl, goals, trainingPreferences, stat_*, etc.) are excluded at the
  // query level. stat_* fields are intentionally absent: profile-level stat
  // totals are never used in the coach projection.
  let rows: Array<Record<string, unknown>>;
  try {
    rows = await db
      .select({
        id:                  scPlayerProfiles.id,
        label:               scPlayerProfiles.label,
        ageBand:             scPlayerProfiles.ageBand,
        graduationYear:      scPlayerProfiles.graduationYear,
        primaryPosition:     scPlayerProfiles.primaryPosition,
        secondaryPosition:   scPlayerProfiles.secondaryPosition,
        foot:                scPlayerProfiles.foot,
        positions:           scPlayerProfiles.positions,
        skillLevel:          scPlayerProfiles.skillLevel,
        clubName:            scPlayerProfiles.clubName,
        profileIntroduction: scPlayerProfiles.profileIntroduction,
        achievements:        scPlayerProfiles.achievements,
        playingLevel:        scPlayerProfiles.playingLevel,
        gpa:                 scPlayerProfiles.gpa,
        gpaScale:            scPlayerProfiles.gpaScale,
        gpaWeighted:         scPlayerProfiles.gpaWeighted,
        intendedMajor:       scPlayerProfiles.intendedMajor,
        collegeGoals:        scPlayerProfiles.collegeGoals,
        contactEmail:        scPlayerProfiles.contactEmail,
        highSchool:          scPlayerProfiles.highSchool,
        schoolCity:          scPlayerProfiles.schoolCity,
        schoolState:         scPlayerProfiles.schoolState,
        avatarUrl:           scPlayerProfiles.avatarUrl,
        avatarInitials:      scPlayerProfiles.avatarInitials,
      })
      .from(scPlayerProfiles)
      .where(
        and(
          eq(scPlayerProfiles.id, playerId),
          eq(scPlayerProfiles.userId, user.id),
          isNull(scPlayerProfiles.deletedAt),
        ),
      )
      .limit(1) as Array<Record<string, unknown>>;
  } catch (e) {
    console.error('[GET coach-preview]', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (rows.length === 0) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const r = rows[0];

  // ── Affiliations (strip internal directory refs) ─────────────────────────
  const affiliationRows = await db
    .select({
      orgName:       scPlayerAffiliations.orgName,
      season:        scPlayerAffiliations.season,
      ageGroupLabel: scPlayerAffiliations.ageGroupLabel,
    })
    .from(scPlayerAffiliations)
    .where(eq(scPlayerAffiliations.playerId, playerId))
    .orderBy(asc(scPlayerAffiliations.createdAt));

  // ── Match records — fetched for ownership verification ───────────────────
  // id is included so buildCoachProjection can filter by approvedMatchRecordIds.
  // notes is intentionally excluded — private.
  // The owner preview passes approvedMatchRecordIds=[] so stats will be
  // { available: false } — the parent must select records when creating a link.
  let matchRecords: Array<Record<string, unknown>> = [];
  let statsTableAvailable = true;
  try {
    matchRecords = await db
      .select({
        id:                   scPlayerMatchRecords.id,
        statGp:               scPlayerMatchRecords.statGp,
        statGoals:            scPlayerMatchRecords.statGoals,
        statAssists:          scPlayerMatchRecords.statAssists,
        statShots:            scPlayerMatchRecords.statShots,
        statGa:               scPlayerMatchRecords.statGa,
        statSaves:            scPlayerMatchRecords.statSaves,
        statSo:               scPlayerMatchRecords.statSo,
        participated:         scPlayerMatchRecords.participated,
        seasonTotalsOverride: scPlayerMatchRecords.seasonTotalsOverride,
        season:               scPlayerMatchRecords.season,
        positionPlayed:       scPlayerMatchRecords.positionPlayed,
        matchDate:            scPlayerMatchRecords.matchDate,
        opponent:             scPlayerMatchRecords.opponent,
        // notes intentionally excluded — private
      })
      .from(scPlayerMatchRecords)
      .where(
        and(
          eq(scPlayerMatchRecords.playerId, playerId),
          eq(scPlayerMatchRecords.userId, user.id),
        ),
      ) as Array<Record<string, unknown>>;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') {
      statsTableAvailable = false;
    } else {
      console.error('[GET coach-preview] match records error:', e);
      // Non-fatal: stats will be unavailable
      statsTableAvailable = false;
    }
  }

  // ── Resolve approved match record IDs ───────────────────────────────────
  // Optional ?matchIds= query param: comma-separated list of match record IDs
  // the parent has selected. When provided, the preview shows the same stats
  // the coach will see — making the preview step accurate before link creation.
  // IDs are validated against the player+owner rows fetched above.
  const rawMatchParam = typeof req.query.matchIds === 'string' ? req.query.matchIds.trim() : '';
  const requestedMatchIds = rawMatchParam
    ? rawMatchParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  // Validate: only IDs that belong to this player+owner are accepted.
  // Foreign IDs are silently excluded — same policy as the coach view GET.
  const ownedMatchIdSet = new Set(matchRecords.map(r => (r as { id: string }).id));
  const approvedMatchRecordIds = requestedMatchIds.filter(id => ownedMatchIdSet.has(id));

  // ── Highlights: uploaded video assignments ───────────────────────────────
  // Highlights are uploaded video files (media_type='video') assigned to this
  // player with kind='highlight'.
  //
  // Optional query param: ?selectedMedia=id1,id2,...
  // When provided, only those assignment IDs are included and each receives
  // a proxy URL (/api/coach/media/preview/:playerId/:assignmentId) so the
  // parent can preview the exact set they intend to share.
  // When omitted, all highlight assignments are returned with publicUrl=null
  // (the parent hasn't selected yet — preview shows what's available).
  //
  // ER_NO_SUCH_TABLE is handled gracefully — returns empty array.
  const rawSelectedMediaParam = typeof req.query.selectedMedia === 'string' ? req.query.selectedMedia.trim() : '';
  const requestedMediaIds = rawSelectedMediaParam
    ? rawSelectedMediaParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const hasMediaFilter = Object.prototype.hasOwnProperty.call(req.query, 'selectedMedia');

  let highlights: HighlightProjectionRow[] = [];
  let highlightsUnavailable = false;
  try {
    const hlRows = await db.execute(
      sql`SELECT a.id, a.title, a.season, m.media_type, m.public_url
           FROM sc_player_media_assignments a
           INNER JOIN sc_parent_media m ON m.id = a.media_id
           WHERE a.player_id = ${playerId}
             AND a.user_id   = ${user.id}
             AND m.media_type = 'video'
             AND m.deleted_at IS NULL
             AND m.user_id = ${user.id}
             ${hasMediaFilter ? (requestedMediaIds.length ? sql`AND a.id IN (${sql.join(requestedMediaIds.map(id => sql`${id}`), sql`, `)})` : sql`AND 1 = 0`) : sql``}
           ORDER BY a.created_at DESC`
    ) as unknown;
    const hlArr = (hlRows as [Array<{ id: string; title: string | null; season: string | null; media_type: string; public_url: string }>])[0];
    // When a selectedMedia filter is provided, validate ownership and restrict
    // to only the requested IDs. Foreign IDs (wrong player/user) are silently
    // excluded — same policy as the coach view GET.
    const ownedIdSet = new Set(hlArr.map(h => h.id));
    const validatedMediaIds = hasMediaFilter
      ? requestedMediaIds.filter(id => ownedIdSet.has(id))
      : null; // null = no filter, return all

    highlights = hlArr
      .filter(h => validatedMediaIds === null || validatedMediaIds.includes(h.id))
      .map(h => ({
        id: h.id,
        title: h.title ?? 'Highlight',
        // Proxy URL: owner-authenticated preview proxy. Only set when this
        // assignment is in the validated selectedMedia set.
        publicUrl: (validatedMediaIds !== null && validatedMediaIds.includes(h.id))
          ? `/api/parent/players/${playerId}/media-preview/${encodeURIComponent(h.id)}`
          : null,
        season: h.season ?? '',
        mediaType: h.media_type,
      }));
  } catch (e: unknown) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (code !== 'ER_NO_SUCH_TABLE') console.error('[GET coach-preview] highlights:', e);
    highlightsUnavailable = true;
  }

  // ── Upcoming events: game events from sc_parent_manual_events ─────────────
  // Only future game events linked to this player.
  //
  // Optional query param: ?selectedEvents=id1,id2,...
  // When provided, only those event IDs are returned — the preview reflects
  // exactly what the coach will see after the parent selects events.
  // When omitted, all upcoming game events are returned so the parent can
  // see what is available before making a selection.
  //
  // ER_NO_SUCH_TABLE is handled gracefully — returns empty array.
  const rawSelectedEventsParam = typeof req.query.selectedEvents === 'string' ? req.query.selectedEvents.trim() : '';
  const requestedEventIds = rawSelectedEventsParam
    ? rawSelectedEventsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const hasEventFilter = Object.prototype.hasOwnProperty.call(req.query, 'selectedEvents');

  let upcomingEvents: UpcomingEventProjectionRow[] = [];
  let eventsUnavailable = false;
  try {
    const evRows = await db.execute(
      sql`SELECT id, title, start_at, location, event_type, all_day
           FROM sc_parent_manual_events
           WHERE user_id    = ${user.id}
             AND player_id  = ${playerId}
             AND event_type IN ('game', 'camp', 'tournament', 'showcase')
             AND start_at   >= NOW()
             ${hasEventFilter ? (requestedEventIds.length ? sql`AND id IN (${sql.join(requestedEventIds.map(id => sql`${id}`), sql`, `)})` : sql`AND 1 = 0`) : sql``}
           ORDER BY start_at ASC`
    ) as unknown;
    const evArr = (evRows as [Array<{ id: string; title: string; start_at: string; event_type?: string; all_day?: number | boolean; location: string | null }>])[0];
    // When a selectedEvents filter is provided, restrict to only those IDs.
    // Foreign IDs (wrong player/user) are silently excluded.
    const ownedEventIdSet = new Set(evArr.map(ev => ev.id));
    const validatedEventIds = hasEventFilter
      ? requestedEventIds.filter(id => ownedEventIdSet.has(id))
      : null; // null = no filter, return all
    upcomingEvents = evArr
      .filter(ev => validatedEventIds === null || validatedEventIds.includes(ev.id))
      .map(ev => {
      // Parse opponent from title: "vs. Opponent" or "@ Opponent" patterns
      const vsMatch = /^(?:vs\.?\s+|@\s*)(.+)$/i.exec(ev.title);
      const isHome = !/^@\s/.test(ev.title);
      const opponent = vsMatch ? vsMatch[1].trim() : null;
      return {
        id: ev.id,
          eventType: ev.event_type ?? 'game',
        date: calendarDate(ev.start_at, Boolean(ev.all_day)),
          startAt: ev.start_at,
          allDay: Boolean(ev.all_day),
        title: ev.title,
        location: ev.location ?? '',
        opponent,
        competition: '',
        isHome,
      };
    });
  } catch (e: unknown) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
    if (code !== 'ER_NO_SUCH_TABLE') console.error('[GET coach-preview] upcoming events:', e);
    eventsUnavailable = true;
  }

  if ((!statsTableAvailable && requestedMatchIds.length > 0)
      || (highlightsUnavailable && requestedMediaIds.length > 0)
      || (eventsUnavailable && requestedEventIds.length > 0)) {
    res.status(503).json({ error: 'SELECTED_CONTENT_UNAVAILABLE', message: 'Selected content could not load. Please retry the preview.' });
    return;
  }

  // ── Build coach projection via shared function ────────────────────────────
  // mediaOriginProtected is true: the coach photo proxy
  // (/api/coach/photo/:token/:playerId) validates token + approvedFields on
  // every request. The preview is owner-authenticated so avatarUrl is passed
  // through directly — the raw URL is safe for the parent to see.
  const projection = buildCoachProjection({
    player: {
      ukEducation: await readUkEducation(playerId),
      id:                  (r.id                  as string | null) ?? null,
      label:               (r.label               as string | null) ?? null,
      ageBand:             (r.ageBand             as string | null) ?? null,
      graduationYear:      (r.graduationYear      as number | null) ?? null,
      primaryPosition:     (r.primaryPosition     as string | null) ?? null,
      secondaryPosition:   (r.secondaryPosition   as string | null) ?? null,
      foot:                (r.foot                as string | null) ?? null,
      positions:           (r.positions           as string | null) ?? null,
      skillLevel:          (r.skillLevel          as string | null) ?? null,
      clubName:            (r.clubName            as string | null) ?? null,
      profileIntroduction: (r.profileIntroduction as string | null) ?? null,
      achievements:        (r.achievements        as string | null) ?? null,
      playingLevel:        (r.playingLevel        as string | null) ?? null,
      gpa:           (r.gpa           as string | null) ?? null,
      gpaScale:      (r.gpaScale      as string | null) ?? null,
      gpaWeighted:   (r.gpaWeighted   as string | null) ?? null,
      intendedMajor: (r.intendedMajor as string | null) ?? null,
      collegeGoals:  (r.collegeGoals  as string | null) ?? null,
      contactEmail:  (r.contactEmail  as string | null) ?? null,
      highSchool:    (r.highSchool    as string | null) ?? null,
      schoolCity:    (r.schoolCity    as string | null) ?? null,
      schoolState:   (r.schoolState   as string | null) ?? null,
      avatarUrl:           (r.avatarUrl           as string | null) ?? null,
      avatarInitials:      (r.avatarInitials      as string | null) ?? null,
    },
    affiliations: affiliationRows,
    matchRecords: matchRecords as unknown as Parameters<typeof buildCoachProjection>[0]['matchRecords'],
    approvedMatchRecordIds,
    statsTableAvailable,
    mediaOriginProtected: true,
    highlights,
    upcomingEvents,
  });

  // No approvedFields query is the owner-only discovery request used to populate
  // the game picker. Actual previews always provide an explicit selection.
  const fields = typeof req.query.approvedFields === 'string'
    ? req.query.approvedFields.split(',').filter(Boolean) : null;
  res.json({ profile: fields === null ? projection : filterCoachProfile(projection, fields) });
}
