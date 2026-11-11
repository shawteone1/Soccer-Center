/**
 * GET /api/my-soccer/saved-tryouts-resolved
 *
 * Returns saved tryout IDs joined against soccer_tryout_events so the client
 * can render full cards without a second lookup.
 *
 * Response shape:
 *   {
 *     items: Array<{
 *       tryoutId: string;
 *       savedAt: string;
 *       // null when the event no longer exists in the DB
 *       clubName: string | null;
 *       city: string | null;
 *       level: string | null;
 *       ageGroups: string[];
 *       eventDate: string | null;
 *       location: string | null;
 *       registrationUrl: string | null;
 *       sourceUrl: string | null;
 *       isPast: boolean;
 *       found: boolean;   // false = event was deleted/cleaned up
 *     }>
 *   }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scSavedTryouts, soccerTryoutEvents } from '../../../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    // 1. Load saved IDs for this user
    const savedRows = await db
      .select({ tryoutId: scSavedTryouts.tryoutId, savedAt: scSavedTryouts.savedAt })
      .from(scSavedTryouts)
      .where(eq(scSavedTryouts.userId, user.id))
      .orderBy(desc(scSavedTryouts.savedAt));

    if (savedRows.length === 0) {
      return res.json({ items: [] });
    }

    const ids = savedRows.map(r => r.tryoutId);

    // 2. Resolve against soccer_tryout_events — LEFT JOIN semantics via inArray
    const eventRows = await db
      .select({
        id: soccerTryoutEvents.id,
        clubName: soccerTryoutEvents.clubName,
        city: soccerTryoutEvents.city,
        level: soccerTryoutEvents.level,
        ageGroups: soccerTryoutEvents.ageGroups,
        eventDate: soccerTryoutEvents.eventDate,
        location: soccerTryoutEvents.location,
        registrationUrl: soccerTryoutEvents.registrationUrl,
        sourceUrl: soccerTryoutEvents.sourceUrl,
        isPast: soccerTryoutEvents.isPast,
      })
      .from(soccerTryoutEvents)
      .where(inArray(soccerTryoutEvents.id, ids));

    const eventMap = new Map(eventRows.map(e => [e.id, e]));

    const items = savedRows.map(r => {
      const ev = eventMap.get(r.tryoutId);
      if (!ev) {
        return {
          tryoutId: r.tryoutId,
          savedAt: r.savedAt?.toISOString() ?? '',
          found: false,
          clubName: null,
          city: null,
          level: null,
          ageGroups: [] as string[],
          eventDate: null,
          location: null,
          registrationUrl: null,
          sourceUrl: null,
          isPast: false,
        };
      }
      let ageGroups: string[] = [];
      try { ageGroups = ev.ageGroups ? JSON.parse(ev.ageGroups) : []; } catch { /* ignore */ }
      return {
        tryoutId: r.tryoutId,
        savedAt: r.savedAt?.toISOString() ?? '',
        found: true,
        clubName: ev.clubName,
        city: ev.city ?? null,
        level: ev.level ?? null,
        ageGroups,
        eventDate: ev.eventDate ?? null,
        location: ev.location ?? null,
        registrationUrl: ev.registrationUrl ?? null,
        sourceUrl: ev.sourceUrl ?? null,
        isPast: ev.isPast ?? false,
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[saved-tryouts-resolved GET]', err);
    return res.status(500).json({ error: 'Database error' });
  }
}
