import type { State, Provider } from "./model";
import { setupOf } from "./pilot";
import type { Command } from "./backend/commands";
export function clientCommand(current: State, next: State): Command {
  if (!next.audit.length) return { type: "reset" };
  const e = next.audit.at(-1)!;
  const key = e.source;
  if (e.action === "Staff assignment updated")
    return {
      type: "assign",
      key,
      owner: next.tasks[key].assigneeId as "morgan" | "casey" | null,
    };
  if (e.action === "Follow-up note added")
    return { type: "note", key, text: next.tasks[key].notes.at(-1)!.text };
  if (e.action === "Follow-up date updated")
    return { type: "due", key, day: next.tasks[key].dueOn };
  if (e.action === "Local workflow resolved") return { type: "complete", key };
  if (e.action.startsWith("Synchronization")) {
    const p = key as Provider;
    return {
      type: "sync",
      provider: p,
      fail: !!next.health[p].error,
      retry: next.health[p].attempts > 1,
    };
  }
  if (e.action === "Stale scenario enabled")
    return { type: "stale", provider: key as Provider };
  if (e.action === "Setup updated")
    return {
      type: "setup",
      setup: setupOf(next) as Extract<Command, { type: "setup" }>["setup"],
    };
  if (e.action.startsWith("Connection "))
    return {
      type: "connection",
      provider: key as Provider,
      action: e.action.split(" ")[1] as "disconnect",
    };
  if (e.action === "Association reviewed") {
    const a = setupOf(next).associations[key];
    return {
      type: "association",
      key,
      personId: a.personId as "parent" | "athlete" | "other" | null,
      reason:
        e.after.split(" · ").slice(1).join(" · ") || "Explicit staff review",
    };
  }
  if (e.action === "Operational defaults applied") return { type: "rules" };
  void current;
  throw new Error("UNSUPPORTED_LOCAL_COMMAND");
}
