import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LockedInWalkthrough from './LockedInWalkthrough';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function verify() {
  fireEvent.click(screen.getByLabelText(/I understand this is a simulated/));
  fireEvent.click(screen.getByRole('button', { name: /Start simulated verification/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Simulate verified response' }));
}
it('requires consent before starting; the club sees no summary before sharing', () => {
  render(<LockedInWalkthrough />);
  expect((screen.getByRole('button', { name: /Start simulated verification/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Club view' }));
  expect(screen.getByText(/No parent-approved summary available/)).toBeTruthy();
});
it('keeps review-required responses out of the sharing flow', () => {
  render(<LockedInWalkthrough />);
  fireEvent.click(screen.getByLabelText(/I understand this is a simulated/));
  fireEvent.click(screen.getByRole('button', { name: /Start simulated verification/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Simulate needs review' }));
  expect(screen.getByText(/Simulated: more information required/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Simulate sharing with club' })).toBeNull();
});
it('shares only selected fields, revokes and requires fresh approval on a new handoff without network calls', () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  render(<LockedInWalkthrough />); verify();
  fireEvent.click(screen.getByLabelText('Verification reference (optional)'));
  fireEvent.click(screen.getByLabelText(/I approve sharing only/));
  fireEvent.click(screen.getByRole('button', { name: 'Simulate sharing with club' }));
  expect(screen.getByText('DEMO-NSID-1042')).toBeTruthy();
  expect(screen.queryByText('U15 — illustrative only')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Return to parent controls' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke demo access' }));
  fireEvent.click(screen.getByRole('button', { name: 'Club view' }));
  expect(screen.getByText('Access revoked — sample summary unavailable.')).toBeTruthy();
  expect(screen.queryByText('DEMO-NSID-1042')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Return to parent controls' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review a new handoff' }));
  expect((screen.getByRole('button', { name: 'Simulate sharing with club' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('changing selected fields clears approval and remount resets all demo state', () => {
  const { rerender } = render(<LockedInWalkthrough key={0} />); verify();
  fireEvent.click(screen.getByLabelText(/I approve sharing only/));
  fireEvent.click(screen.getByLabelText('Age-group eligibility (optional)'));
  expect((screen.getByRole('button', { name: 'Simulate sharing with club' }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<LockedInWalkthrough key={1} />);
  expect((screen.getByRole('button', { name: /Start simulated verification/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getByText('Demo activity').closest('details')!).getByText(/No actions yet/)).toBeTruthy();
});
