// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  rows: [] as any[],
  affected: 1,
  insert: vi.fn(),
  delete: vi.fn(),
  secret: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("@/server/db/client.js", () => ({
  db: {
    insert: () => ({ values: mocks.insert }),
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => mocks.rows }) }),
    }),
    delete: () => ({
      where: async (...args: any[]) => {
        mocks.delete(...args);
        return [{ affectedRows: mocks.affected }];
      },
    }),
  },
}));
vi.mock("#airo/secrets", () => ({ getSecret: mocks.secret }));
import {
  isPublicAddress,
  validateOutboundUrl,
  fetchPublicText,
} from "./safe-outbound-text";
import {
  createCalendarConsent,
  consumeCalendarConsent,
} from "./calendar-oauth-state";
import { redactCoachToken } from "./redact-coach-token";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  mocks.secret.mockReturnValue(undefined);
  mocks.rows = [];
  mocks.affected = 1;
});
afterEach(() => vi.useRealTimers());
function reply(
  status: number,
  headers: Record<string, string> = {},
  text = "ok",
  hang = false,
) {
  mocks.request.mockImplementationOnce(
    (_url: any, opts: any, callback: any) => {
      const req: any = new EventEmitter();
      req.end = () => {
        const res: any = new EventEmitter();
        res.statusCode = status;
        res.headers = headers;
        res.destroy = () => {};
        callback(res);
        queueMicrotask(() => {
          if (!hang) {
            res.emit("data", Buffer.from(text));
            res.emit("end");
          }
        });
      };
      req.destroy = (e: any) => {
        if (e) req.emit("error", e);
      };
      opts.signal.addEventListener(
        "abort",
        () => req.emit("error", new Error("aborted")),
        { once: true },
      );
      return req;
    },
  );
}
describe("outbound network boundary", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
  ])("rejects private/special %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(false),
  );
  it("allows public v4/v6", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects credentials, ports and insecure calendar URLs", () => {
    for (const u of [
      "https://a:b@example.org/",
      "https://example.org:8080/",
      "http://example.org/",
    ])
      expect(() => validateOutboundUrl(u)).toThrow();
  });
  it("rejects DNS with any private result before requesting", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(fetchPublicText("https://example.org/")).rejects.toThrow(
      "Private",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("pins the validated address into the transport", async () => {
    reply(200);
    expect(await fetchPublicText("https://example.org/")).toBe("ok");
    const opts = mocks.request.mock.calls[0][1];
    const cb = vi.fn();
    opts.lookup("example.org", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  });
  it("blocks redirect to private address", async () => {
    reply(302, { location: "https://127.0.0.1/" });
    await expect(fetchPublicText("https://example.org/")).rejects.toThrow(
      "Private",
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("checks DNS again for redirected domains", async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    reply(302, { location: "https://second.example/" });
    await expect(fetchPublicText("https://example.org/")).rejects.toThrow(
      "Private",
    );
  });
  it("rejects oversized body", async () => {
    reply(200, {}, "oversized");
    await expect(
      fetchPublicText("https://example.org/", { maxBytes: 3 }),
    ).rejects.toThrow("size");
  });
  it("enforces timeout during response body", async () => {
    reply(200, {}, "", true);
    await expect(
      fetchPublicText("https://example.org/", { timeoutMs: 15 }),
    ).rejects.toThrow();
  });
  it("enforces redirect cap", async () => {
    reply(302, { location: "/again" });
    await expect(
      fetchPublicText("https://example.org/", { maxRedirects: 0 }),
    ).rejects.toThrow("redirects");
  });
});
describe("OAuth consent boundary", () => {
  it("stores opaque expiring state and S256 challenge without raw state in DB", async () => {
    const c = await createCalendarConsent("owner", "google");
    expect(c.state).toMatch(/^[\w-]{43}$/);
    const row = mocks.insert.mock.calls[0][0];
    expect(row.identifier).not.toContain(c.state);
    expect(JSON.parse(row.value).userId).toBe("owner");
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(c.challenge).toMatch(/^[\w-]{43}$/);
  });
  it("rejects old user-id JSON state before database use", async () => {
    expect(
      await consumeCalendarConsent(
        Buffer.from('{"userId":"owner"}').toString("base64url"),
        "owner",
        "google",
      ),
    ).toBeNull();
  });
  it("rejects unknown or expired state", async () =>
    expect(
      await consumeCalendarConsent("a".repeat(43), "owner", "google"),
    ).toBeNull());
  it("does not consume another user or provider consent", async () => {
    mocks.rows = [
      {
        id: "1",
        value: JSON.stringify({
          userId: "other",
          provider: "google",
          redirectUri: "https://soccercenter.org/api/calendar/google/callback",
          verifier: "secret",
        }),
      },
    ];
    expect(
      await consumeCalendarConsent("a".repeat(43), "owner", "google"),
    ).toBeNull();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("requires winning single-use deletion", async () => {
    mocks.rows = [
      {
        id: "1",
        value: JSON.stringify({
          userId: "owner",
          provider: "google",
          redirectUri: "https://soccercenter.org/api/calendar/google/callback",
          verifier: "secret",
        }),
      },
    ];
    expect(
      await consumeCalendarConsent("a".repeat(43), "owner", "google"),
    ).not.toBeNull();
    mocks.affected = 0;
    expect(
      await consumeCalendarConsent("a".repeat(43), "owner", "google"),
    ).toBeNull();
  });
});
it.each(["profile", "media", "photo"])("redacts %s bearer tokens", (kind) =>
  expect(redactCoachToken(`/api/coach/${kind}/secret/id?x=1`)).not.toContain(
    "secret",
  ),
);
