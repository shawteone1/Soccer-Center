import { z } from "zod";
import { providers, staff, type State } from "../model";
import { initial, sync, markStale } from "../store";
import { assignTask, addNote, setFollowUp, completeTask } from "../operations";
import {
  saveSetup,
  connectionAction,
  reviewAssociation,
  applyRules,
  type PilotSetup,
} from "../pilot";
import { rejectSensitive } from "./security";
const provider = z.enum(providers),
  key = z.string().min(1).max(600),
  staffId = z.enum(["morgan", "casey"]);
const connection = z
  .object({
    mode: z.enum(["simulated", "sandbox"]),
    selected: z.boolean(),
    account: z.string().min(1).max(120),
    locations: z.array(z.string().max(120)).max(30),
    programs: z.array(z.string().max(160)).max(100),
    categories: z.array(z.string().max(40)).max(5),
    authorization: z.enum([
      "not-required",
      "unverified",
      "denied",
      "expired",
      "revoked",
      "disconnected",
    ]),
    disabled: z.boolean(),
  })
  .strict();
export const setupSchema = z
  .object({
    organization: z.string().min(1).max(120),
    timezone: z.string().max(80),
    locations: z.array(z.string().min(1).max(120)).min(1).max(30),
    roles: z
      .object({
        morgan: z.enum(["admin", "operator", "viewer"]),
        casey: z.enum(["admin", "operator", "viewer"]),
      })
      .strict(),
    defaultOwner: staffId,
    followUpDays: z.number().int().min(1).max(30),
    step: z.number().int().min(0).max(6),
    complete: z.boolean(),
    connections: z
      .object({
        Mindbody: connection,
        Playpass: connection,
        Square: connection,
      })
      .strict(),
    associations: z.record(z.unknown()),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reset") }).strict(),
  z
    .object({ type: z.literal("assign"), key, owner: staffId.nullable() })
    .strict(),
  z
    .object({ type: z.literal("note"), key, text: z.string().min(1).max(1500) })
    .strict(),
  z
    .object({
      type: z.literal("due"),
      key,
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z.object({ type: z.literal("complete"), key }).strict(),
  z
    .object({
      type: z.literal("sync"),
      provider,
      fail: z.boolean(),
      retry: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("stale"), provider }).strict(),
  z.object({ type: z.literal("setup"), setup: setupSchema }).strict(),
  z
    .object({
      type: z.literal("connection"),
      provider,
      action: z.enum([
        "disconnect",
        "reauthorize",
        "denied",
        "expired",
        "revoked",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("association"),
      key,
      personId: z.enum(["parent", "athlete", "other"]).nullable(),
      reason: z.string().min(1).max(300),
    })
    .strict(),
  z.object({ type: z.literal("rules") }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type Role = "admin" | "operator" | "viewer";
export function execute(
  s: State,
  raw: unknown,
  role: Role,
  actor: string,
): State {
  const c = commandSchema.parse(raw);
  if (role === "viewer") throw new Error("FORBIDDEN");
  if (
    ["setup", "connection", "association", "rules", "reset"].includes(c.type) &&
    role !== "admin"
  )
    throw new Error("FORBIDDEN");
  rejectSensitive(JSON.stringify(c));
  let next = s;
  const staffActor = staff[0].id;
  switch (c.type) {
    case "reset": {
      next = initial();
      next.audit = [
        ...s.audit,
        {
          id: (s.audit.at(-1)?.id ?? 0) + 1,
          at: new Date().toISOString(),
          actor,
          action: "Fictional demo reset",
          source: "local",
          before: "local demo state",
          after: "reset; durable audit retained",
          mode: "simulated",
        },
      ];
      break;
    }
    case "assign":
      next = assignTask(s, c.key, c.owner, staffActor);
      break;
    case "note":
      next = addNote(s, c.key, c.text, staffActor);
      break;
    case "due":
      next = setFollowUp(s, c.key, c.day, staffActor);
      break;
    case "complete":
      next = completeTask(s, c.key, staffActor);
      break;
    case "sync":
      next = sync(s, c.provider, c.fail, c.retry);
      break;
    case "stale":
      next = markStale(s, c.provider);
      break;
    case "setup":
      next = saveSetup(s, c.setup as PilotSetup, actor);
      break;
    case "connection":
      next = connectionAction(s, c.provider, c.action, actor);
      break;
    case "association":
      next = reviewAssociation(s, c.key, c.personId, c.reason, actor);
      break;
    case "rules":
      next = applyRules(s, actor, new Date().toISOString());
      break;
  }
  if (next === s) throw new Error("INVALID_OR_NOOP_ACTION");
  // Authenticated identity always replaces browser-selected demonstration actors.
  const audit = next.audit.map((a, i) =>
    i >= s.audit.length ? { ...a, actor } : a,
  );
  const tasks = Object.fromEntries(
    Object.entries(next.tasks).map(([k, t]) => [
      k,
      {
        ...t,
        notes: t.notes.map((n) =>
          s.tasks[k]?.notes.some((old) => old.id === n.id)
            ? n
            : { ...n, actor },
        ),
      },
    ]),
  );
  return { ...next, audit, tasks };
}
