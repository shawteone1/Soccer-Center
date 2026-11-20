import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const center = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Pilot setup and connections" });
async function openSetup(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Open setup & connections", exact: true })
    .click();
}
test("onboarding resumes, selects providers, previews records, reviews associations and preserves member state", async ({
  page,
}) => {
  await page.goto("/#admin");
  await openSetup(page);
  const setup = center(page);
  await setup
    .getByLabel("Organization name")
    .fill("Fictional training facility");
  await setup
    .getByLabel("Organization timezone", { exact: true })
    .selectOption("America/Denver");
  await setup
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await page.reload();
  await openSetup(page);
  await expect(
    setup.getByRole("heading", { name: "Staff & rules", exact: true }),
  ).toBeVisible();
  await setup
    .getByLabel("Default task owner", { exact: true })
    .selectOption("casey");
  await setup.getByLabel("Follow-up deadline (days)").fill("3");
  await setup
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await setup.getByLabel("Include Playpass").uncheck();
  await setup
    .getByLabel("Square setup mode", { exact: true })
    .selectOption("sandbox");
  await setup
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(setup).toContainText("Square fictional import preview");
  await setup
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  const association = setup.getByRole("article", {
    name: "Association MB-M-999",
    exact: true,
  });
  await association
    .getByLabel("Association decision MB-M-999", { exact: true })
    .selectOption("athlete");
  await association
    .getByLabel("Review evidence / reason")
    .fill("Explicit fictional verification.");
  await association
    .getByRole("button", { name: "Save association review" })
    .click();
  await expect(association).toContainText("confirmed");
  await page
    .getByRole("button", { name: "Member portal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Unconfirmed Alex Rivera identity",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Administrator", exact: true })
    .click();
  await openSetup(page);
  const again = center(page).getByRole("article", {
    name: "Association MB-M-999",
    exact: true,
  });
  await again
    .getByLabel("Association decision MB-M-999", { exact: true })
    .selectOption("separate");
  await again
    .getByLabel("Review evidence / reason")
    .fill("Correction: separate participant.");
  await again.getByRole("button", { name: "Save association review" }).click();
  await center(page)
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(center(page)).toContainText("Readiness summary");
  await center(page)
    .getByRole("button", { name: "Finish setup review" })
    .click();
  await center(page)
    .getByRole("button", { name: "Connection center", exact: true })
    .click();
  const square = center(page).getByRole("article", {
    name: "Square connection",
    exact: true,
  });
  await expect(square).toContainText("Authorization: unverified");
  await expect(square).toContainText("fictional simulation only");
  await expect(
    center(page).getByRole("article", {
      name: "Playpass connection",
      exact: true,
    }),
  ).toContainText("not selected");
  await square
    .getByRole("button", { name: "Disconnect Square", exact: true })
    .click();
  await expect(square).toContainText("disconnected");
  await expect(
    page.getByRole("article", {
      name: "Task: Participation waiver",
      exact: true,
    }),
  ).toContainText("Local workflow: Open");
  await page.reload();
  await openSetup(page);
  await center(page)
    .getByRole("button", { name: "Connection center", exact: true })
    .click();
  await expect(
    center(page).getByRole("article", {
      name: "Square connection",
      exact: true,
    }),
  ).toContainText("disconnected");
  await page.screenshot({
    path: "artifacts/connection-center-desktop.png",
    fullPage: true,
  });
});
test("authenticated durable backend rejects unauthorized roles and does not store credentials or state in browser storage", async ({
  page,
  context,
}) => {
  const { password } = JSON.parse(
    readFileSync(resolve(".pilot/browser-test/login.json"), "utf8"),
  );
  await page.goto("http://127.0.0.1:5188/?pilot=1");
  await page.getByLabel("Staff username", { exact: true }).fill("test-admin");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Organization ID", { exact: true }).fill("browser-org");
  await page
    .getByRole("button", { name: "Sign in locally", exact: true })
    .click();
  await expect(
    page.getByText("Authenticated local staff: test-admin · admin", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Member portal", exact: true }),
  ).toHaveCount(0);
  const task = page.getByRole("article", {
    name: "Task: Participation waiver",
    exact: true,
  });
  await task.getByLabel("Assigned staff").selectOption("casey");
  await expect(page.getByRole("status")).toContainText("Server confirmed");
  await task
    .getByLabel("Staff follow-up note")
    .fill("Backend-persisted fictional follow-up.");
  await task.getByRole("button", { name: "Save follow-up note" }).click();
  await expect(task).toContainText("Backend-persisted fictional follow-up.");
  await page.reload();
  await page.getByLabel("Organization ID", { exact: true }).fill("browser-org");
  await page
    .getByRole("button", { name: "Open authorized organization", exact: true })
    .click();
  await expect(task).toContainText("Backend-persisted fictional follow-up.");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(
    readFileSync(resolve("artifacts/operations-desk-preview.html"), "utf8"),
  ).not.toContain(password);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "scc_session")?.httpOnly).toBe(true);
  const response = await page.evaluate(async () => {
    const session = await (await fetch("/pilot-api/session")).json();
    const r = await fetch("/pilot-api/orgs/other-org/state");
    return { status: r.status, user: session.user };
  });
  expect(response.status).toBe(403);
  await page
    .getByRole("button", { name: "Sign out locally", exact: true })
    .click();
  await page.getByLabel("Staff username", { exact: true }).fill("test-viewer");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Organization ID", { exact: true }).fill("browser-org");
  await page
    .getByRole("button", { name: "Sign in locally", exact: true })
    .click();
  await expect(task.getByLabel("Assigned staff")).toBeDisabled();
  const denied = await page.evaluate(async () => {
    const session = await (await fetch("/pilot-api/session")).json();
    const snap = await (
      await fetch("/pilot-api/orgs/browser-org/state")
    ).json();
    return (
      await fetch("/pilot-api/orgs/browser-org/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrf,
        },
        body: JSON.stringify({
          revision: snap.revision,
          command: { type: "reset" },
        }),
      })
    ).status;
  });
  expect(denied).toBe(403);
});
for (const viewport of [
  { name: "iPad portrait", width: 768, height: 1024 },
  { name: "iPad landscape", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 },
])
  test(`onboarding and connection workflow on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/#admin");
    await openSetup(page);
    await center(page)
      .getByRole("button", { name: "Save & continue", exact: true })
      .click();
    await expect(
      center(page).getByRole("heading", { name: "Staff & rules", exact: true }),
    ).toBeVisible();
    await center(page)
      .getByRole("button", { name: "Connection center", exact: true })
      .click();
    const mindbody = center(page).getByRole("article", {
      name: "Mindbody connection",
      exact: true,
    });
    await mindbody
      .getByRole("button", { name: "Disconnect Mindbody", exact: true })
      .click();
    await expect(mindbody).toContainText("disconnected");
    await mindbody
      .getByRole("button", {
        name: "Review Mindbody reauthorization",
        exact: true,
      })
      .click();
    await expect(mindbody).toContainText("not-required");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/setup-${viewport.name.replaceAll(" ", "-")}.png`,
      fullPage: true,
    });
  });
