/**
 * GET /api/calendar/connections
 * Returns which calendar providers are connected for the signed-in user.
 * Includes both OAuth connections (Google, Outlook) and iCal subscription feeds.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { scOauthTokens, scCalendarFeeds, scFeedPrefs } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../../my-soccer/auth-guard.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const [oauthRows, feedRows, prefRows] = await Promise.all([
    db.select().from(scOauthTokens).where(eq(scOauthTokens.userId, userId)),
    db.select().from(scCalendarFeeds).where(eq(scCalendarFeeds.userId, userId)),
    db.select().from(scFeedPrefs).where(eq(scFeedPrefs.userId, userId)),
  ]);

  const prefMap = new Map(prefRows.map((p) => [p.feedId, p]));

  const oauthConnections = oauthRows.map((t) => ({
    provider: t.provider,
    connectedAt: t.createdAt?.toISOString() ?? null,
    expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString() : null,
    isExpired: t.expiresAt ? Date.now() > t.expiresAt - 60_000 : false,
  }));

  const feeds = feedRows.map((f) => {
    const pref = prefMap.get(f.id);
    return {
      id: f.id,
      provider: f.provider,
      label: f.label,
      lastFetchedAt: f.lastFetchedAt?.toISOString() ?? null,
      lastFetchStatus: f.lastFetchStatus,
      lastFetchError: f.lastFetchError,
      eventCount: f.eventCount ?? 0,
      visible: pref?.visible ?? true,
      color: pref?.color ?? null,
    };
  });

  return res.json({
    oauth: oauthConnections,
    feeds,
    configured: {
      google: !!(getSecret('GOOGLE_CLIENT_ID') && getSecret('GOOGLE_CLIENT_SECRET')),
      outlook: !!(getSecret('OUTLOOK_CLIENT_ID') && getSecret('OUTLOOK_CLIENT_SECRET')),
      teamsnap: false, // requires separate TEAMSNAP_CLIENT_ID — not currently configured
      playmetrics: false, // requires separate PLAYMETRICS_CLIENT_ID — not currently configured
    },
  });
}
