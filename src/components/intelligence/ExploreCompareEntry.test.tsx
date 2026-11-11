import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ExploreCompareEntry from "./ExploreCompareEntry";
it("exposes both research entry points without another primary navigation item", () => {
  render(<ExploreCompareEntry />);
  expect(
    screen.getByRole("link", { name: /Explore Colorado clubs/ }),
  ).toHaveAttribute("href", "/research/colorado");
  expect(
    screen.getByRole("link", { name: /Explore Colorado colleges/ }),
  ).toHaveAttribute("href", "/research/colorado?kind=college");
});
