import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@/server/lib/safe-outbound-text.js',()=>({fetchPublicText:m.fetch}));
vi.mock('@/server/api/my-soccer/auth-guard.js',()=>({requireAuth:vi.fn()}));
vi.mock('@/server/db/client.js',()=>({db:{}}));
vi.mock('@/server/db/schema.js',()=>({scSources:{},scUserFollowing:{},scMemberProfiles:{},scYoutubeCache:{}}));
import {fetchRss} from './GET';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('preserves last good unified feed, backs off failures, and keys cache to the configured URL',async()=>{
 vi.useFakeTimers();m.fetch.mockResolvedValueOnce('<rss><channel><item><title>Story</title><link>https://example.org/story</link></item></channel></rss>').mockRejectedValue(new Error('timeout'));
 const good=await fetchRss('one','https://example.org/feed');expect(good).toHaveLength(1);
 vi.advanceTimersByTime(16*60*1000);expect(await fetchRss('one','https://example.org/feed')).toEqual(good);
 expect(await fetchRss('one','https://example.org/feed')).toEqual(good);expect(m.fetch).toHaveBeenCalledTimes(2);
 expect(await fetchRss('one','https://example.org/different')).toEqual([]);
});
