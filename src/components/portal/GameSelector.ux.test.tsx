import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameSelector from './GameSelector';
afterEach(() => vi.unstubAllGlobals());
it('only offers games while preserving the selected event and media count', async () => {
  const game = { id:'g', title:'Weekend match', startAt:'2026-11-03T01:30:00Z', endAt:null, location:null, notes:null, source:'manual', eventType:'game' };
  vi.stubGlobal('fetch', vi.fn(async (url:string) => ({ ok:true, json:async () => url.endsWith('/schedule') ? { events:[game, {...game,id:'p',title:'Practice session',eventType:'practice'}, {...game,id:'e',title:'Unclassified',eventType:'event'}] } : { assignments:[{gameEventRef:'g'}] } })));
  const select = vi.fn();
  render(<GameSelector playerId="demo" onSelect={select} />);
  fireEvent.click(screen.getByRole('button', {name:'Log stats for a scheduled game'}));
  await waitFor(() => expect(screen.getByText('Weekend match')).toBeInTheDocument());
  expect(screen.queryByText('Practice session')).not.toBeInTheDocument();
  expect(screen.queryByText('Unclassified')).not.toBeInTheDocument();
  expect(screen.getByText(/Nov 2, 2026/)).toHaveTextContent('6:30 PM');
  fireEvent.click(screen.getByText('Weekend match'));
  expect(select).toHaveBeenCalledWith(game);
});
