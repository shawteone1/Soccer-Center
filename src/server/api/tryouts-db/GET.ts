/**
 * GET /api/tryouts-db?region=colorado[&includePast=true]
 *
 * Returns public tryout events from the database for the requested region.
 * Optionally includes past events when includePast=true.
 *
 * Visibility rules:
 *  - review_status IN ('ok', 'unverified_details') OR review_status IS NULL → shown
 *  - review_status = 'admin_review' → hidden (needs admin attention)
 *  - link_check_status = 'broken' AND no club_url → hidden (no usable link)
 *
 * Response shape per event:
 *  - registrationUrl: confirmed working URL, or null
 *  - clubUrl: confirmed working club homepage, or null
 *  - buttonLabel: 'Register' | 'Tryout Information' | 'Visit Club Website' | null
 *  - detailsVerified: true only when review_status='ok' AND event has confirmed date
 *  - linkCheckStatus: 'ok' | 'broken' | 'inconclusive' | null (for admin use)
 *
 * Admin fields (reviewNote, reviewStatus, scrapedSeason, linkCheckNotes) are stripped.
 */

import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { soccerTryoutEvents } from '../../db/schema.js';
import { eq, and, or, isNull, isNotNull, ne, inArray, count } from 'drizzle-orm';

import { regionSlugAliases } from '@/lib/region-slugs';

/** Determine the best button label based on available confirmed URLs */
function resolveButton(
  registrationUrl: string | null,
  sourceUrl: string | null,
  clubUrl: string | null,
  linkCheckStatus: string | null,
): { url: string | null; label: string | null } {
  // If link check found everything broken and no club_url, no button
  if (linkCheckStatus === 'broken') {
    return { url: clubUrl, label: clubUrl ? 'Visit Club Website' : null };
  }

  // Registration URL takes priority
  if (registrationUrl) {
    return { url: registrationUrl, label: 'Register' };
  }

  // Source URL (official tryout info page) is next
  if (sourceUrl) {
    return { url: sourceUrl, label: 'Tryout Information' };
  }

  // Club homepage as last resort
  if (clubUrl) {
    return { url: clubUrl, label: 'Visit Club Website' };
  }

  return { url: null, label: null };
}

/**
 * Returns true when an event is effectively in the past, even if the stored
 * is_past flag hasn't been updated yet.  Only fires when eventDate contains a
 * parseable calendar date (e.g. "October 15, 2026", "10/15/2026", "2026-10-15").
 * Season strings like "Fall 2026" or null dates are left alone.
 */
function isEffectivelyPast(eventDate: string | null): boolean {
  if (!eventDate) return false;
  // Skip season-only strings — they have no specific date to compare
  if (/^(fall|spring|summer|winter)/i.test(eventDate)) return false;
  const parsed = new Date(eventDate);
  if (isNaN(parsed.getTime())) return false;
  // Compare against today (midnight local) so same-day events still show
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

/** A record has verified event details only when scraped with a confirmed date */
function isDetailsVerified(
  reviewStatus: string | null,
  eventDate: string | null,
  sourceUrl: string | null,
): boolean {
  if (reviewStatus !== 'ok') return false;
  if (!sourceUrl) return false;
  if (!eventDate) return false;
  if (/^(fall|spring|summer|winter)/i.test(eventDate)) return false;
  return true;
}

export default async function handler(req: Request, res: Response) {
  const regionSlug = (req.query.region as string | undefined)?.toLowerCase().trim();
  const includePast = req.query.includePast === 'true';

  if (!regionSlug) {
    return res.status(400).json({ error: 'region query param required' });
  }

  try {
    const regionCond = inArray(soccerTryoutEvents.regionSlug, regionSlugAliases(regionSlug));
    const pastCond = includePast ? undefined : eq(soccerTryoutEvents.isPast, false);

    // Show: ok, unverified_details, null (hand-entered)
    // Hide: admin_review, duplicate, suspect, and any other non-public status
    const statusCond = or(
      eq(soccerTryoutEvents.reviewStatus, 'ok'),
      eq(soccerTryoutEvents.reviewStatus, 'unverified_details'),
      isNull(soccerTryoutEvents.reviewStatus),
    );

    // Also hide records where link check confirmed broken AND no club_url remains
    // (these have no usable link at all — nothing to show the user)
    const notFullyBroken = or(
      ne(soccerTryoutEvents.linkCheckStatus, 'broken'),
      isNull(soccerTryoutEvents.linkCheckStatus),
      and(isNotNull(soccerTryoutEvents.clubUrl), ne(soccerTryoutEvents.clubUrl, '')),
    );

    const conditions = [
      regionCond,
      statusCond,
      notFullyBroken,
      ...(pastCond ? [pastCond] : []),
    ];

    const rows = await db
      .select()
      .from(soccerTryoutEvents)
      .where(and(...conditions))
      .orderBy(soccerTryoutEvents.sortOrder, soccerTryoutEvents.eventDate);

    // Raw count of all stored records for this region (no visibility filters).
    // Lets callers distinguish "two visible listings" from "two total records".
    const [{ totalStored }] = await db
      .select({ totalStored: count() })
      .from(soccerTryoutEvents)
      .where(inArray(soccerTryoutEvents.regionSlug, regionSlugAliases(regionSlug)));

    // Post-query staleness guard: suppress events whose date has passed even if
    // the stored is_past flag hasn't been updated yet.
    const visibleRows = includePast
      ? rows
      : rows.filter((r) => !isEffectivelyPast(r.eventDate ?? null));

    const events = visibleRows.map((r) => {
      const { url: buttonUrl, label: buttonLabel } = resolveButton(
        r.registrationUrl ?? null,
        r.sourceUrl ?? null,
        r.clubUrl ?? null,
        r.linkCheckStatus ?? null,
      );

      return {
        id: r.id,
        regionSlug: r.regionSlug,
        clubName: r.clubName,
        clubUrl: r.clubUrl ?? null,
        city: r.city ?? null,
        level: r.level ?? null,
        ageGroups: (() => {
          try { return JSON.parse(r.ageGroups ?? '[]') as string[]; }
          catch { return []; }
        })(),
        eventDate: r.eventDate ?? null,
        eventTime: r.eventTime ?? null,
        location: r.location ?? null,
        registrationUrl: r.registrationUrl ?? null,
        notes: r.notes ?? null,
        isPast: r.isPast ?? false,
        sortOrder: r.sortOrder ?? 0,
        sourceUrl: r.sourceUrl ?? null,
        lastVerifiedAt: r.lastVerifiedAt ? r.lastVerifiedAt.toISOString() : null,
        /** Resolved button URL — may differ from registrationUrl if it was replaced */
        buttonUrl,
        /** Human-readable button label */
        buttonLabel,
        /** True only when event details (date/time/location) have supporting evidence */
        detailsVerified: isDetailsVerified(
          r.reviewStatus ?? null,
          r.eventDate ?? null,
          r.sourceUrl ?? null,
        ),
        /** Link check status — useful for admin display; not shown publicly */
        linkCheckStatus: r.linkCheckStatus ?? null,
      };
    });

    return res.json({ region: regionSlug, events, total: events.length, totalStored });
  } catch (err) {
    console.error('[tryouts-db GET]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
