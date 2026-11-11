/**
 * POST /api/highlights/refresh
 *
 * Triggers an immediate YouTube highlights refresh for all due channels.
 * Protected by Bearer token (SOCCER_TRYOUT_WRITE_TOKEN).
 * Used for the first-run after setting CHANNELS_VERIFIED=true.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getHighlightsFeedService } from '../../../highlights-cache.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  const token = (() => {
    const v = getSecret('SOCCER_TRYOUT_WRITE_TOKEN');
    return typeof v === 'string' ? v : '';
  })();

  const auth = req.headers.authorization ?? '';
  if (!token || auth !== `Bearer ${token}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const service = getHighlightsFeedService();
    // Run in background — don't hold the HTTP connection open for 21 channels
    void service.refreshDue().catch((err: unknown) => {
      console.error('highlights.refresh.manual.error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    res.json({ ok: true, message: 'Refresh started in background.' });
  } catch (err) {
    console.error('highlights.refresh.manual.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Failed to start refresh.' });
  }
}
