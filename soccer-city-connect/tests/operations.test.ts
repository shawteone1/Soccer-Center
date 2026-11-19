import { describe, it, expect, vi } from "vitest";
import { initial, sync, load, resolve } from "../store";
import {
  addNote,
  assignTask,
  completeTask,
  daySchedule,
  operationsMetrics,
  setFollowUp,
} from "../operations";
import { KEY, recordKey } from "../model";
const requirement = (s: ReturnType<typeof initial>) =>
  Object.values(s.records).find((r) => r.kind === "requirement")!;
const key = recordKey(requirement(initial()));
describe("Operations Desk local staff workflow", () => {
  it("assigns staff, records authors/notes/due date, resolves locally and measures observed handling", () => {
    let s = initial();
    const sources = structuredClone(s.records);
    expect(operationsMetrics(s, "2026-11-14")).toMatchObject({
      open: 2,
      unassigned: 2,
      due: 2,
      sessions: 1,
      averageMinutes: null,
      timedCount: 0,
    });
    s = assignTask(s, key, "casey", "morgan", "2026-11-19T16:00:00Z");
    s = addNote(
      s,
      key,
      "  Check fictional waiver source before participation.  ",
      "casey",
      "2026-11-19T16:02:00Z",
    );
    s = setFollowUp(s, key, "2026-11-20", "casey", "2026-11-19T16:03:00Z");
    expect(operationsMetrics(s, "2026-11-19")).toMatchObject({
      open: 2,
      unassigned: 1,
      overdue: 1,
      notes: 1,
    });
    s = completeTask(s, key, "casey", "2026-11-19T16:10:00Z");
    expect(s.records).toEqual(sources);
    expect(s.records[key].rawStatus).toBe("Missing");
    expect(s.tasks[key]).toMatchObject({
      assigneeId: "casey",
      dueOn: "2026-11-20",
    });
    expect(s.tasks[key].notes[0]).toMatchObject({
      actor: "Casey Brooks",
      text: "Check fictional waiver source before participation.",
    });
    expect(s.audit.at(-1)).toMatchObject({
      actor: "Casey Brooks",
      mode: "simulated",
      source: key,
      action: "Local workflow resolved",
      before: "open",
      after: "locally resolved; provider remains Missing",
    });
    expect(operationsMetrics(s, "2026-11-19")).toMatchObject({
      open: 1,
      completed: 1,
      notes: 1,
      timedCount: 1,
      averageMinutes: 10,
    });
    const snapshot = structuredClone(s.tasks),
      history = structuredClone(s.resolutions);
    s = sync(
      sync(sync(s, "Mindbody"), "Playpass", true),
      "Playpass",
      false,
      true,
    );
    expect(s.tasks).toEqual(snapshot);
    expect(s.resolutions).toEqual(history);
    expect(Object.keys(s.records)).toHaveLength(9);
  });
  it("rejects invalid staff, empty/oversized notes and impossible dates without audit noise", () => {
    const s = initial();
    expect(assignTask(s, key, "unknown", "morgan")).toBe(s);
    expect(assignTask(s, key, "casey", "unknown")).toBe(s);
    expect(addNote(s, key, "   ", "morgan")).toBe(s);
    expect(addNote(s, key, "x".repeat(1501), "morgan")).toBe(s);
    expect(setFollowUp(s, key, "2026-02-30", "morgan")).toBe(s);
    expect(setFollowUp(s, key, "2026-99-01", "morgan")).toBe(s);
    expect(completeTask(s, "unknown", "morgan")).toBe(s);
    expect(completeTask(s, key, "unknown")).toBe(s);
  });
  it("never links ambiguous identities when a staff review is completed", () => {
    let s = initial();
    const identity = Object.values(s.tasks).find(
      (t) => s.records[t.sourceKey].personId === null,
    )!;
    s = completeTask(s, identity.sourceKey, "morgan");
    expect(s.records[identity.sourceKey].personId).toBeNull();
    expect(completeTask(s, identity.sourceKey, "morgan")).toBe(s);
    expect(operationsMetrics(s, "2026-11-14").timedCount).toBe(0);
  });
  it("upgrades the c478169 storage shape in place without losing source data, local resolution or history", () => {
    const s = resolve(initial(), requirement(initial()));
    const { tasks: _tasks, ...legacy } = s;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === KEY ? JSON.stringify(legacy) : null),
    });
    const upgraded = load();
    expect(upgraded.records).toEqual(s.records);
    expect(upgraded.resolutions).toEqual(s.resolutions);
    expect(upgraded.audit).toEqual(s.audit);
    expect(Object.keys(upgraded.tasks)).toHaveLength(2);
    vi.unstubAllGlobals();
  });
  it("uses Denver operating days and resets all local operations", () => {
    expect(
      daySchedule(Object.values(initial().records), "2026-11-15")[0].sourceId,
    ).toBe("MB-B-101");
    expect(
      daySchedule(Object.values(initial().records), "2026-11-16"),
    ).toHaveLength(0);
    expect(operationsMetrics(initial(), "2026-11-15").overdue).toBe(2);
    expect(
      Object.values(initial().tasks).every(
        (t) => !t.assigneeId && !t.notes.length,
      ),
    ).toBe(true);
  });
});
