import { useState } from "react";
import type { Profile } from "@/lib/intelligence/comparison";
import { searchClubEvidence } from "@/lib/opportunities/club-research";
export default function ClubResearchSearch({ profile }: { profile: Profile }) {
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");
  const result = searchClubEvidence(profile, submitted);
  return (
    <section
      className="sc-opportunity"
      aria-label={`Ask about ${profile.name}`}
    >
      <h2>Ask about {profile.name}</h2>
      <p>
        Search this club’s saved research. Live website search, AI answers and
        review feeds are not connected yet.
      </p>
      <div className="sc-opportunity-actions">
        {[
          "Fees and costs",
          "Coaching and directors",
          "Player movement and placement",
          "Public reviews",
        ].map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuestion(q);
              setSubmitted(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(question);
        }}
      >
        <label>
          Your question
          <input
            type="search"
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="How does team placement work?"
          />
        </label>
        <button type="submit" disabled={!question.trim()}>
          Search this club
        </button>
      </form>
      {submitted && (
        <>
          <p role="status">{result.notice}</p>
          {result.hits.map((h, i) => (
            <article key={i}>
              <h3>{h.title}</h3>
              <p>{h.text}</p>
              <a href={h.source.url} target="_blank" rel="noopener noreferrer">
                Source record · checked {h.source.checkedDate}
              </a>
              {h.source.period && <p>Applies to: {h.source.period}</p>}
            </article>
          ))}
          <a href={profile.website} target="_blank" rel="noopener noreferrer">
            Visit {profile.name} to confirm →
          </a>
        </>
      )}
    </section>
  );
}
