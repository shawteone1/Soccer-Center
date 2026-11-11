import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CollegeFitFinder from "./CollegeFitFinder";
import { coloradoCollegeProfiles } from "@/lib/intelligence/college-catalog";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("uses existing shortlist callbacks and produces a private unsent inquiry", () => {
  const toggle = vi.fn(),
    explore = vi.fn(),
    fetch = vi.spyOn(globalThis, "fetch"),
    storage = vi.spyOn(Storage.prototype, "setItem");
  const p = coloradoCollegeProfiles[0];
  render(
    <CollegeFitFinder
      profiles={[p]}
      selected={[]}
      onToggle={toggle}
      onExplore={explore}
    />,
  );
  fireEvent.click(screen.getByText("Find my college fit →"));
  fireEvent.change(screen.getByLabelText("Academic interests / majors"), {
    target: { value: "Engineering" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Explore my college leads" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: `Add to comparison: ${p.name}` }),
  );
  expect(toggle).toHaveBeenCalledWith(p.id);
  fireEvent.click(
    screen.getByRole("button", { name: `View evidence for ${p.name}` }),
  );
  expect(explore).toHaveBeenCalledWith(p.id);
  fireEvent.click(
    screen.getByRole("button", { name: `Prepare inquiry: ${p.name}` }),
  );
  expect(
    (screen.getByLabelText("College inquiry draft") as HTMLTextAreaElement)
      .value,
  ).toContain("Engineering");
  expect(fetch).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Academic interests / majors"), {
    target: { value: "Biology" },
  });
  expect(
    screen.queryByLabelText("College inquiry draft"),
  ).not.toBeInTheDocument();
});
it("respects three-school limit and handles incomplete coverage", () => {
  const p = coloradoCollegeProfiles[0];
  const view = render(
    <CollegeFitFinder
      profiles={[p]}
      selected={["x", "y", "z"]}
      onToggle={() => {}}
      onExplore={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("Find my college fit →"));
  fireEvent.click(
    screen.getByRole("button", { name: "Explore my college leads" }),
  );
  expect(
    screen.getByRole("button", { name: `Add to comparison: ${p.name}` }),
  ).toBeDisabled();
  view.unmount();
  render(
    <CollegeFitFinder
      profiles={[]}
      selected={[]}
      onToggle={() => {}}
      onExplore={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("Find my college fit →"));
  fireEvent.click(
    screen.getByRole("button", { name: "Explore my college leads" }),
  );
  expect(screen.getByText(/No catalog entries match/)).toBeInTheDocument();
});
