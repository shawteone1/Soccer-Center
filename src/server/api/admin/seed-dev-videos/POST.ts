/**
 * POST /api/admin/seed-dev-videos
 * One-shot seed endpoint — upserts the curated dev videos and hides old ones.
 * Requires admin auth. Safe to call multiple times (idempotent).
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent } from '@/server/db/schema.js';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { sql } from 'drizzle-orm';

const VIDEOS = [
  // ── Defending ──────────────────────────────────────────────────────────────
  {
    videoId: '4vBZzkVRqbE',
    title: '5 DEFENSE Tips that Stop Forwards',
    source: 'AllAttack',
    description: 'Practical tips for defending against attacking players.',
    devCategory: 'defending',
    priority: 1,
  },
  // ── Defending — new 4 ─────────────────────────────────────────────────────
  {
    videoId: 'sxSWLpDv770',
    title: 'Defending',           // fallback; enriched by /api/admin/enrich-dev-videos
    source: '',
    description: 'Defending technique and training.',
    devCategory: 'defending',
    priority: 2,
  },
  {
    videoId: 'k9Xhdv_IyN4',
    title: 'Defending',
    source: '',
    description: 'Defending technique and training.',
    devCategory: 'defending',
    priority: 3,
  },
  {
    videoId: 'jtv_fdLrYZ0',
    title: 'Defending',
    source: '',
    description: 'Defending technique and training.',
    devCategory: 'defending',
    priority: 4,
  },
  {
    videoId: 'ay42qx4NSZY',
    title: 'Defending',
    source: '',
    description: 'Defending technique and training.',
    devCategory: 'defending',
    priority: 5,
  },
  // ── Attacking ──────────────────────────────────────────────────────────────
  {
    videoId: 'dLVqO2RgP3A',
    title: 'Improve Your Finishing With Both Feet',
    source: '7mlc',
    description: 'Finishing practice to develop confidence with both feet.',
    devCategory: 'attacking',
    priority: 1,
  },
  {
    videoId: 'e5RxAJM-oxc',
    title: '10 EASY Ball Mastery Exercises For Beginners',
    source: '7mlc',
    description: 'Ball-control exercises for developing close control and dribbling.',
    devCategory: 'attacking',
    priority: 2,
  },
  // ── Midfield ───────────────────────────────────────────────────────────────
  {
    videoId: 'Y9Af7MwsSvc',
    title: 'How to Play Midfield in Soccer/Football',
    source: 'AllAttack',
    description: 'An introduction to playing effectively in midfield.',
    devCategory: 'midfield',
    priority: 1,
  },
  {
    videoId: 'ud84rp3Vphs',
    title: '10 Exercises To Master Your First Touch',
    source: '7mlc',
    description: 'First-touch exercises for controlling the ball and preparing your next action.',
    devCategory: 'midfield',
    priority: 2,
  },
  // ── Midfield — new 7 ──────────────────────────────────────────────────────
  {
    videoId: '4Y_64ANmC9c',
    title: 'Midfield',           // fallback; enriched by /api/admin/enrich-dev-videos
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 3,
  },
  {
    videoId: 'dV0OCVPAFmA',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 4,
  },
  {
    videoId: 'KcSVEInRAGs',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 5,
  },
  {
    videoId: '-_E_0weZhls',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 6,
  },
  {
    videoId: 'bhSlFjBWlzc',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 7,
  },
  {
    videoId: '2UpKcNuSSO0',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 8,
  },
  {
    videoId: '-UY2lPNeWI8',
    title: 'Midfield',
    source: '',
    description: 'Midfield training and technique.',
    devCategory: 'midfield',
    priority: 9,
  },
  // ── Goalkeeping — original 2 ───────────────────────────────────────────────
  {
    videoId: 'lQQUrbATlhI',
    title: '3 pro goalkeeper drills to improve your technique and handling',
    source: 'Unisport',
    description: 'Player-focused exercises for goalkeeper technique and ball handling.',
    devCategory: 'goalkeeping',
    priority: 1,
  },
  {
    videoId: 'O_SqhE2MbZw',
    title: 'The Handling Secrets Goalkeepers Never Get Taught',
    source: 'Ground Glory Goalkeeping',
    description: 'A tutorial on catching technique, hand shapes, and body position.',
    devCategory: 'goalkeeping',
    priority: 2,
  },
  // ── Goalkeeping — new 7 ────────────────────────────────────────────────────
  {
    videoId: 'vxtsvUrSC1w',
    title: 'General goalkeeping',           // fallback; enriched by /api/admin/enrich-dev-videos
    source: '',
    description: 'Goalkeeping fundamentals.',
    devCategory: 'goalkeeping',
    priority: 3,
  },
  {
    videoId: 'Hy10XUls8xs',
    title: 'One-on-ones',
    source: '',
    description: 'Goalkeeper one-on-one situations.',
    devCategory: 'goalkeeping',
    priority: 4,
  },
  {
    videoId: 'dkxN7nFAybk',
    title: 'Advanced techniques',
    source: '',
    description: 'Advanced goalkeeper techniques.',
    devCategory: 'goalkeeping',
    priority: 5,
  },
  {
    videoId: 'wE8fXiPnD7I',
    title: 'Advanced techniques',
    source: '',
    description: 'Advanced goalkeeper techniques.',
    devCategory: 'goalkeeping',
    priority: 6,
  },
  {
    videoId: 'lshxX3S9ShU',
    title: 'Footwork',
    source: '',
    description: 'Goalkeeper footwork training.',
    devCategory: 'goalkeeping',
    priority: 7,
  },
  {
    videoId: 'yfvj7E14lAM',
    title: 'Basics — diving',
    source: '',
    description: 'Goalkeeper diving basics.',
    devCategory: 'goalkeeping',
    priority: 8,
  },
  {
    videoId: 'vbtGG9Kiqmc',
    title: 'Handling',
    source: '',
    description: 'Goalkeeper handling technique.',
    devCategory: 'goalkeeping',
    priority: 9,
  },
] as const;

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const results: { videoId: string; action: string }[] = [];

  // 1. Ensure dev_category column exists
  try {
    await db.execute(sql`ALTER TABLE sc_dev_content ADD COLUMN dev_category varchar(32)`);
    results.push({ videoId: 'schema', action: 'added dev_category column' });
  } catch {
    results.push({ videoId: 'schema', action: 'dev_category column already exists' });
  }

  // 2. Upsert each video
  const curatedIds: string[] = [];
  for (const v of VIDEOS) {
    const contentId = `dev-yt-${v.videoId}`;
    curatedIds.push(contentId);
    const url = `https://www.youtube.com/watch?v=${v.videoId}`;

    await db.execute(sql`
      INSERT INTO sc_dev_content
        (content_id, title, description, source, url, content_type,
         youtube_video_id, dev_category, embed_verified, admin_status,
         playback_status, editorial_priority, positions, interests, tags, audience)
      VALUES (
        ${contentId}, ${v.title}, ${v.description}, ${v.source}, ${url},
        'youtube_video', ${v.videoId}, ${v.devCategory},
        true, 'approved', NULL, ${v.priority}, '[]', '[]', '[]', '["player"]'
      )
      ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        source = CASE WHEN source = '' OR source IS NULL THEN VALUES(source) ELSE source END,
        url = VALUES(url),
        youtube_video_id = VALUES(youtube_video_id),
        dev_category = VALUES(dev_category),
        embed_verified = true,
        admin_status = 'approved',
        playback_status = NULL,
        editorial_priority = VALUES(editorial_priority)
    `);
    results.push({ videoId: v.videoId, action: `upserted (${v.devCategory} priority=${v.priority})` });
  }

  // 3. Hide old non-curated approved rows
  const hidden = await db.update(scDevContent)
    .set({ adminStatus: 'unpublished' })
    .where(
      sql`admin_status = 'approved' AND content_id NOT IN (${sql.join(curatedIds.map((id) => sql`${id}`), sql`, `)})`
    );
  results.push({ videoId: 'cleanup', action: `hidden ${(hidden as unknown as { affectedRows: number }).affectedRows ?? '?'} old rows` });

  return res.json({ ok: true, results });
}
