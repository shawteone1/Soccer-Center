// ── Types ──────────────────────────────────────────────────────────────────────
export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  isoDate: string | null;
  description: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  duration: string | null;
  imageUrl: string | null;
}

// ── XML helpers ────────────────────────────────────────────────────────────────
function text(xml: string, tag: string): string | null {
  // Handles <tag>value</tag> and <ns:tag>value</ns:tag>
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeEntities(m[1].trim()) || null;
}

function attr(xml: string, tag: string, attribute: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${attribute}\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() || null : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

function toIso(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

// ── RSS/Atom parser ────────────────────────────────────────────────────────────
export function parseRss(xml: string): RssItem[] {
  const document = xml.replace(/^\uFEFF/, '').replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim();
  // An HTML error page must not be cached as a successful empty feed.
  if (!/^<(?:[\w.-]+:)?(?:rss|feed|RDF)(?:\s|>)/i.test(document)) throw new Error('Invalid feed document');
  const isAtom = /^<(?:[\w.-]+:)?feed(?:\s|>)/i.test(document);
  const items: RssItem[] = [];

  if (isAtom) {
    // Atom: split on <entry>
    const entryRe = /<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null && items.length < 30) {
      const chunk = m[1];
      const title = text(chunk, 'title') ?? '(no title)';
      // Atom link: <link href="..." rel="alternate"/>
      const links = chunk.match(/<(?:[\w.-]+:)?link\b[^>]*>/gi) ?? [];
      const alternate = links.find(link => {
        const rel = attr(link, 'link', 'rel');
        return !rel || rel === 'alternate';
      });
      const enclosure = links.find(link => attr(link, 'link', 'rel') === 'enclosure');
      const linkHref = alternate ? attr(alternate, 'link', 'href') : null;
      const pubDate = text(chunk, 'published') ?? text(chunk, 'updated');
      const description = stripHtml(text(chunk, 'summary') ?? text(chunk, 'content'));
      items.push({
        title,
        link: linkHref ?? '',
        pubDate,
        isoDate: toIso(pubDate),
        description,
        enclosureUrl: enclosure ? attr(enclosure, 'link', 'href') : null,
        enclosureType: enclosure ? attr(enclosure, 'link', 'type') : null,
        duration: null,
        imageUrl: null,
      });
    }
  } else {
    // RSS 2.0: split on <item>
    const itemRe = /<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && items.length < 30) {
      const chunk = m[1];
      const title = text(chunk, 'title') ?? '(no title)';
      const link = text(chunk, 'link') ?? attr(chunk, 'link', 'href') ?? '';
      const pubDate = text(chunk, 'pubDate') ?? text(chunk, 'published');
      const description = stripHtml(text(chunk, 'description') ?? text(chunk, 'summary'));

      // Enclosure: <enclosure url="..." type="audio/mpeg" length="..."/>
      const enclosureUrl = attr(chunk, 'enclosure', 'url');
      const enclosureType = attr(chunk, 'enclosure', 'type');

      // iTunes duration: <itunes:duration>
      const duration = text(chunk, 'duration');

      // Image: <itunes:image href="..."/> or <media:thumbnail url="..."/>
      const imageUrl =
        attr(chunk, 'image', 'href') ??
        attr(chunk, 'thumbnail', 'url') ??
        null;

      items.push({
        title,
        link,
        pubDate,
        isoDate: toIso(pubDate),
        description,
        enclosureUrl,
        enclosureType,
        duration,
        imageUrl,
      });
    }
  }

  return items;
}
