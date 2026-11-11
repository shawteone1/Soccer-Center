/**
 * POST /api/tryouts-db/update
 *
 * Token-protected endpoint to upsert verified tryout events.
 * Requires header: Authorization: Bearer <SOCCER_TRYOUT_WRITE_TOKEN>
 *
 * Body: { events: TryoutEventInput[] }
 *
 * Each event:
 * {
 *   id?: string          // omit to auto-generate
 *   regionSlug: string
 *   clubName: string
 *   clubUrl?: string
 *   city?: string
 *   level?: string
 *   ageGroups?: string[]
 *   eventDate?: string
 *   eventTime?: string
 *   location?: string
 *   registrationUrl?: string
 *   notes?: string
 *   isPast?: boolean
 *   sortOrder?: number
 * }
 */

import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { soccerTryoutEvents } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';
import { randomUUID } from 'node:crypto';

interface TryoutEventInput {
  id?: string;
  regionSlug: string;
  clubName: string;
  clubUrl?: string;
  city?: string;
  level?: string;
  ageGroups?: string[];
  eventDate?: string;
  eventTime?: string;
  location?: string;
  registrationUrl?: string;
  notes?: string;
  isPast?: boolean;
  sortOrder?: number;
}

export default async function handler(req: Request, res: Response) {
  // Auth check
  const token = getSecret('SOCCER_TRYOUT_WRITE_TOKEN');
  const authHeader = req.headers['authorization'] ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || provided !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { events } = req.body as { events?: TryoutEventInput[] };
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array required' });
  }

  const upserted: string[] = [];
  const errors: string[] = [];

  for (const ev of events) {
    if (!ev.regionSlug || !ev.clubName) {
      errors.push(`Skipped: missing regionSlug or clubName (${JSON.stringify(ev).slice(0, 80)})`);
      continue;
    }

    const id = ev.id ?? randomUUID();
    const ageGroupsJson = JSON.stringify(ev.ageGroups ?? []);

    try {
      // Try update first, then insert
      const existing = await db
        .select({ id: soccerTryoutEvents.id })
        .from(soccerTryoutEvents)
        .where(eq(soccerTryoutEvents.id, id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(soccerTryoutEvents)
          .set({
            regionSlug: ev.regionSlug,
            clubName: ev.clubName,
            clubUrl: ev.clubUrl ?? null,
            city: ev.city ?? null,
            level: ev.level ?? null,
            ageGroups: ageGroupsJson,
            eventDate: ev.eventDate ?? null,
            eventTime: ev.eventTime ?? null,
            location: ev.location ?? null,
            registrationUrl: ev.registrationUrl ?? null,
            notes: ev.notes ?? null,
            isPast: ev.isPast ?? false,
            sortOrder: ev.sortOrder ?? 0,
          })
          .where(eq(soccerTryoutEvents.id, id));
      } else {
        await db.insert(soccerTryoutEvents).values({
          id,
          regionSlug: ev.regionSlug,
          clubName: ev.clubName,
          clubUrl: ev.clubUrl ?? null,
          city: ev.city ?? null,
          level: ev.level ?? null,
          ageGroups: ageGroupsJson,
          eventDate: ev.eventDate ?? null,
          eventTime: ev.eventTime ?? null,
          location: ev.location ?? null,
          registrationUrl: ev.registrationUrl ?? null,
          notes: ev.notes ?? null,
          isPast: ev.isPast ?? false,
          sortOrder: ev.sortOrder ?? 0,
        });
      }

      upserted.push(id);
    } catch (err) {
      errors.push(`Error on ${id}: ${String(err)}`);
    }
  }

  return res.json({ upserted: upserted.length, errors });
}
