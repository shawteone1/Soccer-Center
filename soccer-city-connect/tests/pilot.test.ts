import { describe, it, expect } from "vitest";
import { initial, sync, forHousehold } from "../store";
import {
  setupOf,
  saveSetup,
  connectionAction,
  reviewAssociation,
  applyRules,
  followUpDate,
} from "../pilot";
import { recordKey } from "../model";
describe("Onboarding, connection isolation and local association rules", () => {
  it("resumes saved setup and independently selects providers without claiming authorization", () => {
    let s = initial();
    const p = setupOf(s);
    p.organization = "Fictional facility";
    p.step = 3;
    p.connections.Playpass.selected = false;
    p.connections.Square.mode = "sandbox";
    s = saveSetup(s, p);
    expect(setupOf(s)).toMatchObject({
      organization: "Fictional facility",
      step: 3,
    });
    expect(setupOf(s).connections.Mindbody.selected).toBe(true);
    expect(setupOf(s).connections.Square.authorization).toBe("unverified");
    expect(sync(s, "Square")).toBe(s);
    expect(sync(s, "Playpass")).toBe(s);
    const forged = structuredClone(setupOf(s));
    forged.connections.Square.mode = "live";
    expect(saveSetup(s, forged)).toBe(s);
  });
  it("disconnects without deleting last-known records or resolving open tasks and requires explicit resumption", () => {
    const original = initial();
    let s = connectionAction(original, "Mindbody", "disconnect");
    expect(s.records).toBe(original.records);
    expect(s.resolutions).toEqual({});
    expect(s.health.Mindbody.stale).toBe(true);
    expect(sync(s, "Mindbody")).toBe(s);
    s = saveSetup(s, { ...setupOf(s), organization: "Changed settings" });
    expect(setupOf(s).connections.Mindbody.authorization).toBe("disconnected");
    s = connectionAction(s, "Mindbody", "reauthorize");
    expect(sync(s, "Mindbody").health.Mindbody.stale).toBe(false);
  });
  it("never auto-matches ambiguous records; explicit review and corrections update member projection only", () => {
    let s = initial();
    const r = Object.values(s.records).find((r) => r.sourceId === "MB-M-999")!,
      k = recordKey(r),
      before = structuredClone(s.records);
    expect(
      forHousehold(s, ["athlete"]).some((r) => r.sourceId === "MB-M-999"),
    ).toBe(false);
    expect(reviewAssociation(s, k, "athlete", "")).toBe(s);
    s = reviewAssociation(
      s,
      k,
      "athlete",
      "Independent fictional evidence",
      "Morgan",
    );
    expect(
      forHousehold(s, ["athlete"]).some((r) => r.sourceId === "MB-M-999"),
    ).toBe(true);
    s = reviewAssociation(
      s,
      k,
      null,
      "Correction: records belong to distinct people",
      "Casey",
    );
    expect(
      forHousehold(s, ["athlete"]).some((r) => r.sourceId === "MB-M-999"),
    ).toBe(false);
    expect(s.records).toEqual(before);
    expect(s.audit.at(-1)?.actor).toBe("Casey");
  });
  it("applies configured defaults only to unassigned open tasks and preserves completed work", () => {
    let s = initial();
    const p = setupOf(s);
    p.defaultOwner = "casey";
    p.followUpDays = 3;
    s = saveSetup(s, p);
    s = applyRules(s);
    expect(
      Object.values(s.tasks).every(
        (t) => t.assigneeId === "casey" && t.dueOn === "2026-11-16",
      ),
    ).toBe(true);
    const snapshot = structuredClone(s.tasks);
    s = sync(sync(s, "Mindbody"), "Playpass", true);
    expect(s.tasks).toEqual(snapshot);
    expect(s.resolutions).toEqual({});
  });
  it("uses the configured organization timezone for calendar-day deadlines", () => {
    const config = setupOf(initial());
    config.followUpDays = 2;
    expect(followUpDate(config, "2026-11-20T02:00:00Z")).toBe("2026-11-21");
    config.timezone = "UTC";
    expect(followUpDate(config, "2026-11-20T02:00:00Z")).toBe("2026-11-22");
  });
});
