/**
 * GET /api/my-soccer/recommendations
 *
 * Deterministic content matching — no AI required.
 *
 * Scoring (additive):
 *   +40  age suitability (ageYears falls within ageMin–ageMax, or no age constraint)
 *   +30  position match (any player position appears in content positions, or content has no position filter)
 *   +20  interest / development interest match (any overlap)
 *   +15  training mode match (or content has no mode / 'any')
 *   +10  fan interest match (league/competition name appears in tags or title)
 *   -10  editorial priority 3 (low)
 *   +5   editorial priority 1 (high)
 *
 * Returns top N items (default 12) sorted by score desc, then editorialPriority asc.
 * Each item includes a matchReason string.
 *
 * Fan-only members get content where audience includes 'fan' or is empty.
 * Player members get content where audience includes 'player' or 'coach' or is empty.
 */
import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { scDevContent, scMemberProfiles, scPlayerProfiles, scSavedItems } from '@/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '@/server/api/my-soccer/auth-guard.js';

const parseJson = (v: string | null | undefined): string[] => {
  try { return v ? JSON.parse(v) : []; } catch { return []; }
};

interface ContentRow {
  contentId: string;
  title: string | null;
  description: string | null;
  source: string | null;
  contentType: string | null;
  ageMin: number | null;
  ageMax: number | null;
  positions: string | null;
  interests: string | null;
  tags: string | null;
  audience: string | null;
  trainingMode: string | null;
  access: string | null;
  youtubeVideoId: string | null;
  url: string;
  editorialPriority: number | null;
}

function scoreItem(
  item: ContentRow,
  ageYears: number | null,
  playerPositions: string[],
  devInterests: string[],
  trainingMode: string | null,
  fanInterests: string[],
  memberType: string,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const itemPositions = parseJson(item.positions).map((p) => p.toLowerCase());
  const itemInterests = parseJson(item.interests).map((i) => i.toLowerCase());
  const itemTags = parseJson(item.tags).map((t) => t.toLowerCase());

  // Age suitability
  if (ageYears !== null) {
    const min = item.ageMin ?? 0;
    const max = item.ageMax ?? 99;
    if (ageYears >= min && ageYears <= max) {
      score += 40;
      reasons.push(`Good for age ${ageYears}`);
    } else if (item.ageMin === null && item.ageMax === null) {
      score += 20; // no age constraint — partial credit
    }
  } else if (item.ageMin === null && item.ageMax === null) {
    score += 20;
  }

  // Position match
  if (playerPositions.length > 0 && itemPositions.length > 0) {
    const matchedPos = playerPositions.filter((p) => itemPositions.some((ip) => ip.includes(p.toLowerCase()) || p.toLowerCase().includes(ip)));
    if (matchedPos.length > 0) {
      score += 30;
      reasons.push(`Matches ${matchedPos[0]} position`);
    }
  } else if (itemPositions.length === 0) {
    score += 15; // no position filter — broadly applicable
  }

  // Development interest match
  if (devInterests.length > 0) {
    const matchedInterests = devInterests.filter((di) =>
      itemInterests.some((ii) => ii.includes(di.toLowerCase()) || di.toLowerCase().includes(ii)) ||
      itemTags.some((t) => t.includes(di.toLowerCase()) || di.toLowerCase().includes(t))
    );
    if (matchedInterests.length > 0) {
      score += 20;
      reasons.push(`Covers ${matchedInterests[0]}`);
    }
  }

  // Training mode match
  if (trainingMode && item.trainingMode) {
    if (item.trainingMode === 'any' || item.trainingMode === trainingMode) {
      score += 15;
      reasons.push(`${trainingMode} training`);
    }
  } else if (!item.trainingMode) {
    score += 8;
  }

  // Fan interest match (league/competition names in tags or title)
  if ((memberType === 'fan' || memberType === 'both') && fanInterests.length > 0) {
    const titleLower = (item.title ?? '').toLowerCase();
    const matchedFan = fanInterests.filter((fi) => {
      const fiLower = fi.toLowerCase();
      return itemTags.some((t) => t.includes(fiLower) || fiLower.includes(t)) ||
        titleLower.includes(fiLower);
    });
    if (matchedFan.length > 0) {
      score += 10;
      reasons.push(`Related to ${matchedFan[0]}`);
    }
  }

  // Editorial priority adjustment
  const priority = item.editorialPriority ?? 2;
  if (priority === 1) { score += 5; }
  if (priority === 3) { score -= 10; }

  return { score, reasons };
}

export default async function handler(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const limitParam = parseInt((req.query.limit as string) ?? '12', 10);
  const limit = Math.min(limitParam, 50);

  // Load member profile + player profiles in parallel
  const [profileRows, playerRows, savedRows, contentRows] = await Promise.all([
    db.select().from(scMemberProfiles).where(eq(scMemberProfiles.userId, userId)).limit(1),
    db.select().from(scPlayerProfiles).where(eq(scPlayerProfiles.userId, userId)).orderBy(desc(scPlayerProfiles.sortOrder)),
    db.select({ contentId: scSavedItems.contentId }).from(scSavedItems).where(eq(scSavedItems.userId, userId)),
    db.select().from(scDevContent).where(eq(scDevContent.adminStatus, 'approved')),
  ]);

  const profile = profileRows[0] ?? null;
  const memberType = profile?.memberType ?? 'fan';
  const fanInterests = parseJson(profile?.fanInterests).map((f) => f.toLowerCase());
  const savedIds = new Set(savedRows.map((s) => s.contentId));

  // Aggregate player signals across all player profiles
  const allPositions = Array.from(new Set(
    playerRows.flatMap((p) => parseJson(p.positions))
  )).map((p) => p.toLowerCase());

  const allDevInterests = Array.from(new Set(
    playerRows.flatMap((p) => parseJson(p.developmentInterests))
  )).map((i) => i.toLowerCase());

  // Use youngest player's age for age matching (most restrictive / most relevant)
  const ages = playerRows.map((p) => p.ageYears).filter((a): a is number => a !== null);
  const ageYears = ages.length > 0 ? Math.min(...ages) : null;

  // Preferred training mode from first player profile
  const trainingMode = playerRows[0]?.trainingMode ?? null;

  // Filter content by audience
  const audienceFiltered = contentRows.filter((item) => {
    const audience = parseJson(item.audience).map((a) => a.toLowerCase());
    if (audience.length === 0) return true;
    if (memberType === 'fan') return audience.includes('fan') || audience.includes('viewer');
    if (memberType === 'player') return audience.includes('player') || audience.includes('coach') || audience.includes('parent');
    return true; // 'both' sees everything
  });

  // Score all items
  const scored = audienceFiltered.map((item) => {
    const { score, reasons } = scoreItem(
      item, ageYears, allPositions, allDevInterests, trainingMode, fanInterests, memberType
    );
    return { item, score, reasons };
  });

  // Sort: score desc, then editorialPriority asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.item.editorialPriority ?? 2) - (b.item.editorialPriority ?? 2);
  });

  const top = scored.slice(0, limit);
  const hasGoodMatch = top.some((r) => r.score >= 40);

  res.json({
    hasGoodMatch,
    memberType,
    recommendations: top.map(({ item, score, reasons }) => ({
      contentId: item.contentId,
      title: item.title,
      description: item.description,
      source: item.source,
      contentType: item.contentType,
      ageMin: item.ageMin,
      ageMax: item.ageMax,
      positions: parseJson(item.positions),
      interests: parseJson(item.interests),
      tags: parseJson(item.tags),
      audience: parseJson(item.audience),
      trainingMode: item.trainingMode,
      access: item.access,
      youtubeVideoId: item.youtubeVideoId,
      playbackStatus: item.playbackStatus,
      url: item.url,
      editorialPriority: item.editorialPriority,
      score,
      matchReason: reasons.slice(0, 2).join(' · ') || 'Recommended for you',
      isSaved: savedIds.has(item.contentId),
    })),
  });
}
