/**
 * Server-side YouTube highlights refresh scheduler.
 *
 * Checks for due channels every 60 seconds.
 * Each channel refreshes at most every 4 hours (atomic DB claim).
 * First run is delayed 2 minutes after boot so the server is fully ready.
 *
 * This job runs only in production (import.meta.env.PROD).
 * The public GET /api/highlights endpoint NEVER triggers YouTube calls.
 */

import { getHighlightsFeedService } from './highlights-cache.js';

let _timer: ReturnType<typeof setInterval> | null = null;
let _initialTimeout: ReturnType<typeof setTimeout> | null = null;

async function runRefresh(): Promise<void> {
  try {
    const service = getHighlightsFeedService();
    await service.refreshDue();
  } catch (err) {
    console.error('highlights.scheduler.error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startHighlightsRefreshScheduler(): void {
  if (_timer !== null) return; // already running

  // First run: 2 minutes after boot
  _initialTimeout = setTimeout(() => {
    void runRefresh();
    // Then every 60 seconds
    _timer = setInterval(() => {
      void runRefresh();
    }, 60_000);
    if (_timer.unref) _timer.unref();
  }, 2 * 60 * 1000);

  if (_initialTimeout.unref) _initialTimeout.unref();
  console.log('highlights.scheduler.started');
}

export function stopHighlightsRefreshScheduler(): void {
  if (_initialTimeout !== null) {
    clearTimeout(_initialTimeout);
    _initialTimeout = null;
  }
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}
