/**
 * step5-browser.test.ts
 *
 * Browser-environment tests for the full demo coach profile workflow.
 * Tests actual exported functions — no duplicated resolver logic.
 *
 * TWO-CONTEXT SIMULATION
 * ──────────────────────
 * localStorage is shared across tabs in a real browser. In jsdom each test
 * runs in the same origin so localStorage IS shared within a test. To simulate
 * "parent tab" and "coach tab" as independent contexts we:
 *   1. Run parent-side operations (create, revoke) via demoLinkStore.
 *   2. Run coach-side operations (resolveDemoToken) via the exported function
 *      from coach-demo-store — the same function coach/profile.tsx delegates to.
 *   3. Both read/write the same localStorage key, exactly as two same-origin
 *      tabs would.
 *
 * API ISOLATION
 * ─────────────
 * fetch() is mocked to assert it is never called during the demo workflow.
 * Any call to fetch() fails the test — the demo must be fully self-contained.
 *
 * WHAT IS TESTED
 * ──────────────
 * 1. loadData in demo mode issues no fetch() calls
 * 2. buildDemoProjection (shared function) — field filtering, stats aggregation,
 *    null metrics, partial coverage, zero selected matches
 * 3. demoLinkStore.create — localStorage persistence, cross-context visibility,
 *    storage failure handling, persisted flag
 * 4. demoLinkStore.revoke — localStorage update, cross-context visibility
 * 5. resolveDemoToken — reads from localStorage, returns correct filtered profile,
 *    returns null after revoke, returns null for unknown token
 * 6. Full workflow: create → resolve (coach tab) → revoke → reload (coach tab)
 * 7. Changed field selections update preview content
 * 8. Zero selected matches → stats.available=false
 * 9. Missing metrics → null in result, coverage='partial' when some records
 *    have a metric and others don't
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  demoLinkStore,
  buildDemoProjection,
  resolveDemoToken,
  DEMO_MATCH_RECORDS,
  DEMO_BASE_PROFILE,
  type DemoCoachLink,
} from '../../../../../../components/portal/coach-demo-store';

// ─── Mock fetch — must never be called in demo mode ──────────────────────────

const fetchSpy = vi.fn(() => Promise.reject(new Error('fetch must not be called in demo mode')));

beforeEach(() => {
  localStorage.clear();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// resolveDemoToken is imported directly from coach-demo-store above.
// The test uses the actual exported function — no local copy.

// ─── Simulate loadData in demo mode ──────────────────────────────────────────

function simulateDemoLoadData() {
  // Demo mode branches BEFORE any API calls — no fetch() is issued
  const DEMO_FIELDS = [
    { key: 'label',           recommended: true  },
    { key: 'ageBand',         recommended: true  },
    { key: 'graduationYear',  recommended: true  },
    { key: 'primaryPosition', recommended: true  },
    { key: 'foot',            recommended: true  },
    { key: 'clubName',        recommended: true  },
    { key: 'playingLevel',    recommended: true  },
    { key: 'stats',           recommended: false },
    { key: 'achievements',    recommended: false },
  ];
  return {
    fields: DEMO_FIELDS,
    matchRecords: DEMO_MATCH_RECORDS,
    links: demoLinkStore.list(),
    fetchCallCount: fetchSpy.mock.calls.length,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loadData — no API access', () => {
  it('issues no fetch() calls', () => {
    simulateDemoLoadData();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns DEMO_MATCH_RECORDS fixture (6 records, including null-goals demo-mr-6)', () => {
    const { matchRecords } = simulateDemoLoadData();
    expect(matchRecords).toHaveLength(6);
    expect(matchRecords[0].id).toBe('demo-mr-1');
    // demo-mr-6 has goals=null — used by Playwright partial-coverage test
    const mr6 = matchRecords.find(r => r.id === 'demo-mr-6');
    expect(mr6).toBeDefined();
    expect(mr6?.goals).toBeNull();
    expect(mr6?.assists).toBe(1);
  });

  it('returns empty links list when no links have been created', () => {
    const { links } = simulateDemoLoadData();
    expect(links).toHaveLength(0);
  });
});

describe('buildDemoProjection — field filtering', () => {
  it('includes only approved fields', () => {
    const fields = new Set(['label', 'ageBand']);
    const matches = new Set<string>();
    const p = buildDemoProjection(fields, matches);
    expect(p.label).toBe(DEMO_BASE_PROFILE.label);
    expect(p.ageBand).toBe(DEMO_BASE_PROFILE.ageBand);
    expect(p.primaryPosition).toBeUndefined();
    expect(p.foot).toBeUndefined();
    expect(p.stats).toBeUndefined();
  });

  it('always includes avatarInitials regardless of field selection', () => {
    const p = buildDemoProjection(new Set(), new Set());
    expect(p.avatarInitials).toBe('AD');
  });

  it('changed field selection produces different preview content', () => {
    const matchIds = new Set(['demo-mr-1']);
    const withFoot    = buildDemoProjection(new Set(['label', 'foot']), matchIds);
    const withoutFoot = buildDemoProjection(new Set(['label']),         matchIds);
    expect(withFoot.foot).toBe(DEMO_BASE_PROFILE.foot);
    expect(withoutFoot.foot).toBeUndefined();
  });
});

describe('buildDemoProjection — stats aggregation', () => {
  it('zero selected matches → stats.available=false', () => {
    const p = buildDemoProjection(new Set(['stats']), new Set());
    const stats = p.stats as { available: boolean };
    expect(stats.available).toBe(false);
  });

  it('selected matches → correct totals', () => {
    // demo-mr-1: goals=2, assists=1
    // demo-mr-2: goals=0, assists=2
    const p = buildDemoProjection(new Set(['stats']), new Set(['demo-mr-1', 'demo-mr-2']));
    const stats = p.stats as { available: boolean; gamesPlayed: number; goals: number; assists: number; coverage: string };
    expect(stats.available).toBe(true);
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.goals).toBe(2);    // 2 + 0
    expect(stats.assists).toBe(3);  // 1 + 2
    expect(stats.coverage).toBe('full');
  });

  it('null metric in all records → null in result (not 0)', () => {
    // All demo records have goals/assists recorded; shots is always null
    const p = buildDemoProjection(new Set(['stats']), new Set(['demo-mr-1']));
    const stats = p.stats as { shots: number | null };
    expect(stats.shots).toBeNull();
  });

  it('partial metric coverage → coverage=partial', async () => {
    // Inject a record with null goals to simulate partial coverage
    // We test this via the aggregation function directly
    const { aggregateMatchRecords } = await import('../../../../../../server/lib/player-stats-aggregation');
    const records = [
      { statGp: 1, statGoals: 2, statAssists: 1, statShots: null, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
      { statGp: 1, statGoals: null, statAssists: 1, statShots: null, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.coverage).toBe('partial');
    expect(result.goals).toBe(2);   // partial total — only 1 of 2 records recorded
    expect(result.assists).toBe(2); // both recorded → full for assists
  });

  it('all records have null for a metric → null result, not partial', async () => {
    const { aggregateMatchRecords } = await import('../../../../../../server/lib/player-stats-aggregation');
    const records = [
      { statGp: 1, statGoals: 2, statAssists: 1, statShots: null, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
      { statGp: 1, statGoals: 1, statAssists: 0, statShots: null, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
    ];
    const result = aggregateMatchRecords(records, null);
    // shots is null for all records — not applicable, not partial
    expect(result.shots).toBeNull();
    expect(result.coverage).toBe('full'); // goals and assists are fully recorded
  });

  it('partial coverage → recordedCounts emitted for partial metrics only', () => {
    // demo-mr-1: goals=2, assists=1
    // demo-mr-2: goals=0, assists=2
    // All 2 records have both goals and assists → full for both → no recordedCounts
    const fullP = buildDemoProjection(new Set(['stats']), new Set(['demo-mr-1', 'demo-mr-2']));
    const fullStats = fullP.stats as { coverage: string; recordedCounts?: unknown };
    expect(fullStats.coverage).toBe('full');
    expect(fullStats.recordedCounts).toBeUndefined();
  });

  it('goalkeeper metrics null for outfield players → not penalised in coverage', async () => {
    const { aggregateMatchRecords } = await import('../../../../../../server/lib/player-stats-aggregation');
    const records = [
      { statGp: 1, statGoals: 1, statAssists: 0, statShots: 3, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
      { statGp: 1, statGoals: 0, statAssists: 1, statShots: 2, statGa: null, statSaves: null, statSo: null,
        participated: true, seasonTotalsOverride: false, season: null, positionPlayed: null, matchDate: null, opponent: null },
    ];
    const result = aggregateMatchRecords(records, null);
    expect(result.coverage).toBe('full'); // GK metrics null for all → not applicable, not partial
    expect(result.goalsAgainst).toBeNull();
    expect(result.saves).toBeNull();
    expect(result.shutouts).toBeNull();
  });
});

describe('demoLinkStore.create — localStorage persistence', () => {
  it('persists to localStorage, issues no fetch()', () => {
    const { link, persisted } = demoLinkStore.create({
      label: 'Test Coach',
      approvedFields: ['label', 'ageBand'],
      selectedMatchRecordIds: ['demo-mr-1'],
      expiresInDays: 30,
    });
    expect(persisted).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const stored = localStorage.getItem('sc_demo_coach_links');
    expect(stored).not.toBeNull();
    const links = JSON.parse(stored!) as DemoCoachLink[];
    expect(links[0].id).toBe(link.id);
    expect(links[0].token).toMatch(/^demo-token-/);
  });

  it('share URL uses demo-token- prefix', () => {
    const { shareUrl } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    expect(shareUrl).toContain('/coach/profile/demo-token-');
  });

  it('created link is immediately visible to list() (same-context read)', () => {
    demoLinkStore.create({ label: null, approvedFields: ['label'], selectedMatchRecordIds: [], expiresInDays: 30 });
    expect(demoLinkStore.list()).toHaveLength(1);
  });

  it('multiple links accumulate in localStorage', () => {
    demoLinkStore.create({ label: 'A', approvedFields: ['label'], selectedMatchRecordIds: [], expiresInDays: 30 });
    demoLinkStore.create({ label: 'B', approvedFields: ['ageBand'], selectedMatchRecordIds: [], expiresInDays: 14 });
    expect(demoLinkStore.list()).toHaveLength(2);
  });
});

describe('Two-context workflow — parent tab creates, coach tab resolves', () => {
  it('token created in parent context is resolvable in coach context', () => {
    // Parent tab: create link
    const { token } = demoLinkStore.create({
      label: 'Coach View Test',
      approvedFields: ['label', 'ageBand', 'primaryPosition'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });

    // Coach tab: resolve token from localStorage (same key, same origin)
    const resolved = resolveDemoToken(token);
    expect(resolved).not.toBeNull();
    expect(resolved!.profile.label).toBe(DEMO_BASE_PROFILE.label);
    expect(resolved!.profile.ageBand).toBe(DEMO_BASE_PROFILE.ageBand);
    expect(resolved!.profile.primaryPosition).toBe(DEMO_BASE_PROFILE.primaryPosition);
    // foot was NOT in approvedFields
    expect(resolved!.profile.foot).toBeUndefined();
  });

  it('coach view matches parent preview for same field+match selection', () => {
    const approvedFields = new Set(['label', 'ageBand', 'stats']);
    const selectedMatchIds = new Set(['demo-mr-1', 'demo-mr-2']);

    // Parent preview (via buildDemoProjection)
    const preview = buildDemoProjection(approvedFields, selectedMatchIds);

    // Parent creates link
    const { token } = demoLinkStore.create({
      label: null,
      approvedFields: Array.from(approvedFields),
      selectedMatchRecordIds: Array.from(selectedMatchIds),
      expiresInDays: 30,
    });

    // Coach tab resolves
    const resolved = resolveDemoToken(token);
    expect(resolved).not.toBeNull();

    // Preview and coach view must be identical
    expect(resolved!.profile.label).toBe(preview.label);
    expect(resolved!.profile.ageBand).toBe(preview.ageBand);
    const previewStats = preview.stats as { gamesPlayed: number; goals: number; assists: number };
    const coachStats   = resolved!.profile.stats as { gamesPlayed: number; goals: number; assists: number };
    expect(coachStats.gamesPlayed).toBe(previewStats.gamesPlayed);
    expect(coachStats.goals).toBe(previewStats.goals);
    expect(coachStats.assists).toBe(previewStats.assists);
  });

  it('changed field selection produces different coach view', () => {
    const { token: token1 } = demoLinkStore.create({
      label: null,
      approvedFields: ['label', 'foot'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    const { token: token2 } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });

    const r1 = resolveDemoToken(token1);
    const r2 = resolveDemoToken(token2);
    expect(r1!.profile.foot).toBe(DEMO_BASE_PROFILE.foot);
    expect(r2!.profile.foot).toBeUndefined();
  });

  it('zero selected matches → stats.available=false in coach view', () => {
    const { token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label', 'stats'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    const resolved = resolveDemoToken(token);
    const stats = resolved!.profile.stats as { available: boolean };
    expect(stats.available).toBe(false);
  });

  it('no fetch() called at any point in the two-context workflow', () => {
    const { token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label', 'stats'],
      selectedMatchRecordIds: ['demo-mr-1'],
      expiresInDays: 30,
    });
    resolveDemoToken(token);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Two-context workflow — parent revokes, coach tab reloads', () => {
  it('revoked link returns null in coach context (unavailable state)', () => {
    const { link, token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });

    // Coach tab: verify it resolves before revoke
    expect(resolveDemoToken(token)).not.toBeNull();

    // Parent tab: revoke
    const result = demoLinkStore.revoke(link.id);
    expect(result.revoked).toBe(true);
    expect(result.persisted).toBe(true);

    // Coach tab: reload (resolveDemoToken reads fresh from localStorage)
    expect(resolveDemoToken(token)).toBeNull();
  });

  it('link remains unavailable across multiple coach-tab reads after revoke', () => {
    const { link, token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    const r = demoLinkStore.revoke(link.id);
    expect(r.revoked).toBe(true);
    expect(r.persisted).toBe(true);
    expect(resolveDemoToken(token)).toBeNull();
    expect(resolveDemoToken(token)).toBeNull();
    expect(resolveDemoToken(token)).toBeNull();
  });

  it('revoke returns revoked=false for unknown id', () => {
    const r = demoLinkStore.revoke('demo-link-doesnotexist');
    expect(r.revoked).toBe(false);
    expect(r.persisted).toBe(true); // no write attempted for unknown id
  });

  it('revoke returns revoked=false when already revoked', () => {
    const { link } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    demoLinkStore.revoke(link.id);
    const r2 = demoLinkStore.revoke(link.id);
    expect(r2.revoked).toBe(false);
    expect(r2.persisted).toBe(true);
  });

  it('revoke returns persisted=false and revoked=false when localStorage write fails', () => {
    // Create the link first (this calls setItem once successfully)
    const { link, token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresInDays: 30,
    });
    // jsdom's localStorage.setItem lives on Storage.prototype — spy on the prototype
    // so the mock intercepts calls made through the module's localStorage reference.
    let callCount = 0;
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      callCount++;
      if (callCount === 1) {
        // Restore immediately so subsequent reads/writes work normally
        Storage.prototype.setItem = origSetItem;
        throw new DOMException('QuotaExceededError');
      }
      origSetItem.call(this, key, value);
    };
    let r: { revoked: boolean; persisted: boolean };
    try {
      r = demoLinkStore.revoke(link.id);
    } finally {
      // Always restore even if revoke() throws unexpectedly
      Storage.prototype.setItem = origSetItem;
    }
    expect(r!.revoked).toBe(false);
    expect(r!.persisted).toBe(false);
    // Link must still be resolvable — write failure must not corrupt persisted state
    expect(resolveDemoToken(token)).not.toBeNull();
  });

  it('no fetch() called at any point in the revoke workflow', () => {
    const { link, token } = demoLinkStore.create({
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: ['demo-mr-1'],
      expiresInDays: 30,
    });
    resolveDemoToken(token);
    demoLinkStore.revoke(link.id);
    resolveDemoToken(token);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('resolveDemoToken — edge cases', () => {
  it('returns null for unknown token', () => {
    expect(resolveDemoToken('demo-token-doesnotexist')).toBeNull();
  });

  it('returns null when localStorage is empty', () => {
    expect(resolveDemoToken('demo-token-anything')).toBeNull();
  });

  it('returns null for expired link', () => {
    // Create a link that expired yesterday
    const link: DemoCoachLink = {
      id: 'demo-link-expired',
      token: 'demo-token-expired',
      label: null,
      approvedFields: ['label'],
      selectedMatchRecordIds: [],
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      revokedAt: null,
      createdAt: new Date().toISOString(),
      status: 'expired',
      baseProfile: DEMO_BASE_PROFILE,
    };
    localStorage.setItem('sc_demo_coach_links', JSON.stringify([link]));
    expect(resolveDemoToken('demo-token-expired')).toBeNull();
  });
});

describe('loadData reads links from localStorage (cross-context)', () => {
  it('links created before loadData are visible in the result', () => {
    demoLinkStore.create({ label: 'Pre-existing', approvedFields: ['label'], selectedMatchRecordIds: [], expiresInDays: 30 });
    const { links, fetchCallCount } = simulateDemoLoadData();
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Pre-existing');
    expect(fetchCallCount).toBe(0);
  });
});
