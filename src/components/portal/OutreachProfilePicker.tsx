import { useEffect, useState } from "react";
import { coachPreviewParams } from "@/lib/portal/coach-sharing";
import {
  approvedCoachUrl,
  emptyComposition,
  OUTREACH_FIELDS,
  profileEmailText,
  selectionKey,
  type DraftComposition,
} from "@/lib/portal/outreach-composition";
import AppearanceForm from "./AppearanceForm";

interface Props {
  playerId: string;
  value: DraftComposition;
  onChange: (v: DraftComposition) => void;
  onContent: (text: string, ready: boolean) => void;
  demo: boolean;
}
const labels: Record<string, string> = {
  label: "Player name",
  graduationYear: "Graduation year",
  primaryPosition: "Primary position",
  secondaryPosition: "Secondary position",
  clubName: "Club / team",
  highSchool: "High school",
  playingLevel: "Playing level",
  profileIntroduction: "Introduction",
  achievements: "Achievements",
  stats: "Selected match statistics",
  highlights: "Selected videos / highlights",
  upcomingEvents: "Games, camps & tournaments",
};
type Item = {
  id: string;
  title?: string;
  opponent?: string;
  matchDate?: string;
  date?: string;
};
export default function OutreachProfilePicker({
  playerId,
  value,
  onChange,
  onContent,
  demo,
}: Props) {
  const [catalog, setCatalog] = useState<Record<string, unknown>>({}),
    [records, setRecords] = useState<Item[]>([]),
    [profile, setProfile] = useState<Record<string, unknown>>({});
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [approved, setApproved] = useState(false),
    [addEvent, setAddEvent] = useState(false),
    [revision, setRevision] = useState(0),
    [linkActive, setLinkActive] = useState(false),
    [previewReady, setPreviewReady] = useState(false);
  const [collections, setCollections] = useState<
    Array<{ id: string; name: string; items: string[] }>
  >([]);
  const key = selectionKey(value),
    hasSelection = value.fields.length > 0;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoaded(false);
    setError("");
    async function load() {
      try {
        const base = `/api/parent/players/${encodeURIComponent(playerId)}`;
        const responses = await Promise.all([
          fetch(base + "/coach-preview", {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(base + "/match-records", {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(base + "/collections", {
            credentials: "include",
            signal: controller.signal,
          }),
        ]);
        if (!responses[0].ok)
          throw new Error(
            "Profile information could not load. Coach sharing may be disabled. Retry or use a text-only draft.",
          );
        const data = await responses[0].json();
        setCatalog(data.profile ?? {});
        if (!responses[1].ok)
          throw new Error(
            "Match records could not load. Retry before selecting statistics.",
          );
        const matches = await responses[1].json();
        setRecords(matches.records ?? []);
        if (responses[2].ok) {
          const collectionsData = await responses[2].json();
          setCollections(collectionsData.collections ?? []);
        }
        setLoaded(true);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load profile.");
      }
    }
    void load();
    return () => controller.abort();
  }, [playerId, demo, revision]);
  useEffect(() => {
    setApproved(false);
    setPreviewReady(false);
    setProfile({});
    setLinkActive(false);
    onContent("", !hasSelection);
    if (demo || !hasSelection || !loaded) return;
    const controller = new AbortController();
    async function preview() {
      try {
        const base = `/api/parent/players/${encodeURIComponent(playerId)}`;
        const r = await fetch(
          base +
            "/coach-preview?" +
            coachPreviewParams(
              value.fields,
              value.matches,
              value.media,
              value.events,
            ),
          { credentials: "include", signal: controller.signal },
        );
        if (!r.ok)
          throw new Error(
            "Selected profile content could not load. Retry before copying or sending.",
          );
        const data = await r.json();
        if (controller.signal.aborted) return;
        const p = data.profile ?? {};
        setProfile(p);
        const missingEvents = value.events.filter(
          (id) => !(p.upcomingEvents ?? []).some((e: Item) => e.id === id),
        );
        const missingMedia = value.media.filter(
          (id) => !(p.highlights ?? []).some((e: Item) => e.id === id),
        );
        const missingMatches = value.matches.filter(
          (id) => !records.some((e) => e.id === id),
        );
        if (
          missingEvents.length ||
          missingMedia.length ||
          missingMatches.length
        )
          throw new Error(
            "Some selected records are unavailable. Remove those selections or retry.",
          );
        let url: string | undefined;
        if (value.link && value.link.selection === key) {
          const links = await fetch(base + "/coach-links", {
            credentials: "include",
            signal: controller.signal,
          });
          if (!links.ok)
            throw new Error("Could not verify the saved coach link. Retry.");
          const list = await links.json();
          const link = (list.links ?? []).find(
            (l: { id: string }) => l.id === value.link!.id,
          );
          if (
            link &&
            !link.revokedAt &&
            Date.parse(link.expiresAt) > Date.now()
          )
            url =
              approvedCoachUrl(value.link.url, window.location.origin) ??
              undefined;
          if (!url)
            throw new Error(
              "The saved coach link is unavailable, expired, or revoked. Create a replacement or remove it.",
            );
        }
        if (controller.signal.aborted) return;
        setLinkActive(Boolean(url));
        setPreviewReady(true);
        setError("");
        onContent(
          profileEmailText(p, value, url),
          !value.media.length || Boolean(url),
        );
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Preview unavailable.");
          onContent("", false);
        }
      }
    }
    void preview();
    return () => controller.abort();
  }, [playerId, key, value.link?.id, loaded, revision, demo]);
  function change(next: DraftComposition) {
    onContent("", false);
    setApproved(false);
    onChange(next);
  }
  function toggle(
    group: "fields" | "matches" | "media" | "events",
    id: string,
  ) {
    const next = {
      ...value,
      [group]: value[group].includes(id)
        ? value[group].filter((x) => x !== id)
        : [...value[group], id],
    };
    if (group === "fields" && !next.fields.includes(id)) {
      if (id === "stats") next.matches = [];
      if (id === "highlights") next.media = [];
      if (id === "upcomingEvents") next.events = [];
    }
    change(next);
  }
  async function createLink() {
    if (busy || !approved || !previewReady) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/parent/players/${encodeURIComponent(playerId)}/coach-links`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedFields: value.fields,
            selectedMatchRecords: value.matches,
            selectedMedia: value.media,
            selectedEvents: value.events,
            expiresInDays: 30,
            label: "Outreach email",
          }),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.message ?? data.error ?? "Could not create link");
      const url = approvedCoachUrl(data.shareUrl, window.location.origin);
      if (!url)
        throw new Error(
          "Unexpected coach link address. Check Coach Sharing before retrying.",
        );
      onChange({
        ...value,
        link: {
          id: data.linkId,
          url,
          expiresAt: data.expiresAt,
          selection: key,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  }
  if (demo)
    return (
      <p className="text-xs">
        Profile attachments are available for real players; this demo does not
        access live data.
      </p>
    );
  const media = (catalog.highlights ?? []) as Item[],
    events = (catalog.upcomingEvents ?? []) as Item[];
  return (
    <section
      className="rounded-xl border p-3 space-y-3"
      aria-label="Include from player profile"
    >
      <h3 className="font-semibold">Include from player profile</h3>
      <p className="text-xs">
        Choose what the coach receives. Nothing is shared automatically. Video
        files are accessed through an approved coach link.
      </p>
      {error && (
        <p role="alert" className="text-sm">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRevision((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {!loaded && !error && <p role="status">Loading profile…</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {OUTREACH_FIELDS.map((f) => (
          <label key={f} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!loaded || busy}
              checked={value.fields.includes(f)}
              onChange={() => toggle("fields", f)}
            />
            {labels[f]}
          </label>
        ))}
      </div>
      {(
        [
          ["stats", "matches", records],
          ["highlights", "media", media],
          ["upcomingEvents", "events", events],
        ] as const
      ).map(
        ([field, group, items]) =>
          value.fields.includes(field) && (
            <fieldset key={field} className="space-y-2">
              <legend className="font-medium text-sm">{labels[field]}</legend>
              {items.length === 0 && (
                <p className="text-xs">No saved items available.</p>
              )}
              {items.map((item) => (
                <label key={item.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={value[group].includes(item.id)}
                    onChange={() => toggle(group, item.id)}
                  />
                  {item.title || item.opponent || "Match"}{" "}
                  {item.matchDate || item.date || ""}
                </label>
              ))}
              {value[group]
                .filter((id) => !items.some((i) => i.id === id))
                .map((id) => (
                  <label key={id} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggle(group, id)}
                    />
                    Unavailable selection — uncheck to remove
                  </label>
                ))}
            </fieldset>
          ),
      )}
      {value.fields.includes("highlights") && collections.length > 0 && (
        <fieldset>
          <legend className="text-sm">
            Highlight collections (selects their available videos)
          </legend>
          {collections.map((collection) => {
            const ids = collection.items.filter((id) =>
              media.some((m) => m.id === id),
            );
            return (
              <label key={collection.id} className="flex gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  disabled={!ids.length || busy}
                  checked={
                    ids.length > 0 &&
                    ids.every((id) => value.media.includes(id))
                  }
                  onChange={(e) =>
                    change({
                      ...value,
                      media: e.target.checked
                        ? [...new Set([...value.media, ...ids])]
                        : value.media.filter((id) => !ids.includes(id)),
                    })
                  }
                />
                {collection.name} · {ids.length} videos
              </label>
            );
          })}
        </fieldset>
      )}
      {addEvent ? (
        <AppearanceForm
          playerId={playerId}
          onClose={() => setAddEvent(false)}
          onSaved={() => {
            setAddEvent(false);
            setRevision((n) => n + 1);
          }}
        />
      ) : (
        <button
          type="button"
          className="underline text-sm"
          onClick={() => setAddEvent(true)}
        >
          Add camp or tournament
        </button>
      )}
      {hasSelection && (
        <>
          <h4 className="text-sm font-medium">Selected information preview</h4>
          <pre className="text-xs whitespace-pre-wrap break-words">
            {profileEmailText(profile, value)}
          </pre>
          {linkActive ? (
            <p className="text-sm">
              Approved coach link included. Manage or revoke it in Coach
              Sharing.
            </p>
          ) : (
            <>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!loaded || !previewReady || busy || Boolean(error)}
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I approve sharing the selected information through a link that
                expires in 30 days.
              </label>
              <button
                type="button"
                className="border rounded-lg px-3 py-2"
                disabled={!approved || !previewReady || busy || Boolean(error)}
                onClick={() => void createLink()}
              >
                {busy ? "Creating…" : "Create approved coach link"}
              </button>
            </>
          )}
          {value.link && (
            <button
              type="button"
              className="underline text-xs"
              onClick={() => {
                change({ ...value, link: undefined });
                setError("");
              }}
            >
              Remove link from this draft (does not revoke it)
            </button>
          )}
        </>
      )}
      <button
        type="button"
        className="underline text-xs"
        onClick={() => {
          change(emptyComposition());
          setError("");
        }}
      >
        Clear profile selections
      </button>
      <p className="text-xs">
        Email text cannot be withdrawn after sending. A coach link can expire or
        be revoked. Existing links keep their own permissions when you change
        these selections.
      </p>
    </section>
  );
}
