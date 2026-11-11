/**
 * GET /api/my-soccer/pl-clubs
 *
 * Returns the current Premier League club list with channel metadata.
 * Public — no auth required. Cached 1 hour.
 *
 * Admins update src/data/pl-clubs.json to reflect promotion/relegation.
 * The channelSlug must match a slug in src/data/channels.json.
 */

import type { Request, Response } from 'express';
import plClubsData from '../../../../data/pl-clubs.json';
import channelsData from '../../../../data/channels.json';

interface PlClub {
  slug: string;
  name: string;
  channelSlug: string;
  verified: boolean;
  crest: string | null;
}

interface ChannelSource {
  slug: string;
  name: string;
  kind: 'club' | 'league';
  channelId: string | null;
  channelUrl: string;
  website: string;
}

const PL_CLUBS = plClubsData as PlClub[];
const ALL_CHANNELS = channelsData as ChannelSource[];

export default function handler(_req: Request, res: Response): void {
  const clubs = PL_CLUBS.map((club) => {
    const channel = ALL_CHANNELS.find((ch) => ch.slug === club.channelSlug);
    return {
      slug: club.slug,
      name: club.name,
      channelSlug: club.channelSlug,
      channelUrl: channel?.channelUrl ?? null,
      verified: club.verified,
      hasChannel: !!channel,
      crest: club.crest,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  res.set('Cache-Control', 'public, max-age=3600').json({ clubs });
}
