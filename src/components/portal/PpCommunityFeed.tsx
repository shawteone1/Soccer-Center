import FeedShareButton from '@/components/FeedShareButton';
/**
 * PpCommunityFeed — Club and news feed for the Parent Portal home tab.
 *
 * Preference source: sc_parent_follows (sourceType = 'club' | 'league')
 * Endpoint: GET /api/parent/feed  (Parent Portal auth — requireParentAccess)
 *
 * This is NOT the Fan Arena feed (/api/my-soccer/club-feed), which reads
 * sc_member_profiles.favTeams. A parent who has never used the Fan Arena has
 * no scMemberProfiles row and would get an empty feed from that endpoint.
 * /api/parent/feed reads sc_parent_follows instead.
 *
 * News: GET /api/my-soccer/news-feed — RSS articles from followed news sources.
 * This endpoint uses requireAuth (Fan Arena guard). A parent session satisfies
 * it because both use the same BetterAuth cookie. News preferences are stored
 * in scMemberProfiles.fanInterests; if the parent has no Fan Arena profile,
 * the news feed will be empty and the empty state explains where to configure it.
 *
 * Source transparency:
 *   - Each item shows its source name and type.
 *   - Sources with no cached content are listed by name — not silently omitted.
 *   - External social platforms (Twitter/X, Instagram, Facebook pages) are not
 *     supported as feed sources; this is stated explicitly.
 */

import { useState, useEffect } from 'react';
import { ExternalLink, Loader2, Video, Newspaper, AlertCircle, RefreshCw } from 'lucide-react';
import { PpCard, PpSectionHeading } from './PpPrimitives';

// ─── Types (matching existing API response shapes) ────────────────────────────

interface ClubVideoItem {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string | null;
  watchUrl: string;
  clubName: string;
  matchReason: string;
  embeddable: boolean;
}

interface ClubState {
  slug: string;
  name: string;
  channelUrl: string;
  hasVideos: boolean;
  videoCount: number;
}

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceLabel: string;
  integrationStatus: string;
}

type FeedTab = 'videos' | 'news';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ item }: { item: ClubVideoItem }) {
  return (
    <div>
    <a
      href={item.watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted/30 group"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
    >
      {item.thumbnail ? (
        <div className="shrink-0 w-20 h-12 rounded-lg overflow-hidden bg-muted">
          <img
            src={item.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className="shrink-0 w-20 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Video size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium leading-snug line-clamp-2 group-hover:underline"
          style={{ color: 'hsl(var(--pp-text))' }}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{item.matchReason}</span>
          <span>·</span>
          <span>{relativeTime(item.publishedAt)}</span>
        </div>
      </div>
    </a>
    <FeedShareButton url={item.watchUrl} title={item.title} />
    </div>
  );
}

// ─── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div>
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted/30 group"
      style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
    >
      {item.imageUrl ? (
        <div className="shrink-0 w-20 h-12 rounded-lg overflow-hidden bg-muted">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className="shrink-0 w-20 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'hsl(var(--pp-blue-light))' }}
        >
          <Newspaper size={16} style={{ color: 'hsl(var(--pp-navy))' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium leading-snug line-clamp-2 group-hover:underline"
          style={{ color: 'hsl(var(--pp-text))' }}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          <span>{item.sourceLabel}</span>
          {item.pubDate && <><span>·</span><span>{relativeTime(item.pubDate)}</span></>}
        </div>
      </div>
    </a>
    <FeedShareButton url={item.link} title={item.title} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpCommunityFeed() {
  const [tab, setTab] = useState<FeedTab>('videos');

  // Videos
  const [videos, setVideos] = useState<ClubVideoItem[]>([]);
  const [clubStates, setClubStates] = useState<ClubState[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);

  // News
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  function loadVideos() {
    setVideosLoading(true);
    setVideosError(null);
    // /api/parent/feed reads sc_parent_follows — the Parent Portal preference store.
    // Do NOT use /api/my-soccer/club-feed here; that reads sc_member_profiles.favTeams
    // (Fan Arena preferences) and returns empty for parents with no Fan Arena profile.
    fetch('/api/parent/feed?limit=20', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { videos: ClubVideoItem[]; clubStates: ClubState[] }) => {
        setVideos(data.videos ?? []);
        setClubStates(data.clubStates ?? []);
      })
      .catch((e: unknown) => setVideosError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setVideosLoading(false));
  }

  function loadNews() {
    setNewsLoading(true);
    setNewsError(null);
    fetch('/api/my-soccer/news-feed?limit=20', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { items: NewsItem[] }) => setNewsItems(data.items ?? []))
      .catch((e: unknown) => setNewsError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setNewsLoading(false));
  }

  useEffect(() => {
    loadVideos();
    loadNews();
  }, []);

  // Clubs with no cached content — listed explicitly, not silently omitted
  const emptyClubs = clubStates.filter(c => !c.hasVideos);
  const hasAnySource = clubStates.length > 0 || newsItems.length > 0;

  return (
    <PpCard>
      <div className="flex items-center justify-between mb-4">
        <PpSectionHeading>Club &amp; community feed</PpSectionHeading>
        <button
          type="button"
          onClick={() => { loadVideos(); loadNews(); }}
          className="p-1.5 rounded-full transition-colors hover:bg-muted"
          style={{ color: 'hsl(var(--pp-text-muted))' }}
          title="Refresh feed"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4">
        {(['videos', 'news'] as FeedTab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors capitalize"
            style={{
              background: tab === t ? 'hsl(var(--pp-navy))' : 'transparent',
              color: tab === t ? 'hsl(var(--pp-white))' : 'hsl(var(--pp-text-muted))',
            }}
          >
            {t === 'videos' ? <Video size={11} /> : <Newspaper size={11} />}
            {t}
          </button>
        ))}
      </div>

      {/* No sources configured */}
      {!videosLoading && !newsLoading && !hasAnySource && (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            No club or news sources followed yet.
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Follow clubs and leagues from your player&apos;s profile or the Sources tab to see their content here.
          </p>
          <p className="text-[10px] mt-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
            Note: Only YouTube channels and RSS news feeds are supported.
            Twitter/X, Instagram, and Facebook pages are not available as feed sources.
          </p>
        </div>
      )}

      {/* Videos tab */}
      {tab === 'videos' && (
        <div className="space-y-2">
          {videosLoading && (
            <div className="py-6 flex justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </div>
          )}
          {!videosLoading && videosError && (
            <div className="flex items-center gap-2 text-xs py-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <AlertCircle size={13} />
              {videosError}
            </div>
          )}
          {!videosLoading && !videosError && videos.length === 0 && clubStates.length > 0 && (
            <p className="text-sm py-3 text-center" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              No recent videos from your followed clubs.
            </p>
          )}
          {!videosLoading && !videosError && videos.map(v => (
            <VideoCard key={v.id} item={v} />
          ))}
          {/* Clubs with no cached content — listed explicitly */}
          {!videosLoading && emptyClubs.length > 0 && (
            <div
              className="rounded-xl border px-3 py-2.5 mt-2"
              style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
            >
              <p className="text-[10px] font-semibold mb-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No recent content from:
              </p>
              <div className="flex flex-wrap gap-2">
                {emptyClubs.map(c => (
                  <a
                    key={c.slug}
                    href={c.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: 'hsl(var(--pp-blue))' }}
                  >
                    {c.name}
                    <ExternalLink size={9} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* News tab */}
      {tab === 'news' && (
        <div className="space-y-2">
          {newsLoading && (
            <div className="py-6 flex justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            </div>
          )}
          {!newsLoading && newsError && (
            <div className="flex items-center gap-2 text-xs py-3" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              <AlertCircle size={13} />
              {newsError}
            </div>
          )}
          {!newsLoading && !newsError && newsItems.length === 0 && (
            <div className="py-4 text-center space-y-1">
              <p className="text-sm" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                No news articles yet.
              </p>
              <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                News preferences are managed separately in the{' '}
                <a href="/my-soccer" className="underline" style={{ color: 'hsl(var(--pp-blue))' }}>
                  Fan Arena
                </a>
                .
              </p>
            </div>
          )}
          {!newsLoading && !newsError && newsItems.map(item => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Source transparency footer */}
      {hasAnySource && (
        <p className="text-[10px] mt-3 pt-3 border-t" style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}>
          Videos from YouTube channels you follow. News from RSS feeds configured in the Fan Arena.
          Twitter/X, Instagram, and Facebook pages are not supported as feed sources.
        </p>
      )}
    </PpCard>
  );
}
