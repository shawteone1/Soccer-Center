import { useState } from "react";
import {
  providers,
  people,
  recordKey,
  staff,
  type State,
  type SourceRecord,
} from "./model";
import {
  setupOf,
  saveSetup,
  providerInfo,
  reviewAssociation,
  connectionAction,
  applyRules,
  connectionIsStale,
  type PilotSetup,
} from "./pilot";
import { sync } from "./store";
const steps = [
  "Organization",
  "Staff & rules",
  "Providers",
  "Import preview",
  "Member review",
  "Readiness",
];
export default function PilotCenter({
  state,
  update,
  inspect,
  readOnly = false,
  authorize,
  readSandbox,
}: {
  authorize?: (p: (typeof providers)[number]) => void;
  readSandbox?: (p: (typeof providers)[number], operation: string) => void;
  state: State;
  update: (s: State) => void;
  inspect: (r: SourceRecord) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"setup" | "connections">("setup"),
    [draft, setDraft] = useState<PilotSetup>(() =>
      structuredClone(setupOf(state)),
    ),
    [message, setMessage] = useState(""),
    [reviewPerson, setReviewPerson] = useState<Record<string, string>>({}),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [locationText, setLocationText] = useState(
      setupOf(state).locations.join(", "),
    ),
    [readOperation, setReadOperation] = useState<Record<string, string>>({
      Mindbody: "clients",
      Square: "locations",
      Playpass: "registrations",
    });
  const current = setupOf(state);
  const persist = (next: PilotSetup) => {
    const saved = saveSetup(state, next);
    if (saved === state) {
      setMessage(
        "Check organization, location, timezone and operational rule values. Live mode is disabled.",
      );
      return;
    }
    update(saved);
    setDraft(structuredClone(setupOf(saved)));
    setMessage(
      "Setup saved. Resume this step after refresh. No provider authorization has been established.",
    );
  };
  const changeConnection = (
    p: (typeof providers)[number],
    key: string,
    value: unknown,
  ) =>
    setDraft({
      ...draft,
      connections: {
        ...draft.connections,
        [p]: { ...draft.connections[p], [key]: value },
      },
    });
  return (
    <section
      className="panel pilot-center"
      aria-label="Pilot setup and connections"
    >
      <div className="section-heading">
        <div>
          <h2>Pilot setup & connection center</h2>
          <p>
            {current.complete
              ? "Setup reviewed — provider authorization still required."
              : `Resumable setup · step ${Math.min(current.step + 1, 6)} of 6`}
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(!open);
            setDraft(structuredClone(setupOf(state)));
            setLocationText(setupOf(state).locations.join(", "));
          }}
        >
          {" "}
          {open ? "Close setup" : "Open setup & connections"}
        </button>
      </div>
      {open && (
        <>
          <div className="actions">
            <button
              aria-pressed={tab === "setup"}
              onClick={() => {
                setTab("setup");
                setDraft(structuredClone(setupOf(state)));
              }}
            >
              Guided onboarding
            </button>
            <button
              aria-pressed={tab === "connections"}
              onClick={() => setTab("connections")}
            >
              Connection center
            </button>
          </div>
          <p role="status">{message}</p>
          <fieldset disabled={readOnly} className="pilot-fieldset">
            {tab === "setup" ? (
              <>
                <ol className="setup-steps" aria-label="Onboarding progress">
                  {steps.map((s, i) => (
                    <li
                      key={s}
                      aria-current={draft.step === i ? "step" : undefined}
                    >
                      {i + 1}. {s}
                    </li>
                  ))}
                </ol>
                <h3>{steps[draft.step] ?? steps[5]}</h3>
                <p>
                  Organization timezone controls follow-up deadlines. The
                  preserved fictional activity calendar remains explicitly
                  displayed in America/Denver.
                </p>
                {draft.step === 0 && (
                  <div className="ops-fields">
                    <label>
                      Organization name
                      <input
                        value={draft.organization}
                        maxLength={120}
                        onChange={(e) =>
                          setDraft({ ...draft, organization: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Timezone
                      <select
                        aria-label="Organization timezone"
                        value={draft.timezone}
                        onChange={(e) =>
                          setDraft({ ...draft, timezone: e.target.value })
                        }
                      >
                        {[
                          "America/Denver",
                          "America/Chicago",
                          "America/New_York",
                          "America/Los_Angeles",
                          "UTC",
                        ].map((z) => (
                          <option key={z}>{z}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Locations (comma separated)
                      <input
                        value={locationText}
                        onChange={(e) => setLocationText(e.target.value)}
                        onBlur={() =>
                          setDraft({
                            ...draft,
                            locations: locationText
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {draft.step === 1 && (
                  <>
                    <p>
                      Operational role planning only. Secure backend permissions
                      are provisioned server-side and cannot be granted by these
                      settings.
                    </p>
                    <div className="ops-fields">
                      {staff.map((s) => (
                        <label key={s.id}>
                          {s.name} planned role
                          <select
                            aria-label={`${s.name} planned role`}
                            value={draft.roles[s.id]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                roles: {
                                  ...draft.roles,
                                  [s.id]: e.target.value,
                                },
                              } as PilotSetup)
                            }
                          >
                            <option>admin</option>
                            <option>operator</option>
                            <option>viewer</option>
                          </select>
                        </label>
                      ))}
                      <label>
                        Default task owner
                        <select
                          aria-label="Default task owner"
                          value={draft.defaultOwner}
                          onChange={(e) =>
                            setDraft({ ...draft, defaultOwner: e.target.value })
                          }
                        >
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Follow-up deadline (days)
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={draft.followUpDays}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              followUpDays: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => {
                        persist(draft);
                        setMessage(
                          "Save the rule settings, then use Apply defaults to assign unassigned open tasks.",
                        );
                      }}
                    >
                      Save rule settings
                    </button>
                    <button
                      onClick={() => {
                        update(applyRules(state));
                        setMessage(
                          "Defaults applied to unassigned open tasks only; source and completed tasks preserved.",
                        );
                      }}
                    >
                      Apply saved defaults to open tasks
                    </button>
                  </>
                )}
                {draft.step === 2 &&
                  providers.map((p) => (
                    <article className="record" key={p}>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.connections[p].selected}
                          onChange={(e) =>
                            changeConnection(p, "selected", e.target.checked)
                          }
                        />{" "}
                        Include {p}
                      </label>
                      <p>{providerInfo[p].provides}</p>
                      <p>Authorization required: {providerInfo[p].requires}</p>
                      <label>
                        {p} mode
                        <select
                          aria-label={`${p} setup mode`}
                          value={draft.connections[p].mode}
                          onChange={(e) =>
                            changeConnection(p, "mode", e.target.value)
                          }
                        >
                          <option value="simulated">Simulated</option>
                          <option value="sandbox">
                            Sandbox (authorization required)
                          </option>
                          <option value="live" disabled>
                            Live — disabled
                          </option>
                        </select>
                      </label>
                      <label>
                        {p} selected account reference
                        <input
                          maxLength={120}
                          value={draft.connections[p].account}
                          onChange={(e) =>
                            changeConnection(p, "account", e.target.value)
                          }
                        />
                      </label>
                      <p>
                        References only. Never enter credentials, API keys or
                        tokens here.
                      </p>
                    </article>
                  ))}
                {draft.step === 3 &&
                  providers
                    .filter((p) => draft.connections[p].selected)
                    .map((p) => (
                      <article key={p} className="record">
                        <h4>{p} fictional import preview</h4>
                        <p>
                          Nothing below is imported from a real provider
                          account.
                        </p>
                        <div className="ops-fields">
                          <label>
                            {p} locations to include
                            <select
                              multiple
                              aria-label={`${p} locations to include`}
                              value={draft.connections[p].locations}
                              onChange={(e) =>
                                changeConnection(
                                  p,
                                  "locations",
                                  Array.from(
                                    e.target.selectedOptions,
                                    (x) => x.value,
                                  ),
                                )
                              }
                            >
                              {draft.locations.map((l) => (
                                <option key={l}>{l}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {p} programs to include
                            <select
                              multiple
                              aria-label={`${p} programs to include`}
                              value={draft.connections[p].programs}
                              onChange={(e) =>
                                changeConnection(
                                  p,
                                  "programs",
                                  Array.from(
                                    e.target.selectedOptions,
                                    (x) => x.value,
                                  ),
                                )
                              }
                            >
                              {Object.values(state.records)
                                .filter(
                                  (r) =>
                                    r.provider === p &&
                                    [
                                      "event",
                                      "registration",
                                      "program",
                                    ].includes(r.kind),
                                )
                                .map((r) => (
                                  <option key={recordKey(r)}>{r.title}</option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          Sandbox provider location IDs (comma separated)
                          <input
                            aria-label={`${p} sandbox location IDs`}
                            defaultValue={draft.connections[p].locations.join(
                              ",",
                            )}
                            onBlur={(e) =>
                              changeConnection(
                                p,
                                "locations",
                                e.target.value
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              )
                            }
                          />
                        </label>
                        <label>
                          Sandbox program IDs (comma separated)
                          <input
                            aria-label={`${p} sandbox program IDs`}
                            defaultValue={draft.connections[p].programs.join(
                              ",",
                            )}
                            onBlur={(e) =>
                              changeConnection(
                                p,
                                "programs",
                                e.target.value
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              )
                            }
                          />
                        </label>
                        <p>
                          Empty program selection means all programs. Sandbox
                          account/location IDs must be confirmed separately;
                          fixture field names are not provider IDs.
                        </p>
                        <div className="actions">
                          {providerInfo[p].categories.map((c) => (
                            <label key={c}>
                              <input
                                type="checkbox"
                                checked={draft.connections[
                                  p
                                ].categories.includes(c)}
                                onChange={(e) =>
                                  changeConnection(
                                    p,
                                    "categories",
                                    e.target.checked
                                      ? [...draft.connections[p].categories, c]
                                      : draft.connections[p].categories.filter(
                                          (k) => k !== c,
                                        ),
                                  )
                                }
                              />{" "}
                              {c}
                            </label>
                          ))}
                        </div>
                        {Object.values(state.records)
                          .filter(
                            (r) =>
                              r.provider === p &&
                              (!r.location ||
                                draft.connections[p].locations.includes(
                                  r.location,
                                )) &&
                              (!draft.connections[p].programs.length ||
                                !["event", "registration", "program"].includes(
                                  r.kind,
                                ) ||
                                draft.connections[p].programs.includes(
                                  r.title,
                                )),
                          )
                          .map((r) => (
                            <p key={recordKey(r)}>
                              <button
                                className="text-button"
                                onClick={() => inspect(r)}
                              >
                                {r.sourceId} · {r.title} · {r.rawStatus}
                              </button>
                            </p>
                          ))}
                      </article>
                    ))}
                {draft.step === 4 && (
                  <>
                    <p>
                      Names, shared email and payments never prove identity.
                      Confirm with independent evidence, keep separate, or
                      correct an earlier local association. Provider records
                      remain unchanged.
                    </p>
                    {Object.values(state.records)
                      .filter(
                        (r) =>
                          ![
                            "event",
                            "location",
                            "program",
                            "transaction",
                          ].includes(r.kind),
                      )
                      .map((r) => {
                        const k = recordKey(r),
                          a = current.associations[k];
                        return (
                          <article
                            className="record"
                            key={k}
                            aria-label={`Association ${r.sourceId}`}
                          >
                            <h4>
                              {r.provider} · {r.sourceId}
                            </h4>
                            <p>
                              Local review:{" "}
                              {a
                                ? `${a.decision} · ${a.personId ?? "separate"} · ${a.actor}`
                                : "Original fictional association; review needed for a pilot"}
                            </p>
                            <label>
                              Association decision
                              <select
                                aria-label={`Association decision ${r.sourceId}`}
                                value={reviewPerson[k] ?? "unreviewed"}
                                onChange={(e) =>
                                  setReviewPerson({
                                    ...reviewPerson,
                                    [k]: e.target.value,
                                  })
                                }
                              >
                                <option value="unreviewed">
                                  Select an explicit decision
                                </option>
                                <option value="separate">
                                  Keep separate / undo association
                                </option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} · household {p.household}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Review evidence / reason
                              <input
                                value={reasons[k] ?? ""}
                                maxLength={300}
                                onChange={(e) =>
                                  setReasons({
                                    ...reasons,
                                    [k]: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <button
                              disabled={
                                !reasons[k]?.trim() ||
                                !reviewPerson[k] ||
                                reviewPerson[k] === "unreviewed"
                              }
                              onClick={() => {
                                update(
                                  reviewAssociation(
                                    state,
                                    k,
                                    reviewPerson[k] === "separate"
                                      ? null
                                      : reviewPerson[k],
                                    reasons[k],
                                  ),
                                );
                                setMessage(
                                  "Association review recorded locally; authoritative provider statuses preserved.",
                                );
                              }}
                            >
                              Save association review
                            </button>
                          </article>
                        );
                      })}
                  </>
                )}
                {draft.step >= 5 && (
                  <>
                    <h4>Readiness summary</h4>
                    <p>
                      {draft.organization} · {draft.timezone} ·{" "}
                      {draft.locations.join(", ")}
                    </p>
                    <p>
                      Default owner:{" "}
                      {staff.find((s) => s.id === draft.defaultOwner)?.name};
                      follow up in {draft.followUpDays} days.
                    </p>
                    {providers.map((p) => (
                      <p key={p}>
                        {p}:{" "}
                        {draft.connections[p].selected
                          ? draft.connections[p].mode
                          : "not selected"}{" "}
                        · authorization {current.connections[p].authorization}
                      </p>
                    ))}
                    <p>
                      Reviewed associations:{" "}
                      {Object.keys(current.associations).length}. Unreviewed
                      records remain unqualified for a live pilot.
                    </p>
                    <p className="notice">
                      Next action: obtain approved developer/test-account access
                      and verify permissions, source ownership and family
                      associations. Completing setup does not connect a provider
                      or qualify production use.
                    </p>
                    <button
                      onClick={() =>
                        persist({ ...draft, complete: true, step: 5 })
                      }
                    >
                      Finish setup review
                    </button>
                  </>
                )}
                <div className="actions">
                  <button
                    disabled={draft.step === 0}
                    onClick={() =>
                      persist({ ...draft, step: Math.max(0, draft.step - 1) })
                    }
                  >
                    Save & back
                  </button>
                  <button onClick={() => persist(draft)}>Save this step</button>
                  <button
                    disabled={draft.step >= 5}
                    onClick={() => persist({ ...draft, step: draft.step + 1 })}
                  >
                    Save & continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Connection center</h3>
                <p>
                  Authorization and import health are independent. Simulation
                  success never means an account is connected.
                </p>
                {providers.map((p) => {
                  const c = current.connections[p],
                    h = state.health[p];
                  return (
                    <article
                      className="record"
                      key={p}
                      aria-label={`${p} connection`}
                    >
                      <h4>{p}</h4>
                      <p>
                        Mode: {c.mode} ·{" "}
                        {c.selected ? "selected" : "not selected"} ·
                        Authorization:{" "}
                        <b>
                          {c.authorization === "expired" &&
                          h.error === "ACCESS_EXPIRED_OR_REVOKED"
                            ? "expired or revoked — reverify"
                            : c.authorization}
                        </b>
                      </p>
                      <p>
                        Account: {c.account} · Locations:{" "}
                        {c.locations.join(", ") || "none"} · Categories:{" "}
                        {c.categories.join(", ") || "none"}
                      </p>
                      <p>
                        Synchronization:{" "}
                        {c.disabled
                          ? "paused (last-known data)"
                          : h.error
                            ? "error"
                            : connectionIsStale(state, p)
                              ? "stale"
                              : "last import available"}{" "}
                        · last success {h.lastSuccess}
                      </p>
                      <p>
                        Last source evidence:{" "}
                        {Object.values(state.records)
                          .filter((r) => r.provider === p)
                          .some((r) => r.dataMode === "sandbox")
                          ? "sandbox records (no production access)"
                          : "fictional simulation only"}
                      </p>
                      {connectionIsStale(state, p) && (
                        <p className="notice">
                          Last-known records retained. Access is unavailable or
                          data is stale; local tasks are not automatically
                          resolved.
                        </p>
                      )}
                      {h.error && <p>{h.error}</p>}
                      {h.retryAt && <p>Retry not before {h.retryAt}</p>}
                      <p>{providerInfo[p].requires}</p>
                      {c.mode === "sandbox" && (
                        <div className="actions">
                          {p === "Square" && authorize && (
                            <button onClick={() => authorize(p)}>
                              Prepare Square sandbox authorization
                            </button>
                          )}
                          {readSandbox && (
                            <>
                              <label>
                                {p} read operation
                                <select
                                  aria-label={`${p} read operation`}
                                  value={readOperation[p]}
                                  onChange={(e) =>
                                    setReadOperation({
                                      ...readOperation,
                                      [p]: e.target.value,
                                    })
                                  }
                                >
                                  {(p === "Mindbody"
                                    ? ["clients"]
                                    : p === "Square"
                                      ? [
                                          "locations",
                                          "customers",
                                          "payments",
                                          "orders",
                                        ]
                                      : ["registrations", "schedules"]
                                  ).map((op) => (
                                    <option key={op}>{op}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                disabled={c.disabled || !c.selected}
                                onClick={() => readSandbox(p, readOperation[p])}
                              >
                                Run approved {p} sandbox read
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      <div className="actions">
                        <button
                          disabled={
                            c.disabled || !c.selected || c.mode !== "simulated"
                          }
                          onClick={() => update(sync(state, p))}
                        >
                          Retry {p} import
                        </button>
                        <button
                          disabled={c.disabled}
                          onClick={() =>
                            update(connectionAction(state, p, "disconnect"))
                          }
                        >
                          Disconnect {p}
                        </button>
                        <button
                          onClick={() => {
                            update(connectionAction(state, p, "reauthorize"));
                            setMessage(
                              c.mode === "simulated"
                                ? "Simulation resumed. No authorization occurred."
                                : providerInfo[p].requires +
                                    " Use the authenticated local backend and secure server configuration. No authorization occurred.",
                            );
                          }}
                        >
                          Review {p} reauthorization
                        </button>
                        <button
                          onClick={() =>
                            update(connectionAction(state, p, "expired"))
                          }
                        >
                          Simulate expired {p} access
                        </button>
                        <button
                          onClick={() =>
                            update(connectionAction(state, p, "revoked"))
                          }
                        >
                          Simulate revoked {p} access
                        </button>
                      </div>
                      <details>
                        <summary>{p} source references & sync history</summary>
                        {Object.values(state.records)
                          .filter((r) => r.provider === p)
                          .map((r) => (
                            <button
                              key={recordKey(r)}
                              className="text-button"
                              onClick={() => inspect(r)}
                            >
                              {r.sourceId} · {r.rawStatus} ·{" "}
                              {r.dataMode ?? "simulated"}
                            </button>
                          ))}
                        <ol>
                          {state.audit
                            .filter((a) => a.source === p)
                            .slice(-10)
                            .reverse()
                            .map((a) => (
                              <li key={a.id}>
                                {a.at} · {a.action} · {a.actor} · {a.after}
                              </li>
                            ))}
                        </ol>
                      </details>
                    </article>
                  );
                })}
              </>
            )}
          </fieldset>
        </>
      )}
    </section>
  );
}
