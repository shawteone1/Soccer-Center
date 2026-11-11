/**
 * POST /api/parent/players/:playerId/coach-links
 *
 * Creates a revocable, expiring share link for a player's coach profile.
 *
 * SECURITY
 * ────────
 * - requireParentAccess() enforces authentication.
 * - Player ownership verified against the authenticated user.
 * - selectedMatchRecords validated against player+owner rows — foreign IDs rejected.
 * - approvedFields validated against APPROVED_FIELDS_ALLOWLIST.
 * - expiresInDays: 1–365 (inclusive). Default 30. No never-expiring links.
 * - Cache-Control: no-store on all responses.
 * - Raw token appears only in shareUrl — never stored, never logged.
 *
 * STORE POLICY
 * ────────────
 * Returns 503 when no durable store is available (production default).
 * Demo mode (COACH_PROFILE_DEMO_MODE=true) uses a process-local store.
 *
 * Feature gate: COACH_PROFILE_LINKS_ENABLED must be 'true'.
 */

import type { Request, Response } from 'express';
import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles, scPlayerMatchRecords } from '@/server/db/schema.js';
import { requireParentAccess } from '@/server/auth-policy.js';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from '@/server/lib/coach-feature-gate.js';
import { getCoachLinkStore } from '@/server/lib/coach-link-store.js';
import { validateApprovedFields } from '@/server/lib/coach-profile-fields.js';
import { OUTREACH_AGE_GROUPS } from '@/server/api/parent/recruiting/_guard.js';

const DEFAULT_EXPIRES_DAYS = 30;
const MAX_EXPIRES_DAYS = 365;
const MIN_EXPIRES_DAYS = 1;



function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export default async function handler(req: Request, res: Response) {
  noStore(res);

  const user = await requireParentAccess(req, res);
  if (!user) return;

  if (!isCoachProfileEnabled()) {
    res.status(403).json({ error: 'FEATURE_DISABLED' });
    return;
  }

  // ── Test-cohort enforcement ───────────────────────────────────────────────
  // Coach profile sharing is restricted to accounts listed in
  // COACH_PROFILE_TESTERS (comma-separated) until data verification is
  // complete. This check applies to ALL accounts — admin status does not
  // bypass it. A single-account restriction is therefore enforceable by
  // listing exactly one email address.
  //
  // Behavior by secret value:
  //   absent / empty string  → block everyone (cohort not configured)
  //   '*'                    → allow all authenticated parents
  //   'a@b.com,c@d.com'      → allow only those emails (case-insensitive)
  {
    const testerRaw = getSecret('COACH_PROFILE_TESTERS');
    const testerStr = (typeof testerRaw === 'string' ? testerRaw : '').trim();
    if (testerStr !== '*') {
      const allowed = testerStr.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
      if (allowed.length === 0 || !allowed.includes((user.email ?? '').toLowerCase())) {
        res.status(403).json({
          error: 'NOT_IN_TEST_COHORT',
          message: 'Coach profile sharing is currently restricted to a test cohort. Contact your administrator.',
        });
        return;
      }
    }
  }

  // ── Store availability check ──────────────────────────────────────────────
  const store = getCoachLinkStore((k) => { const v = getSecret(k); return typeof v === 'string' ? v : undefined; });
  if (!store) {
    res.status(503).json({
      error: 'STORE_UNAVAILABLE',
      message: 'Coach profile sharing is not yet available. Durable storage is pending database isolation confirmation.',
    });
    return;
  }

  const playerId = String(req.params.playerId);
  const body = req.body as Record<string, unknown>;

  // ── Validate approvedFields ───────────────────────────────────────────────
  const fieldValidation = validateApprovedFields(body.approvedFields);
  if (!fieldValidation.valid) {
    res.status(400).json({
      error: 'INVALID_APPROVED_FIELDS',
      message: fieldValidation.error,
      invalidFields: fieldValidation.invalidFields,
    });
    return;
  }
  const approvedFields = body.approvedFields as string[];

  // ── Validate expiresInDays ────────────────────────────────────────────────
  const rawExpiry = body.expiresInDays;
  let expiresInDays: number;
  if (rawExpiry === undefined || rawExpiry === null) {
    expiresInDays = DEFAULT_EXPIRES_DAYS;
  } else if (
    typeof rawExpiry !== 'number' ||
    !Number.isInteger(rawExpiry) ||
    rawExpiry < MIN_EXPIRES_DAYS ||
    rawExpiry > MAX_EXPIRES_DAYS
  ) {
    res.status(400).json({
      error: 'INVALID_EXPIRES_IN_DAYS',
      message: `expiresInDays must be an integer between ${MIN_EXPIRES_DAYS} and ${MAX_EXPIRES_DAYS}`,
    });
    return;
  } else {
    expiresInDays = rawExpiry;
  }

  // ── Validate label ────────────────────────────────────────────────────────
  const rawLabel = body.label;
  const label = rawLabel == null ? null
    : typeof rawLabel === 'string' ? rawLabel.slice(0, 120).trim() || null
    : null;

  // ── Verify player ownership ───────────────────────────────────────────────
  let playerRows: Array<{ id: string; ageBand: string | null }>;
  try {
    playerRows = await db
      .select({ id: scPlayerProfiles.id, ageBand: scPlayerProfiles.ageBand })
      .from(scPlayerProfiles)
      .where(
        and(
          eq(scPlayerProfiles.id, playerId),
          eq(scPlayerProfiles.userId, user.id),
          isNull(scPlayerProfiles.deletedAt),
        ),
      )
      .limit(1) as Array<{ id: string; ageBand: string | null }>;
  } catch (e) {
    console.error('[POST coach-links] player ownership check error:', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (playerRows.length === 0) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  // ── Enforce U16+ outreach gate (server-side) ──────────────────────────────
  // Coach profile sharing is an outreach feature — same age gate as coach directory.
  // The tab is hidden client-side for younger players but the API enforces it too.
  const playerAgeBand = (playerRows as Array<{ id: string; ageBand?: string | null }>)[0]?.ageBand ?? null;
  if (!playerAgeBand || !OUTREACH_AGE_GROUPS.has(playerAgeBand)) {
    res.status(403).json({
      error: 'OUTREACH_AGE_GATE',
      message: 'Coach profile sharing is available for U16–U19 players only.',
      ageBand: playerAgeBand,
    });
    return;
  }

  // ── Validate selectedMatchRecords against player+owner ────────────────────
  const rawMatchIds = body.selectedMatchRecords;
  if (!Array.isArray(rawMatchIds)) {
    res.status(400).json({ error: 'INVALID_MATCH_RECORDS', message: 'selectedMatchRecords must be an array' });
    return;
  }
  const requestedMatchIds = (rawMatchIds as unknown[]).filter(id => typeof id === 'string') as string[];

  let validatedMatchIds: string[] = [];
  if (requestedMatchIds.length > 0) {
    let ownedRows: Array<{ id: string }> = [];
    let matchTableAvailable = true;
    try {
      ownedRows = await db
        .select({ id: scPlayerMatchRecords.id })
        .from(scPlayerMatchRecords)
        .where(
          and(
            eq(scPlayerMatchRecords.playerId, playerId),
            eq(scPlayerMatchRecords.userId, user.id),
            inArray(scPlayerMatchRecords.id, requestedMatchIds),
          ),
        ) as Array<{ id: string }>;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        matchTableAvailable = false;
      } else {
        console.error('[POST coach-links] match record validation error:', e);
        res.status(500).json({ error: 'Database error' });
        return;
      }
    }

    if (!matchTableAvailable) {
      // Table not yet migrated — treat all requested IDs as invalid
      res.status(400).json({
        error: 'MATCH_TABLE_UNAVAILABLE',
        message: 'Match records table is not yet available. Cannot validate selectedMatchRecords.',
      });
      return;
    }

    const ownedIds = new Set(ownedRows.map(r => r.id));
    const foreignIds = requestedMatchIds.filter(id => !ownedIds.has(id));
    if (foreignIds.length > 0) {
      res.status(400).json({
        error: 'FOREIGN_MATCH_RECORD_IDS',
        message: 'One or more selectedMatchRecords do not belong to this player.',
        foreignIds,
      });
      return;
    }
    validatedMatchIds = requestedMatchIds;
  }

  // ── Validate selectedMedia against player+owner ───────────────────────────
  // Each ID must be a highlight assignment owned by this player+user.
  // Foreign IDs (other players, other users, deleted items) are rejected.
  const rawMediaIds = body.selectedMedia;
  if (!Array.isArray(rawMediaIds)) {
    res.status(400).json({ error: 'INVALID_SELECTED_MEDIA', message: 'selectedMedia must be an array' });
    return;
  }
  const requestedMediaIds = (rawMediaIds as unknown[]).filter(id => typeof id === 'string') as string[];

  let validatedMediaIds: string[] = [];
  if (requestedMediaIds.length > 0) {
    try {
      const ownedMediaRows = await db.execute(
        sql`SELECT a.id
             FROM sc_player_media_assignments a
             INNER JOIN sc_parent_media m ON m.id = a.media_id
             WHERE a.id        IN ${sql`(${sql.join(requestedMediaIds.map(id => sql`${id}`), sql`, `)})`}
               AND a.player_id = ${playerId}
               AND a.user_id   = ${user.id}
               AND m.user_id = ${user.id}
               AND m.media_type = 'video'
               AND m.deleted_at IS NULL`
      ) as unknown;
      const ownedArr = (ownedMediaRows as [Array<{ id: string }>])[0];
      const ownedMediaSet = new Set(ownedArr.map(r => r.id));
      const foreignMediaIds = requestedMediaIds.filter(id => !ownedMediaSet.has(id));
      if (foreignMediaIds.length > 0) {
        res.status(400).json({
          error: 'FOREIGN_MEDIA_IDS',
          message: 'One or more selectedMedia IDs do not belong to this player as highlight video assignments.',
          foreignIds: foreignMediaIds,
        });
        return;
      }
      validatedMediaIds = requestedMediaIds;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        // Media assignments table not yet migrated — treat all IDs as invalid
        res.status(400).json({
          error: 'MEDIA_TABLE_UNAVAILABLE',
          message: 'Media assignments table is not yet available. Cannot validate selectedMedia.',
        });
        return;
      }
      console.error('[POST coach-links] media validation error:', e);
      res.status(500).json({ error: 'Database error' });
      return;
    }
  }

  // ── Create link ───────────────────────────────────────────────────────────
  // ── Validate selectedEvents against player+owner ────────────────────────
  // Each ID must be a manual event owned by this player+user.
  // Foreign IDs are rejected.
  // Empty array = share NO events (fail-closed). The parent must explicitly
  // select each event. This matches the GET handler semantics.
  const rawEventIds = body.selectedEvents;
  if (!Array.isArray(rawEventIds)) {
    res.status(400).json({ error: 'INVALID_SELECTED_EVENTS', message: 'selectedEvents must be an array' });
    return;
  }
  const requestedEventIds = (rawEventIds as unknown[]).filter(id => typeof id === 'string') as string[];

  let validatedEventIds: string[] = [];
  if (requestedEventIds.length > 0) {
    try {
      const ownedEvRows = await db.execute(
        sql`SELECT id
             FROM sc_parent_manual_events
             WHERE id        IN ${sql`(${sql.join(requestedEventIds.map(id => sql`${id}`), sql`, `)})`}
               AND user_id   = ${user.id}
               AND player_id = ${playerId}
               AND event_type IN ('game', 'camp', 'tournament', 'showcase')`
      ) as unknown;
      const ownedEvArr = (ownedEvRows as [Array<{ id: string }>])[0];
      const ownedEvSet = new Set(ownedEvArr.map(r => r.id));
      const foreignEvIds = requestedEventIds.filter(id => !ownedEvSet.has(id));
      if (foreignEvIds.length > 0) {
        res.status(400).json({
          error: 'FOREIGN_EVENT_IDS',
          message: 'One or more selectedEvents IDs do not belong to this player.',
          foreignIds: foreignEvIds,
        });
        return;
      }
      validatedEventIds = requestedEventIds;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        // Events table not yet migrated — treat all IDs as invalid
        res.status(400).json({
          error: 'EVENTS_TABLE_UNAVAILABLE',
          message: 'Events table is not yet available. Cannot validate selectedEvents.',
        });
        return;
      }
      console.error('[POST coach-links] event validation error:', e);
      res.status(500).json({ error: 'Database error' });
      return;
    }
  }

  const { record, rawToken } = await store.create({
    playerId,
    userId: user.id,
    approvedFields,
    selectedMatchRecords: validatedMatchIds,
    selectedMedia: validatedMediaIds,
    selectedEvents: validatedEventIds,
    expiresInDays,
    label,
  });

  const baseUrl = getSecret('BETTER_AUTH_URL') ?? 'https://soccercenter.org';
  // IMPORTANT: rawToken is included in the URL only here. It must not be logged.
  const shareUrl = `${baseUrl}/coach/profile/${rawToken}`;

  res.status(201).json({
    linkId: record.id,
    shareUrl,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    label: record.label,
    approvedFields: record.approvedFields,
    selectedMatchRecordCount: record.selectedMatchRecords.length,
  });
}
