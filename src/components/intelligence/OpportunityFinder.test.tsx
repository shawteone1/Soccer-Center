import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OpportunityFinder from "./OpportunityFinder";
import ClubResearchSearch from "./ClubResearchSearch";
import ExploreCompareEntry from "./ExploreCompareEntry";
import data from "@/data/intelligence/colorado-clubs.json";
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});
it("opens from the entry link and gives honest U15 research with a reusable inquiry", () => {
  window.history.replaceState({}, "", "?finder=1");
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(<OpportunityFinder clubs={data.clubs} />);
  expect(document.querySelector("details")).toHaveAttribute("open");
  fireEvent.click(
    screen.getByRole("button", { name: "U15 Select · interested in ECNL" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Find research leads & build my inquiry",
    }),
  );
  expect(screen.getByText(/not verified ECNL matches/)).toBeInTheDocument();
  expect(
    (screen.getByLabelText("Inquiry draft") as HTMLTextAreaElement).value,
  ).toContain("Current age group: U15");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
});
it("keeps inquiry available when clipboard is unavailable", async () => {
  render(<OpportunityFinder clubs={[]} />);
  fireEvent.click(screen.getByText("Find my next opportunity →"));
  fireEvent.click(
    screen.getByRole("button", { name: "Age 12 · never played" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Find research leads & build my inquiry",
    }),
  );
  expect(screen.getByText(/No club program labels match/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy inquiry" }));
  expect(
    await screen.findByText(/Clipboard is unavailable/),
  ).toBeInTheDocument();
  expect(
    (screen.getByLabelText("Inquiry draft") as HTMLTextAreaElement).value,
  ).toContain("Player age: 12");
});
it("provides a visible public entry and honest club review status", () => {
  render(<ExploreCompareEntry />);
  expect(
    screen.getByRole("link", { name: /Find my next opportunity/ }),
  ).toHaveAttribute("href", "/research/colorado?finder=1");
  render(<ClubResearchSearch profile={data.clubs[0]} />);
  fireEvent.click(screen.getByRole("button", { name: "Public reviews" }));
  expect(screen.getByRole("status")).toHaveTextContent("not connected");
});
