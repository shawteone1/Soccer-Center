import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import PpNewsContentWall from './PpNewsContentWall';
vi.mock('@/components/FeedShareButton',()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const sources=[{id:'sky',label:'Sky Sports Football',integrationStatus:'rss',connectorEnabled:true,isFollowing:true,url:'https://example.org',feedState:'ready'},{id:'other',label:'Unrelated Publisher',integrationStatus:'link_only',connectorEnabled:false,isFollowing:false,url:'https://example.org'}];
const article={id:'sky:1',sourceId:'sky',sourceLabel:'Sky',title:'Sky article beyond All page one',link:'https://example.org/story',isoDate:null};
it('requests selected-source pagination and keeps unrelated notices out of the selected view',async()=>{
 const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>({sources,items:url.includes('sourceId=sky')?[article]:[],hasMore:true,page:0})}));vi.stubGlobal('fetch',fetcher);render(<PpNewsContentWall/>);
 fireEvent.click(await screen.findByRole('button',{name:'Sky Sports Football'}));
 await screen.findByText(article.title);expect(fetcher.mock.calls.some(([url])=>url.includes('sourceId=sky'))).toBe(true);
 expect(screen.queryByText(/Other sources have no active/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Load more articles'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.includes('page=1&sourceId=sky'))).toBe(true));
});
it('shows retry when the request fails instead of silently rendering blank',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('network');}));render(<PpNewsContentWall/>);await screen.findByText(/News could not be refreshed/);expect(screen.getByRole('button',{name:'Retry news'})).toBeEnabled();});
