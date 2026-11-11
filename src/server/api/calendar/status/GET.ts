import type { Request, Response } from 'express';
export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store');
  return res.status(410).json({error:'INTEGRATION_UNAVAILABLE'});
}
