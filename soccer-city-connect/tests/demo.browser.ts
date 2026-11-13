import { test, expect } from "@playwright/test";
import { KEY } from "../model";

test("complete fictional workflow, cross-tab consistency, sync and reset", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "127.0.0.1" || u.pathname.startsWith("/api/"))
      requests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome, Jordan." }),
  ).toBeVisible();
  await expect(
    page.getByText("Provider: Active", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Youth development league" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Winter camp transaction reference" }),
  ).toBeVisible();
  const list = page.locator(".agenda");
  await expect(list.locator("article")).toHaveCount(3);
  await expect(
    page.getByText("Local workflow: Open", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("MB-M-999", { exact: false })).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "View simulated source · SQ-T-300",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("COMPLETED");
  await expect(page.getByRole("dialog")).toContainText("fictional-soccer-city");
  await page.getByRole("button", { name: "Close source record" }).click();
  await page
    .getByRole("button", {
      name: "Explore registration (simulated)",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No registration submitted",
  );
  await page
    .getByRole("button", { name: "Book an activity (simulated)", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No booking or payment made",
  );
  const member = await context.newPage();
  await member.goto("/");
  await page
    .getByRole("button", { name: "Administrator", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Resolve local workflow (simulated)",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Local workflow resolved", { exact: true }),
  ).toBeVisible();
  await expect(
    member.getByText("Local workflow: Locally resolved", { exact: false }),
  ).toBeVisible();
  await member.reload();
  await expect(
    member.getByText("Local workflow: Locally resolved", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sync Mindbody", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sync Mindbody", exact: true })
    .click();
  await expect(page.locator(".agenda article")).toHaveCount(3);
  await expect(
    page.getByText("Local workflow: Locally resolved", { exact: false }),
  ).toBeVisible();
  const health = page.getByTestId("health-Playpass");
  await health
    .getByRole("button", { name: "Simulate Playpass failure", exact: true })
    .click();
  await expect(health).toContainText("Failed");
  await health
    .getByRole("button", { name: "Retry Playpass", exact: true })
    .click();
  await expect(health).toContainText("Ready");
  await expect(health).toContainText("Attempts: 2/3");
  await expect(
    page.getByText("Synchronization failed", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Soccer City operations" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Member portal", exact: true })
    .click();
  await expect(
    page.getByText("Local workflow: Locally resolved", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/member-desktop.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    localStorage.setItem("unrelated-demo", "preserve-me"),
  );
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(
    page.getByText("Local workflow: Open", { exact: false }),
  ).toBeVisible();
  await expect(
    member.getByText("Local workflow: Open", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-demo")),
  ).toBe("preserve-me");
  await page
    .getByRole("button", { name: "Administrator", exact: true })
    .click();
  await expect(page.getByText("No administrative actions yet.")).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("member search, source filters, calendar navigation, failure bounds and stale warnings", async ({
  page,
}) => {
  await page.goto("/#admin");
  const search = page.getByRole("searchbox");
  await search.fill("PP-R-200");
  await expect(
    page.locator(".record-grid").first().locator("article"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Youth development league" }),
  ).toBeVisible();
  await search.fill("nobody");
  await expect(
    page.getByText("No activities match your filters."),
  ).toBeVisible();
  await search.fill("Alex");
  await expect(page.locator(".record-grid").first()).toContainText(
    "Unconfirmed Alex Rivera identity",
  );
  await search.fill("");
  await page.getByLabel("Calendar provider").selectOption("Square");
  await expect(page.locator(".agenda article")).toHaveCount(1);
  await expect(page.locator(".agenda")).toContainText("Winter skills camp");
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.locator(".pp-cal-toolbar")).toContainText("December 2026");
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.locator(".pp-cal-toolbar")).toContainText("November 2026");
  const h = page.getByTestId("health-Mindbody");
  await h
    .getByRole("button", { name: "Simulate Mindbody failure", exact: true })
    .click();
  await h
    .getByRole("button", { name: "Retry Mindbody with failure", exact: true })
    .click();
  await h
    .getByRole("button", { name: "Retry Mindbody with failure", exact: true })
    .click();
  await expect(
    h.getByRole("button", { name: "Retry Mindbody", exact: true }),
  ).toBeDisabled();
  await expect(h).toContainText("Attempts: 3/3");
  await h.getByRole("button", { name: "Sync Mindbody", exact: true }).click();
  await expect(h).toContainText("Ready");
  await h
    .getByRole("button", { name: "Mark Mindbody stale", exact: true })
    .click();
  await expect(h).toContainText("Stale / last-known data");
});

test("responsive portals and keyboard source inspection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome, Jordan." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/member-mobile.png",
    fullPage: true,
  });
  const source = page.getByRole("button", {
    name: "View simulated source · MB-M-100",
    exact: true,
  });
  await source.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close source record" }).click();
  await page
    .getByRole("button", { name: "Administrator", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/admin-mobile.png", fullPage: true });
});

test("corrupt demo storage recovers without touching other keys", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), KEY);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome, Jordan." }),
  ).toBeVisible();
});
