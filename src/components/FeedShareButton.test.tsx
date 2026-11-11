import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedShareButton, { publicFeedUrl } from './FeedShareButton';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('public feed sharing', () => {
 it('shares the original source through the native sheet', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  render(<FeedShareButton title="Match video" url="https://youtube.com/watch?v=abc" />);
  fireEvent.click(screen.getByRole('button', { name: 'Share Match video' }));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ title:'Match video', url:'https://youtube.com/watch?v=abc' }));
 });
 it('offers Copy link when native sharing is unavailable', async () => {
  Object.defineProperty(navigator,'share',{ configurable:true, value:undefined });
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{ configurable:true, value:{writeText} });
  render(<FeedShareButton title="Article" url="https://example.org/story" />);
  fireEvent.click(screen.getByRole('button',{name:'Share Article'}));
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  expect(await screen.findByText('Link copied')).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith('https://example.org/story');
 });
 it('does not report copied when the clipboard is denied', async () => {
  Object.defineProperty(navigator,'share',{ configurable:true, value:undefined });
  Object.defineProperty(navigator,'clipboard',{ configurable:true, value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))} });
  render(<FeedShareButton title="Article" url="https://example.org/story" />);
  fireEvent.click(screen.getByRole('button',{name:'Share Article'}));
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
  expect(await screen.findByText('Select and copy the link below.')).toBeInTheDocument();
  expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
 });
 it('treats native cancellation as cancellation', async () => {
  Object.defineProperty(navigator,'share',{ configurable:true, value:vi.fn().mockRejectedValue(new DOMException('Cancelled','AbortError')) });
  render(<FeedShareButton title="Episode" url="https://example.org/episode" />);
  fireEvent.click(screen.getByRole('button',{name:'Share Episode'}));
  await new Promise(r => setTimeout(r,0));
  expect(screen.queryByText('Copy link')).not.toBeInTheDocument();
 });
 it.each(['javascript:alert(1)','/api/parent/uploads/media/1','https://soccercenter.org/coach/profile/private','https://example.org/a?token=secret','https://user:pass@example.org/a'])('blocks private or unsafe URL %s', url => {
  expect(publicFeedUrl(url)).toBeNull();
 });
});
