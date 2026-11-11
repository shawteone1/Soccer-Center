import { beforeEach, describe, expect, it, vi } from 'vitest';
const { resolve } = vi.hoisted(() => ({resolve:vi.fn()}));
vi.mock('./private-uploads.js', () => ({resolveUploadPath:resolve}));
import { playerPhotoPath } from './player-photo-path';
const asset='12345678-1234-1234-1234-123456789abc.png';
beforeEach(() => resolve.mockReset().mockReturnValue({found:true}));
describe('player photo revision resolution', () => {
 it('serves the recorded PNG even when an older JPEG exists', () => {
  expect(playerPhotoPath(`/api/parent/uploads/player-photo/p1?asset=${asset}`,'u1','p1')).toBe(`player-photos/u1/p1-${asset}`);
  expect(resolve).toHaveBeenCalledTimes(1);
 });
 it('does not fall back to an obsolete file if the recorded revision is missing', () => {
  resolve.mockReturnValue({found:false});
  expect(playerPhotoPath(`/api/parent/uploads/player-photo/p1?asset=${asset}`,'u1','p1')).toBeNull();
 });
 it('keeps old private photos readable', () => {
  expect(playerPhotoPath('/api/parent/uploads/player-photo/p1','u1','p1')).toBe('player-photos/u1/p1.jpg');
 });
 it('accepts only the owning player legacy path', () => {
  expect(playerPhotoPath('/airo-assets/uploads/player-photos/u1/p1.png','u1','p1')).toBe('player-photos/u1/p1.png');
  expect(playerPhotoPath('/airo-assets/uploads/player-photos/u2/p1.png','u1','p1')).toBeNull();
 });
 it.each(['../evil','other.png','%2e%2e%2fsecret'])('rejects untrusted asset %s', value => {
  expect(playerPhotoPath(`/api/parent/uploads/player-photo/p1?asset=${value}`,'u1','p1')).toBeNull();
 });
});
