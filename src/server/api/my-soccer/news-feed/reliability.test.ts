import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),where:vi.fn(),auth:vi.fn()}));
vi.mock('@/server/lib/safe-outbound-text.js',()=>({fetchPublicText:m.fetch}));
vi.mock('@/server/api/my-soccer/auth-guard.js',()=>({requireAuth:m.auth}));
vi.mock('@/server/db/client.js',()=>({db:{select:()=>({from:()=>({where:m.where})})}}));
vi.mock('@/server/db/schema.js',()=>({scSources:{format:'format'},scUserFollowing:{userId:'userId',entityType:'type'}}));
import handler,{fetchSource,newsFeedCache} from './GET';
const xml='<rss><channel><item><title>Sky result</title><link>https://example.org/story</link><pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>';
const response=()=>({statusCode:200,body:{} as any,set(){return this;},status(n:number){this.statusCode=n;return this;},json(body:any){this.body=body;return this;}});
beforeEach(()=>{vi.clearAllMocks();newsFeedCache.clear();m.auth.mockResolvedValue('owner');});
it('preserves last-good content on network failure and marks it stale',async()=>{m.fetch.mockResolvedValueOnce(xml).mockRejectedValueOnce(new Error('timeout'));const good=await fetchSource('sky','https://example.org/feed');expect(await fetchSource('sky','https://example.org/feed',true)).toEqual(good);expect(newsFeedCache.get('sky')?.failed).toBe(true);});
it('does not report HTML errors as a valid empty feed',async()=>{m.fetch.mockResolvedValue('<html>Unavailable</html>');expect(await fetchSource('cbs','https://example.org/feed')).toEqual([]);expect(newsFeedCache.get('cbs')?.failed).toBe(true);});
it('does not reuse old content after a configured feed URL changes',async()=>{m.fetch.mockResolvedValueOnce(xml).mockRejectedValueOnce(new Error('gone'));await fetchSource('sky','https://example.org/old');expect(await fetchSource('sky','https://example.org/new')).toEqual([]);});
it('filters selected publisher before pagination and leaves unrelated sources unrequested',async()=>{
 m.where.mockResolvedValueOnce([{entityId:'sky'},{entityId:'bbc'}]).mockResolvedValueOnce([
 {id:'sky',label:'Sky',feedEndpoint:'https://example.org/sky',integrationStatus:'rss',connectorEnabled:true,url:'https://example.org'},
 {id:'bbc',label:'BBC',feedEndpoint:'https://example.org/bbc',integrationStatus:'rss',connectorEnabled:true,url:'https://example.org'},
 {id:'link',label:'Link',feedEndpoint:null,integrationStatus:'link_only',connectorEnabled:false,url:'https://example.org'}]);
 m.fetch.mockResolvedValue(xml);const res=response();await handler({query:{sourceId:'sky',limit:'1',page:'0'}} as any,res as any);
 expect(res.body.items).toHaveLength(1);expect(res.body.items[0].sourceId).toBe('sky');expect(m.fetch).toHaveBeenCalledTimes(1);
 expect(res.body.sources.find((s:any)=>s.id==='bbc').feedState).toBe('not_requested');expect(res.body.sources.find((s:any)=>s.id==='link').feedState).toBe('not_configured');
});
it('reports a valid empty document separately from failed retrieval',async()=>{m.fetch.mockResolvedValue('<rss><channel></channel></rss>');await fetchSource('empty','https://example.org/feed');expect(newsFeedCache.get('empty')?.failed).toBe(false);});
