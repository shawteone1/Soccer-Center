import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import ParentRecruitingHub from "./ParentRecruitingHub";
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});
it("offers a guide without requiring a player or exposing a certification form", () => {
  render(<ParentRecruitingHub players={[]} />);
  expect(
    screen.getByRole("heading", {
      name: "NCAA Eligibility Center / Clearinghouse",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Choose an account/ }),
  ).toHaveAttribute(
    "href",
    "https://www.ncaa.org/eligibility-center/register/",
  );
  expect(screen.getByText("November 11, 2026")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "My player tools" }));
  expect(screen.getByRole("link", { name: /Add player/ })).toHaveAttribute(
    "href",
    "/parent-portal/players/new",
  );
});
it("links each owned player to existing recruiting and does not send requests", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(
    <ParentRecruitingHub
      players={[{ id: "player-a", label: "Sample player" }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "My player tools" }));
  expect(
    screen.getByRole("link", { name: /Open recruiting tools/ }),
  ).toHaveAttribute("href", "/parent-portal/players/player-a?tab=recruiting");
  expect(fetch).not.toHaveBeenCalled();
});
it("searches the shared Colorado repository and filters gender and division together", () => {
  render(<ParentRecruitingHub players={[]} />);
  fireEvent.click(
    screen.getByRole("button", { name: "College search & compare" }),
  );
  expect(screen.getByText(/20 profiles shown/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Colorado clubs" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "Colorado Boulder" },
  });
  expect(
    screen.getByRole("heading", { name: "University of Colorado Boulder" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Soccer program"), {
    target: { value: "mens" },
  });
  expect(screen.getByText(/No profiles match/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Soccer program"), {
    target: { value: "womens" },
  });
  fireEvent.change(screen.getByLabelText("Division"), {
    target: { value: "NCAA D2" },
  });
  expect(screen.getByText(/No profiles match/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Division"), {
    target: { value: "NCAA D1" },
  });
  expect(
    screen.getByRole("heading", { name: "University of Colorado Boulder" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Explore college profile →" }),
  );
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "University of Colorado Boulder",
    }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "← Back to college search" }),
  );
  expect(screen.getByLabelText("Search")).toHaveValue("Colorado Boulder");
});
it("shares only canonical public school IDs, never portal context", async () => {
  window.history.replaceState(
    {},
    "",
    "/parent-portal?tab=recruiting&player=private-player",
  );
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ParentRecruitingHub players={[]} />);
  fireEvent.click(
    screen.getByRole("button", { name: "College search & compare" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Compare Colorado College" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy comparison link" }));
  await screen.findByText(/Comparison link copied/);
  const url = new URL(writeText.mock.calls[0][0]);
  expect(url.pathname).toBe("/research/colorado");
  expect([...url.searchParams.keys()]).toEqual(["compare"]);
  expect(url.href).not.toContain("private-player");
  expect(
    within(
      screen.getByRole("region", { name: /Comparison overview/ }),
    ).getByRole("columnheader", { name: "Colorado College" }),
  ).toBeInTheDocument();
});
