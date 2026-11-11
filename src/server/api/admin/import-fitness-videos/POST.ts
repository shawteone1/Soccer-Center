/**
 * POST /api/admin/import-fitness-videos
 * Imports the Fitness & speed training playlist + 4 individual videos into sc_dev_content.
 * - Paginates through the full playlist (up to 200 items).
 * - Deduplicates by YouTube video ID.
 * - Fetches real titles, channel names, embed/region status via YouTube Data API v3.
 * - Upserts into sc_dev_content with devCategory = 'fitness'.
 * - Updates sc_dev_playlists.last_imported_at.
 * - Safe to call multiple times (idempotent).
 * - Requires admin auth.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { getSecret } from '#airo/secrets';
import { apiClient, regionAllowed, type RawVideo } from '@/server/youtube.js';

const PLAYLIST_ID = 'PLSYLQBF8yu6eZrzCbzaF3s_7PcIZhax9e';
const DEV_CATEGORY = 'fitness';

// Individual videos to always include
const INDIVIDUAL_IDS = [
  'd01bxcf-VhQ',
  'jxc1R8N8ZgY',
  '7AfjAgpQgbw',
  '8cCISQG1SuA',
];

interface VideoMeta {
  videoId: string;
  title: string | null;
  channelTitle: string | null;
  privacyStatus: string | null;
  embeddable: boolean;
  regionOk: boolean;
  playbackStatus: string | null;
}

interface ImportResult {
  playlistVideosFound: number;
  individualVideosFound: number;
  duplicatesSkipped: number;
  unavailable: string[];
  embedBlocked: string[];
  upserted: number;
  errors: string[];
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
  const result: ImportResult = {
    playlistVideosFound: 0,
    individualVideosFound: 0,
    duplicatesSkipped: 0,
    unavailable: [],
    embedBlocked: [],
    upserted: 0,
    errors: [],
  };

  // ── Step 1: Collect all video IDs from the playlist (paginated) ─────────────
  const playlistVideoIds: string[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 10; // safety cap: 10 × 50 = 500 items

  do {
    try {
      const params: Record<string, string> = {
        part: 'contentDetails,status',
        playlistId: PLAYLIST_ID,
        maxResults: '50',
      };
      if (pageToken) params.pageToken = pageToken;

      const data = await api('playlistItems', params) as {
        items?: { contentDetails?: { videoId?: string }; status?: { privacyStatus?: string } }[];
        nextPageToken?: string;
      };

      for (const item of data.items ?? []) {
        const vid = item.contentDetails?.videoId;
        // Skip private/deleted playlist entries
        if (!vid) continue;
        if (item.status?.privacyStatus === 'private') continue;
        playlistVideoIds.push(vid);
      }

      pageToken = data.nextPageToken;
      pageCount++;
    } catch (err) {
      result.errors.push(`Playlist page ${pageCount + 1} fetch failed: ${String(err)}`);
      break;
    }
  } while (pageToken && pageCount < MAX_PAGES);

  result.playlistVideosFound = playlistVideoIds.length;

  // ── Step 2: Merge individual IDs, deduplicate ────────────────────────────────
  const seen = new Set<string>();
  const allIds: string[] = [];
  for (const id of [...playlistVideoIds, ...INDIVIDUAL_IDS]) {
    if (!seen.has(id)) {
      seen.add(id);
      allIds.push(id);
    } else {
      result.duplicatesSkipped++;
    }
  }
  result.individualVideosFound = INDIVIDUAL_IDS.filter((id) => !playlistVideoIds.includes(id)).length;

  // ── Step 3: Fetch video metadata in batches of 50 ───────────────────────────
  const metaMap = new Map<string, VideoMeta>();
  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50);
    try {
      const data = await api('videos', {
        part: 'snippet,status,contentDetails',
        id: batch.join(','),
        maxResults: 50,
      }) as { items?: unknown[] };

      for (const raw of data.items ?? []) {
        const item = raw as RawVideo;
        if (!item.id) continue;

        const privacyStatus = item.status?.privacyStatus ?? null;
        const embeddable =
          item.status?.embeddable === true &&
          item.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted';
        const regionOk = regionAllowed(item, 'US');

        let playbackStatus: string | null = null;
        if (privacyStatus !== 'public') playbackStatus = 'unavailable';
        else if (!regionOk) playbackStatus = 'region_blocked';
        else if (!embeddable) playbackStatus = 'embed_blocked';

        metaMap.set(item.id, {
          videoId: item.id,
          title: item.snippet?.title ?? null,
          channelTitle: item.snippet?.channelTitle ?? null,
          privacyStatus,
          embeddable,
          regionOk,
          playbackStatus,
        });
      }
    } catch (err) {
      result.errors.push(`Video metadata batch ${i / 50 + 1} failed: ${String(err)}`);
    }
  }

  // ── Step 4: Upsert into sc_dev_content ───────────────────────────────────────
  // Priority: playlist items get sequential priority starting at 10 (after any
  // manually pinned items at 1–9). Individual-only items get priority 100+.
  let priority = 10;
  for (const videoId of allIds) {
    const meta = metaMap.get(videoId);
    const contentId = `dev-yt-${videoId}`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    if (!meta) {
      // Not returned by YouTube API — private, deleted, or unavailable
      result.unavailable.push(videoId);
      // Still upsert a stub so the card shows a fallback link
      try {
        await db.execute(sql`
          INSERT INTO sc_dev_content
            (content_id, title, description, source, url, content_type,
             youtube_video_id, dev_category, embed_verified, admin_status,
             playback_status, editorial_priority, positions, interests, tags, audience)
          VALUES (
            ${contentId}, 'Fitness & speed training', 'Fitness and speed training video.',
            '', ${url}, 'youtube_video', ${videoId}, ${DEV_CATEGORY},
            false, 'approved', 'unavailable', ${priority},
            '[]', '[]', '[]', '["player"]'
          )
          ON DUPLICATE KEY UPDATE
            dev_category = ${DEV_CATEGORY},
            admin_status = 'approved',
            playback_status = 'unavailable',
            embed_verified = false,
            editorial_priority = VALUES(editorial_priority)
        `);
      } catch (e) {
        result.errors.push(`Stub upsert failed for ${videoId}: ${String(e)}`);
      }
      priority++;
      continue;
    }

    if (meta.playbackStatus === 'embed_blocked') {
      result.embedBlocked.push(videoId);
    }

    const title = meta.title ?? 'Fitness & speed training';
    const channelTitle = meta.channelTitle ?? '';
    const embedOk = meta.embeddable && meta.regionOk && meta.privacyStatus === 'public';

    try {
      await db.execute(sql`
        INSERT INTO sc_dev_content
          (content_id, title, description, source, url, content_type,
           youtube_video_id, dev_category, embed_verified, admin_status,
           playback_status, editorial_priority, positions, interests, tags, audience)
        VALUES (
          ${contentId}, ${title}, 'Fitness and speed training for soccer players.',
          ${channelTitle}, ${url}, 'youtube_video', ${videoId}, ${DEV_CATEGORY},
          ${embedOk}, 'approved', ${meta.playbackStatus}, ${priority},
          '[]', '[]', '["fitness","speed","conditioning"]', '["player"]'
        )
        ON DUPLICATE KEY UPDATE
          title = CASE WHEN title IN ('Fitness & speed training','') OR title IS NULL
                       THEN VALUES(title) ELSE title END,
          source = CASE WHEN source = '' OR source IS NULL
                        THEN VALUES(source) ELSE source END,
          dev_category = ${DEV_CATEGORY},
          admin_status = 'approved',
          playback_status = ${meta.playbackStatus},
          embed_verified = ${embedOk},
          editorial_priority = VALUES(editorial_priority)
      `);
      result.upserted++;
    } catch (e) {
      result.errors.push(`Upsert failed for ${videoId}: ${String(e)}`);
    }
    priority++;
  }

  // ── Step 5: Register / update the playlist tracking row ─────────────────────
  try {
    await db.execute(sql`
      INSERT INTO sc_dev_playlists (playlist_id, dev_category, label, last_imported_at, last_import_count, enabled)
      VALUES (${PLAYLIST_ID}, ${DEV_CATEGORY}, 'Fitness & speed training', NOW(), ${result.upserted}, true)
      ON DUPLICATE KEY UPDATE
        last_imported_at = NOW(),
        last_import_count = ${result.upserted},
        enabled = true
    `);
  } catch (e) {
    result.errors.push(`Playlist tracking update failed: ${String(e)}`);
  }

  return res.json({ ok: true, ...result });
}
