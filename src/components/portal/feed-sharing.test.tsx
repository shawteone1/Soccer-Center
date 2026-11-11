import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import UnifiedFeedWall from './UnifiedFeedWall';
import PpCommunityFeed from './PpCommunityFeed';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('offers sharing for fan videos, articles and podcasts outside their links',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({items:['video','article','podcast'].map(type=>({id:type,type,title:type+' item',url:'https://example.org/'+type,sourceBadge:'Official',publishedAt:null})),total:3,page:0,hasMore:false,noFollows:false,followedTeamCount:1,followedSourceCount:1})})));
 render(<UnifiedFeedWall />);
 for(const type of ['video','article','podcast']){
  const button=await screen.findByRole('button',{name:'Share '+type+' item'});
  expect(button.closest('a')).toBeNull();
 }
});
it('offers sharing on both parent club videos and news articles',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>({ok:true,json:async()=>path.includes('/parent/feed') ? {videos:[{id:'v',title:'Club video',watchUrl:'https://example.org/video',publishedAt:'2026-11-03',matchReason:'Club'}],clubStates:[]} : {items:[{id:'n',title:'Club news',link:'https://example.org/news',sourceLabel:'Club'}]}})));
 render(<PpCommunityFeed />);
 expect(await screen.findByRole('button',{name:'Share Club video'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/^news$/i}));
 expect(await screen.findByRole('button',{name:'Share Club news'})).toBeInTheDocument();
});
