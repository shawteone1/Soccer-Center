import { it, expect, vi, afterEach } from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import AppearanceForm from './AppearanceForm';
afterEach(()=>vi.unstubAllGlobals());
it.each(['camp','tournament','showcase'])('saves %s against the current player',async type=>{
 const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>({ok:true}));vi.stubGlobal('fetch',fetcher);const saved=vi.fn();
 render(<AppearanceForm playerId="player-1" onSaved={saved} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Event type'),{target:{value:type}});
 fireEvent.change(screen.getByLabelText('Event name'),{target:{value:'Winter appearance'}});
 fireEvent.change(screen.getByLabelText(/Start date and time/),{target:{value:'2026-12-01T10:00'}});
 fireEvent.click(screen.getByRole('button',{name:'Save event'}));await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toMatchObject({playerId:'player-1',eventType:type,title:'Winter appearance'});
});
it('keeps entries and reports failure without claiming a save',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));const saved=vi.fn();render(<AppearanceForm playerId="p" onSaved={saved} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Event name'),{target:{value:'Keep this name'}});fireEvent.change(screen.getByLabelText(/Start date and time/),{target:{value:'2026-12-01T10:00'}});
 fireEvent.click(screen.getByRole('button',{name:'Save event'}));await screen.findByRole('alert');expect(saved).not.toHaveBeenCalled();expect(screen.getByLabelText('Event name')).toHaveValue('Keep this name');
});
