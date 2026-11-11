/**
 * POST /api/parent/players/:playerId/schedule/games
 *
 * Creates a single game event for a player owned by the authenticated parent.
 * Persists to sc_parent_manual_events with event_type = 'game' and
 * player_id = :playerId so it appears only on this player's schedule.
 *
 * Body (JSON):
 *   title       string   required — e.g. "vs FC Denver"
 *   startDate   string   required — ISO 8601 datetime, e.g. "2026-11-15T14:00:00"
 *   opponent    string?  optional
 *   homeAway    string?  'home' | 'away'
 *   venue       string?  optional
 *   notes       string?  optional
 *
 * Duplicate prevention: if a game with the same title + startDate already exists
 * for this player, returns the existing event (idempotent).
 *
 * Protected by requireParentAccess(). Player ownership enforced.
 */

import type { Request, Response } from 'express';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;
  setPrivateCacheHeaders(res);

  const { playerId } = req.params;
  const safePlayerId = Array.isArray(playerId) ? playerId[0] : playerId;

  // Verify player ownership (graceful: deleted_at column may not exist yet)
  try {
    const rows = await db.execute(
      sql.raw(
        `SELECT id FROM \`sc_player_profiles\`
         WHERE id = '${safePlayerId.replace(/'/g, "''")}' 
           AND user_id = '${user.id.replace(/'/g, "''")}'
         LIMIT 1`
      )
    );
    const arr = (rows as unknown as [Array<{ id: string }>])[0];
    if (!arr.length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch (e) {
    console.error('[POST /schedule/games] ownership', e);
    res.status(500).json({ error: 'Database error' });
    return;
  }

  const body = req.body as {
    title?: string;
    startDate?: string;
    opponent?: string | null;
    homeAway?: string | null;
    venue?: string | null;
    notes?: string | null;
  };

  if (!body.title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!body.startDate?.trim()) {
    res.status(400).json({ error: 'startDate is required' });
    return;
  }

  // Normalise startDate — accept ISO 8601 with or without seconds
  const startAt = body.startDate.trim();

  // Duplicate check: same title + startDate for this player
  try {
    const dupRows = await db.execute(
      sql`SELECT id FROM sc_parent_manual_events
          WHERE user_id = ${user.id}
            AND player_id = ${safePlayerId}
            AND event_type = 'game'
            AND title = ${body.title.trim()}
            AND start_at = ${startAt}
          LIMIT 1`
    );
    const dupArr = (dupRows as unknown as [Array<{ id: string }>])[0];
    if (dupArr.length) {
      res.status(200).json({ ok: true, id: dupArr[0].id, duplicate: true });
      return;
    }
  } catch (e) {
    // sc_parent_manual_events may not exist yet — handled below
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) {
      console.error('[POST /schedule/games] dup check', e);
      res.status(500).json({ error: 'Database error' });
      return;
    }
  }

  const id = randomUUID();

  // Build notes combining opponent/homeAway with any user notes
  const noteParts: string[] = [];
  if (body.opponent) noteParts.push(`Opponent: ${body.opponent}`);
  if (body.homeAway) noteParts.push(body.homeAway === 'home' ? 'Home' : 'Away');
  if (body.notes?.trim()) noteParts.push(body.notes.trim());
  const notes = noteParts.length ? noteParts.join(' · ') : null;

  try {
    await db.execute(
      sql`INSERT INTO sc_parent_manual_events
            (id, user_id, player_id, title, start_at, location, notes, event_type, all_day, created_at, updated_at)
          VALUES
            (${id}, ${user.id}, ${safePlayerId}, ${body.title.trim()}, ${startAt},
             ${body.venue ?? null}, ${notes}, 'game', 0, NOW(), NOW())`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) {
      res.status(409).json({
        error: 'SCHEMA_REQUIRED',
        message: 'Manual events table not yet available. Run the parent v2 schema migration from Settings → Admin panel.',
      });
      return;
    }
    console.error('[POST /schedule/games] insert', e);
    res.status(500).json({ error: 'Failed to save game' });
    return;
  }

  res.status(201).json({ ok: true, id });
}
