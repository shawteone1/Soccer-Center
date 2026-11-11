import type { Request, Response } from 'express';
/** Retired global-token prototype. Existing per-user iCal subscriptions are unchanged. */
export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({error:'INTEGRATION_UNAVAILABLE', message:'Use a calendar subscription link or manual events. Direct provider integration is not enabled.'});
}
