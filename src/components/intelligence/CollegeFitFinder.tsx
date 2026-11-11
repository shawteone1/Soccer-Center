import { useState } from "react";
import {
  collegeInquiry,
  collegeLeads,
  type CollegeFitIntake,
} from "@/lib/opportunities/college-fit";
import { feeLabel, type Profile } from "@/lib/intelligence/comparison";
import "@/styles/opportunity-finder.css";
const initial: CollegeFitIntake = {
  academic: {
    graduation: "",
    interests: "",
    gpa: "",
    budget: "",
    size: "",
    distance: "",
  },
  sport: "soccer",
  gender: "",
  division: "",
  area: "",
  position: "",
  level: "",
  commitment: "",
};
export default function CollegeFitFinder({
  profiles,
  selected,
  onToggle,
  onExplore,
}: {
  profiles: Profile[];
  selected: string[];
  onToggle: (id: string) => void;
  onExplore: (id: string) => void;
}) {
  const [input, setInput] = useState(initial);
  const [submitted, setSubmitted] = useState<CollegeFitIntake | null>(null);
  const [school, setSchool] = useState<Profile | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const leads = submitted ? collegeLeads(profiles, submitted) : [];
  const draft =
    submitted && school ? collegeInquiry(submitted, school.name) : "";
  function reset() {
    setSubmitted(null);
    setSchool(null);
    setCopyStatus("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus("Copied. Review the draft before sharing.");
    } catch {
      setCopyStatus("Clipboard unavailable. Select and copy the draft below.");
    }
  }
  return (
    <details className="sc-opportunity">
      <summary>Find my college fit →</summary>
      <h2>Explore the school and the soccer program separately.</h2>
      <p>
        Start with the existing Colorado catalog. This guided finder does not
        score your chances of admission, scholarships or team selection.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({ ...input, academic: { ...input.academic } });
          setSchool(null);
          setCopyStatus("");
        }}
      >
        <fieldset>
          <legend>Academic and college preferences</legend>
          <div className="sc-opportunity-fields">
            {(
              [
                ["graduation", "Graduation year"],
                ["interests", "Academic interests / majors"],
                ["gpa", "GPA and scale (optional)"],
                ["budget", "Annual budget preference"],
                ["size", "School-size preference"],
                ["distance", "Distance-from-home preference"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  maxLength={120}
                  value={input.academic[key]}
                  onChange={(e) => {
                    setInput({
                      ...input,
                      academic: { ...input.academic, [key]: e.target.value },
                    });
                    reset();
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Soccer interests and catalog filters</legend>
          <div className="sc-opportunity-fields">
            <label>
              Program preference
              <select
                value={input.gender}
                onChange={(e) => {
                  setInput({ ...input, gender: e.target.value });
                  reset();
                }}
              >
                <option value="">Any listed program</option>
                <option value="mens">Men’s</option>
                <option value="womens">Women’s</option>
              </select>
            </label>
            <label>
              Preferred division
              <select
                value={input.division}
                onChange={(e) => {
                  setInput({ ...input, division: e.target.value });
                  reset();
                }}
              >
                <option value="">Any listed division</option>
                {[
                  ...new Set(
                    profiles.flatMap((p) =>
                      (p.catalogPrograms ?? []).map((r) => r.division),
                    ),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            <label>
              College city
              <select
                value={input.area}
                onChange={(e) => {
                  setInput({ ...input, area: e.target.value });
                  reset();
                }}
              >
                <option value="">Any listed Colorado city</option>
                {[...new Set(profiles.map((p) => p.area))].sort().map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {(
              [
                ["position", "Playing position"],
                ["level", "Current playing level"],
                ["commitment", "Desired sport commitment"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  maxLength={120}
                  value={input[key]}
                  onChange={(e) => {
                    setInput({ ...input, [key]: e.target.value });
                    reset();
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="sc-disclosure">
          Only city, program and division filter the existing soccer catalog.
          Academic interests, GPA, budget, distance and playing background shape
          your inquiry; they are not verified matches. No name or exact address
          needed. Inputs stay in page memory; copying an inquiry includes the
          preferences you entered.
        </p>
        <button type="submit">Explore my college leads</button>
      </form>
      {submitted && (
        <section aria-label="College fit results">
          <p role="status">
            {leads.length} research leads, alphabetical—not a fit ranking.
            Existing catalog labels require current confirmation.
          </p>
          {!leads.length && (
            <p>
              No catalog entries match these filters. Broaden your preferences;
              this does not mean no suitable college exists.
            </p>
          )}
          <p>
            Use Add to comparison to shortlist up to three schools, then the
            existing Save comparison button below to save school IDs on this
            device. Your intake and inquiry are not saved with the comparison.
          </p>
          <ul className="sc-lead-list">
            {leads.map((p) => (
              <li key={p.id}>
                <h3>{p.name}</h3>
                <p>
                  Why shown: {p.area};{" "}
                  {(p.catalogPrograms ?? [])
                    .filter(
                      (r) =>
                        (!submitted.gender || r.gender === submitted.gender) &&
                        (!submitted.division ||
                          r.division === submitted.division),
                    )
                    .map(
                      (r) =>
                        `${r.gender === "womens" ? "Women’s" : "Men’s"} ${r.division}`,
                    )
                    .join(" · ")}{" "}
                  in the existing catalog.
                </p>
                <h4>Academic evidence</h4>
                {p.academicFacts?.length ? (
                  p.academicFacts.slice(0, 2).map((f, i) => (
                    <p key={i}>
                      {f.label}: {f.value}
                      <br />
                      <a
                        href={f.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source · checked {f.source.checkedDate}
                        {f.source.period ? ` · ${f.source.period}` : ""}
                      </a>
                    </p>
                  ))
                ) : (
                  <p>
                    Academic enrichment not available here. Confirm majors,
                    requirements and school size directly.
                  </p>
                )}
                <h4>Cost context</h4>
                {p.fees.length ? (
                  <p>
                    {feeLabel(p.fees[0])}
                    <br />
                    {p.fees[0].notes}
                    <br />
                    <a
                      href={p.fees[0].source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Cost source · checked {p.fees[0].source.checkedDate}
                    </a>
                  </p>
                ) : (
                  <p>
                    No reviewed cost example available. Unknown cost is not
                    free.
                  </p>
                )}
                <p>
                  Published cost examples are not personalized net prices. Major
                  fit, affordability, admission, graduation-year recruitment and
                  roster availability remain unconfirmed.
                </p>
                <button onClick={() => onExplore(p.id)}>
                  View evidence for {p.name}
                </button>
                <button
                  aria-pressed={selected.includes(p.id)}
                  disabled={!selected.includes(p.id) && selected.length >= 3}
                  onClick={() => onToggle(p.id)}
                >
                  {selected.includes(p.id)
                    ? "Remove shortlist"
                    : "Add to comparison"}
                  : {p.name}
                </button>
                <button
                  onClick={() => {
                    setSchool(p);
                    setCopyStatus("");
                  }}
                >
                  Prepare inquiry: {p.name}
                </button>
              </li>
            ))}
          </ul>
          {school && (
            <section aria-label="College inquiry">
              <h3>Inquiry for {school.name}</h3>
              <p>
                Adapt the admissions and coaching questions for the appropriate
                recipient. This does not create a coach link, attach private
                media or send a message.
              </p>
              <label>
                College inquiry draft
                <textarea readOnly rows={12} value={draft} />
              </label>
              <button onClick={() => void copy()}>Copy college inquiry</button>
              <p role="status">{copyStatus}</p>
            </section>
          )}
        </section>
      )}
    </details>
  );
}
