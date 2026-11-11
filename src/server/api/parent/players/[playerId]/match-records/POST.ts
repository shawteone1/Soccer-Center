/**
 * POST /api/parent/players/:playerId/match-records
 *
 * Adds a match record for a player. Returns 409 on duplicate (same player + date + opponent).
 */

import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { requireParentAccess } from '@/server/auth-policy.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const user = await requireParentAccess(req, res);
  if (!user) return;

  const { playerId } = req.params;
  const { match_date, opponent, goals, assists, ga, saves, shutouts, notes, season, event_ref, participated } = req.body as {
    match_date: string;
    opponent: string;
    goals?:       number | null;
    assists?:     number | null;
    ga?:          number | null;
    saves?:       number | null;
    shutouts?:    number | null;
    notes?:       string;
    season?:      string;
    event_ref?:   string;
    participated?: boolean;
  };

  if (!match_date || !opponent) {
    res.status(400).json({ error: 'match_date and opponent are required' });
    return;
  }

  // Verify player belongs to this parent
  try {
    const rows = await db.execute(
      sql`SELECT id FROM sc_player_profiles WHERE id = ${playerId} AND user_id = ${user.id} LIMIT 1`
    );
    if (!(rows[0] as unknown as Array<unknown>).length) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'Database error' });
    return;
  }

  try {
    const id = `mr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Use provided event_ref if given (links to a scheduled game), otherwise
    // generate a synthetic key for manually-entered records.
    const effectiveEventRef = event_ref?.trim()
      || `manual_${match_date}_${opponent.toLowerCase().replace(/\s+/g, '_').slice(0, 32)}`;
    await db.execute(
      sql`INSERT INTO sc_player_match_records
          (id, user_id, player_id, event_ref, match_date, opponent,
           stat_goals, stat_assists, stat_ga, stat_saves, stat_so,
           notes, season, participated, created_at)
          VALUES (${id}, ${user.id}, ${playerId}, ${effectiveEventRef}, ${match_date}, ${opponent},
                  ${goals ?? null}, ${assists ?? null},
                  ${ga ?? null}, ${saves ?? null}, ${shutouts ?? null},
                  ${notes ?? null}, ${season ?? null}, ${participated ?? true}, NOW())`
    );
    res.status(201).json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Duplicate') || msg.includes('duplicate') || msg.includes('ER_DUP')) {
      res.status(409).json({ error: 'A record for this player, date, and opponent already exists' });
    } else {
      console.error('[match-records POST] insert error:', e);
      res.status(500).json({ error: 'Failed to save match record' });
    }
  }
}
