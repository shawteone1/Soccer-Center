import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
vi.mock('./PpCalendarConnections', () => ({ default: () => null }));
vi.mock('./CalendarViews', () => ({
 MonthView: ({ events }: {events:Array<{id:string;title:string}>}) => <div>{events.map(e => <span key={e.id}>{e.title}</span>)}</div>,
 WeekView: () => null,
}));
import PpCalendarTab from './PpCalendarTab';
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it('removes deleted player events, preserves a sibling and family events, and clears the last player', async () => {
 const event=(id:string,title:string,playerId:string|null=null) => ({id,title,playerId,startAt:'2026-11-03T18:00:00Z',allDay:false,eventType:'game',source:'feed'});
 vi.stubGlobal('fetch',vi.fn(async (path:string) => ({ok:true,json:async () => ({events:
  path.includes('/p1/schedule') ? [event('e1','Deleted child game')] :
  path.includes('/p2/schedule') ? [event('e2','Sibling game')] :
  [event('m1','Deleted manual event','p1'), event('m2','Family event')]
 })})));
 const {rerender}=render(<PpCalendarTab players={[{id:'p1',label:'One'},{id:'p2',label:'Two'}]} />);
 await waitFor(() => expect(screen.getAllByText('Deleted child game').length).toBeGreaterThan(0));
 rerender(<PpCalendarTab players={[{id:'p2',label:'Two'}]} />);
 await waitFor(() => expect(screen.queryByText('Deleted child game')).not.toBeInTheDocument());
 expect(screen.queryByText('Deleted manual event')).not.toBeInTheDocument();
 expect(screen.getAllByText('Sibling game').length).toBeGreaterThan(0);
 expect(screen.getAllByText('Family event').length).toBeGreaterThan(0);
 rerender(<PpCalendarTab players={[]} />);
 await waitFor(() => expect(screen.queryByText('Sibling game')).not.toBeInTheDocument());
 expect(screen.getAllByText('Family event').length).toBeGreaterThan(0);
});
