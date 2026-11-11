import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client.js";
import { getCoachLinkStore } from "@/server/lib/coach-link-store.js";
import {
  bulkMessageSchema,
  coachToken,
  outreachEmailText,
} from "@/lib/portal/bulk-outreach";
import {
  bulkAccess,
  outreachFailure,
  senderConfig,
  secret,
} from "../../../../lib/bulk-outreach-access";
import { bulkDeliveryStore } from "../../../../lib/bulk-outreach-store";
import {
  deliverOnce,
  OutreachError,
  sendWithResend,
} from "../../../../lib/bulk-outreach-delivery";
import { unverifiedCoachKeys } from "../_recruiting-data.js";
import { OUTREACH_AGE_GROUPS } from "../_guard.js";
export default async function handler(req: Request, res: Response) {
  const user = await bulkAccess(req, res);
  if (!user) return;
  try {
    const config = senderConfig();
    if (req.get("origin") !== config.origin || !req.is("application/json"))
      throw new OutreachError(
        403,
        "Use the signed-in Soccer Center page to send outreach.",
      );
    const parsed = bulkMessageSchema.safeParse(req.body);
    if (!parsed.success)
      throw new OutreachError(
        400,
        "Review the recipient, subject, message, profile assignments and consent.",
      );
    const message = parsed.data;
    const result =
      await db.execute(sql`SELECT c.name, c.email, c.import_key, p.institution
      FROM sc_college_coaches c JOIN sc_college_programs p ON p.id = c.program_id
      WHERE c.id = ${message.coachId} AND c.active = 1 AND p.active = 1 LIMIT 1`);
    const coach = (
      result as unknown as [
        Array<{
          name: string | null;
          email: string | null;
          import_key: string;
          institution: string;
        }>,
      ]
    )[0][0];
    if (
      !coach ||
      unverifiedCoachKeys.has(coach.import_key) ||
      coach.email?.trim().toLowerCase() !== message.recipientEmail ||
      (coach.name || "Coach") !== message.coachName ||
      coach.institution !== message.institution
    )
      throw new OutreachError(
        409,
        "Coach details changed or are no longer available. Reload the directory and review before sending.",
      );
    const store = getCoachLinkStore(secret);
    if (!store)
      throw new OutreachError(
        503,
        "Durable coach-link storage is unavailable.",
      );
    for (const profile of message.profiles) {
      const token = coachToken(profile.url, config.origin);
      const link = token ? await store.findByToken(token) : null;
      if (
        !link ||
        link.id !== profile.linkId ||
        link.userId !== user.id ||
        link.playerId !== profile.playerId ||
        link.demoMode ||
        link.revokedAt ||
        !link.expiresAt ||
        link.expiresAt.getTime() <= Date.now() ||
        !link.approvedFields.length
      )
        throw new OutreachError(
          409,
          "A selected profile link is unavailable, expired, revoked or not owned by you. Review its sharing permissions.",
        );
      const players =
        await db.execute(sql`SELECT age_band FROM sc_player_profiles WHERE id = ${profile.playerId}
        AND user_id = ${user.id} AND deleted_at IS NULL LIMIT 1`);
      const player = (
        players as unknown as [Array<{ age_band: string }>]
      )[0][0];
      if (!player || !OUTREACH_AGE_GROUPS.has(player.age_band))
        throw new OutreachError(
          403,
          "Every selected player must be owned by you and in U16–U19.",
        );
    }
    const payload = {
      from: config.from,
      to: [message.recipientEmail],
      reply_to: user.email,
      subject: message.subject,
      text: outreachEmailText(message),
    };
    const id = createHash("sha256")
      .update(JSON.stringify([user.id, message.messageId]))
      .digest("hex");
    const hash = createHash("sha256")
      .update(JSON.stringify({ message, payload }))
      .digest("hex");
    const receipt = await deliverOnce(
      bulkDeliveryStore,
      {
        id,
        userId: user.id,
        batchId: message.batchId,
        messageId: message.messageId,
        email: message.recipientEmail,
        hash,
      },
      () => sendWithResend(payload, `soccer-outreach/${id}`, config.apiKey),
    );
    res.json(receipt);
  } catch (error) {
    outreachFailure(res, error);
  }
}
