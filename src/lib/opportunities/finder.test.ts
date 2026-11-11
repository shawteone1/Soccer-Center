import { expect, it } from "vitest";
import {
  buildInquiry,
  findResearchLeads,
  type OpportunityIntake,
} from "./finder";
import { searchClubEvidence } from "./club-research";
import data from "@/data/intelligence/colorado-clubs.json";
const intake: OpportunityIntake = {
  sport: "soccer",
  goal: "beginner",
  age: "12",
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
it("filters beginner evidence without treating age or budget as verified", () => {
  const clubs = [
    {
      id: "a",
      name: "A",
      area: "Denver",
      website: "https://example.org",
      programs: ["Competitive"],
    },
    {
      id: "b",
      name: "B",
      area: "Denver",
      website: "https://example.org",
      programs: ["Recreational"],
    },
  ];
  expect(
    findResearchLeads(clubs, {
      ...intake,
      budget: "free",
      pathway: "ECNL",
    }).map((c) => c.id),
  ).toEqual(["b"]);
  expect(findResearchLeads(clubs, { ...intake, area: "Boulder" })).toEqual([]);
});
it("supports another sport without soccer-specific assumptions", () => {
  const text = buildInquiry(
    {
      ...intake,
      sport: "basketball",
      goal: "coaching",
      coaching: ["Individual feedback"],
    },
    "Example",
  );
  expect(text).toContain("basketball options");
  expect(text).toContain("Individual feedback");
  expect(text).not.toContain("soccer");
});
it("does not infer an age or league opening from U15", () => {
  const text = buildInquiry({
    ...intake,
    age: "",
    ageGroup: "U15",
    pathway: "ECNL",
  });
  expect(text).toContain("Current age group: U15");
  expect(text).not.toContain("Player age:");
  expect(text).toContain("does not establish an opening");
});
it("keeps evidence in the selected club and preserves sources", () => {
  const p = data.clubs.find((c) => c.id === "united") ?? data.clubs[0];
  const result = searchClubEvidence(p, "coaches fees");
  expect(result.hits.length).toBeGreaterThan(0);
  for (const hit of result.hits) {
    expect(hit.source.checkedDate).toBeTruthy();
    expect(hit.source.url).toMatch(/^https?:/);
  }
  expect(result.notice).toContain("not a generated answer");
});
it("does not invent reviews or missing information", () => {
  expect(searchClubEvidence(data.clubs[0], "parent reviews").hits).toEqual([]);
  expect(searchClubEvidence(data.clubs[0], "parent reviews").notice).toContain(
    "not connected",
  );
  expect(searchClubEvidence(data.clubs[0], "xyzzyunlisted").notice).toContain(
    "No supporting detail",
  );
});
