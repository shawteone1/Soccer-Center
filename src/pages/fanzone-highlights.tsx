import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { ExternalLink, Play, AlertCircle, RefreshCw, ChevronDown, LogIn } from 'lucide-react';
import { fanzone_highlights } from 'virtual:content';
import ShareButton from '@/components/ShareButton';
import { useSession } from '@/lib/auth/auth-client';
import ScoresTicker from '@/components/scores/ScoresTicker';

const siteUrl = 'https://soccercenter.org';

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoTag = 'highlights' | 'interviews' | 'training' | 'features';

interface Video {
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

type ChannelStatus = 'verification-required' | 'not-ready' | 'expired' | 'stale' | 'ready';

interface Channel {
  slug: string;
  name: string;
  kind: 'club' | 'league' | 'competition';
  channelUrl: string;
  website: string;
  competition?: string;
  country?: string;
  lastUpdated: string | null;
  status: ChannelStatus;
  videos: Video[];
}

interface HighlightsPayload {
  channels: Channel[];
  region: string;
  refreshHours: number;
  checkedAt: string;
}

// ─── All channels from the database (leagues + clubs) ────────────────────────
// The public page shows all enabled channels. The league selector is now
// a combined dropdown with a kind filter (All / Leagues / Clubs).
// Previously hardcoded to 4 leagues only.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function getStatusMessage(status: ChannelStatus): string {
  const m = fanzone_highlights.statusMessages;
  switch (status) {
    case 'verification-required': return m.verificationRequired;
    case 'not-ready': return m.notReady;
    case 'expired': return m.expired;
    case 'stale': return m.stale;
    case 'ready': return m.ready;
  }
}

const CATEGORY_OPTIONS: { value: VideoTag | ''; label: string }[] = [
  { value: '', label: 'All content' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'interviews', label: 'Interviews & reaction' },
  { value: 'training', label: 'Training' },
  { value: 'features', label: 'Features' },
];

const TAG_COLORS: Record<VideoTag, string> = {
  highlights: 'hsl(var(--primary))',
  interviews: 'hsl(var(--secondary))',
  training: 'hsl(var(--accent))',
  features: 'hsl(var(--muted-foreground))',
};

// ─── Video card ───────────────────────────────────────────────────────────────

interface VideoCardProps {
  video: Video;
  activeVideoId: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
}

function VideoCard({ video, activeVideoId, onPlay, onStop }: VideoCardProps) {
  const isPlaying = activeVideoId === video.id;
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const prevPlayingRef = useRef(isPlaying);
  if (prevPlayingRef.current !== isPlaying) {
    prevPlayingRef.current = isPlaying;
    if (!isPlaying) setIframeBlocked(false);
  }

  // Listen for YouTube IFrame API postMessage events.
  // YouTube sends JSON strings from www.youtube-nocookie.com or www.youtube.com.
  // Error codes 100, 101, 150 mean the video cannot be played (private/embedding disabled).
  // We validate origin and match the source window to avoid acting on unrelated messages.
  useEffect(() => {
    if (!isPlaying) return;
    const ALLOWED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];

    function handleMessage(e: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(e.origin)) return;
      // Only act on messages from our specific iframe
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as { event?: string; info?: number | Record<string, unknown> };
        // YouTube IFrame API error event: event="onError", info = error code number
        // Codes: 2=invalid id, 5=HTML5 error, 100=not found/private, 101/150=embedding disabled
        if (msg.event === 'onError') {
          const code = typeof msg.info === 'number' ? msg.info : null;
          if (code === 100 || code === 101 || code === 150) {
            setIframeBlocked(true);
          }
        }
      } catch { /* not a YouTube JSON message */ }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isPlaying]);

  const canEmbed = video.embeddable && !iframeBlocked;

  return (
    <article
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
    >
      {/* Poster / player */}
      <div
        className="relative"
        style={{ aspectRatio: '16/9', background: 'hsl(var(--muted))' }}
      >
        {isPlaying && !iframeBlocked ? (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?playsinline=1&autoplay=0&enablejsapi=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            onError={() => setIframeBlocked(true)}
          />
        ) : isPlaying && iframeBlocked ? (
          /* Embed was blocked mid-play — show clean fallback */
          <a
            href={video.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Watch ${video.title} on YouTube`}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 pointer-events-auto"
            style={{ background: 'hsl(var(--muted))' }}
          >
            {video.thumbnail && (
              <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-30" />
            )}
            <span className="relative flex items-center justify-center rounded-full w-14 h-14 shadow-lg"
              style={{ background: 'hsl(var(--primary))' }}>
              <ExternalLink className="w-6 h-6 text-white" />
            </span>
            <span className="relative text-xs font-semibold text-center px-3 py-1 rounded-full"
              style={{ background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}>
              Embedding restricted — Watch on YouTube
            </span>
          </a>
        ) : (
          <>
            {video.thumbnail && (
              <img
                src={video.thumbnail}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {canEmbed ? (
              <button
                type="button"
                aria-label={`Play ${video.title}`}
                onClick={() => {
                  if (activeVideoId) onStop();
                  onPlay(video.id);
                }}
                className="absolute inset-0 flex items-center justify-center w-full h-full transition-opacity hover:opacity-90 pointer-events-auto"
                style={{ background: video.thumbnail ? 'rgba(0,0,0,0.35)' : 'hsl(var(--muted))' }}
              >
                <span
                  className="flex items-center justify-center rounded-full w-14 h-14 shadow-lg"
                  style={{ background: 'hsl(var(--primary))' }}
                >
                  <Play className="w-6 h-6 fill-white text-white ml-1" />
                </span>
              </button>
            ) : (
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch ${video.title} on YouTube`}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 transition-opacity hover:opacity-90 pointer-events-auto"
                style={{ background: video.thumbnail ? 'rgba(0,0,0,0.55)' : 'hsl(var(--muted))' }}
              >
                <span
                  className="flex items-center justify-center rounded-full w-14 h-14 shadow-lg"
                  style={{ background: 'hsl(var(--primary))' }}
                >
                  <ExternalLink className="w-6 h-6 text-white" />
                </span>
                <span
                  className="text-xs font-semibold text-center px-3 py-1 rounded-full"
                  style={{ background: 'hsl(var(--foreground) / 0.5)', color: 'hsl(var(--background))' }}
                >
                  {iframeBlocked ? 'Embedding restricted — Watch on YouTube' : 'Watch on YouTube'}
                </span>
              </a>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex flex-wrap gap-1">
          {video.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{ background: 'hsl(var(--muted))', color: TAG_COLORS[tag] }}
            >
              {tag}
            </span>
          ))}
        </div>
        <h3
          className="text-sm font-semibold leading-snug line-clamp-2"
          style={{ color: 'hsl(var(--foreground))' }}
        >
          {video.title}
        </h3>
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {video.channelName} · Uploaded {formatDate(video.publishedAt)}
        </p>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <a
            href={video.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Watch on YouTube
            <ExternalLink className="w-3 h-3" />
          </a>
          <ShareButton
            url={video.watchUrl}
            text={`🎬 ${video.title} — ${video.channelName}`}
          />
        </div>
      </div>
    </article>
  );
}

// ─── League feed section ──────────────────────────────────────────────────────

interface LeagueFeedProps {
  channel: Channel;
  categoryFilter: VideoTag | '';
  activeVideoId: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
}

function LeagueFeed({ channel, categoryFilter, activeVideoId, onPlay, onStop }: LeagueFeedProps) {
  const [visibleCount, setVisibleCount] = useState(6);

  useEffect(() => {
    setVisibleCount(6);
  }, [categoryFilter, channel.slug]);

  const filtered = channel.videos.filter((v) => {
    if (categoryFilter && !v.tags.includes(categoryFilter)) return false;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <section>
      {/* Channel header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {getStatusMessage(channel.status)}
            {channel.lastUpdated && channel.status !== 'verification-required' && (
              <> Last updated: {formatDate(channel.lastUpdated)}.</>
            )}
          </p>
        </div>
        <a
          href={channel.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-colors hover:underline"
          style={{ color: 'hsl(var(--primary))' }}
        >
          Official YouTube channel
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {visible.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                activeVideoId={activeVideoId}
                onPlay={onPlay}
                onStop={onStop}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 6)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: 'hsl(var(--muted))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <ChevronDown className="w-4 h-4" />
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          className="rounded-xl px-6 py-5 text-sm leading-relaxed"
          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
        >
          {channel.status === 'ready'
            ? fanzone_highlights.emptyStates.ready
            : fanzone_highlights.emptyStates.unavailable}
        </div>
      )}
    </section>
  );
}

// ─── Sign-in invitation banner ────────────────────────────────────────────────

function SignInBanner() {
  return (
    <div
      className="rounded-2xl px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10"
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <div>
        <p
          className="text-sm font-semibold mb-0.5"
          style={{ color: 'hsl(var(--foreground))' }}
        >
          Follow your clubs in My Soccer.
        </p>
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Sign in to see official videos from Arsenal, Chelsea, Liverpool, and every other Premier League club.
        </p>
      </div>
      <Link
        to="/login/auth?returnTo=/my-soccer"
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
        }}
      >
        <LogIn className="w-4 h-4" />
        Sign in to personalize
      </Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FanzoneHighlightsPage() {
  const { isAuthenticated } = useSession();
  const [data, setData] = useState<HighlightsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Channel selector — no initial selection
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<VideoTag | ''>('');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/highlights/all', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('Video listings are temporarily unavailable. Please try again later.');
      const payload = (await r.json()) as HighlightsPayload;
      if (!Array.isArray(payload.channels)) throw new Error('Video listings are unavailable.');
      setData(payload);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Video listings are temporarily unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll every 10 minutes while visible and no player is open
  useEffect(() => {
    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => {
        if (!document.hidden && !activeVideoId) void load();
      }, 10 * 60 * 1000);
    };
    const stopPoll = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    startPoll();
    const onVisibility = () => { if (document.hidden) stopPoll(); else startPoll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopPoll(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load, activeVideoId]);

  // When channel changes, reset category filter and stop any playing video
  const handleLeagueChange = (slug: string) => {
    setSelectedLeagueSlug(slug);
    setCategoryFilter('');
    setActiveVideoId(null);
  };

  const handlePlay = (id: string) => setActiveVideoId(id);
  const handleStop = () => setActiveVideoId(null);

  // All channels — leagues and competitions only (clubs are in Fan Zone / My Soccer)
  const allChannels = data?.channels ?? [];
  const leagueChannels = allChannels.filter(c => c.kind === 'league' || c.kind === 'competition');

  const selectedChannel = selectedLeagueSlug
    ? leagueChannels.find((c) => c.slug === selectedLeagueSlug) ?? null
    : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${siteUrl}/fanzone/highlights#webpage`,
    name: 'Soccer Highlights — Official League Videos | Soccer Center',
    url: `${siteUrl}/fanzone/highlights`,
    description:
      'Official video highlights from Premier League, LaLiga, Bundesliga, Ligue 1, and more — updated regularly from each league\'s official YouTube channel.',
    isPartOf: { '@id': `${siteUrl}/#website` },
    about: { '@id': `${siteUrl}/#organization` },
  };

  return (
    <>
      <Helmet>
        <title>Soccer Highlights — Official League Videos | Soccer Center</title>
        <meta
          name="description"
          content="Official video highlights from Premier League, LaLiga, Bundesliga, Ligue 1, and more — updated regularly from each league's official YouTube channel."
        />
        <link rel="canonical" href={`${siteUrl}/fanzone/highlights`} />
        <meta property="og:title" content="Soccer Highlights — Official League Videos | Soccer Center" />
        <meta
          property="og:description"
          content="Official video highlights from Premier League, LaLiga, Bundesliga, Ligue 1, and more — updated from each league's official YouTube channel."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/fanzone/highlights`} />
        <meta property="og:image" content={`${siteUrl}/airo-assets/images/pages/home/arena-fan`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Soccer Highlights — Official League Videos | Soccer Center" />
        <meta
          name="twitter:description"
          content="Official video highlights from Premier League, LaLiga, Bundesliga, Ligue 1, and more."
        />
        <meta name="twitter:image" content={`${siteUrl}/airo-assets/images/pages/home/arena-fan`} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main>
        {/* Hero */}
        <section
          className="pt-28 pb-10 px-6"
          style={{ background: 'hsl(var(--background))' }}
        >
          <div className="max-w-7xl mx-auto">
            <p
              className="text-xs font-bold tracking-widest uppercase mb-3"
              style={{ color: 'hsl(var(--primary))' }}
            >
              <span>{fanzone_highlights.hero.eyebrow}</span>
            </p>
            <h1
              className="text-4xl md:text-6xl font-bold leading-tight mb-4"
              style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
            >
              <span>{fanzone_highlights.hero.title}</span>
            </h1>
            <p
              className="text-base md:text-lg max-w-2xl leading-relaxed mb-2"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <span>{fanzone_highlights.hero.subtitle}</span>
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span>{fanzone_highlights.hero.disclaimer}</span>
            </p>
          </div>
        </section>

        {/* Scores ticker — auth-gated; shows sign-in prompt for unauthenticated visitors.
            Only free-tier leagues (MLS/NWSL excluded — HTTP 403 on football-data.org free plan). */}
        <ScoresTicker
          leagues={['premier-league', 'laliga', 'bundesliga', 'ligue-1', 'serie-a', 'champions-league']}
          isAuthenticated={isAuthenticated}
        />

        {/* Controls */}
        <div
          className="sticky top-16 md:top-20 z-30 px-6 py-4 border-b"
          style={{
            background: 'hsl(var(--background) / 0.97)',
            backdropFilter: 'blur(8px)',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
            {/* League / competition selector — clubs are in Fan Zone / My Soccer */}
            <div className="flex flex-col gap-1 w-full sm:w-64">
              <label
                htmlFor="hl-league"
                className="text-xs font-semibold"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                League / Competition
              </label>
              <select
                id="hl-league"
                value={selectedLeagueSlug}
                onChange={(e) => handleLeagueChange(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm font-medium border"
                style={{
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <option value="">All leagues</option>
                {leagueChannels.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            {/* Category filter — only shown when a league is selected */}
            {selectedChannel && (
              <div className="flex flex-col gap-1 w-full sm:w-56">
                <label
                  htmlFor="hl-category"
                  className="text-xs font-semibold"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <span>{fanzone_highlights.filters.categoryLabel}</span>
                </label>
                <select
                  id="hl-category"
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value as VideoTag | '');
                    handleStop();
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium border"
                  style={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    borderColor: 'hsl(var(--border))',
                  }}
                >
                  {CATEGORY_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-6 py-3 max-w-7xl mx-auto" role="status" aria-live="polite">
          {isLoading ? (
            <p className="text-xs flex items-center gap-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loading official channels…
            </p>
          ) : loadError ? (
            <p className="text-xs flex items-center gap-2" style={{ color: 'hsl(var(--destructive))' }}>
              <AlertCircle className="w-3 h-3" />
              {loadError}
            </p>
          ) : data && selectedChannel ? (
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Showing {selectedChannel.name} ({selectedChannel.kind}) · refreshed about every {data.refreshHours} hours · availability checked for {data.region}. Playback can vary by viewer location.
            </p>
          ) : data ? (
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {allChannels.length} channels available — {allChannels.filter(c => c.kind === 'league' || c.kind === 'competition').length} leagues/competitions and {allChannels.filter(c => c.kind === 'club').length} clubs.
            </p>
          ) : null}
        </div>

        {/* Main content area */}
        <div className="px-6 pb-16 max-w-7xl mx-auto">
          {/* Sign-in invitation */}
          <SignInBanner />

          {/* No league selected prompt */}
          {!isLoading && !loadError && !selectedChannel && (
            <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'hsl(var(--muted))' }}
              >
                <Play className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
                >
                  Select a channel to start watching
                </h2>
                <p className="text-sm max-w-md" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Choose from {leagueChannels.length} channel{leagueChannels.length !== 1 ? 's' : ''} — {allChannels.filter(c => c.kind === 'league' || c.kind === 'competition').length} leagues/competitions and {allChannels.filter(c => c.kind === 'club').length} clubs — from the dropdown above.
                </p>
              </div>
              {/* Quick-pick league buttons */}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {leagueChannels.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => handleLeagueChange(c.slug)}
                    className="inline-flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-full border transition-colors hover:underline"
                    style={{
                      borderColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary))',
                      background: 'hsl(var(--card))',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected league feed */}
          {!isLoading && !loadError && selectedChannel && (() => {
            const isReady = selectedChannel.status === 'ready' || selectedChannel.status === 'stale';
            if (!isReady) {
              return (
                <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'hsl(var(--muted))' }}
                  >
                    <Play className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <h2
                      className="text-2xl font-bold mb-2"
                      style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
                    >
                      {selectedChannel.name} — loading first videos
                    </h2>
                    <p className="text-sm max-w-md" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      This channel's video cache hasn't been populated yet. The background scheduler fetches each channel at most once every 4 hours — videos will appear after the next scheduled run. If this persists, an admin can trigger a force-fetch from the admin panel.
                    </p>
                    <a
                      href={selectedChannel.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-4 text-sm font-medium hover:underline"
                      style={{ color: 'hsl(var(--primary))' }}
                    >
                      {selectedChannel.name} on YouTube <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            }

            return (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2
                    className="text-2xl md:text-3xl font-bold"
                    style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
                  >
                    {selectedChannel.name}
                  </h2>
                </div>
                <LeagueFeed
                  channel={selectedChannel}
                  categoryFilter={categoryFilter}
                  activeVideoId={activeVideoId}
                  onPlay={handlePlay}
                  onStop={handleStop}
                />
              </div>
            );
          })()}
        </div>

        {/* Disclosure / attribution */}
        <section
          className="px-6 py-10 border-t"
          style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="max-w-7xl mx-auto">
            <h2
              className="text-xl font-bold mb-4"
              style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
            >
              <span>{fanzone_highlights.disclosure.heading}</span>
            </h2>
            <div
              className="text-sm leading-relaxed space-y-3 max-w-3xl"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <p><span>{fanzone_highlights.disclosure.para1}</span></p>
              <p><span>{fanzone_highlights.disclosure.para2}</span></p>
              <p>
                <span>{fanzone_highlights.disclosure.para3}</span>
                {' '}
                <a
                  href="https://developers.google.com/youtube/terms/api-services-terms-of-service"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  YouTube API Services
                </a>
                {', '}
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  YouTube's Terms of Service
                </a>
                {', '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Google's Privacy Policy
                </a>
                .
              </p>
              <p>
                <span>{fanzone_highlights.disclosure.para4}</span>
                {' '}
                <Link
                  to="/privacy"
                  className="underline hover:no-underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Privacy Policy
                </Link>
                {' and '}
                <Link
                  to="/terms"
                  className="underline hover:no-underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Terms of Use
                </Link>
                .
              </p>
              <p className="text-xs">
                <span>{fanzone_highlights.disclosure.footnote}</span>
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
