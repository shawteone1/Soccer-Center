import { useEffect, useState } from "react";
import {
  coachPreviewParams,
  filterCoachProfile,
} from "@/lib/portal/coach-sharing";
export interface BulkSelection {
  fields: string[];
  matches: string[];
  media: string[];
  events: string[];
}
export const emptyBulkSelection = (): BulkSelection => ({
  fields: [],
  matches: [],
  media: [],
  events: [],
});
type Item = {
  id: string;
  title?: string;
  opponent?: string;
  matchDate?: string;
  date?: string;
};
type Field = { key: string; label: string };
export async function privateJson(url: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      data.message || data.error || `Request failed (${r.status}). Retry.`,
    );
  return data;
}
function PreviewValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span>Not provided</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <PreviewValue value={v} />
          </li>
        ))}
      </ul>
    ) : (
      <span>None selected / available</span>
    );
  if (typeof value === "object")
    return (
      <dl>
        {Object.entries(value)
          .filter(([k]) => !["documents", "url", "thumbnailUrl"].includes(k))
          .map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium">{k.replace(/([A-Z])/g, " $1")}</dt>
              <dd>
                <PreviewValue value={v} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
export default function BulkProfileSelection({
  playerId,
  value,
  onChange,
  onReady,
}: {
  playerId: string;
  value: BulkSelection;
  onChange: (v: BulkSelection) => void;
  onReady: (ready: boolean) => void;
}) {
  const [fields, setFields] = useState<Field[]>([]);
  const [items, setItems] = useState<{
    matches: Item[];
    media: Item[];
    events: Item[];
  }>({ matches: [], media: [], events: [] });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const selection = JSON.stringify(value);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    onReady(false);
    setError("");
    const base = `/api/parent/players/${encodeURIComponent(playerId)}`;
    Promise.all(
      ["/coach-fields", "/coach-preview", "/match-records"].map((path) =>
        privateJson(base + path, { signal: controller.signal }),
      ),
    )
      .then(([f, p, m]) => {
        if (controller.signal.aborted) return;
        setFields(f.fields);
        setItems({
          matches: m.records ?? [],
          media: p.profile?.highlights ?? [],
          events: p.profile?.upcomingEvents ?? [],
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Could not load sharing options. Retry; no information will be shared.",
          );
      });
    return () => controller.abort();
  }, [playerId, revision]);
  useEffect(() => {
    onReady(false);
    setPreview(null);
    if (!loaded || !value.fields.length) return;
    const controller = new AbortController();
    privateJson(
      `/api/parent/players/${encodeURIComponent(playerId)}/coach-preview?${coachPreviewParams(value.fields, value.matches, value.media, value.events)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        if (
          value.fields.some((k) => !fields.some((f) => f.key === k)) ||
          (["matches", "media", "events"] as const).some((group) =>
            value[group].some((id) => !items[group].some((i) => i.id === id)),
          )
        )
          throw new Error(
            "A selected item is unavailable. Remove it or reload.",
          );
        setPreview(filterCoachProfile(data.profile ?? {}, value.fields));
        setError("");
        onReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Selected information could not be verified. Retry before preparing links.",
          );
      });
    return () => controller.abort();
  }, [playerId, selection, loaded, revision]);
  function toggle(group: keyof BulkSelection, id: string) {
    onReady(false);
    const next = {
      ...value,
      [group]: value[group].includes(id)
        ? value[group].filter((x) => x !== id)
        : [...value[group], id],
    };
    if (group === "fields") {
      if (!next.fields.includes("stats")) next.matches = [];
      if (!next.fields.includes("highlights")) next.media = [];
      if (!next.fields.includes("upcomingEvents")) next.events = [];
    }
    onChange(next);
  }
  return (
    <section className="bo-profile">
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRevision((n) => n + 1)}>
            Retry profile
          </button>
        </p>
      )}
      {!loaded && !error && <p role="status">Loading sharing options…</p>}
      <div className="bo-grid">
        {fields.map((f) => (
          <label key={f.key}>
            <input
              type="checkbox"
              checked={value.fields.includes(f.key)}
              onChange={() => toggle("fields", f.key)}
            />
            {f.key === "academics" ? "Academics — UK exams or US GPA" : f.label}
          </label>
        ))}
      </div>
      {(
        [
          ["stats", "matches"],
          ["highlights", "media"],
          ["upcomingEvents", "events"],
        ] as const
      ).map(
        ([field, group]) =>
          value.fields.includes(field) && (
            <fieldset key={group}>
              <legend>Select {group}</legend>
              {items[group].length ? (
                items[group].map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={value[group].includes(item.id)}
                      onChange={() => toggle(group, item.id)}
                    />
                    {item.title || item.opponent || "Match"}{" "}
                    {item.matchDate || item.date}
                  </label>
                ))
              ) : (
                <p>No saved {group} available.</p>
              )}
            </fieldset>
          ),
      )}
      {preview && (
        <details open>
          <summary>Selected profile information</summary>
          <PreviewValue value={preview} />
        </details>
      )}
      <p>
        Only selected fields and records are shared. UK document checklists stay
        private. Links reflect current approved profile fields; they are not
        frozen copies.
      </p>
    </section>
  );
}
