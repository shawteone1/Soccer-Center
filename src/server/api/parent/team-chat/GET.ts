import type { Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { requireParentAccess, setPrivateCacheHeaders } from '@/server/auth-policy.js';
import { db } from '@/server/db/client.js';
import { scPlayerProfiles } from '@/server/db/schema.js';
import { parseTeamChatConfig, visibleTeamChats } from '@/server/lib/team-chat-config.js';
export default async function handler(req: Request, res: Response) {
  setPrivateCacheHeaders(res);
  const user = await requireParentAccess(req, res);
  if (!user) return;
  try {
    const channels = parseTeamChatConfig(process.env.PARENT_TEAM_CHAT_CHANNELS);
    if (!channels.length) { res.json({channels: []}); return; }
    const players = await db.select({id: scPlayerProfiles.id, label: scPlayerProfiles.label})
      .from(scPlayerProfiles).where(and(eq(scPlayerProfiles.userId, user.id), isNull(scPlayerProfiles.deletedAt)));
    res.json({channels: visibleTeamChats(channels, user.id, players)});
  } catch {
    // Never log invite links, config, member IDs or raw exceptions.
    res.status(503).json({error: 'Team chat could not be loaded. Please retry or contact your team administrator.'});
  }
}
