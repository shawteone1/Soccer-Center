/**
 * POST /api/parent/players/:playerId/schedule/practices
 *
 * Creates a recurring practice series for a player owned by the authenticated parent.
 * Expands the recurrence into individual sc_parent_manual_events rows
 * (event_type = 'practice', player_id = :playerId).
 *
 * Body (JSON):
 *   weekdays    number[]  required — 0=Sun … 6=Sat; at least one
 *   startTime   string    required — "HH:MM" in 24h
 *   endTime     string    required — "HH:MM" in 24h
 *   startDate   string    required — "YYYY-MM-DD"
 *   endDate     string    required — "YYYY-MM-DD"
 *   location    string?   optional
 *   timezone    string?   optional — IANA tz, e.g. "America/Denver"; defaults to UTC
 *
 * Expansion: generates one row per matching weekday between startDate and endDate
 * (inclusive). Maximum 365 occurrences to prevent runaway inserts.
 *
 * Duplicate prevention: skips any occurrence that already exists with the same
 * player_id + event_type + start_at.
 *
 * Protected by requireParentAccess(). Player ownership enforced.
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const MAX_OCCURRENCES = 365;

/** Returns "YYYY-MM-DD HH:MM:SS" for a given date + time string in the given timezone.
 *  We build the datetime string directly from the date + time parts to avoid
 *  timezone conversion issues — the user picks a local date and time, and we
 *  store it as-is (the schedule display converts to local time for rendering). */
function buildDatetime(dateStr: string, timeStr: string): string {
  return `${dateStr} ${timeStr}:00`;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;
  const safePlayerId = Array.isArray(playerId) ? playerId[0] : playerId;

  // Verify player ownership
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles
          WHERE id = ${safePlayerId} AND user_id = ${user.id}
          LIMIT 1`
    );
    const arr = (rows as unknown as [Array<{ id: string }>])[0];
    if (!arr.length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch (e) {
    console.error('[POST /schedule/practices] ownership', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  const body = req.body as {
    weekdays?: number[];
    startTime?: string;
    endTime?: string;
    startDate?: string;
    endDate?: string;
    location?: string | null;
    timezone?: string | null;
  };

  // Validate
  if (!Array.isArray(body.weekdays) || body.weekdays.length === 0) {
    res.status(400).json({ error: 'weekdays must be a non-empty array' });
    return;
  }
  if (!body.startTime?.match(/^\d{2}:\d{2}$/)) {
    res.status(400).json({ error: 'startTime must be HH:MM' });
    return;
  }
  if (!body.endTime?.match(/^\d{2}:\d{2}$/)) {
    res.status(400).json({ error: 'endTime must be HH:MM' });
    return;
  }
  if (!body.startDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
    return;
  }
  if (!body.endDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
    return;
  }

  const weekdaySet = new Set(body.weekdays.filter(d => d >= 0 && d <= 6));
  if (weekdaySet.size === 0) {
    res.status(400).json({ error: 'weekdays must contain values 0–6' });
    return;
  }

  // Expand occurrences
  const occurrences: Array<{ startAt: string; endAt: string }> = [];
  const cur = new Date(body.startDate + 'T00:00:00');
  const end = new Date(body.endDate + 'T00:00:00');

  while (cur <= end && occurrences.length < MAX_OCCURRENCES) {
    if (weekdaySet.has(cur.getDay())) {
      const dateStr = cur.toISOString().slice(0, 10); // YYYY-MM-DD
      occurrences.push({
        startAt: buildDatetime(dateStr, body.startTime),
        endAt:   buildDatetime(dateStr, body.endTime),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (occurrences.length === 0) {
    res.status(400).json({ error: 'No occurrences generated for the given date range and weekdays' });
    return;
  }

  // Fetch existing start_at values for this player + practice to skip duplicates
  let existingStartAts = new Set<string>();
  try {
    const existingRows = await db.execute(
      sql`SELECT start_at FROM sc_parent_manual_events
          WHERE user_id = ${user.id}
            AND player_id = ${safePlayerId}
            AND event_type = 'practice'`
    );
    const arr = (existingRows as unknown as [Array<{ start_at: string }>])[0];
    existingStartAts = new Set(arr.map(r => r.start_at));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) {
      res.status(409).json({
        error: 'SCHEMA_REQUIRED',
        message: 'Manual events table not yet available. Run the parent v2 schema migration from Settings → Admin panel.',
      });
      return;
    }
    // Non-fatal — proceed without duplicate check
    console.warn('[POST /schedule/practices] dup check failed, proceeding without:', msg);
  }

  const title = body.location
    ? `Practice — ${body.location}`
    : 'Practice';

  const notes = body.timezone ? `Timezone: ${body.timezone}` : null;

  let inserted = 0;
  let skipped = 0;

  for (const occ of occurrences) {
    if (existingStartAts.has(occ.startAt)) {
      skipped++;
      continue;
    }
    const id = randomUUID();
    try {
      await db.execute(
        sql`INSERT INTO sc_parent_manual_events
              (id, user_id, player_id, title, start_at, end_at, location, notes, event_type, all_day, created_at, updated_at)
            VALUES
              (${id}, ${user.id}, ${safePlayerId}, ${title}, ${occ.startAt}, ${occ.endAt},
               ${body.location ?? null}, ${notes}, 'practice', 0, NOW(), NOW())`
      );
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Duplicate') || msg.includes('ER_DUP_ENTRY')) {
        skipped++;
      } else {
        console.error('[POST /schedule/practices] insert', e);
        // Continue — partial success is better than total failure
      }
    }
  }

  res.status(201).json({
    ok: true,
    inserted,
    skipped,
    total: occurrences.length,
  });
}
