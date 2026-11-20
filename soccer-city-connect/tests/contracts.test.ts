import { describe, it, expect } from "vitest";
import {
  readContract,
  ImportError,
  squareSandboxTransport,
  type ReadContext,
  type Request,
  type Response,
} from "../integration/contracts";
import { recordKey } from "../model";
const context = (
  provider: ReadContext["provider"],
  operation: ReadContext["operation"],
): ReadContext => ({
  organizationId: "org-a",
  account: provider === "Mindbody" ? "-99" : "account-a",
  provider,
  operation,
  mode: "fixture",
  now: () => Date.parse("2026-11-19T16:00:00Z"),
});
const ok = (body: unknown): Response => ({ status: 200, body });
describe("Official-contract fixtures — no provider integration claimed", () => {
  it("projects paginated Square commerce without card data or participant inference", async () => {
    const requests: Request[] = [];
    let page = 0;
    const result = await readContract(
      { ...context("Square", "payments"), since: "2026-11-18T00:00:00Z" },
      async (r) => {
        requests.push(r);
        return ++page === 1
          ? ok({
              payments: [
                {
                  id: "same-id",
                  status: "COMPLETED",
                  customer_id: "customer-1",
                  location_id: "loc1",
                  card_details: { card: { last_4: "0000" } },
                  buyer_email_address: "excluded@example.test",
                },
              ],
              cursor: "next",
            })
          : ok({ payments: [{ id: "second", status: "PENDING" }] });
      },
    );
    expect(result.pages).toBe(2);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      kind: "transaction",
      personId: null,
      rawStatus: "COMPLETED",
      sourceSubjectId: "customer-1",
      dataMode: "contract-fixture",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /last_4|card_details|buyer_email|excluded@example/,
    );
    expect(requests[1].path).toContain("cursor=next");
    expect(requests[0].path).toContain("updated_at_begin_time=");
  });
  it("uses organizer-scoped Playpass pagination and never imports participant birth dates", async () => {
    let page = 0;
    const result = await readContract(
      context("Playpass", "registrations"),
      async (r) => {
        expect(r.headers["X-Playpass-Api-Version"]).toBe("2026-02-08");
        expect(r.path).toContain("organizer_id=account-a");
        page++;
        return ok({
          data: {
            organizer_id: "account-a",
            registrations: [
              {
                id: "r" + page,
                status: "confirmed",
                participant: {
                  name: "Do not import",
                  birth_date: "2010-01-01",
                },
                activity: { id: "program-1" },
              },
            ],
          },
          meta: { registrations: { page, total_pages: 2 } },
        });
      },
    );
    expect(result.records.map((r) => r.sourceId)).toEqual(["r1", "r2"]);
    expect(result.records[0].programId).toBe("program-1");
    expect(JSON.stringify(result)).not.toMatch(/birth_date|Do not import/);
    await expect(
      readContract(context("Playpass", "schedules"), async () =>
        ok({
          data: { organizer_id: "wrong", schedules: [] },
          meta: { schedules: { page: 1, total_pages: 1 } },
        }),
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_MISMATCH" });
  });
  it("reads Mindbody offsets, incremental client filters and membership instance IDs", async () => {
    const calls: Request[] = [];
    let n = 0;
    const r = await readContract(
      { ...context("Mindbody", "clients"), since: "2026-11-18T00:00:00Z" },
      async (req) => {
        calls.push(req);
        n++;
        return ok({
          Clients: [
            {
              Id: String(n),
              Status: "Active",
              ClientCreditCard: { CardNumber: "never-store" },
              BirthDate: "never-store",
            },
          ],
          PaginationResponse: {
            RequestedOffset: n - 1,
            PageSize: 1,
            TotalResults: 2,
          },
        });
      },
    );
    expect(r.records).toHaveLength(2);
    expect(calls[1].path).toContain("request.offset=1");
    expect(calls[0].path).toContain("request.lastModifiedDate=");
    expect(calls[0].headers.SiteId).toBe("-99");
    expect(JSON.stringify(r)).not.toContain("never-store");
    const m = await readContract(
      { ...context("Mindbody", "memberships"), clientId: "client-a" },
      async () =>
        ok({
          ClientMemberships: [
            { Id: 88, MembershipId: 5, Name: "Family plan", Current: true },
          ],
          PaginationResponse: {
            RequestedOffset: 0,
            PageSize: 1,
            TotalResults: 1,
          },
        }),
    );
    expect(m.records[0]).toMatchObject({
      sourceId: "client-a:88",
      rawStatus: "Current",
      status: "current",
      sourceSubjectId: "client-a",
    });
  });
  it("deduplicates within an import but separates organization, account and provider IDs", async () => {
    const read = (c: ReadContext) =>
      readContract(c, async () =>
        ok({
          payments: [
            { id: "same", status: "COMPLETED" },
            { id: "same", status: "COMPLETED" },
          ],
        }),
      );
    const a = await read(context("Square", "payments")),
      b = await read({
        ...context("Square", "payments"),
        organizationId: "org-b",
      }),
      c = await read({ ...context("Square", "payments"), account: "another" });
    expect(a.records).toHaveLength(1);
    expect(new Set([a, b, c].map((x) => recordKey(x.records[0]))).size).toBe(3);
  });
  it("honors delta and date Retry-After, never retries auth denial, bounds waits and attempts", async () => {
    const sleeps: number[] = [];
    let n = 0;
    await readContract(
      context("Square", "payments"),
      async () =>
        ++n < 3
          ? {
              status: 429,
              headers: {
                "Retry-After": n === 1 ? "2" : "Thu, 19 Nov 2026 16:00:03 GMT",
              },
              body: { secret: "never log" },
            }
          : ok({ payments: [] }),
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(sleeps).toEqual([2000, 3000]);
    for (const status of [401, 403]) {
      let calls = 0;
      await expect(
        readContract(context("Square", "payments"), async () => {
          calls++;
          return { status, body: { token: "never log" } };
        }),
      ).rejects.toMatchObject({
        code: status === 401 ? "ACCESS_EXPIRED_OR_REVOKED" : "ACCESS_DENIED",
      });
      expect(calls).toBe(1);
    }
    await expect(
      readContract(context("Square", "payments"), async () => ({
        status: 429,
        headers: { "retry-after": "3600" },
        body: {},
      })),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAt: "2026-11-19T17:00:00.000Z",
    });
    let attempts = 0;
    await expect(
      readContract(
        context("Square", "payments"),
        async () => {
          attempts++;
          return { status: 503, body: {} };
        },
        { sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(ImportError);
    expect(attempts).toBe(3);
  });
  it("fails atomically on partial pages, malformed schemas, loops and timeouts", async () => {
    let n = 0;
    await expect(
      readContract(
        context("Square", "payments"),
        async () =>
          ++n === 1
            ? ok({ payments: [{ id: "projected" }], cursor: "next" })
            : { status: 503, body: { access_token: "sensitive-body" } },
        { sleep: async () => {} },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    await expect(
      readContract(context("Square", "payments"), async () =>
        ok({ payments: [{}] }),
      ),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
    await expect(
      readContract(context("Square", "payments"), async () =>
        ok({ payments: [], cursor: "loop" }),
      ),
    ).rejects.toMatchObject({ code: "PAGINATION_LOOP" });
    await expect(
      readContract(
        context("Square", "payments"),
        async () => new Promise(() => {}),
        { timeoutMs: 2, sleep: async () => {} },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT_OR_NETWORK" });
  });
  it("blocks live mode and arbitrary egress, and requires a real documented sandbox", async () => {
    await expect(
      readContract(
        { ...context("Square", "payments"), mode: "live" },
        async () => ok({}),
      ),
    ).rejects.toMatchObject({ code: "LIVE_DISABLED" });
    await expect(
      readContract(
        { ...context("Playpass", "registrations"), mode: "sandbox" },
        async () => ok({}),
      ),
    ).rejects.toMatchObject({ code: "NO_VERIFIED_PLAYPASS_SANDBOX" });
    await expect(
      squareSandboxTransport(true)({
        method: "POST",
        path: "/v2/payments",
        headers: {},
      }),
    ).rejects.toMatchObject({ code: "ENDPOINT_DENIED" });
    await expect(
      squareSandboxTransport(true)({
        method: "GET",
        path: "https://attacker.invalid/v2/payments",
        headers: {},
      }),
    ).rejects.toMatchObject({ code: "ENDPOINT_DENIED" });
  });
});
