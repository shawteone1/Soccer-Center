import {
  CLOCK,
  providers,
  recordKey,
  people,
  staff,
  type State,
  type Provider,
  type SourceRecord,
} from "./model";
export type ConnectionMode = "simulated" | "sandbox" | "live";
export type AuthorizationStatus =
  | "not-required"
  | "unverified"
  | "denied"
  | "expired"
  | "revoked"
  | "disconnected";
export interface Connection {
  mode: ConnectionMode;
  selected: boolean;
  account: string;
  locations: string[];
  programs: string[];
  categories: string[];
  authorization: AuthorizationStatus;
  disabled: boolean;
}
export interface Association {
  decision: "confirmed" | "separate";
  personId: string | null;
  actor: string;
  at: string;
}
export interface PilotSetup {
  organization: string;
  timezone: string;
  locations: string[];
  roles: Record<string, "admin" | "operator" | "viewer">;
  defaultOwner: string;
  followUpDays: number;
  step: number;
  complete: boolean;
  connections: Record<Provider, Connection>;
  associations: Record<string, Association>;
}
export const providerInfo: Record<
  Provider,
  { provides: string; requires: string; categories: string[] }
> = {
  Mindbody: {
    provides:
      "Client references and active membership pricing options; bookings/classes require additional approved endpoints.",
    requires:
      "Developer account/API key, approved site authorization and endpoint-specific staff token. Public sandbox site -99. No generic OAuth assumption.",
    categories: ["memberships", "clients", "schedule"],
  },
  Playpass: {
    provides:
      "Organizer registrations and league schedules. Participant association requires review; payment status is not identity.",
    requires:
      "Organizer-scoped manager API token with creating user permissions and plan eligibility. Player OAuth is a distinct code + PKCE flow; not used for organizer setup. A dedicated sandbox has not been verified; Playpass remains contract-fixture only.",
    categories: ["registrations", "schedule"],
  },
  Square: {
    provides:
      "Seller locations, customer references, order and payment status. Commerce records are not participant enrollments.",
    requires:
      "Developer application, authorized seller OAuth read scopes and a Sandbox test seller. Separate Sandbox tokens. Never request payment-write permissions.",
    categories: ["customers", "locations", "commerce"],
  },
};
export function defaultSetup(): PilotSetup {
  return {
    organization: "Soccer City (fictional)",
    timezone: "America/Denver",
    locations: ["Field 1", "Field 2", "Field 3"],
    roles: { morgan: "admin", casey: "operator" },
    defaultOwner: "morgan",
    followUpDays: 2,
    step: 0,
    complete: false,
    connections: Object.fromEntries(
      providers.map((p) => [
        p,
        {
          mode: "simulated",
          selected: true,
          account: "fictional-soccer-city",
          locations: ["Field 1", "Field 2", "Field 3"],
          programs: [],
          categories: [...providerInfo[p].categories],
          authorization: "not-required",
          disabled: false,
        },
      ]),
    ) as unknown as PilotSetup["connections"],
    associations: {},
  };
}
export const setupOf = (s: State) => s.pilot ?? defaultSetup();
function event(
  s: State,
  pilot: PilotSetup,
  action: string,
  source: string,
  before: string,
  after: string,
  actor = "Demo administrator",
): State {
  return {
    ...s,
    pilot,
    audit: [
      ...s.audit,
      {
        id: (s.audit.at(-1)?.id ?? 0) + 1,
        at: new Date().toISOString(),
        actor,
        action,
        source,
        before,
        after,
        mode: "simulated",
      },
    ],
  };
}
export function saveSetup(
  s: State,
  pilot: PilotSetup,
  actor = "Demo administrator",
): State {
  if (
    !pilot.organization.trim() ||
    !pilot.locations.length ||
    !staff.some((x) => x.id === pilot.defaultOwner) ||
    !Number.isInteger(pilot.followUpDays) ||
    pilot.followUpDays < 1 ||
    pilot.followUpDays > 30
  )
    return s;
  try {
    new Intl.DateTimeFormat("en", { timeZone: pilot.timezone });
  } catch {
    return s;
  }
  for (const p of providers) {
    const c = pilot.connections[p];
    if (
      !c ||
      c.mode === "live" ||
      !c.categories.every((k) => providerInfo[p].categories.includes(k))
    )
      return s;
  }
  // Saved settings cannot assert verified authorization or restore disconnected access.
  const safe = structuredClone(pilot);
  for (const p of providers) {
    const old = setupOf(s).connections[p];
    const c = safe.connections[p];
    c.authorization =
      c.mode === "simulated"
        ? old.disabled
          ? "disconnected"
          : "not-required"
        : "unverified";
    c.disabled = old.disabled;
    if (c.mode !== old.mode) {
      c.authorization = c.mode === "simulated" ? "not-required" : "unverified";
    }
  }
  safe.associations = setupOf(s).associations;
  return event(
    s,
    safe,
    "Setup updated",
    "onboarding",
    String(setupOf(s).step),
    String(safe.step),
    actor,
  );
}
export function connectionAction(
  s: State,
  p: Provider,
  action: "disconnect" | "reauthorize" | "expired" | "revoked" | "denied",
  actor = "Demo administrator",
): State {
  const pilot = structuredClone(setupOf(s)),
    c = pilot.connections[p];
  if (action === "disconnect") {
    c.disabled = true;
    c.authorization = "disconnected";
  } else if (action === "reauthorize") {
    c.disabled = false;
    c.authorization = c.mode === "simulated" ? "not-required" : "unverified";
  } else {
    c.authorization = action;
    c.disabled = true;
  }
  const next = event(
    s,
    pilot,
    `Connection ${action}`,
    p,
    setupOf(s).connections[p].authorization,
    c.authorization,
    actor,
  );
  return {
    ...next,
    health: {
      ...next.health,
      [p]: {
        ...next.health[p],
        stale: true,
        error:
          action === "reauthorize"
            ? null
            : "Access unavailable; last-known data retained",
      },
    },
  };
}
export function reviewAssociation(
  s: State,
  key: string,
  personId: string | null,
  reason: string,
  actor = "Demo administrator",
): State {
  if (
    !s.records[key] ||
    (personId !== null && !people.some((p) => p.id === personId)) ||
    !reason.trim()
  )
    return s;
  const pilot = structuredClone(setupOf(s));
  const old = pilot.associations[key];
  pilot.associations[key] = {
    decision: personId === null ? "separate" : "confirmed",
    personId,
    actor,
    at: new Date().toISOString(),
  };
  return event(
    s,
    pilot,
    "Association reviewed",
    key,
    old ? `${old.decision}:${old.personId}` : "original fixture link",
    `${personId === null ? "keep separate" : `confirm ${personId}`} · ${reason.slice(0, 300)}`,
    actor,
  );
}
export function viewRecords(s: State): SourceRecord[] {
  const links = setupOf(s).associations;
  return Object.values(s.records).map((r) =>
    links[recordKey(r)] ? { ...r, personId: links[recordKey(r)].personId } : r,
  );
}
export function applyRules(
  s: State,
  actor = "Demo administrator",
  at = CLOCK,
): State {
  const config = setupOf(s),
    tasks = { ...s.tasks },
    deadline = followUpDate(config, at);
  for (const [key, t] of Object.entries(tasks))
    if (!s.resolutions[key] && !t.assigneeId)
      tasks[key] = {
        ...t,
        assigneeId: config.defaultOwner,
        dueOn: deadline,
      };
  return {
    ...event(
      s,
      config,
      "Operational defaults applied",
      "tasks",
      "unassigned open tasks",
      JSON.stringify({
        owner: config.defaultOwner,
        followUpDays: config.followUpDays,
        tasks: Object.keys(tasks).filter((k) => tasks[k] !== s.tasks[k]),
      }),
      actor,
    ),
    tasks,
  };
}

export function connectionIsStale(s: State, p: Provider, now = Date.now()) {
  const c = setupOf(s).connections[p],
    h = s.health[p];
  return (
    c.disabled ||
    h.stale ||
    (c.mode === "sandbox" &&
      (!Number.isFinite(Date.parse(h.lastSuccess)) ||
        now - Date.parse(h.lastSuccess) > 60 * 60 * 1000))
  );
}

export function followUpDate(config: PilotSetup, at: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const date = ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
  const due = new Date(`${date}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + config.followUpDays);
  return due.toISOString().slice(0, 10);
}
