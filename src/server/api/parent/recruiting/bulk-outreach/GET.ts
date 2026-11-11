import type { Request, Response } from "express";
import {
  bulkAccess,
  outreachFailure,
  senderConfig,
} from "../../../../lib/bulk-outreach-access";
import { deliveryHistory } from "../../../../lib/bulk-outreach-store";
export default async function handler(req: Request, res: Response) {
  const user = await bulkAccess(req, res);
  if (!user) return;
  try {
    // History remains readable when provider configuration needs repair.
    const history = await deliveryHistory(user.id);
    try {
      senderConfig();
      res.json({ ready: true, history, replyTo: user.email });
    } catch {
      res.json({
        ready: false,
        history,
        replyTo: user.email,
        message: "Email provider setup is required before sending.",
      });
    }
  } catch (error) {
    outreachFailure(res, error);
  }
}
