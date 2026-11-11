import { describe, it, expect } from 'vitest';
import { parseRss } from './rss-parser';

describe('RSS/Atom normalization', () => {
  it.each(['"', "'"])('reads Atom namespace using %s quotes', q => {
    const result = parseRss(`<feed xmlns=${q}http://www.w3.org/2005/Atom${q}><entry><title>News</title><link rel="self" href="https://example.test/api"/><link rel="alternate" href="https://example.test/story"/><updated>2026-10-29</updated></entry></feed>`);
    expect(result).toHaveLength(1);
    expect(result[0].link).toBe('https://example.test/story');
    expect(result[0].title).toBe('News');
  });
  it('reads prefixed Atom entries and podcast enclosures', () => {
    const result = parseRss(`<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry><atom:title>Episode</atom:title><atom:link rel = 'enclosure' href = 'https://example.test/audio.mp3' type='audio/mpeg'/></atom:entry></atom:feed>`);
    expect(result[0].enclosureUrl).toBe('https://example.test/audio.mp3');
  });
  it('normalizes RSS, CDATA and dates', () => {
    const result = parseRss('<rss version="2.0"><channel><item><title><![CDATA[One &amp; Two]]></title><link>https://example.test/story</link><pubDate>bad date</pubDate></item></channel></rss>');
    expect(result[0].title).toBe('One & Two');
    expect(result[0].isoDate).toBeNull();
  });
  it('rejects HTML upstream errors instead of silently returning no stories', () => {
    expect(() => parseRss('<!doctype html><html>Forbidden</html>')).toThrow();
  });
  it('allows valid empty feeds', () => expect(parseRss('<rss><channel></channel></rss>')).toEqual([]));
});
