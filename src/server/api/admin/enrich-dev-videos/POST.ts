/**
 * POST /api/admin/enrich-dev-videos
 * Fetches real YouTube metadata (title, channel, thumbnail, embed/region status)
 * for sc_dev_content rows that have a youtube_video_id.
 * Upserts title, source (channel name), playback_status, and embed_verified.
 * Requires admin auth. Safe to call multiple times (idempotent).
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { getSecret } from '#airo/secrets';
import { apiClient, regionAllowed } from '@/server/youtube.js';

// Video IDs to enrich — goalkeeping (batch 1) + midfield (batch 2) + defending (batch 3) + attacking (batch 4)
const TARGET_VIDEO_IDS = [
  // Goalkeeping — batch 1
  'vxtsvUrSC1w',
  'Hy10XUls8xs',
  'dkxN7nFAybk',
  'wE8fXiPnD7I',
  'lshxX3S9ShU',
  'yfvj7E14lAM',
  'vbtGG9Kiqmc',
  // Midfield — batch 2
  '4Y_64ANmC9c',
  'dV0OCVPAFmA',
  'KcSVEInRAGs',
  '-_E_0weZhls',
  'bhSlFjBWlzc',
  '2UpKcNuSSO0',
  '-UY2lPNeWI8',
  // Defending — batch 3
  'sxSWLpDv770',
  'k9Xhdv_IyN4',
  'jtv_fdLrYZ0',
  'ay42qx4NSZY',
  // Attacking — batch 4
  'qmaQSEJaz6I',
  'x_H_Q-tJVS8',
  'vwk53EIM5AM',
  'hCgt6-ag7VA',
  'iN5YxaM1PpM',
  'Zdg232Eoqfw',
  'r-xNitT6VTY',
];

interface VideoResult {
  videoId: string;
  title: string | null;
  channelTitle: string | null;
  thumbnail: string | null;
  embeddable: boolean | null;
  regionAllowedUS: boolean | null;
  privacyStatus: string | null;
  action: string;
  error?: string;
}

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const rawKey = getSecret('YOUTUBE_API_KEY');
  const apiKey = typeof rawKey === 'string' ? rawKey : '';
  if (!apiKey) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });
  }

  const api = apiClient(apiKey);
  const results: VideoResult[] = [];

  // Fetch all target IDs in one API call (max 50 per request)
  let rawItems: unknown[] = [];
  try {
    const data = await api('videos', {
      part: 'snippet,status,contentDetails',
      id: TARGET_VIDEO_IDS.join(','),
      maxResults: 50,
    });
    rawItems = data.items;
  } catch (err) {
    return res.status(502).json({ error: 'YouTube API call failed', detail: String(err) });
  }

  // Index by video ID
  const byId = new Map<string, unknown>();
  for (const item of rawItems) {
    const v = item as { id?: string };
    if (v.id) byId.set(v.id, item);
  }

  for (const videoId of TARGET_VIDEO_IDS) {
    const contentId = `dev-yt-${videoId}`;
    const raw = byId.get(videoId) as {
      id?: string;
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
      };
      status?: { privacyStatus?: string; embeddable?: boolean };
      contentDetails?: { regionRestriction?: { allowed?: string[]; blocked?: string[] }; contentRating?: { ytRating?: string } };
    } | undefined;

    if (!raw) {
      results.push({ videoId, title: null, channelTitle: null, thumbnail: null, embeddable: null, regionAllowedUS: null, privacyStatus: null, action: 'not_found_in_api', error: 'Video not returned by YouTube API — may be private, deleted, or unavailable' });
      // Mark playback_status so the card shows a fallback
      await db.execute(sql`
        UPDATE sc_dev_content
        SET playback_status = 'unavailable', embed_verified = false
        WHERE content_id = ${contentId}
      `);
      continue;
    }

    const title = raw.snippet?.title ?? null;
    const channelTitle = raw.snippet?.channelTitle ?? null;
    const privacyStatus = raw.status?.privacyStatus ?? null;
    const embeddable = raw.status?.embeddable === true
      && raw.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted';
    const regionOk = regionAllowed(raw, 'US');

    // Safe thumbnail (ytimg.com only)
    let thumbnail: string | null = null;
    const rawThumb =
      raw.snippet?.thumbnails?.high?.url ??
      raw.snippet?.thumbnails?.medium?.url ??
      raw.snippet?.thumbnails?.default?.url ?? null;
    if (rawThumb) {
      try {
        const u = new URL(rawThumb);
        if (u.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(u.hostname)) {
          thumbnail = u.href;
        }
      } catch { /* discard */ }
    }

    // Determine playback_status
    let playbackStatus: string | null = null;
    if (privacyStatus !== 'public') {
      playbackStatus = 'unavailable';
    } else if (!regionOk) {
      playbackStatus = 'region_blocked';
    } else if (!embeddable) {
      playbackStatus = 'embed_blocked';
    }
    // null = playable

    // Upsert — only update title/source if they are still a fallback placeholder
    await db.execute(sql`
      UPDATE sc_dev_content
      SET
        title = CASE WHEN title IN ('General goalkeeping','One-on-ones','Advanced techniques','Footwork','Basics — diving','Handling','Midfield','Defending','Attacking') OR title IS NULL
                     THEN COALESCE(${title}, title)
                     ELSE title END,
        source = CASE WHEN source = '' OR source IS NULL
                      THEN COALESCE(${channelTitle}, source)
                      ELSE source END,
        playback_status = ${playbackStatus},
        embed_verified = ${embeddable && regionOk && privacyStatus === 'public'}
      WHERE content_id = ${contentId}
    `);

    results.push({
      videoId,
      title,
      channelTitle,
      thumbnail,
      embeddable,
      regionAllowedUS: regionOk,
      privacyStatus,
      action: playbackStatus ? `stored_with_status:${playbackStatus}` : 'enriched_ok',
    });
  }

  return res.json({ ok: true, results });
}
