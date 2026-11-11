import { expect, it } from "vitest";
import {
  collegeLeads,
  collegeInquiry,
  type CollegeFitIntake,
} from "./college-fit";
import { coloradoCollegeProfiles } from "@/lib/intelligence/college-catalog";
const input: CollegeFitIntake = {
  academic: {
    graduation: "2029",
    interests: "Engineering",
    gpa: "3.5 / 4",
    budget: "$20,000",
    size: "Small",
    distance: "Near home",
  },
  sport: "soccer",
  gender: "",
  division: "",
  area: "",
  position: "GK",
  level: "Select",
  commitment: "Competitive",
};
it("reuses all existing Colorado schools without invented academic filtering", () => {
  expect(collegeLeads(coloradoCollegeProfiles, input)).toHaveLength(20);
  expect(
    collegeLeads(coloradoCollegeProfiles, {
      ...input,
      academic: { ...input.academic, gpa: "1.0", budget: "0" },
    }),
  ).toEqual(collegeLeads(coloradoCollegeProfiles, input));
});
it("requires gender and division on the same program row", () => {
  const p = {
    ...coloradoCollegeProfiles[0],
    catalogPrograms: [
      {
        importKey: "a",
        gender: "mens",
        division: "A",
        conference: null,
        programUrl: "https://example.org",
        staffUrl: "https://example.org",
      },
      {
        importKey: "b",
        gender: "womens",
        division: "B",
        conference: null,
        programUrl: "https://example.org",
        staffUrl: "https://example.org",
      },
    ],
  };
  expect(
    collegeLeads([p], { ...input, gender: "mens", division: "B" }),
  ).toEqual([]);
  expect(
    collegeLeads([p], { ...input, gender: "mens", division: "A" }),
  ).toHaveLength(1);
});
it("academic preferences and inquiry can be reused for another sport", () => {
  const draft = collegeInquiry({ ...input, sport: "volleyball" }, "Example");
  expect(draft).toContain("volleyball");
  expect(draft).not.toContain("soccer");
  expect(draft).toContain("Engineering");
  expect(draft).toContain("does not confirm admission");
});
