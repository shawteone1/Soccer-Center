/**
 * GET /api/my-soccer/media-sources
 *
 * Returns all sc_sources rows with format in ('podcast','video','news','media'),
 * enriched with isFollowing flag for the current user.
 *
 * Query params:
 *   format   optional — filter by format: podcast | video | news | media
 *   limit    default 100, max 200
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSources, scUserFollowing } from '@/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

const MEDIA_FORMATS = ['podcast', 'video', 'news', 'media', 'youtube'];

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const formatFilter = (req.query.format as string) ?? '';
  const limitParam = parseInt((req.query.limit as string) ?? '100', 10);
  const limit = Math.min(Math.max(1, limitParam), 200);

  const formats = formatFilter && MEDIA_FORMATS.includes(formatFilter)
    ? [formatFilter]
    : MEDIA_FORMATS;

  // Load sources + user's following rows in parallel
  let sourceRows: {
    id: string; label: string | null; url: string | null; format: string | null;
    authority: string | null; scope: string | null; integrationStatus: string | null;
    connectorEnabled: boolean | null; notes: string | null;
  }[];
  let followingRows: { entityId: string }[];

  try {
    [sourceRows, followingRows] = await Promise.all([
      db
        .select({
          id: scSources.id,
          label: scSources.label,
          url: scSources.url,
          format: scSources.format,
          authority: scSources.authority,
          scope: scSources.scope,
          integrationStatus: scSources.integrationStatus,
          connectorEnabled: scSources.connectorEnabled,
          notes: scSources.notes,
        })
        .from(scSources)
        .where(inArray(scSources.format, formats))
        .limit(limit),
      db
        .select({ entityId: scUserFollowing.entityId })
        .from(scUserFollowing)
        .where(eq(scUserFollowing.userId, userId)),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only return schema_unavailable when the error is specifically a missing table.
    // Transient DB failures (connection timeout, deadlock, etc.) return 500 instead.
    if ((msg.includes("Table") && msg.includes("doesn't exist")) ||
        msg.includes("sc_sources") || msg.includes("sc_user_following")) {
      res.status(503).json({
        error: 'schema_unavailable',
        detail: 'Required tables are missing. Run run-schema-foundation from the admin panel.',
      });
      return;
    }
    console.error('[GET /api/my-soccer/media-sources]', msg);
    res.status(500).json({ error: 'Failed to load media sources' });
    return;
  }

  const followedIds = new Set(followingRows.map((r) => r.entityId));

  const sources = sourceRows.map((s) => ({
    id: s.id,
    label: s.label ?? s.url ?? 'Unknown source',
    url: s.url,
    format: s.format,
    authority: s.authority,
    scope: s.scope,
    integrationStatus: s.integrationStatus,
    connectorEnabled: s.connectorEnabled ?? false,
    notes: s.notes,
    isFollowing: followedIds.has(s.id),
  }));

  // Followed first, then alphabetical
  sources.sort((a, b) => {
    if (a.isFollowing !== b.isFollowing) return a.isFollowing ? -1 : 1;
    return (a.label ?? '').localeCompare(b.label ?? '');
  });

  res.set('Cache-Control', 'private, max-age=30').json({ sources, total: sources.length });
}
