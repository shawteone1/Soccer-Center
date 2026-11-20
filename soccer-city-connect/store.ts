import {
  CLOCK,
  KEY,
  providers,
  recordKey,
  type State,
  type Provider,
  type Audit,
  type SourceRecord,
} from "./model";
import { mindbody } from "./adapters/mindbody";
import { playpass } from "./adapters/playpass";
import { square } from "./adapters/square";
import { seedTasks } from "./operations";
import { setupOf, viewRecords } from "./pilot";
export const adapters = {
  Mindbody: mindbody,
  Playpass: playpass,
  Square: square,
};
function audit(
  s: State,
  action: string,
  source: string,
  before: string,
  after: string,
  actor = "Demo administrator",
): State {
  const entry: Audit = {
    id: (s.audit.at(-1)?.id ?? 0) + 1,
    at: new Date().toISOString(),
    actor,
    action,
    source,
    before,
    after,
    mode: "simulated",
  };
  return { ...s, audit: [...s.audit, entry] };
}
export function initial(): State {
  const records: State["records"] = {};
  for (const p of providers)
    for (const r of adapters[p].read(false)) records[recordKey(r)] = r;
  return {
    version: 1,
    records,
    health: Object.fromEntries(
      providers.map((p) => [
        p,
        {
          lastAttempt: CLOCK,
          lastSuccess: CLOCK,
          error: null,
          attempts: 0,
          stale: false,
        },
      ]),
    ) as State["health"],
    resolutions: {},
    tasks: seedTasks(records),
    audit: [],
  };
}
export function sync(
  s: State,
  p: Provider,
  fail = false,
  retry = false,
): State {
  const connection = setupOf(s).connections[p];
  if (
    connection.disabled ||
    !connection.selected ||
    connection.mode !== "simulated"
  )
    return s;
  const old = s.health[p];
  const attempts = retry ? old.attempts + 1 : 1;
  if (retry && (!old.error || old.attempts >= adapters[p].maxAttempts))
    return s;
  const at = new Date().toISOString();
  let next = { ...s, records: { ...s.records }, health: { ...s.health } };
  try {
    for (const r of adapters[p].read(fail))
      next.records[recordKey(r)] = { ...r, importedAt: at };
    next.health[p] = {
      lastAttempt: at,
      lastSuccess: at,
      error: null,
      attempts,
      stale: false,
    };
    next = audit(
      next,
      "Synchronization succeeded",
      p,
      old.error ?? "ready",
      `${attempts} attempt(s); source records refreshed`,
      "Simulated connector",
    );
  } catch {
    next.health[p] = {
      ...old,
      lastAttempt: at,
      error: "Simulated source unavailable",
      attempts,
      stale: true,
    };
    next = audit(
      next,
      "Synchronization failed",
      p,
      "last-known records",
      `retained; attempt ${attempts}/3`,
      "Simulated connector",
    );
  }
  return next;
}
export function resolve(s: State, r: SourceRecord): State {
  const key = recordKey(r);
  if (r.kind !== "requirement" || !s.records[key] || s.resolutions[key])
    return s;
  const at = new Date().toISOString();
  return audit(
    {
      ...s,
      resolutions: {
        ...s.resolutions,
        [key]: {
          at,
          note: "Reviewed in fictional demonstration; provider confirmation still required.",
        },
      },
    },
    "Local workflow resolved",
    key,
    "open",
    "locally resolved; provider remains " + r.rawStatus,
  );
}
export function markStale(s: State, p: Provider): State {
  return audit(
    { ...s, health: { ...s.health, [p]: { ...s.health[p], stale: true } } },
    "Stale scenario enabled",
    p,
    "fresh",
    "stale (simulated)",
  );
}
export function forHousehold(s: State, ids: string[]) {
  return viewRecords(s).filter(
    (r) => r.personId !== null && ids.includes(r.personId),
  );
}
export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (
        s.version === 1 &&
        s.records &&
        s.health &&
        s.resolutions &&
        Array.isArray(s.audit) &&
        providers.every((p) => s.health[p])
      )
        return { ...s, tasks: { ...seedTasks(s.records), ...s.tasks } };
    }
  } catch {
    /* corrupt/unavailable storage falls back to fictional fixtures */
  }
  return initial();
}

/** Informational overlaps only; never changes authoritative bookings. */
export function findConflicts(records: SourceRecord[]) {
  const events = records.filter(
    (r) =>
      r.kind === "event" && r.startAt && r.endAt && r.status === "confirmed",
  );
  const conflicts: { first: string; second: string; reason: string }[] = [];
  for (let i = 0; i < events.length; i++)
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i],
        b = events[j];
      if (
        Date.parse(a.startAt!) < Date.parse(b.endAt!) &&
        Date.parse(b.startAt!) < Date.parse(a.endAt!)
      ) {
        const participant = a.personId !== null && a.personId === b.personId;
        const field = Boolean(a.location && a.location === b.location);
        if (participant || field)
          conflicts.push({
            first: recordKey(a),
            second: recordKey(b),
            reason: participant ? "Participant overlap" : "Field overlap",
          });
      }
    }
  return conflicts;
}
