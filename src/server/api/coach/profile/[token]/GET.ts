import { calendarDate } from '@/lib/portal/calendar-display';
/**
 * GET /api/coach/profile/:token
 *
 * Unauthenticated coach-facing view of a player profile.
 * The :token is the raw bearer token embedded in the share URL.
 *
 * SECURITY
 * ────────
 * - No authentication required — the token is the credential.
 * - Token is hashed on arrival; the raw token is never logged or stored.
 * - Expired and revoked links return identical 404 (same as never-issued).
 * - selectedMatchRecords are re-validated against player+owner on every read.
 *   Foreign IDs are silently excluded (not an error — link may predate a deletion).
 * - Cache-Control: no-store on all responses.
 * - Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 * - Returns 503 when no durable store is available.
 *
 * MEDIA SHARING
 * ─────────────
 * mediaOriginProtected=true — proxy /api/coach/media/:token/:assignmentId
 * serves token-gated video with ownership re-validation on every request.
 *
 * FIELD FILTER
 * ────────────
 * Only the fields in link.approvedFields are returned.
 * Only the media protection capability is included independently of field consent.
 */

import { readUkEducation } from '@/server/lib/uk-education';
import type { Request, Response } from 'express';
import { and, eq, asc, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import {
  scPlayerProfiles,
  scPlayerAffiliations,
  scPlayerMatchRecords,
} from '@/server/db/schema.js';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { redactCoachToken } from '@/server/lib/redact-coach-token.js';
import { buildCoachProjection, type HighlightProjectionRow, type UpcomingEventProjectionRow } from '@/server/lib/coach-projection.js';
import { DEMO_COACH_PROJECTION, DEMO_MATCH_RECORDS_FOR_COACH_VIEW } from '@/server/lib/coach-demo-fixtures.js';
import { filterCoachProfile as applyFieldFilter } from '@/lib/portal/coach-sharing';

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  // Prevent token URLs from entering Referer headers on outbound links
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export default async function handler(req: Request, res: Response) {
  noStore(res);

  if (!isCoachProfileEnabled()) {
    res.status(404).json({});
    return;
  }

  const store = getCoachLinkStore((k) => { const v = getSecret(k); return typeof v === 'string' ? v : undefined; });
  if (!store) {
    // Fail closed — same 404 shape as expired/revoked to avoid information leakage
    res.status(404).json({});
    return;
  }

  const rawToken = String(req.params.token ?? '');
  if (!rawToken || rawToken.length < 10) {
    res.status(404).json({});
    return;
  }

  // ── Look up link by token hash ────────────────────────────────────────────
  // The raw token is hashed immediately and never referenced again after this point.
  const link = await store.findByToken(rawToken);

  if (!link) {
    res.status(404).json({});
    return;
  }

  const now = new Date();
  if (link.revokedAt != null || (link.expiresAt != null && link.expiresAt < now)) {
    res.status(404).json({});
    return;
  }

  const { playerId, userId, approvedFields, selectedMatchRecords } = link;

  // ── Demo mode: serve synthetic fixtures, never query real DB ─────────────
  // When a link was created in demo mode (COACH_PROFILE_DEMO_MODE=true), the
  // playerId/userId are synthetic. Serving real DB data for those IDs would
  // either return nothing (safe) or — if IDs collide — expose real player data.
  // We build the projection from the canonical demo fixture + the link's
  // selectedMatchRecords filtered against DEMO_MATCH_RECORDS_FOR_COACH_VIEW.
  // This ensures zero selections show stats.available=false, not the hardcoded
  // 5-match fixture, and the coach view matches what the parent previewed.
  if (link.demoMode) {
    const approvedDemoRecords = DEMO_MATCH_RECORDS_FOR_COACH_VIEW.filter(
      r => r.id != null && selectedMatchRecords.includes(r.id),
    );
    const demoProjection = buildCoachProjection({
      player: {
        id:                  'demo-player',
        label:               DEMO_COACH_PROJECTION.label,
        ageBand:             DEMO_COACH_PROJECTION.ageBand,
        graduationYear:      DEMO_COACH_PROJECTION.graduationYear,
        primaryPosition:     DEMO_COACH_PROJECTION.primaryPosition,
        secondaryPosition:   DEMO_COACH_PROJECTION.secondaryPosition,
        foot:                DEMO_COACH_PROJECTION.foot,
        positions:           JSON.stringify(DEMO_COACH_PROJECTION.positions),
        skillLevel:          DEMO_COACH_PROJECTION.skillLevel,
        clubName:            DEMO_COACH_PROJECTION.clubName,
        profileIntroduction: DEMO_COACH_PROJECTION.profileIntroduction,
        achievements:        JSON.stringify(DEMO_COACH_PROJECTION.achievements),
        playingLevel:        DEMO_COACH_PROJECTION.playingLevel,
        gpa:           DEMO_COACH_PROJECTION.gpa,
        gpaScale:      DEMO_COACH_PROJECTION.gpaScale,
        gpaWeighted:   DEMO_COACH_PROJECTION.gpaWeighted,
        intendedMajor: DEMO_COACH_PROJECTION.intendedMajor,
        highSchool:    DEMO_COACH_PROJECTION.highSchool,
        schoolCity:    DEMO_COACH_PROJECTION.schoolCity,
        schoolState:   DEMO_COACH_PROJECTION.schoolState,
        collegeGoals:  DEMO_COACH_PROJECTION.collegeGoals,
        contactEmail:  DEMO_COACH_PROJECTION.contactEmail,
        avatarUrl:           null,
        avatarInitials:      DEMO_COACH_PROJECTION.avatarInitials,
      },
      affiliations: DEMO_COACH_PROJECTION.affiliations,
      matchRecords: approvedDemoRecords,
      approvedMatchRecordIds: approvedDemoRecords.map(r => r.id!),
      statsTableAvailable: true,
      mediaOriginProtected: true,
    });
    const filtered = applyFieldFilter(demoProjection, approvedFields);
    res.json({
      profile: filtered,
      linkId: link.id,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      _demo: true,
    });
    return;
  }

  // ── Fetch player ──────────────────────────────────────────────────────────
  let playerRows: Array<Record<string, unknown>>;
  try {
    playerRows = await db
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
          eq(scPlayerProfiles.userId, userId),
          isNull(scPlayerProfiles.deletedAt),
        ),
      )
      .limit(1) as Array<Record<string, unknown>>;
  } catch (e) {
    console.error('[GET coach/profile] player fetch error:', redactCoachToken(req.url), e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (playerRows.length === 0) {
    res.status(404).json({});
    return;
  }

  const r = playerRows[0];

  // ── Affiliations ──────────────────────────────────────────────────────────
  const affiliationRows = await db
    .select({
      orgName:       scPlayerAffiliations.orgName,
      season:        scPlayerAffiliations.season,
      ageGroupLabel: scPlayerAffiliations.ageGroupLabel,
    })
    .from(scPlayerAffiliations)
    .where(eq(scPlayerAffiliations.playerId, playerId))
    .orderBy(asc(scPlayerAffiliations.createdAt));

  // ── Match records — re-validate against player+owner ─────────────────────
  // selectedMatchRecords from the link are re-validated on every read.
  // Foreign IDs (e.g. from a deleted record) are silently excluded.
  let matchRecords: Array<Record<string, unknown>> = [];
  let statsTableAvailable = true;
  let validatedMatchIds: string[] = selectedMatchRecords;

  if (selectedMatchRecords.length > 0) {
    try {
      const ownedRows = await db
        .select({ id: scPlayerMatchRecords.id })
        .from(scPlayerMatchRecords)
        .where(
          and(
            eq(scPlayerMatchRecords.playerId, playerId),
            eq(scPlayerMatchRecords.userId, userId),
            inArray(scPlayerMatchRecords.id, selectedMatchRecords),
          ),
        ) as Array<{ id: string }>;
      const ownedIds = new Set(ownedRows.map(row => row.id));
      // Silently exclude any IDs that no longer belong to this player+owner
      validatedMatchIds = selectedMatchRecords.filter(id => ownedIds.has(id));
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'ER_NO_SUCH_TABLE') {
        console.error('[GET coach/profile] match ID re-validation error:', redactCoachToken(req.url), e);
      }
      statsTableAvailable = false;
      validatedMatchIds = [];
    }
  }

  if (validatedMatchIds.length > 0 && statsTableAvailable) {
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
        })
        .from(scPlayerMatchRecords)
        .where(
          and(
            eq(scPlayerMatchRecords.playerId, playerId),
            eq(scPlayerMatchRecords.userId, userId),
            inArray(scPlayerMatchRecords.id, validatedMatchIds),
          ),
        ) as Array<Record<string, unknown>>;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'ER_NO_SUCH_TABLE') {
        console.error('[GET coach/profile] match records fetch error:', redactCoachToken(req.url), e);
      }
      statsTableAvailable = false;
    }
  }

  // ── Highlights: uploaded video assignments (selectedMedia-scoped) ──────────
  // Only assignments whose id appears in link.selectedMedia are included.
  // This enforces individual parent selection — the coach sees only what the
  // parent explicitly approved when creating the link.
  // publicUrl is the token-gated proxy URL /api/coach/media/:token/:assignmentId.
  let highlights: HighlightProjectionRow[] = [];
  // link.selectedMedia is already a string[] (parsed by CoachLinkRecord)
  const selectedMediaIds: string[] = Array.isArray(link.selectedMedia) ? link.selectedMedia : [];
  if (selectedMediaIds.length > 0) {
    try {
      const hlRows = await db.execute(
        sql`SELECT a.id, a.title, a.season, m.media_type
             FROM sc_player_media_assignments a
             INNER JOIN sc_parent_media m ON m.id = a.media_id
             WHERE a.id        IN ${sql`(${sql.join(selectedMediaIds.map(id => sql`${id}`), sql`, `)})`}
               AND a.player_id = ${playerId}
               AND a.user_id   = ${userId}
               AND m.user_id = ${userId}
               AND m.media_type = 'video'
               AND m.deleted_at IS NULL
             ORDER BY a.created_at DESC`
      ) as unknown;
      const hlArr = (hlRows as [Array<{ id: string; title: string | null; season: string | null; media_type: string }>])[0];
      highlights = hlArr.map(h => ({
        id: h.id,
        title: h.title ?? 'Highlight',
        // Token-gated proxy URL — validates ownership + selectedMedia on every request.
        publicUrl: `/api/coach/media/${encodeURIComponent(rawToken)}/${encodeURIComponent(h.id)}`,
        season: h.season ?? '',
        mediaType: h.media_type,
      }));
    } catch (e: unknown) {
      const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code ?? '';
      if (code !== 'ER_NO_SUCH_TABLE') console.error('[GET coach/profile] highlights:', redactCoachToken(req.url), e);
    }
  }

  // ── Upcoming events — scoped strictly to this player ────────────────────
  // Only events with player_id = playerId are included. Events with
  // player_id IS NULL are family-wide and must not appear in a coach view.
  // notes column is excluded — private. title is the only public text.
  //
  // selectedEvents semantics (fail-closed):
  //   - Empty array (or missing/null column) → NO events returned.
  //     The parent must explicitly select each event to share it.
  //   - Non-empty array → only those specific event IDs are returned.
  //     IDs that no longer exist or have passed are silently excluded.
  //
  // A missing selected_events column in an older DB row parses as [] via
  // _parseJson fallback → no events shared. This is the correct safe default.
  let upcomingEvents: UpcomingEventProjectionRow[] = [];
  const selectedEventIds: string[] = Array.isArray(link.selectedEvents) ? link.selectedEvents : [];
  if (selectedEventIds.length > 0) {
    try {
      const evRows = await db.execute(
        sql`SELECT id, title, start_at, location, event_type, all_day
               FROM sc_parent_manual_events
               WHERE user_id    = ${userId}
                 AND player_id  = ${playerId}
                 AND event_type IN ('game', 'camp', 'tournament', 'showcase')
                 AND start_at   >= NOW()
                 AND id         IN ${sql`(${sql.join(selectedEventIds.map(id => sql`${id}`), sql`, `)})`}
               ORDER BY start_at ASC`
      ) as unknown;
      const evArr = (evRows as [Array<{ id: string; title: string; start_at: string; event_type?: string; all_day?: number | boolean; location: string | null }>])[0];
      upcomingEvents = evArr.map(ev => {
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
      if (code !== 'ER_NO_SUCH_TABLE') console.error('[GET coach/profile] upcoming events:', redactCoachToken(req.url), e);
    }
  }

  // ── Build projection ──────────────────────────────────────────────────────
  const projection = buildCoachProjection({
    player: {
      ukEducation: await readUkEducation(link.playerId),
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
      // avatarUrl: never pass the raw DB URL to the projection builder.
      // The proxy URL is injected post-filter below when 'photo' is approved.
      avatarUrl:           null,
      avatarInitials:      (r.avatarInitials      as string | null) ?? null,
    },
    affiliations: affiliationRows,
    matchRecords: matchRecords as unknown as Parameters<typeof buildCoachProjection>[0]['matchRecords'],
    approvedMatchRecordIds: validatedMatchIds,
    statsTableAvailable,
    mediaOriginProtected: true,
    highlights,
    upcomingEvents,
  });

  const filtered = applyFieldFilter(projection, approvedFields);

  // Inject photo proxy URL post-filter.
  // 'photo' is the parent-facing field key; 'avatarUrl' is the projection key.
  // The proxy /api/coach/photo/:token/:playerId validates token + approvedFields
  // on every request — the raw /airo-assets/uploads/ URL is never forwarded.
  if (approvedFields.includes('photo') && r.avatarUrl) {
    (filtered as Record<string, unknown>).avatarUrl =
      `/api/coach/photo/${encodeURIComponent(rawToken)}/${encodeURIComponent(link.playerId)}`;
  }

  res.json({
    profile: filtered,
    linkId: link.id,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  });
}
