/**
 * YouTube Data API v3 client and video normalization.
 * Ported from the reference src/youtube.mjs — all identity checks,
 * quota-safety rules, and stale-retention logic preserved.
 *
 * SECURITY: The API key is NEVER included in responses, logs, or errors.
 */

export const REFRESH_MS = 4 * 60 * 60 * 1000;   // 4 hours
export const MAX_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const idPattern = /^[a-zA-Z0-9_-]{11}$/;

// ─── Source configuration ─────────────────────────────────────────────────────

export type ChannelKind =
  | 'club'
  | 'league'
  | 'competition'   // cup / continental tournament (UCL, UEL, Copa America, etc.)
  | 'national_team' // national federation YouTube channel
  | 'media';        // broadcast / media organisation

export interface ChannelSource {
  slug: string;
  name: string;
  kind: ChannelKind;
  handle: string;
  channelId: string | null;
  website: string;
  channelUrl: string;
  /** Primary competition this club competes in (e.g. "premier-league") */
  competition?: string;
  /** Country / confederation code (e.g. "ENG", "ESP", "UEFA") */
  country?: string;
  season?: string;
  enabled?: boolean;
}

export interface ResolvedSource extends ChannelSource {
  channelId: string; // always populated after resolution
}

export function validateSources(sources: ChannelSource[]): ChannelSource[] {
  if (!Array.isArray(sources) || !sources.length || sources.length > 50) {
    throw new Error('Configure 1–50 approved channels.');
  }
  const slugs = new Set<string>();
  for (const s of sources) {
    if (
      !/^[a-z0-9-]{1,64}$/.test(s.slug) ||
      slugs.has(s.slug) ||
      (s.channelId != null && !/^UC[a-zA-Z0-9_-]{22}$/.test(s.channelId)) ||
      !['club', 'league', 'competition', 'national_team', 'media'].includes(s.kind) ||
      typeof s.name !== 'string' ||
      !s.name ||
      s.name.length > 100 ||
      !/^@[A-Za-z0-9_.-]{3,50}$/.test(s.handle)
    ) {
      throw new Error(`Invalid source configuration for slug: ${s.slug}`);
    }
    if (
      new URL(s.channelUrl).href !== `https://www.youtube.com/${s.handle}` ||
      new URL(s.website).protocol !== 'https:'
    ) {
      throw new Error(`Invalid official source URL for slug: ${s.slug}`);
    }
    slugs.add(s.slug);
  }
  const enabled = sources.filter((s) => s.enabled !== false);
  if (!enabled.length) throw new Error('Enable at least one channel.');
  return enabled;
}

// ─── Title tagging ────────────────────────────────────────────────────────────

export type VideoTag = 'highlights' | 'interviews' | 'training' | 'features';

export function tags(title: string): VideoTag[] {
  const out: VideoTag[] = [];
  if (/\b(highlights?|extended highlights?|match recap)\b/i.test(title)) out.push('highlights');
  if (/\b(interview|reaction|press conference)\b/i.test(title)) out.push('interviews');
  if (/\b(training|inside training)\b/i.test(title)) out.push('training');
  return out.length ? out : ['features'];
}

// ─── Region check ─────────────────────────────────────────────────────────────

interface RegionRestriction {
  allowed?: string[];
  blocked?: string[];
}

interface VideoContentDetails {
  duration?: string;
  regionRestriction?: RegionRestriction;
  contentRating?: { ytRating?: string };
}

interface VideoStatus {
  privacyStatus?: string;
  uploadStatus?: string;
  embeddable?: boolean;
}

interface VideoSnippet {
  title?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  liveBroadcastContent?: string;
  thumbnails?: {
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
}

export interface RawVideo {
  id?: string;
  snippet?: VideoSnippet;
  contentDetails?: VideoContentDetails;
  status?: VideoStatus;
}

export function regionAllowed(video: RawVideo, region = 'US'): boolean {
  const rule = video.contentDetails?.regionRestriction;
  if (rule?.allowed && !rule.allowed.includes(region)) return false;
  if (rule?.blocked?.includes(region)) return false;
  return true;
}

// ─── Normalized video ─────────────────────────────────────────────────────────

export interface NormalizedVideo {
  id: string;
  title: string;
  sourceSlug: string;
  channelName: string;
  publishedAt: string;
  duration: string;
  thumbnail: string | null;
  tags: VideoTag[];
  embeddable: boolean;
  watchUrl: string;
}

export function normalizeVideo(
  video: RawVideo,
  source: ResolvedSource,
  now = new Date(),
  region = 'US',
): NormalizedVideo | null {
  const s = video.snippet;
  const details = video.contentDetails;
  const status = video.status;

  if (
    !idPattern.test(video.id ?? '') ||
    !s ||
    s.channelId !== source.channelId ||
    status?.privacyStatus !== 'public' ||
    status.uploadStatus !== 'processed' ||
    !regionAllowed(video, region)
  ) {
    return null;
  }
  if (s.liveBroadcastContent && s.liveBroadcastContent !== 'none') return null;

  const published = new Date(s.publishedAt ?? '');
  if (!Number.isFinite(published.getTime()) || published > now) return null;

  const safeThumb =
    s.thumbnails?.high?.url ??
    s.thumbnails?.medium?.url ??
    s.thumbnails?.default?.url ??
    null;

  let thumbnail: string | null = null;
  if (safeThumb) {
    try {
      const u = new URL(safeThumb);
      if (
        u.protocol === 'https:' &&
        ['i.ytimg.com', 'img.youtube.com'].includes(u.hostname)
      ) {
        thumbnail = u.href;
      }
    } catch {
      // discard unsafe thumbnail
    }
  }

  // Availability can change after this check; every card retains a YouTube link.
  const embeddable =
    status.embeddable === true &&
    details?.contentRating?.ytRating !== 'ytAgeRestricted';

  return {
    id: video.id!,
    title: String(s.title ?? '').slice(0, 500),
    sourceSlug: source.slug,
    channelName: String(s.channelTitle ?? source.name).slice(0, 150),
    publishedAt: published.toISOString(),
    duration: details?.duration ?? '',
    thumbnail,
    tags: tags(s.title ?? ''),
    embeddable,
    watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

// ─── API client ───────────────────────────────────────────────────────────────

type ApiEndpoint = 'channels' | 'playlistItems' | 'videos';
type ApiParams = Record<string, string | number>;

export type ApiClient = (endpoint: ApiEndpoint, params: ApiParams) => Promise<{ items: unknown[] }>;

export function apiClient(key: string, fetchImpl: typeof fetch = fetch): ApiClient {
  if (typeof key !== 'string' || !key.trim() || key.startsWith('REPLACE_')) {
    throw new Error('Configure the server YouTube Data API key.');
  }
  return async (endpoint, params) => {
    if (!(['channels', 'playlistItems', 'videos'] as string[]).includes(endpoint)) {
      throw new Error('Unsupported API endpoint.');
    }
    const u = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [k, v] of Object.entries({ ...params, key })) {
      u.searchParams.set(k, String(v));
    }

    let r: Response;
    try {
      r = await fetchImpl(u.toString(), {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new Error('YouTube request failed.');
    }

    if (!r.ok) {
      // NEVER include the request URL/API key in the error message.
      throw new Error(
        r.status === 403
          ? 'YouTube access or quota unavailable.'
          : 'YouTube request failed.',
      );
    }

    const declared = Number(r.headers.get('content-length') ?? 0);
    if (declared > 2 * 1024 * 1024) throw new Error('YouTube response too large.');

    const reader = r.body!.getReader();
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('YouTube response too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }

    let data: { items?: unknown[] };
    try {
      data = JSON.parse(new TextDecoder().decode(bytes)) as { items?: unknown[] };
    } catch {
      throw new Error('Invalid YouTube response.');
    }
    if (!Array.isArray(data.items)) throw new Error('Invalid YouTube response.');
    return data as { items: unknown[] };
  };
}

// ─── Channel fetch ────────────────────────────────────────────────────────────

export interface ChannelPayload {
  channelId: string;
  sourceHandle: string;
  channelTitle: string;
  videos: NormalizedVideo[];
}

export async function fetchChannel(
  source: ChannelSource,
  api: ApiClient,
  { now = new Date(), region = 'US' } = {},
): Promise<ChannelPayload> {
  const info = await api('channels', {
    part: 'snippet,contentDetails',
    ...(source.channelId ? { id: source.channelId } : { forHandle: source.handle }),
    maxResults: 1,
  });

  const channel = info.items[0] as {
    id?: string;
    snippet?: { customUrl?: string; title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  } | undefined;

  if (!channel || !/^UC[a-zA-Z0-9_-]{22}$/.test(channel.id ?? '')) {
    throw new Error('Configured channel not found.');
  }
  if (source.channelId && channel.id !== source.channelId) {
    throw new Error('Configured channel not found.');
  }
  if (
    !source.channelId &&
    channel.snippet?.customUrl?.toLowerCase() !== source.handle.toLowerCase()
  ) {
    throw new Error('Channel handle did not match approved configuration.');
  }

  const resolved: ResolvedSource = { ...source, channelId: channel.id! };

  const playlist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!/^UU[a-zA-Z0-9_-]{22}$/.test(playlist ?? '')) {
    throw new Error('Channel uploads playlist unavailable.');
  }

  const listing = await api('playlistItems', {
    part: 'contentDetails',
    playlistId: playlist!,
    maxResults: 50,
  });

  const ids = [
    ...new Set(
      (listing.items as { contentDetails?: { videoId?: string } }[])
        .map((v) => v.contentDetails?.videoId)
        .filter((id): id is string => idPattern.test(id ?? '')),
    ),
  ];

  if (!ids.length) {
    return {
      channelId: channel.id!,
      sourceHandle: source.handle.toLowerCase(),
      channelTitle: channel.snippet?.title ?? source.name,
      videos: [],
    };
  }

  const data = await api('videos', {
    part: 'snippet,status,contentDetails',
    id: ids.join(','),
    maxResults: 50,
  });

  const allowed = new Set(ids);
  const videos = (data.items as RawVideo[])
    .filter((v) => allowed.has(v.id ?? ''))
    .map((v) => normalizeVideo(v, resolved, now, region))
    .filter((v): v is NormalizedVideo => v !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    channelId: channel.id!,
    sourceHandle: source.handle.toLowerCase(),
    channelTitle: channel.snippet?.title ?? source.name,
    videos,
  };
}

// ─── Public snapshot ──────────────────────────────────────────────────────────

export type ChannelStatus =
  | 'verification-required'
  | 'not-ready'
  | 'expired'
  | 'stale'
  | 'ready';

export interface PublicChannel {
  slug: string;
  name: string;
  kind: ChannelKind;
  channelUrl: string;
  website: string;
  lastUpdated: string | null;
  status: ChannelStatus;
  videos: NormalizedVideo[];
}

export interface PublicSnapshot {
  channels: PublicChannel[];
  region: string;
  refreshHours: number;
  checkedAt: string;
}

interface CacheRow {
  slug: string;
  payload: string | ChannelPayload;
  fetched_at: Date | string | null;
  sync_error: string | null;
}

export function publicSnapshot(
  sources: ChannelSource[],
  rows: CacheRow[],
  { now = new Date(), region = 'US', verified = true } = {},
): PublicSnapshot {
  const channels: PublicChannel[] = sources.map((s) => {
    const row = rows.find((r) => r.slug === s.slug);
    const raw = row?.fetched_at;
    const when =
      raw instanceof Date
        ? raw
        : raw
        ? new Date((raw as string).includes('T') ? raw as string : (raw as string).replace(' ', 'T') + 'Z')
        : null;

    const validWhen = when !== null && Number.isFinite(when.getTime());
    const usable =
      verified &&
      validWhen &&
      now.getTime() - when!.getTime() >= 0 &&
      now.getTime() - when!.getTime() <= MAX_CACHE_MS;

    let payload: ChannelPayload | null = null;
    if (usable && row) {
      payload =
        typeof row.payload === 'string'
          ? (JSON.parse(row.payload) as ChannelPayload)
          : row.payload;
    }

    const matched = s.channelId
      ? payload?.channelId === s.channelId
      : payload?.sourceHandle === s.handle.toLowerCase();

    let status: ChannelStatus;
    if (!verified) {
      status = 'verification-required';
    } else if (!row?.fetched_at) {
      status = 'not-ready';
    } else if (!usable) {
      status = 'expired';
    } else if (!matched) {
      status = 'not-ready';
    } else if (row.sync_error) {
      status = 'stale';
    } else {
      status = 'ready';
    }

    return {
      slug: s.slug,
      name: s.name,
      kind: s.kind,
      channelUrl: s.channelUrl,
      website: s.website,
      lastUpdated: validWhen ? when!.toISOString() : null,
      status,
      videos: matched ? (payload?.videos ?? []) : [],
    };
  });

  return { channels, region, refreshHours: 4, checkedAt: now.toISOString() };
}
