import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),limit:vi.fn(),auth:vi.fn()}));
vi.mock('@/server/lib/safe-outbound-text.js',()=>({fetchPublicText:m.fetch}));
vi.mock('@/server/api/my-soccer/auth-guard.js',()=>({requireAuth:m.auth}));
vi.mock('@/server/db/client.js',()=>({db:{select:()=>({from:()=>({where:()=>({limit:m.limit})})})}}));
vi.mock('@/server/db/schema.js',()=>({scSources:{id:'id'}}));
import handler from './GET';
const xml='<rss><channel><item><title>Episode</title><link>https://example.org/story</link><enclosure url="https://example.org/audio.mp3" type="audio/mpeg"/></item></channel></rss>';
const response=()=>({body:{} as any,code:200,set(){return this},json(body:any){this.body=body;return this},status(n:number){this.code=n;return this}});
const source={label:'Podcast',feedEndpoint:'https://example.org/feed',integrationStatus:'rss',connectorEnabled:true};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();m.auth.mockResolvedValue('owner');m.limit.mockResolvedValue([source]);});
afterEach(()=>vi.useRealTimers());
it('retains episodes after network or HTML failure and marks the response stale',async()=>{
 m.fetch.mockResolvedValueOnce(xml).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('<html>error</html>');
 const req={query:{sourceId:'preserve'}} as any;const first=response();await handler(req,first as any);
 vi.advanceTimersByTime(16*60*1000);const second=response();await handler(req,second as any);expect(second.body.stale).toBe(true);expect(second.body.items).toEqual(first.body.items);
 const third=response();await handler(req,third as any);expect(third.body.stale).toBe(true);expect(third.body.items).toEqual(first.body.items);
});
it('does not return old cached audio when configuration changes',async()=>{
 m.fetch.mockResolvedValueOnce(xml).mockRejectedValueOnce(new Error('timeout'));const req={query:{sourceId:'changed'}} as any;await handler(req,response() as any);
 m.limit.mockResolvedValue([{...source,feedEndpoint:'https://example.org/new'}]);const res=response();await handler(req,res as any);expect(res.code).toBe(502);expect(res.body.items).toBeUndefined();
});
