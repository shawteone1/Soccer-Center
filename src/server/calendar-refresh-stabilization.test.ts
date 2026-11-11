// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  events: ["old"],
  fail: false,
  transaction: vi.fn(),
  updates: [] as unknown[],
}));
vi.mock("./calendar-crypto.js", () => ({
  deserializePayload: () => ({}),
  decryptUrl: () => "https://calendar.google.com/test",
}));
vi.mock("./ical-parser.js", () => ({
  fetchAndParseIcal: async () => [
    {
      uid: "new",
      title: "New",
      startAt: "2026-11-01T12:00:00Z",
      endAt: "2026-11-01T13:00:00Z",
      provider: "google",
      eventType: "game",
      status: "confirmed",
    },
  ],
}));
vi.mock("./db/client.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            { id: "feed", userId: "owner", encryptedUrl: "encrypted" },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (v: unknown) => ({ where: async () => state.updates.push(v) }),
    }),
    transaction: async (fn: any) => {
      state.transaction();
      let staged = [...state.events];
      const tx = {
        delete: () => ({
          where: async () => {
            staged = [];
          },
        }),
        insert: () => ({
          values: async () => {
            if (state.fail) throw new Error("insert failed");
            staged = ["new"];
          },
        }),
        update: () => ({ set: () => ({ where: async () => {} }) }),
      };
      await fn(tx);
      state.events = staged;
    },
  },
}));
import { refreshFeedNow } from "./calendar-refresh-job";
beforeEach(() => {
  state.events = ["old"];
  state.fail = false;
  state.updates = [];
  vi.clearAllMocks();
});
it("rolls back replacement when inserting refreshed events fails", async () => {
  state.fail = true;
  const result = await refreshFeedNow("feed");
  expect(result.ok).toBe(false);
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.events).toEqual(["old"]);
  expect(state.updates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lastFetchStatus: "error" }),
    ]),
  );
});
it("commits refreshed events through the transaction", async () => {
  expect((await refreshFeedNow("feed")).ok).toBe(true);
  expect(state.events).toEqual(["new"]);
});
