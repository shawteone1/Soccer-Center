/**
 * GET /api/my-soccer/tryouts
 *
 * Auth-gated personalized tryout feed for the My Soccer dashboard.
 * Reads the member's saved region from sc_member_profiles; accepts an
 * optional ?region= override so members can browse other regions.
 *
 * Query params:
 *   region       — override the profile region (e.g. "colorado")
 *   ageBand      — filter by age band, e.g. "U12" (case-insensitive prefix match)
 *   level        — filter by level, e.g. "Competitive"
 *   includeTbd   — "true" to include events with no confirmed date (Dates TBD)
 *   includePast  — "true" to include past events
 *
 * Response:
 *   { region, regionLabel, upcoming: TryoutCard[], tbd: TryoutCard[], total }
 *
 * Only rows with reviewStatus = 'ok' or null (hand-entered) are returned.
 * Admin fields (reviewStatus, reviewNote, scrapedSeason) are stripped.
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { soccerTryoutEvents, scMemberProfiles } from '../../../db/schema.js';
import { eq, and, or, isNull, ne } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

// ── Region label map (mirrors the public tryouts page) ────────────────────────
const REGION_LABELS: Record<string, string> = {
  'colorado':   'Colorado',
  'arizona':    'Arizona',
  'cal-south':  'Southern California',
  'cal-north':  'Northern California',
  'oregon':     'Oregon',
  'washington': 'Washington',
  'nevada':     'Nevada',
};

export interface TryoutCard {
  id: string;
  regionSlug: string;
  clubName: string;
  clubUrl: string | null;
  city: string | null;
  level: string | null;
  ageGroups: string[];
  eventDate: string | null;
  eventTime: string | null;
  location: string | null;
  registrationUrl: string | null;
  notes: string | null;
  isPast: boolean;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  /** True when eventDate is null or a non-specific value like "TBD" / "Fall 2026" */
  dateConfirmed: boolean;
  /** Resolved button URL — use this for the CTA, not registrationUrl directly */
  buttonUrl: string | null;
  /** 'Register' | 'Tryout Information' | 'Visit Club Website' | null */
  buttonLabel: string | null;
  /** True only when event details have supporting evidence from the source */
  detailsVerified: boolean;
}

/**
 * Returns true when an event is effectively in the past, even if the stored
 * is_past flag hasn't been updated yet.  Season strings ("Fall 2026") and null
 * dates are left alone — only parseable calendar dates are compared.
 */
function isEffectivelyPast(eventDate: string | null): boolean {
  if (!eventDate) return false;
  if (/^(fall|spring|summer|winter)/i.test(eventDate)) return false;
  const parsed = new Date(eventDate);
  if (isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

/** Heuristic: a date string is "confirmed" when it contains a specific day number */
function isDateConfirmed(eventDate: string | null): boolean {
  if (!eventDate) return false;
  return /\b([1-9]|[12]\d|3[01])\b/.test(eventDate) ||
         /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(eventDate);
}

function resolveButton(
  registrationUrl: string | null,
  sourceUrl: string | null,
  clubUrl: string | null,
  linkCheckStatus: string | null,
): { url: string | null; label: string | null } {
  if (linkCheckStatus === 'broken' && !clubUrl) return { url: null, label: null };
  if (registrationUrl) return { url: registrationUrl, label: 'Register' };
  if (sourceUrl) return { url: sourceUrl, label: 'Tryout Information' };
  if (clubUrl) return { url: clubUrl, label: 'Visit Club Website' };
  return { url: null, label: null };
}

function isDetailsVerified(
  reviewStatus: string | null,
  eventDate: string | null,
  sourceUrl: string | null,
): boolean {
  if (reviewStatus !== 'ok') return false;
  if (!sourceUrl || !eventDate) return false;
  if (/^(fall|spring|summer|winter)/i.test(eventDate)) return false;
  return true;
}

// Sub-region slugs are UI-only — all Colorado records share regionSlug='colorado'.
// Map any sub-region to the parent slug so old clients don't get empty results.
const COLORADO_SUB_REGIONS = new Set([
  'denver-metro', 'boulder', 'colorado-springs', 'fort-collins', 'pueblo', 'western-slope',
]);

function resolveRegionSlug(slug: string): string {
  return COLORADO_SUB_REGIONS.has(slug) ? 'colorado' : slug;
}

export default async function handler(req: Request, res: Response) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  // ── Params ───────────────────────────────────────────────────────────────────
  const includePast  = req.query.includePast  === 'true';
  const includeTbd   = req.query.includeTbd   !== 'false'; // default true
  const ageBandParam = (req.query.ageBand  as string | undefined)?.trim().toUpperCase();
  const levelParam   = (req.query.level    as string | undefined)?.trim().toLowerCase();
  const regionParam  = (req.query.region   as string | undefined)?.toLowerCase().trim();

  // ── Resolve region ───────────────────────────────────────────────────────────
  let regionSlug = regionParam ? resolveRegionSlug(regionParam) : undefined;

  if (!regionSlug) {
    // Fall back to member profile region
    try {
      const [profile] = await db
        .select({ region: scMemberProfiles.region })
        .from(scMemberProfiles)
        .where(eq(scMemberProfiles.userId, user.id))
        .limit(1);
      regionSlug = profile?.region?.toLowerCase().trim() ?? 'colorado';
    } catch {
      regionSlug = 'colorado';
    }
  }

  const regionLabel = REGION_LABELS[regionSlug] ?? regionSlug;

  // ── Query ────────────────────────────────────────────────────────────────────
  try {
    const statusCond = or(
      eq(soccerTryoutEvents.reviewStatus, 'ok'),
      eq(soccerTryoutEvents.reviewStatus, 'unverified_details'),
      isNull(soccerTryoutEvents.reviewStatus),
    );
    const regionCond = eq(soccerTryoutEvents.regionSlug, regionSlug);
    const pastCond   = includePast ? undefined : eq(soccerTryoutEvents.isPast, false);
    const notFullyBroken = or(
      ne(soccerTryoutEvents.linkCheckStatus, 'broken'),
      isNull(soccerTryoutEvents.linkCheckStatus),
    );

    const conditions = [regionCond, statusCond, notFullyBroken, ...(pastCond ? [pastCond] : [])];

    const rows = await db
      .select()
      .from(soccerTryoutEvents)
      .where(and(...conditions))
      .orderBy(soccerTryoutEvents.sortOrder, soccerTryoutEvents.eventDate);

    // ── Post-query staleness guard ────────────────────────────────────────────
    // Suppress events whose date has passed even if the stored is_past flag
    // hasn't been updated yet (flag is set by a periodic scraper, not live).
    const visibleRows = includePast
      ? rows
      : rows.filter((r) => !isEffectivelyPast(r.eventDate ?? null));

    // ── Shape rows into cards ─────────────────────────────────────────────────
    const cards: TryoutCard[] = visibleRows.map((r) => {
      const ageGroups: string[] = (() => {
        try { return JSON.parse(r.ageGroups ?? '[]') as string[]; }
        catch { return []; }
      })();

      const { url: buttonUrl, label: buttonLabel } = resolveButton(
        r.registrationUrl ?? null,
        r.sourceUrl ?? null,
        r.clubUrl ?? null,
        r.linkCheckStatus ?? null,
      );

      return {
        id:              r.id,
        regionSlug:      r.regionSlug,
        clubName:        r.clubName,
        clubUrl:         r.clubUrl ?? null,
        city:            r.city ?? null,
        level:           r.level ?? null,
        ageGroups,
        eventDate:       r.eventDate ?? null,
        eventTime:       r.eventTime ?? null,
        location:        r.location ?? null,
        registrationUrl: r.registrationUrl ?? null,
        notes:           r.notes ?? null,
        isPast:          r.isPast ?? false,
        sourceUrl:       r.sourceUrl ?? null,
        lastVerifiedAt:  r.lastVerifiedAt ? r.lastVerifiedAt.toISOString() : null,
        dateConfirmed:   isDateConfirmed(r.eventDate ?? null),
        buttonUrl,
        buttonLabel,
        detailsVerified: isDetailsVerified(r.reviewStatus ?? null, r.eventDate ?? null, r.sourceUrl ?? null),
      };
    });

    // ── Optional age-band filter ──────────────────────────────────────────────
    // We do NOT infer eligibility — we only match when the member's ageBand
    // appears literally in the event's ageGroups array (case-insensitive).
    // If no age groups are stored we include the event (don't exclude on missing data).
    const filtered = ageBandParam
      ? cards.filter((c) => {
          if (c.ageGroups.length === 0) return true; // no age data → show it
          const band = ageBandParam.replace(/^U-?/, 'U');
          return c.ageGroups.some((ag) =>
            ag.toUpperCase().replace(/^U-?/, 'U').includes(band)
          );
        })
      : cards;

    // ── Optional level filter ─────────────────────────────────────────────────
    const levelFiltered = levelParam
      ? filtered.filter((c) =>
          !c.level || c.level.toLowerCase().includes(levelParam)
        )
      : filtered;

    // ── Split: confirmed-date upcoming vs TBD ─────────────────────────────────
    const upcoming = levelFiltered.filter((c) => c.dateConfirmed);
    const tbd      = includeTbd
      ? levelFiltered.filter((c) => !c.dateConfirmed)
      : [];

    return res.json({
      region:      regionSlug,
      regionLabel,
      upcoming,
      tbd,
      total:       upcoming.length + tbd.length,
    });
  } catch (err) {
    console.error('[my-soccer/tryouts GET]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
