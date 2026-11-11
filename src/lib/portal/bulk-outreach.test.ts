import { describe, it, expect } from "vitest";
import {
  bulkMessageSchema,
  outreachEmailText,
  personalize,
  coachToken,
} from "./bulk-outreach";
import { filterCoachProfile } from "./coach-sharing";
export const fixture = () => ({
  batchId: "c5113282-5c1c-4f40-8f96-f292d2653888",
  messageId: "f5113282-5c1c-4f40-8f96-f292d2653888",
  consent: true as const,
  coachId: "coach-a",
  recipientEmail: "coach@example.edu",
  coachName: "Coach A",
  institution: "College A",
  subject: "Recruiting inquiry",
  introduction: "Please consider these profiles.",
  profiles: [
    {
      playerId: "player-a",
      linkId: "link-a",
      url: `https://soccercenter.org/coach/profile/${"a".repeat(43)}`,
    },
  ],
});
describe("bulk outreach contract", () => {
  it("accepts multiple profiles but rejects duplicate players and over-limit batches", () => {
    expect(bulkMessageSchema.safeParse(fixture()).success).toBe(true);
    const p = fixture();
    p.profiles.push(p.profiles[0]);
    expect(bulkMessageSchema.safeParse(p).success).toBe(false);
    p.profiles = Array.from({ length: 6 }, (_, i) => ({
      ...p.profiles[0],
      playerId: String(i),
    }));
    expect(bulkMessageSchema.safeParse(p).success).toBe(false);
  });
  it("rejects missing consent, recipient lists, header injection and pasted token URLs", () => {
    for (const extra of [
      { consent: false },
      { recipientEmail: "a@b.com,b@b.com" },
      { subject: "Hi\nBcc: x@y.com" },
      { introduction: fixture().profiles[0].url },
    ])
      expect(
        bulkMessageSchema.safeParse({ ...fixture(), ...extra }).success,
      ).toBe(false);
  });
  it("personalizes literally and only includes assigned links, never raw academics or checklist data", () => {
    expect(
      personalize("Hi {{coach}} at {{college}}", {
        name: "$& Coach",
        institution: "College",
      }),
    ).toBe("Hi $& Coach at College");
    const m = fixture();
    expect(outreachEmailText(m)).toContain(m.profiles[0].url);
    expect(outreachEmailText(m)).not.toMatch(/documents|GPA|coach@example/);
    expect(
      filterCoachProfile(
        { ukEducation: { exams: [] }, academics: null, privateChecklist: true },
        [],
      ),
    ).not.toHaveProperty("ukEducation");
    expect(
      filterCoachProfile({ ukEducation: { exams: [] } }, ["academics"]),
    ).toHaveProperty("ukEducation");
  });
  it("allows only exact same-origin profile paths and rejects query, fragment, credentials and malformed tokens", () => {
    const url = fixture().profiles[0].url;
    expect(coachToken(url, "https://soccercenter.org")).toBe("a".repeat(43));
    for (const u of [
      url + "?x=1",
      url + "#a",
      url.replace("soccercenter.org", "evil.test"),
      url.replace("https://", "https://user@"),
      url.slice(0, -1),
    ])
      expect(coachToken(u, "https://soccercenter.org")).toBeNull();
  });
});
