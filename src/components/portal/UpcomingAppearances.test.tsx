import {it,expect,vi,afterEach} from 'vitest';import {render,screen,fireEvent} from '@testing-library/react';import UpcomingAppearances from './UpcomingAppearances';
afterEach(()=>vi.unstubAllGlobals());
it('shows upcoming appearances but not practices or past events',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({events:[{id:'c',title:'Future camp',startAt:'2099-12-01T17:00:00Z',eventType:'camp',source:'manual'},{id:'p',title:'Practice',startAt:'2099-12-01T17:00:00Z',eventType:'practice',source:'manual'},{id:'o',title:'Past match',startAt:'2020-01-01T17:00:00Z',eventType:'game',source:'manual'}]})})));
 const manage=vi.fn();render(<UpcomingAppearances playerId="p" onManage={manage}/>);await screen.findByText('Future camp');expect(screen.queryByText('Practice')).not.toBeInTheDocument();expect(screen.queryByText('Past match')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Manage schedule'}));expect(manage).toHaveBeenCalled();
});
it('shows a retry action instead of an empty schedule when loading fails',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));render(<UpcomingAppearances playerId="p" onManage={vi.fn()}/>);await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument();expect(screen.queryByText(/No upcoming events/)).not.toBeInTheDocument();});
