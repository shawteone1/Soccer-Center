import { describe, it, expect } from "vitest";
import {
  initial,
  sync,
  resolve,
  forHousehold,
  markStale,
  adapters,
  findConflicts,
} from "../store";
import { recordKey, providers } from "../model";
import {
  calendarDate,
  calendarTime,
} from "../../src/lib/portal/calendar-display";

describe("Soccer City source normalization and workflow boundaries", () => {
  it("keeps deterministic provider records, explicit family links and ownership", () => {
    const s = initial();
    expect(s).toEqual(initial());
    expect(Object.keys(s.records)).toHaveLength(9);
    const family = forHousehold(s, ["parent", "athlete"]);
    expect(family).toHaveLength(8);
    expect(forHousehold(s, ["other"])).toHaveLength(0);
    expect(family.some((r) => r.sourceId === "MB-M-999")).toBe(false);
    expect(family.filter((r) => r.kind === "event")).toHaveLength(3);
    for (const r of family) {
      expect(r.sourceId).toBeTruthy();
      expect(r.sourceUpdatedAt).toBeTruthy();
      expect(r.importedAt).toBeTruthy();
      expect(r.account).toBe("fictional-soccer-city");
    }
    expect(family.find((r) => r.kind === "membership")?.status).toBe("active");
    expect(family.find((r) => r.kind === "transaction")?.rawStatus).toBe(
      "COMPLETED",
    );
    expect(
      family.find((r) => r.provider === "Square" && r.kind === "registration")
        ?.sourceId,
    ).toBe("SQ-EN-301");
  });
  it("never collides across provider, account or record type", () => {
    const r = Object.values(initial().records)[0];
    const keys = [
      recordKey(r),
      recordKey({ ...r, provider: "Square" }),
      recordKey({ ...r, account: "another" }),
      recordKey({ ...r, kind: "event" }),
    ];
    expect(new Set(keys).size).toBe(4);
  });
  it("idempotently refreshes all providers without duplicate records or local resolution loss", () => {
    let s = initial();
    const r = Object.values(s.records).find((r) => r.kind === "requirement")!;
    s = resolve(s, r);
    const resolved = s.resolutions;
    const source = s.records[recordKey(r)];
    for (let n = 0; n < 3; n++) for (const p of providers) s = sync(s, p);
    expect(Object.keys(s.records)).toHaveLength(9);
    expect(s.resolutions).toEqual(resolved);
    expect(s.records[recordKey(r)].rawStatus).toBe(source.rawStatus);
    expect(source.rawStatus).toBe("Missing");
    const count = s.audit.length;
    expect(resolve(s, r).audit).toHaveLength(count);
    expect(s.audit[0]).toMatchObject({
      action: "Local workflow resolved",
      before: "open",
      after: "locally resolved; provider remains Missing",
      mode: "simulated",
    });
  });
  it("retains last-known records on failure, bounds retries and permits deliberate new cycles", () => {
    let s = initial();
    const before = s.records;
    s = sync(s, "Playpass", true);
    expect(s.records).toEqual(before);
    expect(s.health.Playpass).toMatchObject({
      attempts: 1,
      stale: true,
      error: "Simulated source unavailable",
    });
    s = sync(s, "Playpass", true, true);
    s = sync(s, "Playpass", true, true);
    expect(s.health.Playpass.attempts).toBe(3);
    expect(sync(s, "Playpass", false, true)).toBe(s);
    s = sync(s, "Playpass");
    expect(s.health.Playpass).toMatchObject({
      attempts: 1,
      error: null,
      stale: false,
    });
    expect(s.records).toHaveProperty(
      "Playpass:fictional-soccer-city:event:PP-E-201",
    );
  });
  it("records failure and successful retry audit and clears stale state", () => {
    let s = sync(initial(), "Square", true);
    s = sync(s, "Square", false, true);
    expect(s.health.Square).toMatchObject({
      attempts: 2,
      error: null,
      stale: false,
    });
    expect(s.audit.map((a) => a.action)).toEqual([
      "Synchronization failed",
      "Synchronization succeeded",
    ]);
    expect(markStale(s, "Mindbody").health.Mindbody.stale).toBe(true);
  });
  it("rejects resolving anything other than a known requirement and resets all local state", () => {
    const s = initial();
    const membership = Object.values(s.records)[0];
    expect(resolve(s, membership)).toBe(s);
    const requirement = Object.values(s.records).find(
      (r) => r.kind === "requirement",
    )!;
    expect(resolve(s, { ...requirement, sourceId: "unknown" })).toBe(s);
    expect(initial().resolutions).toEqual({});
    expect(initial().audit).toEqual([]);
  });
  it("detects genuine participant/field overlaps but permits adjacent events", () => {
    const a = Object.values(initial().records).find((r) => r.kind === "event")!;
    const b = { ...a, sourceId: "other-event" };
    expect(findConflicts([a, b])).toHaveLength(1);
    expect(
      findConflicts([
        a,
        { ...b, startAt: a.endAt, endAt: "2026-11-16T03:00:00Z" },
      ]),
    ).toHaveLength(0);
    expect(findConflicts(Object.values(initial().records))).toHaveLength(0);
  });
  it("uses read-only fictional adapters and correct Denver schedule dates", () => {
    for (const p of providers)
      expect(adapters[p]).toMatchObject({
        provider: p,
        mode: "simulated",
        access: "read-only",
        maxAttempts: 3,
      });
    expect(calendarDate("2026-11-16T01:00:00Z")).toBe("2026-11-15");
    expect(calendarTime("2026-11-16T01:00:00Z")).toBe("6:00 PM");
  });
});
