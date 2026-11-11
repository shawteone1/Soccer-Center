import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayerMediaTab from './PlayerMediaTab';
afterEach(() => vi.unstubAllGlobals());
it('filters photos and videos without changing stored assignments', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url:string) => ({ok:true,json:async () => url.endsWith('/media-assignments') ? { assignments:[
    {id:'photo',mediaId:'p',mediaType:'image',publicUrl:'/demo.jpg',caption:'Team photo'},
    {id:'video',mediaId:'v',mediaType:'video',publicUrl:'/demo.mp4',caption:'Goal video'}
  ], tableAvailable:true } : url.endsWith('/collections') ? {collections:[]} : {events:[]} })));
  render(<PlayerMediaTab playerId="demo" />);
  await screen.findByRole('button',{name:'Team photo'});
  fireEvent.click(screen.getByRole('button',{name:'Videos'}));
  expect(screen.queryByRole('button',{name:'Team photo'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Goal video'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Photos'}));
  expect(screen.getByRole('button',{name:'Team photo'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Goal video'})).not.toBeInTheDocument();
});
