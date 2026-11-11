import type { DeliveryReceipt } from "@/lib/portal/bulk-outreach";
export interface DeliveryPayload {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
}
export interface SendResult {
  state: "accepted" | "failed" | "unknown";
  providerId?: string;
  retryable: boolean;
}
export interface DeliveryStore {
  claim(input: {
    id: string;
    userId: string;
    batchId: string;
    messageId: string;
    email: string;
    hash: string;
  }): Promise<boolean>;
  read(id: string, userId: string, hash: string): Promise<DeliveryReceipt>;
  finish(id: string, userId: string, result: SendResult): Promise<void>;
}
export class OutreachError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** A timeout/5xx may follow acceptance. Never retry an uncertain send automatically. */
export async function sendWithResend(
  payload: DeliveryPayload,
  key: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const data = (await response.json()) as { id?: unknown };
      return typeof data.id === "string" && data.id.length <= 200
        ? { state: "accepted", providerId: data.id, retryable: false }
        : { state: "unknown", retryable: false };
    }
    if (response.status === 429) return { state: "failed", retryable: true };
    if ([400, 401, 403, 404, 413, 422].includes(response.status))
      return { state: "failed", retryable: false };
    return { state: "unknown", retryable: false };
  } catch {
    return { state: "unknown", retryable: false };
  }
}
export async function deliverOnce(
  store: DeliveryStore,
  input: Parameters<DeliveryStore["claim"]>[0],
  send: () => Promise<SendResult>,
): Promise<DeliveryReceipt> {
  if (!(await store.claim(input)))
    return store.read(input.id, input.userId, input.hash);
  let result: SendResult;
  try {
    result = await send();
  } catch {
    result = { state: "unknown", retryable: false };
  }
  // If persistence fails after provider acceptance, the durable 'sending' claim
  // remains blocked. Do not reset it, even after the provider's 24-hour TTL.
  await store.finish(input.id, input.userId, result);
  return store.read(input.id, input.userId, input.hash);
}
