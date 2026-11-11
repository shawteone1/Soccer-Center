/**
 * GET /api/my-soccer/league-clubs
 *
 * Returns clubs for a given competition from channels.json.
 * Public — no auth required (club names are not sensitive).
 *
 * Query params:
 *   competition  required — e.g. "premier-league", "laliga"
 *
 * Returns:
 *   { clubs: [{ slug, name, channelSlug, channelUrl, hasChannel }] }
 */
import type { Request, Response } from 'express';
import channelsData from '../../../../data/channels.json';

interface ChannelEntry {
  slug: string;
  name: string;
  kind: string;
  competition?: string;
  channelId?: string;
  channelUrl?: string;
  website?: string;
  enabled?: boolean;
}

const ALL_CHANNELS = channelsData as ChannelEntry[];

export default function handler(req: Request, res: Response): void {
  const competition = (req.query.competition as string) ?? '';
  if (!competition) {
    res.status(400).json({ error: 'competition is required' });
    return;
  }

  const clubs = ALL_CHANNELS
    .filter(
      (ch) =>
        ch.kind === 'club' &&
        ch.competition === competition &&
        ch.enabled !== false,
    )
    .map((ch) => ({
      slug: ch.slug,
      name: ch.name,
      channelSlug: ch.slug,   // club slug IS the channel slug in channels.json
      channelUrl: ch.channelUrl ?? null,
      hasChannel: !!(ch.channelId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.set('Cache-Control', 'public, max-age=3600').json({ clubs });
}
