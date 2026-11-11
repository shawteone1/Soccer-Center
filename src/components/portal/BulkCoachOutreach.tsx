import { useEffect, useRef, useState } from "react";
import BulkProfileSelection, {
  emptyBulkSelection,
  privateJson,
  type BulkSelection,
} from "./BulkProfileSelection";
import {
  bulkMessageSchema,
  coachToken,
  MAX_COACHES,
  MAX_PLAYERS,
  outreachEmailText,
  personalize,
  type BulkMessage,
  type DeliveryReceipt,
} from "@/lib/portal/bulk-outreach";
import "@/styles/bulk-coach-outreach.css";
interface Player {
  id: string;
  label: string | null;
  ageBand: string | null;
}
interface Coach {
  coachId: string;
  name: string | null;
  email: string | null;
  program: {
    institution: string;
    gender: string;
    division: string | null;
    state?: string | null;
  };
}
interface Prepared {
  message: BulkMessage;
  state: DeliveryReceipt["state"] | "pending" | "check";
  retryable: boolean;
  note?: string;
}
interface History {
  batchId: string;
  messageId: string;
  recipientEmail: string;
  state: string;
  providerId?: string | null;
}
const eligible = (p: Player) =>
  ["U16", "U17", "U18", "U19"].includes(p.ageBand ?? "");
const statusText: Record<Prepared["state"], string> = {
  pending: "Pending — not submitted",
  sending: "Processing — check history; do not start another batch",
  accepted: "Accepted by email provider (delivery not confirmed)",
  failed: "Provider rejected this message",
  unknown: "Outcome unknown — admin must reconcile before any new send",
  check: "Connection interrupted — check / resume this same batch",
};
export default function BulkCoachOutreach() {
  const [players, setPlayers] = useState<Player[]>([]),
    [coaches, setCoaches] = useState<Coach[]>([]);
  const [selections, setSelections] = useState<Record<string, BulkSelection>>(
    {},
  );
  const [readyProfiles, setReadyProfiles] = useState<Record<string, boolean>>(
    {},
  );
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState(""),
    [subject, setSubject] = useState("Soccer recruiting inquiry — {{college}}");
  const [program, setProgram] = useState("");
  const [division, setDivision] = useState("");
  const [state, setState] = useState("");
  const [emailOnly, setEmailOnly] = useState(false);
  const [introduction, setIntroduction] = useState(
    "I would like to introduce the selected players and learn more about your soccer program.",
  );
  const [approved, setApproved] = useState(false),
    [sendApproved, setSendApproved] = useState(false);
  const [phase, setPhase] = useState<"edit" | "prepare" | "review">("edit");
  const [entries, setEntries] = useState<Prepared[]>([]),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [setup, setSetup] = useState("");
  const [senderReady, setSenderReady] = useState(false),
    [replyTo, setReplyTo] = useState("");
  const [history, setHistory] = useState<History[]>([]),
    [revision, setRevision] = useState(0);
  const batch = useRef(""),
    links = useRef(new Map<string, BulkMessage["profiles"][number]>()),
    lock = useRef(false);
  const messageIds = useRef(new Map<string, string>());
  const selectedPlayers = players.filter((p) => p.id in selections);
  const selectedCoaches = coaches.filter((c) => assignments[c.coachId]?.length);
  const locked = phase !== "edit" || busy;
  const known = (value: string | null | undefined) => value?.trim() || "";
  const divisions = [
    ...new Set(coaches.map((c) => known(c.program.division)).filter(Boolean)),
  ].sort();
  const states = [
    ...new Set(
      coaches.map((c) => known(c.program.state).toUpperCase()).filter(Boolean),
    ),
  ].sort();
  const matches = (c: Coach) =>
    `${c.name ?? ""} ${c.program.institution}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()) &&
    (!program || c.program.gender === program) &&
    (!division ||
      (division === "__unknown"
        ? !known(c.program.division)
        : known(c.program.division) === division)) &&
    (!state ||
      (state === "__unknown"
        ? !known(c.program.state)
        : known(c.program.state).toUpperCase() === state)) &&
    (!emailOnly || Boolean(c.email?.trim()));
  const matchingCoaches = coaches.filter(matches);
  const retainedCoaches = selectedCoaches.filter((c) => !matches(c));
  const visibleCoaches = [...retainedCoaches, ...matchingCoaches];
  function clearFilters() {
    setQuery("");
    setProgram("");
    setDivision("");
    setState("");
    setEmailOnly(false);
  }
  async function refreshStatus() {
    const data = await privateJson("/api/parent/recruiting/bulk-outreach");
    setSenderReady(data.ready === true);
    setReplyTo(data.replyTo ?? "");
    setHistory(data.history ?? []);
    setSetup(data.message ?? "");
    return data;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const data = await privateJson("/api/parent/players");
        if (!active) return;
        setPlayers(data.players ?? []);
        const player = ((data.players as Player[]) ?? []).find(eligible);
        if (player) {
          const directory = await privateJson(
            `/api/parent/recruiting/coaches?playerId=${encodeURIComponent(player.id)}`,
          );
          if (!active) return;
          setCoaches(directory.coaches ?? []);
        }
        try {
          if (active) await refreshStatus();
        } catch (e) {
          if (active) {
            setSenderReady(false);
            setSetup(
              e instanceof Error ? e.message : "Email sender unavailable.",
            );
          }
        }
      } catch {
        if (active)
          setError("Players or coaches could not load. Retry to continue.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (phase === "edit") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);
  function selectPlayer(player: Player) {
    setApproved(false);
    setReadyProfiles((p) => ({ ...p, [player.id]: false }));
    if (player.id in selections) {
      setSelections((p) => {
        const n = { ...p };
        delete n[player.id];
        return n;
      });
      setAssignments((p) =>
        Object.fromEntries(
          Object.entries(p).map(([id, ids]) => [
            id,
            ids.filter((x) => x !== player.id),
          ]),
        ),
      );
    } else if (selectedPlayers.length < MAX_PLAYERS)
      setSelections((p) => ({ ...p, [player.id]: emptyBulkSelection() }));
  }
  function assign(coach: Coach, playerId: string) {
    setApproved(false);
    setError("");
    const ids = assignments[coach.coachId] ?? [];
    if (!ids.length) {
      if (selectedCoaches.length >= MAX_COACHES) {
        setError("Choose at most 20 coaches per batch.");
        return;
      }
      if (
        selectedCoaches.some(
          (c) =>
            c.email?.trim().toLowerCase() === coach.email?.trim().toLowerCase(),
        )
      ) {
        setError(
          "That email address already has a coach selected. Assign all intended players to that recipient.",
        );
        return;
      }
    }
    setAssignments((p) => ({
      ...p,
      [coach.coachId]: ids.includes(playerId)
        ? ids.filter((id) => id !== playerId)
        : [...ids, playerId],
    }));
  }
  async function prepare() {
    if (
      lock.current ||
      !approved ||
      !selectedCoaches.length ||
      selectedPlayers.some((p) => !readyProfiles[p.id])
    )
      return;
    lock.current = true;
    setBusy(true);
    setPhase("prepare");
    setError("");
    if (!batch.current) batch.current = crypto.randomUUID();
    try {
      // Validate every recipient/message before creating any links.
      for (const c of selectedCoaches) {
        bulkMessageSchema.parse({
          batchId: batch.current,
          messageId: crypto.randomUUID(),
          consent: true,
          coachId: c.coachId,
          recipientEmail: c.email,
          coachName: c.name || "Coach",
          institution: c.program.institution,
          subject: personalize(subject, {
            name: c.name || "Coach",
            institution: c.program.institution,
          }),
          introduction: personalize(introduction, {
            name: c.name || "Coach",
            institution: c.program.institution,
          }),
          profiles: assignments[c.coachId].map((playerId) => ({
            playerId,
            linkId: "pending",
            url: `${window.location.origin}/coach/profile/${"a".repeat(43)}`,
          })),
        });
      }
      const prepared: Prepared[] = [];
      for (const c of selectedCoaches) {
        const profiles: BulkMessage["profiles"] = [];
        for (const playerId of assignments[c.coachId]) {
          const key = `${c.coachId}:${playerId}`;
          let profile = links.current.get(key);
          if (!profile) {
            const v = selections[playerId];
            const result = await privateJson(
              `/api/parent/players/${encodeURIComponent(playerId)}/coach-links`,
              {
                method: "POST",
                body: JSON.stringify({
                  approvedFields: v.fields,
                  selectedMatchRecords: v.matches,
                  selectedMedia: v.media,
                  selectedEvents: v.events,
                  expiresInDays: 30,
                  label: `Bulk ${batch.current.slice(0, 8)} · ${c.name || "Coach"}`,
                }),
              },
            );
            if (
              !coachToken(result.shareUrl, window.location.origin) ||
              typeof result.linkId !== "string"
            )
              throw new Error(
                "Unexpected link response. Review Coach Sharing before retrying.",
              );
            profile = { playerId, linkId: result.linkId, url: result.shareUrl };
            links.current.set(key, profile);
          }
          profiles.push(profile);
        }
        if (!messageIds.current.has(c.coachId))
          messageIds.current.set(c.coachId, crypto.randomUUID());
        prepared.push({
          state: "pending",
          retryable: false,
          message: bulkMessageSchema.parse({
            batchId: batch.current,
            messageId: messageIds.current.get(c.coachId),
            consent: true,
            coachId: c.coachId,
            recipientEmail: c.email,
            coachName: c.name || "Coach",
            institution: c.program.institution,
            subject: personalize(subject, {
              name: c.name || "Coach",
              institution: c.program.institution,
            }),
            introduction: personalize(introduction, {
              name: c.name || "Coach",
              institution: c.program.institution,
            }),
            profiles,
          }),
        });
      }
      setEntries(prepared);
      setPhase("review");
      setSendApproved(false);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Check each recipient and message. Subjects must fit 200 characters and introductions 2,000. Do not paste coach-profile links into the message.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function updateEntry(id: string, change: Partial<Prepared>) {
    setEntries((list) =>
      list.map((e) => (e.message.messageId === id ? { ...e, ...change } : e)),
    );
  }
  async function sendBatch() {
    if (lock.current || !sendApproved || !senderReady) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      for (const entry of entries) {
        if (
          !(
            entry.state === "pending" ||
            entry.state === "check" ||
            entry.state === "sending" ||
            (entry.state === "failed" && entry.retryable)
          )
        )
          continue;
        updateEntry(entry.message.messageId, { state: "sending", note: "" });
        try {
          const result = (await privateJson(
            "/api/parent/recruiting/bulk-outreach",
            { method: "POST", body: JSON.stringify(entry.message) },
          )) as DeliveryReceipt;
          if (
            !["accepted", "failed", "unknown", "sending"].includes(result.state)
          )
            throw new Error("Unexpected status. Check history.");
          updateEntry(entry.message.messageId, {
            state: result.state,
            retryable: result.retryable,
            note: result.retryable
              ? `Wait at least ${result.retryAfterSeconds || 60} seconds, then retry this batch.`
              : "",
          });
        } catch (e) {
          updateEntry(entry.message.messageId, {
            state: "check",
            note: e instanceof Error ? e.message : "Check delivery history.",
          });
          break; // Stop on request/auth/config failures; remaining recipients stay pending.
        }
      }
      try {
        await refreshStatus();
      } catch {
        setError(
          "Could not refresh history. Keep this batch open and retry status.",
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function discard() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Only offered before any delivery attempt. Revoke known prepared links.
      for (const [key, profile] of links.current) {
        const response = await fetch(
          `/api/parent/players/${encodeURIComponent(profile.playerId)}/coach-links/${encodeURIComponent(profile.linkId)}`,
          { method: "DELETE", credentials: "include", cache: "no-store" },
        );
        if (!response.ok && response.status !== 404)
          throw new Error("Revoke failed");
        links.current.delete(key);
      }
      links.current.clear();
      messageIds.current.clear();
      batch.current = "";
      setEntries([]);
      setPhase("edit");
      setApproved(false);
      setSendApproved(false);
    } catch {
      setError(
        "Some links could not be revoked. Retry or revoke them in the player’s Coach Sharing tab before starting over.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const attempted = entries.some((e) => e.state !== "pending");
  const canResume = entries.some(
    (e) =>
      ["pending", "check", "sending"].includes(e.state) ||
      (e.state === "failed" && e.retryable),
  );
  return (
    <section className="bo-wrap" aria-label="Bulk coach outreach">
      <h2>Reach multiple coaches</h2>
      <p>
        Select up to 5 players and 20 coaches, assign profiles, then review and
        send separate emails in one batch. Other coaches’ addresses are never
        included.
      </p>
      <p>
        U16–U19 access is a product rule, not confirmation of recruiting
        eligibility. Replies go to your account email
        {replyTo ? `: ${replyTo}` : ""}.
      </p>
      {loading && <p role="status">Loading players and coach directory…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          {phase === "edit" && (
            <button onClick={() => setRevision((n) => n + 1)}>Reload</button>
          )}
        </p>
      )}
      {setup && (
        <p role="status">
          {setup}{" "}
          <button
            disabled={busy}
            onClick={() =>
              void refreshStatus().catch((e) => setSetup(e.message))
            }
          >
            Check sender status
          </button>
        </p>
      )}
      <fieldset disabled={locked || loading}>
        <legend>1. Choose players and sharing permissions</legend>
        {players.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              disabled={
                !eligible(p) ||
                (!(p.id in selections) && selectedPlayers.length >= MAX_PLAYERS)
              }
              checked={p.id in selections}
              onChange={() => selectPlayer(p)}
            />
            {p.label || "Player"} · {p.ageBand || "Age group not set"}
            {!eligible(p) ? " — outreach requires U16–U19" : ""}
          </label>
        ))}
        {!loading && !players.length && (
          <p>Add a player in the parent portal first.</p>
        )}
        {selectedPlayers.map((p) => (
          <article key={p.id}>
            <h3>{p.label || "Player"} — sharing selections</h3>
            <BulkProfileSelection
              playerId={p.id}
              value={selections[p.id]}
              onChange={(v) => {
                setApproved(false);
                setReadyProfiles((r) => ({ ...r, [p.id]: false }));
                setSelections((s) => ({ ...s, [p.id]: v }));
              }}
              onReady={(r) =>
                setReadyProfiles((s) =>
                  s[p.id] === r ? s : { ...s, [p.id]: r },
                )
              }
            />
          </article>
        ))}
        <h3>2. Assign players to coaches</h3>
        <label>
          Find coaches or colleges
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="bo-grid">
          <label>
            Program
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option value="">All programs</option>
              <option value="mens">Men’s soccer</option>
              <option value="womens">Women’s soccer</option>
            </select>
          </label>
          <label>
            Division
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              <option value="">All divisions</option>
              {divisions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__unknown">Division not listed</option>
            </select>
          </label>
          <label>
            State
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__unknown">State not listed</option>
            </select>
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={emailOnly}
            onChange={(e) => setEmailOnly(e.target.checked)}
          />
          Has a published email
        </label>
        <button type="button" onClick={clearFilters}>
          Clear search filters
        </button>
        <p role="status">
          {matchingCoaches.length} matching coaches in the loaded directory
          {retainedCoaches.length
            ? `; ${retainedCoaches.length} selected outside these filters remain visible`
            : ""}
          .
        </p>
        {coaches.length >= 500 && (
          <p>
            The current directory response is limited to 500 coaches. These
            filters search loaded records, not a complete national directory.
          </p>
        )}
        {!loading && coaches.length > 0 && matchingCoaches.length === 0 && (
          <p>
            No coaches match these filters. Clear or broaden your search;
            existing assignments are kept.
          </p>
        )}
        <p>
          {selectedCoaches.length} coaches selected. A check beside a player
          assigns that profile to that coach only.
        </p>
        <div className="bo-directory">
          {visibleCoaches.map((c) => (
            <article key={c.coachId}>
              <h3>
                {c.name || "Coach"} · {c.program.institution}
              </h3>
              {!matches(c) && <p>Selected — outside current filters</p>}
              <p>
                {c.program.gender === "mens"
                  ? "Men’s soccer"
                  : c.program.gender === "womens"
                    ? "Women’s soccer"
                    : "Program not listed"}{" "}
                · {c.program.division || "Division not listed"} ·{" "}
                {c.program.state || "State not listed"} ·{" "}
                {c.email || "No published email — unavailable for sending"}
              </p>
              {selectedPlayers.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    disabled={!c.email}
                    checked={assignments[c.coachId]?.includes(p.id) ?? false}
                    onChange={() => assign(c, p.id)}
                  />
                  Send {p.label || "player"} profile to {c.name || "Coach"}
                </label>
              ))}
            </article>
          ))}
        </div>
        {!loading && !coaches.length && (
          <p>
            No available coaches. Check the player age group and directory
            setup.
          </p>
        )}
        <h3>3. Write your message</h3>
        <p>
          Use {"{{coach}}"} or {"{{college}}"} to personalize. Profile details
          are shared through links only.
        </p>
        <label>
          Subject
          <input
            value={subject}
            maxLength={200}
            onChange={(e) => {
              setSubject(e.target.value);
              setApproved(false);
            }}
          />
        </label>
        <label>
          Introduction
          <textarea
            rows={5}
            value={introduction}
            maxLength={2000}
            onChange={(e) => {
              setIntroduction(e.target.value);
              setApproved(false);
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          I approve these assignments and selected information being accessible
          through individual links that expire in 30 days.
        </label>
      </fieldset>
      {phase !== "review" && (
        <button
          disabled={
            busy ||
            !approved ||
            !selectedCoaches.length ||
            !selectedPlayers.length ||
            selectedPlayers.some((p) => !readyProfiles[p.id])
          }
          onClick={() => void prepare()}
        >
          {busy
            ? "Preparing…"
            : phase === "prepare"
              ? "Retry preparation (reuse known links)"
              : "Prepare links & review emails"}
        </button>
      )}
      {phase === "review" && (
        <>
          <h3>4. Review each recipient’s email</h3>
          <p>
            Batch {batch.current}. Keep this page open until the batch is
            resolved; private drafts and raw links are not saved in browser
            storage.
          </p>
          {entries.map((e) => (
            <article key={e.message.messageId} className="bo-email">
              <h3>
                To: {e.message.coachName} · {e.message.recipientEmail}
              </h3>
              <p>Subject: {e.message.subject}</p>
              <pre>{outreachEmailText(e.message)}</pre>
              {e.message.profiles.map((p, i) => (
                <a
                  key={p.linkId}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Preview profile {i + 1}:{" "}
                  {players.find((x) => x.id === p.playerId)?.label || "Player"}
                </a>
              ))}
              <p role="status">
                {statusText[e.state]} {e.note}
              </p>
            </article>
          ))}
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={sendApproved}
              onChange={(e) => setSendApproved(e.target.checked)}
            />
            I reviewed every recipient, assigned profile, email and reply-to
            address. Send these separate emails.
          </label>
          <button
            disabled={busy || !sendApproved || !senderReady || !canResume}
            onClick={() => void sendBatch()}
          >
            {busy
              ? "Processing batch…"
              : attempted
                ? "Check / resume unfinished messages"
                : `Send ${entries.length} separate emails`}
          </button>
          <p>
            “Accepted” means the email provider accepted the message, not that
            it reached an inbox. Failed rate-limited messages can be retried
            after the indicated wait. Unknown or stuck-processing outcomes need
            an admin to reconcile provider logs; they are never automatically
            resent.
          </p>
        </>
      )}
      {phase !== "edit" && !attempted && (
        <button disabled={busy} onClick={() => void discard()}>
          Discard prepared batch & revoke its links
        </button>
      )}
      {attempted &&
        !busy &&
        entries.every(
          (e) =>
            e.state === "accepted" || (e.state === "failed" && !e.retryable),
        ) && (
          <button
            onClick={() => {
              links.current.clear();
              messageIds.current.clear();
              batch.current = "";
              setEntries([]);
              setAssignments({});
              setPhase("edit");
              setApproved(false);
              setSendApproved(false);
            }}
          >
            Start a new batch (keep sent profile links active)
          </button>
        )}
      {attempted && (
        <p>
          Manage expiry or revoke links in each player’s Build Profile / Coach
          Sharing tools. Before starting a new batch, check history for this one
          to avoid contacting a coach twice.
        </p>
      )}
      <details>
        <summary>Recent delivery history</summary>
        <button
          disabled={busy}
          onClick={() => void refreshStatus().catch((e) => setError(e.message))}
        >
          Refresh delivery history
        </button>
        {history.length ? (
          history.map((h) => (
            <p key={h.messageId}>
              {h.recipientEmail} · {h.state} · batch {h.batchId} · message{" "}
              {h.messageId}
              {h.providerId ? ` · provider ${h.providerId}` : ""}
            </p>
          ))
        ) : (
          <p>No delivery records loaded.</p>
        )}
      </details>
    </section>
  );
}
