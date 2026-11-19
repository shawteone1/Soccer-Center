import { useId, useState } from "react";
import {
  people,
  staff,
  type State,
  type LocalTask,
  type SourceRecord,
} from "./model";
import {
  addNote,
  assignTask,
  completeTask,
  daySchedule,
  operationsMetrics,
  setFollowUp,
} from "./operations";
import { calendarTime } from "../src/lib/portal/calendar-display";

function TaskCard({
  task,
  state,
  actor,
  update,
  inspect,
}: {
  task: LocalTask;
  state: State;
  actor: string;
  update: (s: State) => void;
  inspect: (r: SourceRecord) => void;
}) {
  const id = useId(),
    [draft, setDraft] = useState(""),
    [message, setMessage] = useState("");
  const source = state.records[task.sourceKey],
    resolved = state.resolutions[task.sourceKey];
  return (
    <article className="ops-task" aria-label={`Task: ${task.title}`}>
      <div className="section-heading">
        <div>
          <span className="badge">
            {task.priority} priority · {resolved ? "Locally resolved" : "Open"}
          </span>
          <h3>{task.title}</h3>
          <p>
            {people.find((p) => p.id === source.personId)?.name ??
              "Identity not confirmed"}{" "}
            · {source.provider} · simulated · {source.sourceId}
          </p>
        </div>
        <button onClick={() => inspect(source)}>Inspect source</button>
      </div>
      <p>
        Provider status: <b>{source.rawStatus}</b> · Local workflow:{" "}
        <b>{resolved ? "Locally resolved" : "Open"}</b>
      </p>
      <div className="ops-fields">
        <label htmlFor={`${id}-owner`}>
          Assigned staff
          <select
            id={`${id}-owner`}
            value={task.assigneeId ?? ""}
            onChange={(e) => {
              update(
                assignTask(
                  state,
                  task.sourceKey,
                  e.target.value || null,
                  actor,
                ),
              );
              setMessage("Local staff assignment saved.");
            }}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.role}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-due`}>
          Follow-up date
          <input
            id={`${id}-due`}
            type="date"
            value={task.dueOn}
            onChange={(e) => {
              update(setFollowUp(state, task.sourceKey, e.target.value, actor));
              setMessage("Local follow-up date saved.");
            }}
          />
        </label>
      </div>
      <label htmlFor={`${id}-note`}>
        Staff follow-up note
        <textarea
          id={`${id}-note`}
          value={draft}
          maxLength={1500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Record the next step or review outcome. Fictional data only."
          rows={3}
        />
      </label>
      <div className="actions">
        <button
          disabled={!draft.trim()}
          onClick={() => {
            update(addNote(state, task.sourceKey, draft, actor));
            setDraft("");
            setMessage("Follow-up note saved locally. No message sent.");
          }}
        >
          Save follow-up note
        </button>
        {!resolved && (
          <button
            className="primary"
            onClick={() => {
              update(completeTask(state, task.sourceKey, actor));
              setMessage("Local workflow resolved. No provider updated.");
            }}
          >
            {source.kind === "requirement"
              ? "Resolve local workflow (simulated)"
              : "Complete identity review locally"}
          </button>
        )}
      </div>
      <p className="task-feedback" aria-live="polite">
        {message}
      </p>
      <p className="notice">
        {resolved
          ? "Simulated resolution — no provider updated. Provider confirmation still required."
          : "Local staff work only. Notes are not sent to members or providers."}
        {source.personId === null
          ? " Completing this review does not merge identities or confirm an identity link."
          : ""}
      </p>
      {task.notes.length > 0 && (
        <details open>
          <summary>Follow-up notes ({task.notes.length})</summary>
          <ol className="ops-notes">
            {task.notes.map((note) => (
              <li key={note.id}>
                <p>{note.text}</p>
                <small>
                  {note.actor} · {new Date(note.at).toLocaleString()} ·
                  simulated
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

export default function OperationsDesk({
  state,
  update,
  inspect,
}: {
  state: State;
  update: (s: State) => void;
  inspect: (r: SourceRecord) => void;
}) {
  const [day, setDay] = useState("2026-11-14"),
    [actor, setActor] = useState("morgan"),
    [owner, setOwner] = useState("All"),
    [status, setStatus] = useState("All");
  const metrics = operationsMetrics(state, day),
    schedule = daySchedule(Object.values(state.records), day);
  const tasks = Object.values(state.tasks)
    .filter(
      (t) =>
        (owner === "All" ||
          (owner === "Unassigned" ? !t.assigneeId : t.assigneeId === owner)) &&
        (status === "All" ||
          (status === "Open"
            ? !state.resolutions[t.sourceKey]
            : Boolean(state.resolutions[t.sourceKey]))),
    )
    .sort(
      (a, b) =>
        Number(Boolean(state.resolutions[a.sourceKey])) -
          Number(Boolean(state.resolutions[b.sourceKey])) ||
        a.dueOn.localeCompare(b.dueOn) ||
        a.priority.localeCompare(b.priority),
    );
  const completed = Object.values(state.tasks)
    .filter((t) => state.resolutions[t.sourceKey])
    .sort((a, b) =>
      state.resolutions[b.sourceKey].at.localeCompare(
        state.resolutions[a.sourceKey].at,
      ),
    );
  return (
    <div className="operations-desk">
      <nav className="ops-nav" aria-label="Operations sections">
        <a
          href="#daily-operations"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("daily-operations")?.scrollIntoView();
          }}
        >
          Daily operations
        </a>
        <a
          href="#exception-queue"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("exception-queue")?.scrollIntoView();
          }}
        >
          Exception queue
        </a>
        <a
          href="#member-lookup"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("member-lookup")?.scrollIntoView();
          }}
        >
          Member lookup
        </a>
        <a
          href="#ops-measurement"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("ops-measurement")?.scrollIntoView();
          }}
        >
          Measurement
        </a>
      </nav>
      <section
        className="panel"
        id="daily-operations"
        aria-labelledby="daily-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">DAILY OPERATIONS · FICTIONAL DATA</p>
            <h2 id="daily-title">At the desk today</h2>
            <p>Review sessions, assign follow-ups and close the local loop.</p>
          </div>
          <label>
            Operating date (demo)
            <input
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
          </label>
        </div>
        <div className="ops-metrics">
          <div>
            <span>Sessions on date</span>
            <strong>{metrics.sessions}</strong>
          </div>
          <div>
            <span>Open exceptions</span>
            <strong>{metrics.open}</strong>
          </div>
          <div>
            <span>Unassigned open</span>
            <strong>{metrics.unassigned}</strong>
          </div>
          <div>
            <span>Follow-ups due</span>
            <strong>{metrics.due}</strong>
          </div>
          <div>
            <span>Overdue open</span>
            <strong>{metrics.overdue}</strong>
          </div>
        </div>
        <div className="ops-sessions">
          {schedule.map((r) => (
            <article key={r.sourceId}>
              <span className="badge">
                {calendarTime(r.startAt!)} · {r.location}
              </span>
              <h3>{r.title}</h3>
              <p>
                {people.find((p) => p.id === r.personId)?.name} · {r.provider} ·{" "}
                {r.sourceId} · simulated
              </p>
              <button onClick={() => inspect(r)}>Review session source</button>
            </article>
          ))}
          {!schedule.length && (
            <p>
              No sessions on this date in the fictional schedule. Choose
              November 14, 15 or 21.
            </p>
          )}
        </div>
        <p>
          America/Denver · Local review does not establish participation
          eligibility.
        </p>
      </section>
      <section
        className="panel"
        id="exception-queue"
        aria-labelledby="queue-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="queue-title">Exception queue</h2>
            <p>
              Provider facts stay read-only. Assignment, notes and completion
              are local staff work.
            </p>
          </div>
          <label>
            Acting staff (simulated)
            <select value={actor} onChange={(e) => setActor(e.target.value)}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          Staff selection is a demo control, not verified staff identity or
          authentication.
        </p>
        <div className="ops-fields">
          <label>
            Queue owner
            <select
              aria-label="Queue owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option>All</option>
              <option>Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Queue status
            <select
              aria-label="Queue status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>All</option>
              <option>Open</option>
              <option>Resolved</option>
            </select>
          </label>
        </div>
        {tasks.map((t) => (
          <TaskCard
            key={t.sourceKey}
            task={t}
            state={state}
            actor={actor}
            update={update}
            inspect={inspect}
          />
        ))}
        {!tasks.length && <p>No tasks match these queue filters.</p>}
      </section>
      <section className="panel" aria-labelledby="resolution-title">
        <h2 id="resolution-title">Resolution history</h2>
        {completed.length ? (
          <ol className="audit">
            {completed.map((t) => (
              <li key={t.sourceKey}>
                <strong>{t.title} · review completed locally</strong>
                <p>
                  Assigned:{" "}
                  {staff.find((s) => s.id === t.assigneeId)?.name ??
                    "Unassigned"}{" "}
                  · Completed by:{" "}
                  {[...state.audit]
                    .reverse()
                    .find(
                      (a) =>
                        a.source === t.sourceKey &&
                        a.action === "Local workflow resolved",
                    )?.actor ?? "Unrecorded (legacy)"}{" "}
                  · {state.resolutions[t.sourceKey].at}
                </p>
                <p>{t.notes.at(-1)?.text ?? "No follow-up note recorded."}</p>
                <p>
                  Provider remains {state.records[t.sourceKey].rawStatus}. No
                  provider updated.
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No completed local reviews yet.</p>
        )}
      </section>
      <section
        className="panel"
        id="ops-measurement"
        aria-labelledby="measurement-title"
      >
        <h2 id="measurement-title">Operational measurement</h2>
        <p>
          Observed in this browser demo only. These counts are not Soccer City
          operating results or measured savings.
        </p>
        <dl className="ops-measurements">
          <div>
            <dt>Local reviews completed</dt>
            <dd>{metrics.completed}</dd>
          </div>
          <div>
            <dt>Follow-up notes saved</dt>
            <dd>{metrics.notes}</dd>
          </div>
          <div>
            <dt>Timed local reviews</dt>
            <dd>{metrics.timedCount}</dd>
          </div>
          <div>
            <dt>Average local handling interval</dt>
            <dd>
              {metrics.averageMinutes === null
                ? "Not measured"
                : `${metrics.averageMinutes.toFixed(1)} minutes`}
            </dd>
          </div>
        </dl>
        <p>
          Handling interval = first recorded assignment or note to local
          completion; only valid timed reviews count. Includes elapsed waiting
          time, not verified active staff effort. Counts cover the current demo
          since reset; the operating date filters sessions and due/overdue
          counts.
        </p>
        <details>
          <summary>Pilot measurement plan</summary>
          <p>
            Capture actual task volume, systems opened, manual re-entry, staff
            active minutes, unresolved exceptions and member support contacts
            before and during an authorized pilot. Compare like tasks, subtract
            licensing, integration, training and maintenance costs. Report labor
            capacity separately from cash savings. No ROI or savings have been
            measured.
          </p>
        </details>
      </section>
    </div>
  );
}
