import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PublicCampDirectory from './PublicCampDirectory';

afterEach(cleanup);
it('starts with Colorado clubs and official links without a registration claim', () => {
  render(<PublicCampDirectory />);
  expect(screen.getByText('Colorado Storm')).toBeTruthy();
  expect(screen.getByText('Colorado United')).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.queryByText('Register now')).toBeNull();
});
it('shows program-only resources for Nevada and a useful empty search state', () => {
  render(<PublicCampDirectory />);
  fireEvent.click(screen.getByRole('button', { name: 'College camps & programs' }));
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'nevada' } });
  expect(screen.getAllByText('Program link · camp details unconfirmed')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getAllByRole('link')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'no-such-institution-xyz' } });
  expect(screen.getByText('No matches. Try a different search or region.')).toBeTruthy();
});
it('keeps unspecified California records accessible without assigning a region', () => {
  render(<PublicCampDirectory />);
  fireEvent.click(screen.getByRole('button', { name: 'College camps & programs' }));
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'california' } });
  expect(screen.getByText(/22 camp and program resources/)).toBeTruthy();
});
