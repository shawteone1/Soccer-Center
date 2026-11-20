import {
  CLOCK,
  recordKey,
  staff,
  type State,
  type LocalTask,
  type SourceRecord,
} from "./model";
import { calendarDate } from "../src/lib/portal/calendar-display";

export function seedTasks(records: State["records"]): State["tasks"] {
  return Object.fromEntries(
    Object.values(records)
      .filter(
        (r) =>
          r.kind === "requirement" ||
          (r.personId === null &&
            ["client", "membership", "registration"].includes(r.kind)),
      )
      .map((r) => {
        const key = recordKey(r);
        return [
          key,
          {
            sourceKey: key,
            title:
              r.kind === "requirement"
                ? r.title
                : "Unconfirmed identity review",
            priority: r.kind === "requirement" ? "High" : "Normal",
            assigneeId: null,
            dueOn: "2026-11-14",
            createdAt: CLOCK,
            updatedAt: CLOCK,
            notes: [],
          } satisfies LocalTask,
        ];
      }),
  );
}
const actorName = (id: string) => staff.find((s) => s.id === id)?.name;
function log(
  s: State,
  key: string,
  action: string,
  before: string,
  after: string,
  actor: string,
  at: string,
): State {
  return {
    ...s,
    audit: [
      ...s.audit,
      {
        id: (s.audit.at(-1)?.id ?? 0) + 1,
        at,
        actor,
        action,
        source: key,
        before,
        after,
        mode: "simulated",
      },
    ],
  };
}
export function assignTask(
  s: State,
  key: string,
  assigneeId: string | null,
  actorId: string,
  at = new Date().toISOString(),
): State {
  const task = s.tasks[key],
    actor = actorName(actorId);
  if (
    !task ||
    !actor ||
    (assigneeId !== null && !actorName(assigneeId)) ||
    task.assigneeId === assigneeId
  )
    return s;
  return log(
    {
      ...s,
      tasks: { ...s.tasks, [key]: { ...task, assigneeId, updatedAt: at } },
    },
    key,
    "Staff assignment updated",
    task.assigneeId ? actorName(task.assigneeId)! : "Unassigned",
    assigneeId ? actorName(assigneeId)! : "Unassigned",
    actor,
    at,
  );
}
export function addNote(
  s: State,
  key: string,
  text: string,
  actorId: string,
  at = new Date().toISOString(),
): State {
  const task = s.tasks[key],
    actor = actorName(actorId),
    trimmed = text.trim();
  if (!task || !actor || !trimmed || trimmed.length > 1500) return s;
  const note = {
    id: (task.notes.at(-1)?.id ?? 0) + 1,
    at,
    actor,
    text: trimmed,
  };
  return log(
    {
      ...s,
      tasks: {
        ...s.tasks,
        [key]: { ...task, updatedAt: at, notes: [...task.notes, note] },
      },
    },
    key,
    "Follow-up note added",
    `${task.notes.length} notes`,
    trimmed,
    actor,
    at,
  );
}
export function setFollowUp(
  s: State,
  key: string,
  dueOn: string,
  actorId: string,
  at = new Date().toISOString(),
): State {
  const task = s.tasks[key],
    actor = actorName(actorId);
  if (
    !task ||
    !actor ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ||
    !Number.isFinite(Date.parse(`${dueOn}T00:00:00Z`)) ||
    new Date(`${dueOn}T00:00:00Z`).toISOString().slice(0, 10) !== dueOn ||
    task.dueOn === dueOn
  )
    return s;
  return log(
    { ...s, tasks: { ...s.tasks, [key]: { ...task, dueOn, updatedAt: at } } },
    key,
    "Follow-up date updated",
    task.dueOn,
    dueOn,
    actor,
    at,
  );
}
/** Completing local work never changes the source record or identity association. */
export function completeTask(
  s: State,
  key: string,
  actorId: string,
  at = new Date().toISOString(),
): State {
  const task = s.tasks[key],
    actor = actorName(actorId),
    source = s.records[key];
  if (!task || !source || !actor || s.resolutions[key]) return s;
  return log(
    {
      ...s,
      tasks: { ...s.tasks, [key]: { ...task, updatedAt: at } },
      resolutions: {
        ...s.resolutions,
        [key]: {
          at,
          note: "Local review complete. Provider confirmation remains required.",
        },
      },
    },
    key,
    "Local workflow resolved",
    "open",
    `locally resolved; provider remains ${source.rawStatus}`,
    actor,
    at,
  );
}
export function operationsMetrics(s: State, day: string) {
  const tasks = Object.values(s.tasks),
    open = tasks.filter((t) => !s.resolutions[t.sourceKey]);
  const completed = tasks.filter((t) => Boolean(s.resolutions[t.sourceKey]));
  // Only operations with an observed audit start + valid completion contribute to timing.
  const durations = completed.flatMap((t) => {
    const started = s.audit.find(
      (a) =>
        a.source === t.sourceKey &&
        ["Staff assignment updated", "Follow-up note added"].includes(a.action),
    );
    const end = s.resolutions[t.sourceKey].at;
    const ms = started ? Date.parse(end) - Date.parse(started.at) : NaN;
    return Number.isFinite(ms) && ms >= 0 ? [ms / 60000] : [];
  });
  return {
    open: open.length,
    unassigned: open.filter((t) => !t.assigneeId).length,
    overdue: open.filter((t) => t.dueOn < day).length,
    due: open.filter((t) => t.dueOn === day).length,
    completed: completed.length,
    notes: tasks.reduce((n, t) => n + t.notes.length, 0),
    sessions: Object.values(s.records).filter(
      (r) => r.kind === "event" && calendarDate(r.startAt!) === day,
    ).length,
    timedCount: durations.length,
    averageMinutes: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null,
  };
}
export function daySchedule(records: SourceRecord[], day: string) {
  return records
    .filter(
      (r) => r.kind === "event" && r.startAt && calendarDate(r.startAt) === day,
    )
    .sort((a, b) => a.startAt!.localeCompare(b.startAt!));
}
