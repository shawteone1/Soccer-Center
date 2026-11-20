import { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { MonthView } from "../src/components/portal/CalendarViews";
import {
  KEY,
  CLOCK,
  people,
  providers,
  recordKey,
  type SourceRecord,
  type State,
} from "./model";
import {
  load,
  initial,
  sync,
  forHousehold,
  markStale,
  findConflicts,
} from "./store";
import "./style.css";
import OperationsDesk from "./OperationsDesk";
import PilotCenter from "./PilotCenter";
import PilotGate, { type BackendSession } from "./PilotGate";
import { viewRecords, setupOf } from "./pilot";
import { clientCommand } from "./client-command";

function App({ backend }: { backend?: BackendSession }) {
  const [state, setState] = useState(() => backend?.state ?? load());
  const revision = useRef(backend?.revision ?? 0);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(
    backend || location.hash === "#admin" ? "admin" : "member",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [anchor, setAnchor] = useState(new Date(2026, 10, 1));
  const [detail, setDetail] = useState<SourceRecord | null>(null);
  const [action, setAction] = useState("");
  const [storageError, setStorageError] = useState("");
  const sourceTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    document.title =
      role === "admin"
        ? "Soccer City Operations Desk — powered by PlayRcmd"
        : "Soccer City Connect — Fictional demonstration";
  }, [role]);
  function openDetail(r: SourceRecord) {
    sourceTrigger.current = document.activeElement as HTMLElement;
    setDetail(r);
  }
  useEffect(() => {
    if (backend) return;
    const onHash = () =>
      setRole(location.hash === "#admin" ? "admin" : "member");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
      if (e.key === "Tab") {
        e.preventDefault();
        document
          .querySelector<HTMLButtonElement>("[role=dialog] button")
          ?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      sourceTrigger.current?.focus();
    };
  }, [detail]);
  useEffect(() => {
    if (backend) return;
    const listener = (e: StorageEvent) => {
      if (e.key === KEY) setState(load());
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  function update(next: State) {
    if (next === state) return;
    if (backend) {
      if (busy.current) {
        setStorageError("Wait for the current server operation.");
        return;
      }
      busy.current = true;
      setSaving(true);
      void (async () => {
        try {
          const response = await fetch(
            `/pilot-api/orgs/${encodeURIComponent(backend.organization)}/command`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": backend.csrf,
              },
              body: JSON.stringify({
                revision: revision.current,
                command: clientCommand(state, next),
              }),
            },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          revision.current = data.revision;
          setState(data.state);
          setStorageError("");
          setAction(
            "Server confirmed and durably saved the local operation. No provider updated.",
          );
        } catch (e) {
          setAction("");
          setStorageError(
            `Server rejected operation: ${e instanceof Error ? e.message : "unknown error"}. No change was saved.`,
          );
        } finally {
          busy.current = false;
          setSaving(false);
        }
      })();
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage unavailable: changes will not survive refresh.",
      );
    }
    setState(next);
  }
  async function backendConnection(
    provider: (typeof providers)[number],
    operation?: string,
  ) {
    if (!backend) return;
    try {
      const endpoint = operation ? "read" : "oauth/square/start";
      const response = await fetch(
        `/pilot-api/orgs/${encodeURIComponent(backend.organization)}/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": backend.csrf,
          },
          body: JSON.stringify(operation ? { provider, operation } : {}),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.url) {
        const target = new URL(data.url);
        if (target.origin !== "https://connect.squareupsandbox.com")
          throw new Error("UNEXPECTED_AUTHORIZATION_ORIGIN");
        location.assign(target.toString());
      } else {
        revision.current = data.revision;
        setState(data.state);
        setAction(
          "Server completed the approved sandbox read; no production access.",
        );
        setStorageError("");
      }
    } catch (e) {
      setStorageError(
        `Connection dependency: ${e instanceof Error ? e.message : "unavailable"}. No live access was attempted.`,
      );
    }
  }
  function switchRole(next: string) {
    location.hash = next;
    setRole(next);
    setQuery("");
  }
  const family = forHousehold(state, ["parent", "athlete"]);
  const records =
    role === "member"
      ? family
      : viewRecords(state).filter(
          (r) =>
            !query ||
            `${r.title} ${r.sourceId} ${people.find((p) => p.id === r.personId)?.name ?? "Unconfirmed identity"}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        );
  const events = records
    .filter(
      (r) => r.kind === "event" && (filter === "All" || r.provider === filter),
    )
    .sort((a, b) => a.startAt!.localeCompare(b.startAt!));
  const conflicts = findConflicts(Object.values(state.records));
  const requirements = records.filter((r) => r.kind === "requirement");
  const open = family.filter(
    (r) => r.kind === "requirement" && !state.resolutions[recordKey(r)],
  ).length;
  function sourceButton(r: SourceRecord) {
    return (
      <button className="text-button" onClick={() => openDetail(r)}>
        View simulated source · {r.sourceId}
      </button>
    );
  }
  return (
    <div
      className={`city-shell ${role === "admin" ? `ops-shell ${backend ? "backend-mode" : ""}` : ""}`}
    >
      <div className="demo-banner">
        <span>FICTIONAL DEMONSTRATION · No live provider connections</span>
        <button
          onClick={() => {
            update(initial());
            setAction("Demo reset. Only Soccer City Connect data was reset.");
          }}
        >
          Reset demo
        </button>
      </div>
      <header>
        <a
          className="brand"
          href="#member"
          onClick={() => switchRole("member")}
        >
          <span className="brand-mark">SC</span>
          <span>
            {role === "admin" ? (
              <>
                SOCCER CITY <b>OPERATIONS DESK</b>
                <small>powered by PlayRcmd</small>
              </>
            ) : (
              <>
                SOCCER CITY <b>CONNECT</b>
                <small>Powered by Soccer Center</small>
              </>
            )}
          </span>
        </a>
        <div className="role-control">
          <span>
            {backend
              ? `Authenticated local staff: ${backend.user} · ${backend.role}`
              : "Demo view switch · not authentication"}
          </span>
          {!backend && (
            <nav aria-label="Demo portal">
              <button
                aria-pressed={role === "member"}
                onClick={() => switchRole("member")}
              >
                Member portal
              </button>
              <button
                aria-pressed={role === "admin"}
                onClick={() => switchRole("admin")}
              >
                Administrator
              </button>
            </nav>
          )}
          {backend && (
            <button
              onClick={async () => {
                await fetch("/pilot-api/logout", {
                  method: "POST",
                  headers: { "X-CSRF-Token": backend.csrf },
                });
                location.reload();
              }}
            >
              Sign out locally
            </button>
          )}
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">ONE CONNECTED EXPERIENCE</p>
            <h1>
              {role === "member"
                ? "Welcome, Jordan."
                : "Soccer City Operations Desk"}
            </h1>
            <p>
              {role === "member"
                ? "Your family, memberships and upcoming activities — together."
                : "powered by PlayRcmd · Your daily member operations workspace."}
            </p>
          </div>
          <span className="date-chip">
            Demo schedule · November 2026
            <br />
            <small>Fixture clock: {CLOCK}</small>
          </span>
        </div>
        {storageError && (
          <p role="alert" className="notice">
            {storageError}
          </p>
        )}
        {action && (
          <p role="status" className="notice">
            {action}
          </p>
        )}
        {providers
          .filter((p) => state.health[p].stale || state.health[p].error)
          .map((p) => (
            <p className="notice" key={p}>
              {p} · simulated ·{" "}
              {setupOf(state).connections[p].disabled
                ? "access paused"
                : state.health[p].error
                  ? "sync failed"
                  : "stale scenario"}
              . Showing last-known provider records; verify source before
              acting.
            </p>
          ))}
        {saving && <p role="status">Waiting for server acknowledgement…</p>}
        {role === "admin" && (
          <PilotCenter
            state={state}
            update={update}
            inspect={openDetail}
            readOnly={saving || (!!backend && backend.role !== "admin")}
            authorize={
              backend
                ? (p) => {
                    void backendConnection(p);
                  }
                : undefined
            }
            readSandbox={
              backend
                ? (p, op) => {
                    void backendConnection(p, op);
                  }
                : undefined
            }
          />
        )}
        {role === "admin" && (
          <fieldset
            className="pilot-fieldset"
            disabled={saving || backend?.role === "viewer"}
          >
            <OperationsDesk
              state={state}
              update={update}
              inspect={openDetail}
              authenticatedActor={backend?.user}
            />
          </fieldset>
        )}
        {role === "member" && (
          <div className="metrics">
            <section>
              <small>MEMBERSHIP</small>
              <strong>Active</strong>
              <span>Mindbody · simulated</span>
            </section>
            <section>
              <small>FAMILY ACTIVITIES</small>
              <strong>{family.filter((r) => r.kind === "event").length}</strong>
              <span>Across three providers</span>
            </section>
            <section>
              <small>OUTSTANDING ACTIONS</small>
              <strong>{open}</strong>
              <span>
                {open ? "Staff review required" : "Local workflow complete"}
              </span>
            </section>
          </div>
        )}
        {role === "admin" && (
          <section className="panel" id="member-lookup">
            <h2>Member and record search</h2>
            <label>
              Search members, programs or source IDs
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try Alex, Winter or PP-R-200"
              />
            </label>
            <p>
              {records.length} matching source records. Same names are never
              automatically merged.
            </p>
          </section>
        )}
        {role === "member" && (
          <div className="two-columns">
            <section className="panel">
              <h2>
                {role === "member"
                  ? "The Rivera family"
                  : "Family and identity associations"}
              </h2>
              {people
                .filter((p) => p.household === "rivera")
                .map((p) => (
                  <div className="person" key={p.id}>
                    <span className="avatar">
                      {p.name
                        .split(" ")
                        .map((x) => x[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <p>
                        {p.role} · household: {p.household}
                      </p>
                    </div>
                  </div>
                ))}
            </section>
            <section className="panel">
              <h2>Notifications and requirements</h2>
              <p className="muted">
                Membership renewal: December 13, 2026 · simulated
              </p>
              {requirements.map((r) => (
                <article key={recordKey(r)} className="requirement">
                  <span className="badge">Priority · before participation</span>
                  <h3>{r.title} · Alex Rivera</h3>
                  <p>
                    Provider status: <b>{r.rawStatus}</b> · {r.provider}{" "}
                    (simulated)
                  </p>
                  <p>
                    Local workflow:{" "}
                    <b>
                      {state.resolutions[recordKey(r)]
                        ? "Locally resolved"
                        : "Open"}
                    </b>
                  </p>
                  {sourceButton(r)}
                  {state.resolutions[recordKey(r)] ? (
                    <p className="notice">
                      Simulated resolution — no provider updated. Provider
                      confirmation still required.
                    </p>
                  ) : (
                    <p>
                      Staff will review this requirement. Provider eligibility
                      remains unconfirmed.
                    </p>
                  )}
                </article>
              ))}
              {requirements.length === 0 && (
                <p>No requirements match this view.</p>
              )}
            </section>
          </div>
        )}
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Membership and enrollments</h2>
              <p>Source records retain their provider ownership.</p>
            </div>
          </div>
          <div className="record-grid">
            {records
              .filter((r) =>
                ["membership", "registration", "transaction"].includes(r.kind),
              )
              .map((r) => (
                <article className="record" key={recordKey(r)}>
                  <span className="badge">
                    {r.provider} · {r.dataMode ?? "simulated"}
                  </span>
                  <h3>{r.title}</h3>
                  <p>
                    {people.find((p) => p.id === r.personId)?.name ??
                      "Identity unconfirmed"}
                  </p>
                  <p>
                    Provider: <b>{r.rawStatus}</b> · normalized: {r.status}
                  </p>
                  {r.renewal && <p>Renews {r.renewal}</p>}
                  {sourceButton(r)}
                </article>
              ))}
          </div>
          <div className="actions">
            <button
              onClick={() =>
                setAction(
                  "Simulated registration destination. No registration submitted; approved provider links are required for a pilot.",
                )
              }
            >
              Explore registration (simulated)
            </button>
            <button
              onClick={() =>
                setAction(
                  "Simulated booking destination. No booking or payment made; provider authorization is required.",
                )
              }
            >
              Book an activity (simulated)
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Combined calendar</h2>
              <p>Member commitments and program sessions · America/Denver</p>
            </div>
            <label>
              Calendar provider
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["All", ...providers].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <MonthView
            events={events.map((r) => ({
              ...r,
              id: recordKey(r),
              startAt: r.startAt!,
              allDay: false,
              playerId: r.personId,
              playerName: people.find((p) => p.id === r.personId)?.name ?? null,
              eventType: r.provider,
            }))}
            anchor={anchor}
            onPrev={() =>
              setAnchor(
                new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1),
              )
            }
            onNext={() =>
              setAnchor(
                new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
              )
            }
            onEventClick={(r) => openDetail(r)}
            colorMap={
              new Map([
                ["athlete", "#3a6a9c"],
                ["parent", "#153b60"],
              ])
            }
          />
          <div className="agenda" aria-label="Filtered activity list">
            {events.map((r) => (
              <article key={recordKey(r)}>
                <div>
                  <strong>{r.title}</strong>
                  <p>
                    {new Date(r.startAt!).toLocaleString("en-US", {
                      timeZone: "America/Denver",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {r.location} ·{" "}
                    {people.find((p) => p.id === r.personId)?.name}
                  </p>
                  <span>
                    {r.provider} · {r.dataMode ?? "simulated"} · {r.status}
                  </span>
                </div>
                {sourceButton(r)}
              </article>
            ))}
            {events.length === 0 && <p>No activities match your filters.</p>}
          </div>
        </section>
        {role === "admin" && (
          <>
            <section className="panel">
              <h2>Scheduling review</h2>
              {conflicts.length ? (
                conflicts.map((c) => (
                  <p className="notice" key={c.first + c.second}>
                    {c.reason}: {c.first} / {c.second}
                  </p>
                ))
              ) : (
                <p>
                  No participant or field overlaps in the fictional schedule.
                </p>
              )}
              <p>Informational review only. No bookings are changed.</p>
            </section>
            <section className="panel">
              <h2>Simulated provider synchronization</h2>
              <p>
                Read-only adapters · last-known records retained on failure ·
                retry limit: 3 attempts per cycle
              </p>
              <div className="record-grid">
                {providers.map((p) => {
                  const h = state.health[p];
                  return (
                    <article
                      className="record"
                      key={p}
                      data-testid={`health-${p}`}
                    >
                      <h3>{p} · simulated</h3>
                      <span className="badge">
                        {h.error ? "Failed" : h.stale ? "Stale" : "Ready"}
                      </span>
                      <p>Last success: {h.lastSuccess}</p>
                      <p>Last attempt: {h.lastAttempt}</p>
                      <p>Attempts: {h.attempts}/3</p>
                      {h.stale && (
                        <p role="status">
                          Stale / last-known data. Verify source before acting.
                        </p>
                      )}
                      {h.error && <p>{h.error}</p>}
                      <div className="stack">
                        <button
                          disabled={
                            setupOf(state).connections[p].disabled ||
                            !setupOf(state).connections[p].selected ||
                            setupOf(state).connections[p].mode !== "simulated"
                          }
                          onClick={() => update(sync(state, p))}
                        >
                          Sync {p}
                        </button>
                        <button onClick={() => update(sync(state, p, true))}>
                          Simulate {p} failure
                        </button>
                        <button
                          disabled={
                            !h.error ||
                            h.attempts >= 3 ||
                            setupOf(state).connections[p].disabled ||
                            setupOf(state).connections[p].mode !==
                              "simulated" ||
                            !setupOf(state).connections[p].selected
                          }
                          onClick={() => update(sync(state, p, false, true))}
                        >
                          Retry {p}
                        </button>
                        <button
                          disabled={
                            !h.error ||
                            h.attempts >= 3 ||
                            setupOf(state).connections[p].disabled ||
                            setupOf(state).connections[p].mode !==
                              "simulated" ||
                            !setupOf(state).connections[p].selected
                          }
                          onClick={() => update(sync(state, p, true, true))}
                        >
                          Retry {p} with failure
                        </button>
                        <button onClick={() => update(markStale(state, p))}>
                          Mark {p} stale
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <h2>Operational activity and audit history</h2>
              <p>
                Browser-local demonstration history. Every action below is
                simulated.
              </p>
              {state.audit.length === 0 ? (
                <p>No administrative actions yet.</p>
              ) : (
                <ol className="audit">
                  {[...state.audit].reverse().map((a) => (
                    <li key={a.id}>
                      <strong>{a.action}</strong>
                      <p>
                        {a.source} · {a.actor} · {a.mode}
                      </p>
                      <p>
                        {a.before} → {a.after}
                      </p>
                      <small>{a.at}</small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
        <footer>
          {role === "admin"
            ? "Soccer City Operations Desk · powered by PlayRcmd"
            : "Soccer City Connect"}{" "}
          · Fictional functional POC · Existing providers remain authoritative.
        </footer>
      </main>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Simulated source record"
            onClick={(e) => e.stopPropagation()}
          >
            <button autoFocus onClick={() => setDetail(null)}>
              Close source record
            </button>
            <h2>{detail.title}</h2>
            <p className="notice">
              Simulated source viewer · no external provider opened
            </p>
            <dl>
              {Object.entries(detail).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v ?? "Unconfirmed"}</dd>
                </div>
              ))}
            </dl>
            <p>
              Local workflow:{" "}
              {state.resolutions[recordKey(detail)]
                ? "Locally resolved; provider unchanged"
                : "No local resolution"}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("pilot") ? (
    <PilotGate>{(session) => <App backend={session} />}</PilotGate>
  ) : (
    <App />
  ),
);
