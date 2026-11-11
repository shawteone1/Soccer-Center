import BulkCoachOutreach from "./BulkCoachOutreach";
import { useState } from "react";
import ColoradoExplorer from "@/components/intelligence/ColoradoExplorer";
import RecruitingGuide from "./RecruitingGuide";
import "@/styles/parent-recruiting-hub.css";
export interface RecruitingHubPlayer {
  id: string;
  label: string | null;
}
export default function ParentRecruitingHub({
  players,
}: {
  players: RecruitingHubPlayer[];
}) {
  const [section, setSection] = useState<"guide" | "colleges" | "players" | "outreach">(
    "guide",
  );
  return (
    <section className="rh-hub" aria-label="Recruiting hub">
      <header className="rh-hero">
        <p className="rh-eyebrow">SOCCER CENTER · YOUR NEXT CHAPTER</p>
        <h1>Your recruiting home.</h1>
        <p>
          Understand the journey. Explore colleges. Put your player’s story
          together.
        </p>
        <nav aria-label="Recruiting hub sections">
          {(
            [
              ["guide", "Guide & eligibility"],
              ["colleges", "College search & compare"],
              ["players", "My player tools"],
              ["outreach", "Bulk coach outreach"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={section === id}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {section === "outreach" && <BulkCoachOutreach />}
      {section === "guide" && <RecruitingGuide />}
      {section === "colleges" && <ColoradoExplorer collegeOnly embedded />}
      {section === "players" && (
        <section className="rh-card">
          <h2>Continue with a player</h2>
          <p>
            Open the existing recruiting tools for profile building, coach
            research, saved appearances and outreach drafts. Availability
            follows the player’s existing access and age rules.
          </p>
          {players.length ? (
            <div className="rh-grid">
              {players.map((p, i) => (
                <article key={p.id}>
                  <h3>{p.label || `Player ${i + 1}`}</h3>
                  <a
                    href={`/parent-portal/players/${encodeURIComponent(p.id)}?tab=recruiting`}
                  >
                    Open recruiting tools →
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <p>
              Add a player when you’re ready. You can use the guide and college
              research now.{" "}
              <a href="/parent-portal/players/new">Add player →</a>
            </p>
          )}
          <p className="rh-note">
            Research comparisons save public school IDs on this device. They do
            not automatically add schools to a player’s saved coaches or share
            any player information.
          </p>
        </section>
      )}
    </section>
  );
}
