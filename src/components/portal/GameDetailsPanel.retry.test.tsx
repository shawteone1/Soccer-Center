import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import GameDetailsPanel from './GameDetailsPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('retains a successful upload when game attachment fails',async()=>{
 let attempts=0;const fetcher=vi.fn(async(url:string,options?:RequestInit)=>({ok:!(url.endsWith('/media-assignments')&&options?.method==='POST'&&++attempts===1),status:200,json:async()=>url.endsWith('/media/upload')?{id:'file'}:url.endsWith('/media-assignments')&&options?.method==='POST'?{error:'Attachment failed'}:url.endsWith('/match-records')?{tableAvailable:true,records:[]}:{assignments:[],media:[],total:0}}));vi.stubGlobal('fetch',fetcher);
 const {container}=render(<GameDetailsPanel playerId="p" event={{id:'game',title:'vs Test',startAt:'2026-12-01T17:00:00Z',endAt:null,location:null,notes:null,eventType:'game',source:'manual'}} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Media/i}));
 fireEvent.click(await screen.findByRole('button',{name:'Add photo or video'}));
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['v'],'test.mov',{type:'video/quicktime'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Upload & attach'}));await screen.findByText('Attachment failed');
 fireEvent.click(screen.getByRole('button',{name:'Retry attachment'}));await waitFor(()=>expect(attempts).toBe(2));
 expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/media/upload'))).toHaveLength(1);
});
