import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PpInput, PpSelect } from './PpPrimitives';
import { getClubLogoAsset } from '../../lib/portal/club-logos';
afterEach(cleanup);
describe('member experience accessibility and badge identity', () => {
 it('associates a unique label and hint with each input and preserves editing', () => {
  const change = vi.fn();
  render(<><PpInput label="Player name" value="Sam" onChange={change} hint="Preferred name" /><PpInput label="Club" value="" onChange={vi.fn()} /></>);
  const input = screen.getByLabelText('Player name');
  expect(input.id).not.toBe(screen.getByLabelText('Club').id);
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Preferred name');
  fireEvent.change(input, {target:{value:'Alex'}}); expect(change).toHaveBeenCalledWith('Alex');
 });
 it('labels selects and preserves their change callback', () => {
  const change=vi.fn(); render(<PpSelect label="Season" value="" onChange={change} options={[{value:'2026',label:'2026'}]} />);
  fireEvent.change(screen.getByLabelText('Season'),{target:{value:'2026'}}); expect(change).toHaveBeenCalledWith('2026');
 });
 it('uses the known club ID ahead of an inconsistent name', () => {
  expect(getClubLogoAsset('Colorado Storm','colorado-84a99d75-ae7b-407d-b163-fac1f509b44a')).toBeNull();
 });
 it('supports exact verified names without assigning badges to legacy variants', () => {
  expect(getClubLogoAsset('Colorado Storm',null)).toBe('/club-logos/co-004.svg');
  expect(getClubLogoAsset('Colorado Storm - North',null)).toBeNull();
  expect(getClubLogoAsset('Unknown',null)).toBeNull();
 });
});
