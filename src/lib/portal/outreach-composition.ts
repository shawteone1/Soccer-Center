/** Versioned draft content stored in the existing TEXT introduction column.
 * GET decodes it so older drafts and ordinary text consumers remain readable.
 * Selections confer no access: coach-link handlers enforce ownership/consent.
 */
export const OUTREACH_FIELDS = [
  "label",
  "graduationYear",
  "primaryPosition",
  "secondaryPosition",
  "clubName",
  "highSchool",
  "playingLevel",
  "profileIntroduction",
  "achievements",
  "stats",
  "highlights",
  "upcomingEvents",
] as const;
export interface DraftComposition {
  fields: string[];
  matches: string[];
  media: string[];
  events: string[];
  link?: { id: string; url: string; selection: string; expiresAt: string };
}
export const emptyComposition = (): DraftComposition => ({
  fields: [],
  matches: [],
  media: [],
  events: [],
});
const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter(
            (x): x is string =>
              typeof x === "string" && x.length > 0 && x.length <= 128,
          ),
        ),
      ].slice(0, 100)
    : [];
export function normalizeComposition(value: unknown): DraftComposition {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: DraftComposition = {
    fields: ids(v.fields).filter((f) =>
      (OUTREACH_FIELDS as readonly string[]).includes(f),
    ),
    matches: ids(v.matches),
    media: ids(v.media),
    events: ids(v.events),
  };
  const link = v.link as DraftComposition["link"];
  if (
    link &&
    typeof link.id === "string" &&
    link.id.length <= 128 &&
    typeof link.url === "string" &&
    link.url.length <= 2048 &&
    typeof link.selection === "string" &&
    link.selection.length <= 20000 &&
    typeof link.expiresAt === "string"
  )
    result.link = link;
  return result;
}
export function selectionKey(c: DraftComposition): string {
  return JSON.stringify(
    [c.fields, c.matches, c.media, c.events].map((a) => [...a].sort()),
  );
}
const marker = "soccer-center-outreach-v1";
export function encodeDraftContent(
  message: string,
  composition: unknown,
): string {
  const value = JSON.stringify({
    format: marker,
    message: message.slice(0, 2000),
    composition: normalizeComposition(composition),
  });
  if (new TextEncoder().encode(value).length > 60000)
    throw new Error("Too many draft selections. Select fewer items.");
  return value;
}
export function decodeDraftContent(value: unknown): {
  message: string;
  composition: DraftComposition;
} {
  const text = typeof value === "string" ? value : "";
  try {
    const data = JSON.parse(text);
    if (data?.format === marker && typeof data.message === "string")
      return {
        message: data.message,
        composition: normalizeComposition(data.composition),
      };
  } catch {
    /* legacy plain text */
  }
  return { message: text, composition: emptyComposition() };
}
export function approvedCoachUrl(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw, origin);
    return u.origin === origin &&
      !u.username &&
      !u.password &&
      /^\/coach\/profile\/[A-Za-z0-9_-]+$/.test(u.pathname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
/** Deliberate allowlist: never serialize an entire profile or its private URLs. */
export function profileEmailText(
  profile: Record<string, unknown>,
  c: DraftComposition,
  url?: string,
): string {
  const labels: Record<string, string> = {
    label: "Player",
    graduationYear: "Graduation year",
    primaryPosition: "Primary position",
    secondaryPosition: "Secondary position",
    clubName: "Club / team",
    highSchool: "High school",
    playingLevel: "Playing level",
    profileIntroduction: "Introduction",
    achievements: "Achievements",
  };
  const lines: string[] = [];
  for (const key of c.fields) {
    if (!labels[key]) continue;
    const v = profile[key];
    if (typeof v === "string" || typeof v === "number") {
      if (String(v).trim()) lines.push(`${labels[key]}: ${v}`);
    } else if (Array.isArray(v))
      lines.push(
        `${labels[key]}: ${v.filter((x) => typeof x === "string").join("; ")}`,
      );
  }
  if (c.fields.includes("stats")) {
    const stats = profile.stats as Record<string, unknown> | undefined;
    if (stats?.available === true) {
      lines.push(`Selected match statistics (${c.matches.length} records):`);
      for (const k of [
        "gamesPlayed",
        "goals",
        "assists",
        "shots",
        "goalsAgainst",
        "saves",
        "shutouts",
      ])
        if (typeof stats[k] === "number") lines.push(`${k}: ${stats[k]}`);
      lines.push(
        `Coverage: ${String(stats.coverage ?? "unavailable")}; excluded records: ${String(stats.excludedCount ?? "unavailable")}`,
      );
      if (stats.recordedCounts && typeof stats.recordedCounts === "object")
        for (const [metric, count] of Object.entries(stats.recordedCounts))
          if (typeof count === "number")
            lines.push(`${metric}: recorded in ${count} matches`);
    } else lines.push("Selected match statistics: unavailable");
  }
  if (
    c.fields.includes("upcomingEvents") &&
    Array.isArray(profile.upcomingEvents)
  ) {
    const events = profile.upcomingEvents as Array<Record<string, unknown>>;
    for (const e of events)
      if (c.events.includes(String(e.id))) {
        const at = typeof e.startAt === "string" ? e.startAt : "";
        let when = String(e.date ?? "Date unavailable");
        if (
          at &&
          !e.allDay &&
          /(?:Z|[+-]\d\d:\d\d)$/.test(at) &&
          !Number.isNaN(Date.parse(at))
        )
          when =
            new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Denver",
            }).format(new Date(at)) + " (America/Denver)";
        else if (at && !e.allDay) when = at + " (source local time)";
        lines.push(
          `${e.eventType ?? "Event"}: ${e.title ?? "Upcoming appearance"} — ${when}${e.allDay ? " · All day" : ""}${e.location ? " · " + String(e.location) : ""}`,
        );
      }
  }
  if (c.fields.includes("highlights") && Array.isArray(profile.highlights)) {
    for (const h of profile.highlights as Array<Record<string, unknown>>)
      if (c.media.includes(String(h.id)))
        lines.push(`Highlight: ${String(h.title || "Selected video")}`);
  }
  if (url)
    lines.push(`View approved player profile and selected media:\n${url}`);
  return lines.join("\n");
}
