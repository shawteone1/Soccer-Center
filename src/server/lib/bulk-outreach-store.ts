import { sql } from "drizzle-orm";
import { db } from "@/server/db/client.js";
import { MAX_COACHES, type DeliveryReceipt } from "@/lib/portal/bulk-outreach";
import {
  OutreachError,
  type DeliveryStore,
  type SendResult,
} from "./bulk-outreach-delivery";
type Row = {
  message_id: string;
  payload_hash: string;
  state: DeliveryReceipt["state"];
  retryable: number;
  attempts: number;
  wait_seconds: number;
};
function rows<T>(result: unknown): T[] {
  return (result as [T[]])[0];
}
function receipt(row: Row): DeliveryReceipt {
  return {
    messageId: row.message_id,
    state: row.state,
    retryable:
      row.state === "failed" && Boolean(row.retryable) && row.attempts < 3,
    retryAfterSeconds: Math.max(0, Number(row.wait_seconds) || 0),
  };
}
export const bulkDeliveryStore: DeliveryStore = {
  async claim(input) {
    return db.transaction(async (tx) => {
      // A durable per-user lock serializes limits and duplicate claims across instances.
      await tx.execute(sql`INSERT INTO sc_bulk_outreach_limits (user_id, quota_day, used_count)
        VALUES (${input.userId}, UTC_DATE(), 0) ON DUPLICATE KEY UPDATE user_id = user_id`);
      await tx.execute(
        sql`SELECT user_id FROM sc_bulk_outreach_limits WHERE user_id = ${input.userId} FOR UPDATE`,
      );
      const existing = rows<Row>(
        await tx.execute(sql`SELECT *, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), retry_at) AS wait_seconds
        FROM sc_bulk_outreach_delivery WHERE id = ${input.id} AND user_id = ${input.userId} FOR UPDATE`),
      )[0];
      if (existing) {
        if (existing.payload_hash !== input.hash)
          throw new OutreachError(
            409,
            "This message changed after preparation. Start a new batch after checking delivery history.",
          );
        if (!receipt(existing).retryable || existing.wait_seconds > 0)
          return false;
        await tx.execute(sql`UPDATE sc_bulk_outreach_delivery SET state = 'sending', retryable = FALSE, attempts = attempts + 1,
          updated_at = UTC_TIMESTAMP() WHERE id = ${input.id} AND user_id = ${input.userId}`);
        return true;
      }
      const duplicate = rows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM sc_bulk_outreach_delivery
        WHERE user_id = ${input.userId} AND batch_id = ${input.batchId} AND recipient_email = ${input.email}`),
      );
      if (duplicate.length)
        throw new OutreachError(
          409,
          "This recipient already has a message in this batch. Check delivery history.",
        );
      const count = rows<{ total: number }>(
        await tx.execute(sql`SELECT COUNT(*) AS total FROM sc_bulk_outreach_delivery
        WHERE user_id = ${input.userId} AND batch_id = ${input.batchId}`),
      )[0];
      if (Number(count.total) >= MAX_COACHES)
        throw new OutreachError(429, "Maximum 20 coaches per batch.");
      await tx.execute(
        sql`UPDATE sc_bulk_outreach_limits SET used_count = IF(quota_day = UTC_DATE(), used_count, 0), quota_day = UTC_DATE() WHERE user_id = ${input.userId}`,
      );
      const quota = rows<{ used_count: number }>(
        await tx.execute(
          sql`SELECT used_count FROM sc_bulk_outreach_limits WHERE user_id = ${input.userId}`,
        ),
      )[0];
      if (quota.used_count >= 100)
        throw new OutreachError(
          429,
          "Daily outreach limit reached. Try again tomorrow (UTC).",
        );
      await tx.execute(sql`INSERT INTO sc_bulk_outreach_delivery (id, user_id, batch_id, message_id, recipient_email, payload_hash, state)
        VALUES (${input.id}, ${input.userId}, ${input.batchId}, ${input.messageId}, ${input.email}, ${input.hash}, 'sending')`);
      await tx.execute(
        sql`UPDATE sc_bulk_outreach_limits SET used_count = used_count + 1 WHERE user_id = ${input.userId}`,
      );
      return true;
    });
  },
  async read(id, userId, hash) {
    const row = rows<Row>(
      await db.execute(sql`SELECT *, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), retry_at) AS wait_seconds
      FROM sc_bulk_outreach_delivery WHERE id = ${id} AND user_id = ${userId}`),
    )[0];
    if (!row || row.payload_hash !== hash)
      throw new OutreachError(
        409,
        "Message status could not be reconciled. Check delivery history.",
      );
    return receipt(row);
  },
  async finish(id: string, userId: string, result: SendResult) {
    await db.execute(sql`UPDATE sc_bulk_outreach_delivery SET state = ${result.state}, retryable = ${result.retryable},
      retry_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 60 SECOND), provider_id = ${result.providerId ?? null}, updated_at = UTC_TIMESTAMP()
      WHERE id = ${id} AND user_id = ${userId} AND state = 'sending'`);
  },
};
export async function deliveryHistory(userId: string) {
  return rows<Record<string, unknown>>(
    await db.execute(sql`SELECT batch_id AS batchId, message_id AS messageId,
    recipient_email AS recipientEmail, state, provider_id AS providerId, created_at AS createdAt
    FROM sc_bulk_outreach_delivery WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`),
  );
}
