/**
 * POST /api/admin/content/import — admin CSV import, idempotent by contentId.
 * Body: JSON { csv: "<csv text>" }
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/api/my-soccer/auth-guard.js';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseList(val: string): string[] {
  if (!val || val.trim() === '') return [];
  return val.split(';').map((s) => s.trim()).filter(Boolean);
}

export default async function handler(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const csvText: string = req.body?.csv;
  if (!csvText || typeof csvText !== 'string') return res.status(400).json({ error: 'csv field required' });

  const lines = csvText.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + at least one data row' });

  const headers = parseCsvLine(lines[0]);
  const dataLines = lines.slice(1);

  let inserted = 0, updated = 0;
  const invalid: string[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });

    const contentId = row['contentId'];
    if (!contentId) { invalid.push('Missing contentId'); continue; }
    const url = row['url'];
    if (!url || !url.startsWith('http')) { invalid.push(`${contentId}: invalid URL`); continue; }

    const recStatus = row['recommendationStatus'] ?? '';
    const adminStatus = recStatus.includes('admin-preview-required') ? 'pending' : 'approved';

    const record = {
      contentId,
      title: row['title'] || '',
      description: row['description'] || null,
      source: row['source'] || null,
      url,
      sourceUrl: row['sourceUrl'] || null,
      contentType: row['contentType'] || null,
      ageMin: row['ageMin'] ? parseInt(row['ageMin'], 10) : null,
      ageMax: row['ageMax'] ? parseInt(row['ageMax'], 10) : null,
      ageBasis: row['ageBasis'] || null,
      positions: JSON.stringify(parseList(row['positions'])),
      interests: JSON.stringify(parseList(row['interests'])),
      tags: JSON.stringify(parseList(row['tags'])),
      audience: JSON.stringify(parseList(row['audience'])),
      trainingMode: row['trainingMode'] || null,
      equipment: row['equipment'] || null,
      access: row['access'] || null,
      language: row['language'] || null,
      editorialPriority: row['editorialPriority'] ? parseInt(row['editorialPriority'], 10) : 2,
      providerUrl: row['providerUrl'] || null,
      providerBestFor: row['providerBestFor'] || null,
      providerAccess: row['providerAccess'] || null,
      youtubeVideoId: row['youtubeVideoId'] || null,
      reviewStatus: row['reviewStatus'] || null,
      playbackStatus: row['playbackStatus'] || null,
      deliveryMode: row['deliveryMode'] || null,
      checkedDate: row['checkedDate'] || null,
      reviewNotes: row['reviewNotes'] || null,
      recommendationStatus: recStatus || null,
      adminStatus,
    };

    try {
      const [existing] = await db.select({ contentId: scDevContent.contentId })
        .from(scDevContent).where(eq(scDevContent.contentId, contentId)).limit(1);
      if (existing) {
        await db.update(scDevContent).set(record).where(eq(scDevContent.contentId, contentId));
        updated++;
      } else {
        await db.insert(scDevContent).values(record);
        inserted++;
      }
    } catch (e) {
      invalid.push(`${contentId}: ${String(e).slice(0, 120)}`);
    }
  }

  res.json({ inserted, updated, invalid: invalid.length, invalidDetails: invalid });
}
