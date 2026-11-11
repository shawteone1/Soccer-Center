import { it, expect } from "vitest";
import {
  decodeDraftContent,
  encodeDraftContent,
  emptyComposition,
  normalizeComposition,
  profileEmailText,
  approvedCoachUrl,
  selectionKey,
} from "./outreach-composition";
it("round trips text and selections and preserves legacy introductions", () => {
  const c = {
    ...emptyComposition(),
    fields: ["label", "highlights"],
    media: ["m"],
  };
  expect(decodeDraftContent(encodeDraftContent("My own words", c))).toEqual({
    message: "My own words",
    composition: c,
  });
  expect(decodeDraftContent("Old draft")).toEqual({
    message: "Old draft",
    composition: emptyComposition(),
  });
});
it("filters unknown and sensitive fields", () =>
  expect(
    normalizeComposition({
      fields: ["label", "medical", "birthYear", "label"],
      media: [2, "id"],
    }),
  ).toEqual({ ...emptyComposition(), fields: ["label"], media: ["id"] }));
it("formats only selected content without private media URLs", () => {
  const c = {
    ...emptyComposition(),
    fields: ["label", "highlights", "upcomingEvents"],
    media: ["yes"],
    events: ["e"],
  };
  const text = profileEmailText(
    {
      label: "Player",
      contactEmail: "private@example.com",
      highlights: [
        { id: "yes", title: "Goal", publicUrl: "/private/file.mov" },
        { id: "no", title: "Hidden" },
      ],
      upcomingEvents: [
        {
          id: "e",
          title: "Camp",
          startAt: "2026-12-01T17:00:00Z",
          location: "Field",
          eventType: "camp",
        },
      ],
    },
    c,
    "https://site.test/coach/profile/token",
  );
  expect(text).toContain("Player");
  expect(text).toContain("Goal");
  expect(text).toContain("10:00 AM");
  expect(text).toContain("America/Denver");
  expect(text).not.toMatch(/private|Hidden/);
});
it("includes zero statistics and coverage without inventing unavailable numbers", () => {
  const text = profileEmailText(
    {
      stats: {
        available: true,
        gamesPlayed: 2,
        goals: 0,
        assists: null,
        coverage: "partial",
        excludedCount: 1,
        recordedCounts: { goals: 1 },
      },
    },
    { ...emptyComposition(), fields: ["stats"], matches: ["a", "b"] },
  );
  expect(text).toContain("goals: 0");
  expect(text).toContain("Coverage: partial");
  expect(text).not.toContain("assists: 0");
});
it("accepts only same-origin coach routes", () => {
  expect(approvedCoachUrl("/coach/profile/token", "https://site.test")).toBe(
    "https://site.test/coach/profile/token",
  );
  for (const url of [
    "https://evil.test/coach/profile/token",
    "/api/parent/uploads/media/x",
    "javascript:alert(1)",
  ])
    expect(approvedCoachUrl(url, "https://site.test")).toBeNull();
});
it("selection identity ignores order but changes when consent changes", () => {
  expect(
    selectionKey({ ...emptyComposition(), fields: ["label", "stats"] }),
  ).toBe(selectionKey({ ...emptyComposition(), fields: ["stats", "label"] }));
  expect(selectionKey(emptyComposition())).not.toBe(
    selectionKey({ ...emptyComposition(), media: ["m"] }),
  );
});
