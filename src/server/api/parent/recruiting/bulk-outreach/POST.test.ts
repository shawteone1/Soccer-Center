// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
const mocks = vi.hoisted(() => ({
  user: { id: "owner", email: "parent@example.org" } as {
    id: string;
    email: string;
  } | null,
  secrets: {} as Record<string, string>,
  execute: vi.fn(),
  link: vi.fn(),
  claim: vi.fn(),
  read: vi.fn(),
  finish: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/server/auth-policy.js", () => ({
  requireParentAccess: vi.fn(async (_req, res) => {
    if (!mocks.user) res.status(401).json({});
    return mocks.user;
  }),
}));
vi.mock("#airo/secrets", () => ({
  getSecret: (key: string) => mocks.secrets[key],
}));
vi.mock("@/server/db/client.js", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/server/lib/coach-link-store.js", () => ({
  getCoachLinkStore: () => ({ findByToken: mocks.link }),
}));
vi.mock("../../../../lib/bulk-outreach-store", () => ({
  bulkDeliveryStore: {
    claim: mocks.claim,
    read: mocks.read,
    finish: mocks.finish,
  },
}));
vi.mock("../../../../lib/bulk-outreach-delivery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendWithResend: mocks.send,
}));
import handler from "./POST";
function fixture() {
  return {
    batchId: "c5113282-5c1c-4f40-8f96-f292d2653888",
    messageId: "f5113282-5c1c-4f40-8f96-f292d2653888",
    consent: true,
    coachId: "coach-a",
    recipientEmail: "coach@example.edu",
    coachName: "Coach A",
    institution: "College A",
    subject: "Recruiting",
    introduction: "Please review.",
    profiles: [
      {
        playerId: "player-a",
        linkId: "link-a",
        url: `https://soccercenter.org/coach/profile/${"a".repeat(43)}`,
      },
    ],
  };
}
let body: ReturnType<typeof fixture>, origin: string;
function activeLink() {
  return {
    id: "link-a",
    userId: "owner",
    playerId: "player-a",
    demoMode: false,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    approvedFields: ["label"],
  };
}
async function call() {
  const response = {
    code: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(n: number) {
      this.code = n;
      return this;
    },
    json(v: unknown) {
      this.body = v;
      return this;
    },
  };
  await handler(
    { body, get: () => origin, is: () => true } as unknown as Request,
    response as unknown as Response,
  );
  return response;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "owner", email: "parent@example.org" };
  body = fixture();
  origin = "https://soccercenter.org";
  mocks.secrets = {
    COACH_PROFILE_LINKS_ENABLED: "true",
    COACH_PROFILE_TESTERS: "*",
    BULK_OUTREACH_ENABLED: "true",
    BULK_OUTREACH_TESTERS: "parent@example.org",
    BULK_OUTREACH_RESEND_API_KEY: "synthetic-key",
    BULK_OUTREACH_FROM: "sender@example.org",
    BETTER_AUTH_URL: origin,
  };
  mocks.execute
    .mockReset()
    .mockResolvedValueOnce([
      [
        {
          name: "Coach A",
          email: "coach@example.edu",
          import_key: "verified-test",
          institution: "College A",
        },
      ],
    ])
    .mockResolvedValue([[{ age_band: "U17" }]]);
  mocks.link.mockResolvedValue(activeLink());
  mocks.claim.mockResolvedValue(true);
  mocks.read.mockResolvedValue({
    messageId: body.messageId,
    state: "accepted",
    retryable: false,
  });
  mocks.finish.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({
    state: "accepted",
    providerId: "provider-id",
    retryable: false,
  });
});
describe("bulk outreach server enforcement", () => {
  it("requires authentication and sends private no-store responses", async () => {
    mocks.user = null;
    const r = await call();
    expect(r.code).toBe(401);
    expect(r.headers["Cache-Control"]).toContain("no-store");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    "BULK_OUTREACH_ENABLED",
    "BULK_OUTREACH_TESTERS",
    "COACH_PROFILE_TESTERS",
    "COACH_PROFILE_LINKS_ENABLED",
  ])("fails closed without %s", async (key) => {
    delete mocks.secrets[key];
    expect((await call()).code).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send in demo mode or without sender setup", async () => {
    mocks.secrets.COACH_PROFILE_DEMO_MODE = "true";
    expect((await call()).code).toBe(403);
    delete mocks.secrets.COACH_PROFILE_DEMO_MODE;
    delete mocks.secrets.BULK_OUTREACH_RESEND_API_KEY;
    expect((await call()).code).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and unapproved requests", async () => {
    origin = "https://other.test";
    expect((await call()).code).toBe(403);
    origin = "https://soccercenter.org";
    body.consent = false;
    expect((await call()).code).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects stale directory email before touching links or delivery storage", async () => {
    body.recipientEmail = "other@example.edu";
    expect((await call()).code).toBe(409);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each([
    { userId: "another-owner" },
    { playerId: "another-player" },
    { id: "another-link" },
    { demoMode: true },
    { revokedAt: new Date() },
    { expiresAt: new Date(0) },
    { expiresAt: null },
    { approvedFields: [] },
  ])("rejects inaccessible link %j", async (change) => {
    mocks.link.mockResolvedValue({ ...activeLink(), ...change });
    expect((await call()).code).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects malformed/off-origin profile URLs without fetching them", async () => {
    body.profiles[0].url = body.profiles[0].url.replace(
      "soccercenter.org",
      "evil.test",
    );
    expect((await call()).code).toBe(409);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("rejects missing/deleted/wrong-owner or under-age players", async () => {
    mocks.execute
      .mockReset()
      .mockResolvedValueOnce([
        [
          {
            name: "Coach A",
            email: "coach@example.edu",
            import_key: "verified-test",
            institution: "College A",
          },
        ],
      ])
      .mockResolvedValue([[]]);
    expect((await call()).code).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("validates every profile before sending any email", async () => {
    body.profiles.push({
      ...body.profiles[0],
      playerId: "player-b",
      linkId: "link-b",
    });
    mocks.link.mockResolvedValueOnce(activeLink()).mockResolvedValueOnce(null);
    expect((await call()).code).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("sends a single separate recipient with the signed-in reply address and stable hash key", async () => {
    const r = await call();
    expect(r.code).toBe(200);
    const [payload, key] = mocks.send.mock.calls[0];
    expect(payload.to).toEqual(["coach@example.edu"]);
    expect(payload.reply_to).toBe("parent@example.org");
    expect(payload).not.toHaveProperty("bcc");
    expect(payload).not.toHaveProperty("cc");
    expect(key).toMatch(/^soccer-outreach\/[a-f0-9]{64}$/);
    expect(payload.text).toContain(body.profiles[0].url);
  });
  it("does not expose token-bearing database errors", async () => {
    mocks.execute
      .mockReset()
      .mockRejectedValue(new Error(body.profiles[0].url));
    const r = await call();
    expect(r.code).toBe(503);
    expect(JSON.stringify(r.body)).not.toContain("a".repeat(43));
  });
});
