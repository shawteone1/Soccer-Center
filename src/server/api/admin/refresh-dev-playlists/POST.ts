/**
 * POST /api/admin/refresh-dev-playlists
 * Re-imports all enabled tracked playlists in sc_dev_playlists.
 * New public videos are added; existing rows are preserved on API failure.
 * Requires admin auth. Safe to call on a schedule.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';
import { getSecret } from '#airo/secrets';
import { apiClient, regionAllowed, type RawVideo } from '@/server/youtube.js';

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const rawKey = getSecret('YOUTUBE_API_KEY');
  const apiKey = typeof rawKey === 'string' ? rawKey : '';
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });

  const api = apiClient(apiKey);

  // Load all enabled playlists
  const rows = await db.execute(sql`
    SELECT playlist_id, dev_category, label FROM sc_dev_playlists WHERE enabled = true
  `);
  const playlists = (rows as unknown as { playlist_id: string; dev_category: string; label: string }[]);

  const summary: Record<string, { added: number; errors: string[] }> = {};

  for (const pl of playlists) {
    const { playlist_id: playlistId, dev_category: devCategory } = pl;
    const added: string[] = [];
    const errors: string[] = [];

    // Collect playlist video IDs (paginated)
    const videoIds: string[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;
    do {
      try {
        const params: Record<string, string> = {
          part: 'contentDetails,status',
          playlistId,
          maxResults: '50',
        };
        if (pageToken) params.pageToken = pageToken;
        const data = await api('playlistItems', params) as {
          items?: { contentDetails?: { videoId?: string }; status?: { privacyStatus?: string } }[];
          nextPageToken?: string;
        };
        for (const item of data.items ?? []) {
          const vid = item.contentDetails?.videoId;
          if (!vid || item.status?.privacyStatus === 'private') continue;
          videoIds.push(vid);
        }
        pageToken = data.nextPageToken;
        pageCount++;
      } catch (err) {
        errors.push(`Page ${pageCount + 1}: ${String(err)}`);
        break;
      }
    } while (pageToken && pageCount < 10);

    if (errors.length && videoIds.length === 0) {
      // Full failure — preserve existing rows, don't wipe anything
      summary[playlistId] = { added: 0, errors };
      continue;
    }

    // Fetch metadata in batches of 50
    const metaMap = new Map<string, { title: string; channel: string; playbackStatus: string | null; embedOk: boolean }>();
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      try {
        const data = await api('videos', {
          part: 'snippet,status,contentDetails',
          id: batch.join(','),
          maxResults: 50,
        }) as { items?: unknown[] };
        for (const raw of data.items ?? []) {
          const item = raw as RawVideo;
          if (!item.id) continue;
          const priv = item.status?.privacyStatus ?? null;
          const emb = item.status?.embeddable === true && item.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted';
          const reg = regionAllowed(item, 'US');
          let ps: string | null = null;
          if (priv !== 'public') ps = 'unavailable';
          else if (!reg) ps = 'region_blocked';
          else if (!emb) ps = 'embed_blocked';
          metaMap.set(item.id, {
            title: item.snippet?.title ?? 'Fitness & speed training',
            channel: item.snippet?.channelTitle ?? '',
            playbackStatus: ps,
            embedOk: emb && reg && priv === 'public',
          });
        }
      } catch (err) {
        errors.push(`Meta batch ${i / 50 + 1}: ${String(err)}`);
      }
    }

    // Upsert new videos (won't overwrite real titles already in DB)
    let priority = 10;
    for (const videoId of videoIds) {
      const contentId = `dev-yt-${videoId}`;
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const meta = metaMap.get(videoId);
      const title = meta?.title ?? 'Fitness & speed training';
      const channel = meta?.channel ?? '';
      const ps = meta?.playbackStatus ?? null;
      const embedOk = meta?.embedOk ?? false;
      try {
        await db.execute(sql`
          INSERT INTO sc_dev_content
            (content_id, title, description, source, url, content_type,
             youtube_video_id, dev_category, embed_verified, admin_status,
             playback_status, editorial_priority, positions, interests, tags, audience)
          VALUES (
            ${contentId}, ${title}, 'Fitness and speed training for soccer players.',
            ${channel}, ${url}, 'youtube_video', ${videoId}, ${devCategory},
            ${embedOk}, 'approved', ${ps}, ${priority},
            '[]', '[]', '["fitness","speed","conditioning"]', '["player"]'
          )
          ON DUPLICATE KEY UPDATE
            title = CASE WHEN title IN ('Fitness & speed training','') OR title IS NULL
                         THEN VALUES(title) ELSE title END,
            source = CASE WHEN source = '' OR source IS NULL THEN VALUES(source) ELSE source END,
            dev_category = ${devCategory},
            admin_status = 'approved',
            playback_status = ${ps},
            embed_verified = ${embedOk},
            editorial_priority = VALUES(editorial_priority)
        `);
        added.push(videoId);
      } catch (e) {
        errors.push(`Upsert ${videoId}: ${String(e)}`);
      }
      priority++;
    }

    // Update tracking row
    try {
      await db.execute(sql`
        UPDATE sc_dev_playlists
        SET last_imported_at = NOW(), last_import_count = ${added.length}
        WHERE playlist_id = ${playlistId}
      `);
    } catch { /* non-fatal */ }

    summary[playlistId] = { added: added.length, errors };
  }

  return res.json({ ok: true, summary });
}
