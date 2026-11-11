import { useEffect, useState } from "react";
import type { Profile } from "@/lib/intelligence/comparison";
import {
  findResearchLeads,
  buildInquiry,
  type OpportunityIntake,
  type Goal,
} from "@/lib/opportunities/finder";
import "@/styles/opportunity-finder.css";
const initial: OpportunityIntake = {
  sport: "soccer",
  goal: "beginner",
  age: "",
  ageGroup: "",
  program: "",
  area: "",
  pathway: "",
  coaching: [],
  travel: "",
  budget: "",
  availability: "",
  context: "",
};
const priorities = [
  "Individual feedback",
  "Position-specific coaching",
  "More challenging sessions",
  "Consistent coaching",
  "Clearer team progression",
  "Communication with families",
];
export default function OpportunityFinder({ clubs }: { clubs: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [intake, setIntake] = useState(initial);
  const [submitted, setSubmitted] = useState<OpportunityIntake | null>(null);
  const [clubName, setClubName] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    setOpen(new URLSearchParams(window.location.search).get("finder") === "1");
  }, []);
  const update = (key: keyof OpportunityIntake, value: string) => {
    setIntake((prev) => ({ ...prev, [key]: value }));
    setSubmitted(null);
    setCopied("");
  };
  const leads = submitted ? findResearchLeads(clubs, submitted) : [];
  const inquiry = submitted ? buildInquiry(submitted, clubName) : "";
  function example(goal: Goal) {
    setIntake({
      ...initial,
      goal,
      age: goal === "beginner" ? "12" : "",
      ageGroup: goal === "move-up" ? "U15" : "",
      pathway: goal === "move-up" ? "ECNL" : "",
      context:
        goal === "beginner"
          ? "New to soccer; has never played before."
          : goal === "move-up"
            ? "Currently plays on a Select team."
            : "Looking for stronger coaching and more individual development.",
    });
    setSubmitted(null);
    setCopied("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(inquiry);
      setCopied("Inquiry copied. Review it before sharing.");
    } catch {
      setCopied(
        "Clipboard is unavailable. Select and copy the inquiry text below.",
      );
    }
  }
  return (
    <details
      className="sc-opportunity"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Find my next opportunity →</summary>
      <h2>A starting point that fits your family.</h2>
      <p>
        Beginner, moving up, returning to play or looking for different
        coaching? Start here.
      </p>
      <p className="sc-disclosure">
        Guided research, not live AI matching. This version uses existing
        Colorado club program labels. It does not verify age eligibility, roster
        openings, travel times, coaching quality or affordability.
      </p>
      <div className="sc-opportunity-actions">
        <button onClick={() => example("beginner")}>
          Age 12 · never played
        </button>
        <button onClick={() => example("move-up")}>
          U15 Select · interested in ECNL
        </button>
        <button onClick={() => example("coaching")}>
          Looking for stronger coaching
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({ ...intake, coaching: [...intake.coaching] });
          setClubName("");
          setCopied("");
        }}
      >
        <div className="sc-opportunity-fields">
          <label>
            What are you looking for?
            <select
              value={intake.goal}
              onChange={(e) => update("goal", e.target.value)}
            >
              <option value="beginner">Starting for the first time</option>
              <option value="move-up">
                A more challenging playing pathway
              </option>
              <option value="coaching">
                Different coaching or development
              </option>
              <option value="return">Returning to play</option>
            </select>
          </label>
          <label>
            Player age (optional)
            <input
              type="number"
              min="4"
              max="20"
              value={intake.age}
              onChange={(e) => update("age", e.target.value)}
            />
          </label>
          <label>
            Current age group (optional)
            <input
              maxLength={30}
              placeholder="For example, U15"
              value={intake.ageGroup}
              onChange={(e) => update("ageGroup", e.target.value)}
            />
          </label>
          <label>
            Preferred program
            <select
              value={intake.program}
              onChange={(e) => update("program", e.target.value)}
            >
              <option value="">Not sure / discuss with club</option>
              <option>Boys</option>
              <option>Girls</option>
              <option>Coed</option>
            </select>
          </label>
          <label>
            Area
            <select
              value={intake.area}
              onChange={(e) => update("area", e.target.value)}
            >
              <option value="">All listed Colorado areas</option>
              {[...new Set(clubs.map((c) => c.area))].sort().map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Pathway of interest
            <select
              value={intake.pathway}
              onChange={(e) => update("pathway", e.target.value)}
            >
              <option value="">Open to suggestions</option>{" "}
              <option>Recreational</option>
              <option>Competitive</option>
              <option>ECNL</option>
              <option>ECNL Regional League</option>
              <option>MLS NEXT</option>
              <option>Other — describe below</option>
            </select>
          </label>
          <label>
            Comfortable travel (optional)
            <input
              maxLength={100}
              placeholder="For example, 30 minutes"
              value={intake.travel}
              onChange={(e) => update("travel", e.target.value)}
            />
          </label>
          <label>
            Budget preference (optional)
            <input
              maxLength={100}
              placeholder="For example, under $300 per season"
              value={intake.budget}
              onChange={(e) => update("budget", e.target.value)}
            />
          </label>
          <label>
            Available days (optional)
            <input
              maxLength={100}
              value={intake.availability}
              onChange={(e) => update("availability", e.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>What would better coaching look like?</legend>
          <div className="sc-priorities">
            {priorities.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={intake.coaching.includes(item)}
                  onChange={() => {
                    setIntake((prev) => ({
                      ...prev,
                      coaching: prev.coaching.includes(item)
                        ? prev.coaching.filter((c) => c !== item)
                        : [...prev.coaching, item],
                    }));
                    setSubmitted(null);
                  }}
                />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Anything else you want to ask?
          <textarea
            maxLength={600}
            value={intake.context}
            onChange={(e) => update("context", e.target.value)}
            placeholder="Current level, training goals or accessibility needs you choose to share. No child’s name, exact address or private records needed."
          />
        </label>
        <p className="sc-disclosure">
          Only goal and area narrow the saved club list. Other answers shape
          your inquiry and what to confirm; they are not silently treated as
          verified matches. Your answers stay in this page’s memory unless you
          choose to copy them.
        </p>
        <button type="submit" className="sc-save-comparison">
          Find research leads & build my inquiry
        </button>
      </form>
      {submitted && (
        <section aria-label="Opportunity research results">
          <h3>Your next step</h3>
          <p>
            {submitted.goal === "beginner"
              ? "Start by asking about beginner-friendly recreational or introductory sessions at this age. A recreational label alone does not confirm eligibility."
              : submitted.goal === "coaching"
                ? "Ask who will lead the sessions, how players receive feedback and whether a trial session is possible. A league badge or higher fee does not establish coaching quality."
                : "Ask about evaluation routes, current team levels and how placement decisions are made. A current Select label does not establish readiness for another league."}
          </p>
          <p role="status">
            {leads.length} club research leads, listed alphabetically—not ranked
            recommendations or confirmed openings.
          </p>
          {submitted.pathway && (
            <p className="sc-opportunity-notice">
              {submitted.pathway} interest recorded. No
              age-group/team/season-specific {submitted.pathway} opportunity has
              been confirmed by this finder. The clubs below are broader
              research leads, not verified {submitted.pathway} matches.
            </p>
          )}
          <ul className="sc-lead-list">
            {leads.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <p>
                  {c.area} · Saved program labels: {c.programs.join(", ")}
                </p>
                <p>
                  Confirm age eligibility, program preference, location, costs,
                  schedule and availability directly.
                </p>
                <a
                  href={`/research/colorado?profile=${encodeURIComponent(c.id)}`}
                >
                  Explore club evidence →
                </a>
                {" · "}
                <a href={c.website} target="_blank" rel="noopener noreferrer">
                  Club website ↗
                </a>
                <button
                  onClick={() => {
                    setClubName(c.name);
                    setCopied("");
                  }}
                >
                  Prepare inquiry for {c.name}
                </button>
              </li>
            ))}
          </ul>
          {!leads.length && (
            <p>
              No club program labels match this goal and area in the current
              shortlist. This is incomplete coverage, not proof that no local
              options exist. Broaden the area or ask a local recreation
              provider.
            </p>
          )}
          <h3>Your inquiry draft</h3>
          <p>
            Copy this inquiry and adapt it before contacting a club. Nothing is
            sent automatically.
          </p>
          <label>
            Inquiry draft
            <textarea readOnly rows={12} value={inquiry} />
          </label>
          <button onClick={() => void copy()}>Copy inquiry</button>
          <p role="status">{copied}</p>
          <p className="sc-disclosure">
            Ask the club which birth-year or school-year rules apply before
            providing further details. Public reviews, player retention rates
            and live website searches are not connected here.
          </p>
        </section>
      )}
    </details>
  );
}
