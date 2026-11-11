// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  deliverOnce,
  sendWithResend,
  type DeliveryStore,
  type SendResult,
} from "./bulk-outreach-delivery";
import type { DeliveryReceipt } from "@/lib/portal/bulk-outreach";
const input = {
  id: "id",
  userId: "owner",
  batchId: "batch",
  messageId: "message",
  email: "coach@example.edu",
  hash: "hash",
};
const payload = {
  from: "sender@example.org",
  to: ["coach@example.edu"],
  reply_to: "parent@example.org",
  subject: "Test",
  text: "Synthetic fixture",
};
function memoryStore() {
  let row: DeliveryReceipt | null = null;
  const store: DeliveryStore = {
    async claim() {
      if (row && !(row.state === "failed" && row.retryable)) return false;
      row = { messageId: "message", state: "sending", retryable: false };
      return true;
    },
    async read() {
      return row!;
    },
    async finish(_id, _owner, result) {
      row = {
        messageId: "message",
        state: result.state,
        retryable: result.retryable,
      };
    },
  };
  return store;
}
describe("durable delivery state machine", () => {
  it("sends only once under concurrent calls and repeated requests", async () => {
    const store = memoryStore();
    const send = vi.fn(
      async (): Promise<SendResult> => ({
        state: "accepted",
        retryable: false,
      }),
    );
    await Promise.all([
      deliverOnce(store, input, send),
      deliverOnce(store, input, send),
    ]);
    expect((await deliverOnce(store, input, send)).state).toBe("accepted");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retries a known rejection without resending accepted messages", async () => {
    const store = memoryStore();
    const send = vi
      .fn<() => Promise<SendResult>>()
      .mockResolvedValueOnce({ state: "failed", retryable: true })
      .mockResolvedValue({ state: "accepted", retryable: false });
    expect((await deliverOnce(store, input, send)).retryable).toBe(true);
    expect((await deliverOnce(store, input, send)).state).toBe("accepted");
    await deliverOnce(store, input, send);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("blocks uncertain outcomes and never resets an accepted-but-unpersisted claim", async () => {
    const store = memoryStore();
    const send = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect((await deliverOnce(store, input, send)).state).toBe("unknown");
    await deliverOnce(store, input, send);
    expect(send).toHaveBeenCalledTimes(1);
    const broken = memoryStore();
    broken.finish = vi.fn().mockRejectedValue(new Error("DB failed"));
    const accepted = vi.fn(
      async (): Promise<SendResult> => ({
        state: "accepted",
        retryable: false,
      }),
    );
    await expect(deliverOnce(broken, input, accepted)).rejects.toThrow(
      "DB failed",
    );
    expect((await deliverOnce(broken, input, accepted)).state).toBe("sending");
    expect(accepted).toHaveBeenCalledTimes(1);
  });
});
describe("Resend adapter", () => {
  it("uses a separate To, reply-to and stable idempotency header; no CC/BCC or HTML trackers", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "provider-id" }), { status: 200 }),
      );
    expect(
      await sendWithResend(payload, "stable-key", "test-key", request),
    ).toEqual({
      state: "accepted",
      retryable: false,
      providerId: "provider-id",
    });
    const init = request.mock.calls[0][1];
    expect(init.headers["Idempotency-Key"]).toBe("stable-key");
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.redirect).toBe("error");
  });
  it.each([
    [429, "failed", true],
    [400, "failed", false],
    [401, "failed", false],
    [403, "failed", false],
    [422, "failed", false],
    [409, "unknown", false],
    [500, "unknown", false],
    [503, "unknown", false],
  ])("classifies HTTP %s conservatively", async (status, state, retryable) => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: Number(status) }));
    expect(await sendWithResend(payload, "key", "secret", request)).toEqual({
      state,
      retryable,
    });
  });
  it("does not expose provider errors or secrets on malformed acceptance / timeout", async () => {
    for (const request of [
      vi.fn().mockResolvedValue(new Response("{}")),
      vi.fn().mockRejectedValue(new Error("sensitive")),
    ])
      expect(await sendWithResend(payload, "key", "secret", request)).toEqual({
        state: "unknown",
        retryable: false,
      });
  });
});
