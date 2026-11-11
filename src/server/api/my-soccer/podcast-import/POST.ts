import { fetchPublicText } from '@/server/lib/safe-outbound-text.js';
/**
 * POST /api/my-soccer/podcast-import
 *
 * Validates a user-supplied RSS URL as a podcast feed, extracts metadata,
 * and upserts a row in sc_sources so the user can follow it.
 *
 * Body: { feedUrl: string }
 *
 * Response:
 *   { ok: true, source: { id, label, feedEndpoint, notes } }
 *   { ok: false, error: string }
 *
 * The importKey is derived from the URL so re-importing the same feed
 * returns the existing row rather than creating a duplicate.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scSources } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';
import { randomUUID } from 'crypto';

function text(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim() || null;
}

function slugify(url: string): string {
  return url.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').slice(0, 120);
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { feedUrl } = req.body as { feedUrl?: string };
  if (!feedUrl || typeof feedUrl !== 'string') {
    res.status(400).json({ ok: false, error: 'feedUrl is required' });
    return;
  }

  let url: URL;
  try {
    url = new URL(feedUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid URL — must start with http:// or https://' });
    return;
  }

  // Fetch the feed
  let xml: string;
  try {
    xml = await fetchPublicText(url.toString(), {allowHttp:true,timeoutMs:10_000});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(422).json({ ok: false, error: `Could not fetch feed: ${msg}` });
    return;
  }

  // Basic validation — must look like RSS or Atom
  const isRss = xml.includes('<rss') || xml.includes('<channel>') || xml.includes('<item>');
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  if (!isRss && !isAtom) {
    res.status(422).json({ ok: false, error: 'URL does not appear to be an RSS or Atom feed' });
    return;
  }

  // Extract title and description
  const title = text(xml, 'title') ?? url.hostname;
  const description = text(xml, 'description') ?? text(xml, 'subtitle') ?? '';
  const siteLink = text(xml, 'link') ?? url.origin;

  const importKey = `podcast:custom:${slugify(url.toString())}`;

  // Upsert
  const existing = await db
    .select({ id: scSources.id, label: scSources.label })
    .from(scSources)
    .where(eq(scSources.importKey, importKey))
    .limit(1);

  let sourceId: string;
  let sourceLabel: string;

  if (existing.length > 0) {
    sourceId = existing[0].id;
    sourceLabel = existing[0].label ?? title;
    // Update feed endpoint in case URL changed
    await db.update(scSources).set({
      label: title,
      feedEndpoint: url.toString(),
      connectorEnabled: true,
      integrationStatus: 'rss',
    }).where(eq(scSources.importKey, importKey));
  } else {
    sourceId = randomUUID();
    sourceLabel = title;
    await db.insert(scSources).values({
      id: sourceId,
      importKey,
      label: title,
      url: siteLink,
      format: 'podcast',
      authority: 'fan',
      scope: 'general',
      integrationStatus: 'rss',
      feedEndpoint: url.toString(),
      connectorEnabled: true,
      notes: description.slice(0, 300) || 'User-imported podcast feed',
    });
  }

  res.json({
    ok: true,
    source: {
      id: sourceId,
      label: sourceLabel,
      feedEndpoint: url.toString(),
      notes: description.slice(0, 300),
      isNew: existing.length === 0,
    },
  });
}
