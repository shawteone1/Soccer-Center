import { test, expect } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { initial, resolve } from "../store";
import { KEY } from "../model";

test("staff assignment, follow-up, source review, completion and operational measurement persist", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "127.0.0.1" || u.pathname.startsWith("/api/"))
      external.push(r.url());
  });
  await page.goto("/#admin");
  await expect(
    page.getByRole("heading", {
      name: "Soccer City Operations Desk",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("header")).toContainText("powered by PlayRcmd");
  const member = await context.newPage();
  await member.goto("/#member");
  const task = page.getByRole("article", {
    name: "Task: Participation waiver",
    exact: true,
  });
  await page.getByLabel("Acting staff (simulated)").selectOption("casey");
  await task.getByLabel("Assigned staff").selectOption("casey");
  await task.getByLabel("Follow-up date").fill("2026-11-15");
  await task
    .getByLabel("Staff follow-up note")
    .fill(
      "Reviewed fictional source; provider confirmation needed before participation.",
    );
  await task.getByRole("button", { name: "Save follow-up note" }).click();
  await expect(task).toContainText("Casey Brooks");
  await task
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("MB-W-102");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(task.getByLabel("Assigned staff")).toHaveValue("casey");
  await expect(task.getByLabel("Follow-up date")).toHaveValue("2026-11-15");
  await expect(task).toContainText("Reviewed fictional source");
  await page.getByLabel("Acting staff (simulated)").selectOption("casey");
  await page.getByLabel("Queue owner", { exact: true }).selectOption("casey");
  await expect(page.locator(".ops-task")).toHaveCount(1);
  await task
    .getByRole("button", {
      name: "Resolve local workflow (simulated)",
      exact: true,
    })
    .click();
  await expect(task).toContainText("Local workflow: Locally resolved");
  await expect(task).toContainText("Provider status: Missing");
  await expect(
    member.getByText("Local workflow: Locally resolved", { exact: false }),
  ).toBeVisible();
  await member.reload();
  await expect(
    member.getByText("Provider status: Missing", { exact: false }),
  ).toBeVisible();
  const measurement = page.locator("#ops-measurement");
  await expect(measurement).toContainText("Local reviews completed1");
  await expect(measurement).toContainText("Follow-up notes saved1");
  await expect(measurement).toContainText("Timed local reviews1");
  await expect(
    page.getByRole("heading", { name: "Resolution history" }).locator(".."),
  ).toContainText("Reviewed fictional source");
  await page
    .getByRole("button", { name: "Sync Mindbody", exact: true })
    .click();
  await expect(task).toContainText("Locally resolved");
  await expect(task.getByLabel("Assigned staff")).toHaveValue("casey");
  await page
    .getByRole("button", { name: "Simulate Mindbody failure", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry Mindbody", exact: true })
    .click();
  await expect(task).toContainText("Reviewed fictional source");
  await page.getByLabel("Queue status", { exact: true }).selectOption("Open");
  await expect(page.locator(".ops-task")).toHaveCount(0);
  await page
    .getByLabel("Queue status", { exact: true })
    .selectOption("Resolved");
  await expect(page.locator(".ops-task")).toHaveCount(1);
  await page.getByLabel("Queue owner", { exact: true }).selectOption("All");
  await page.getByLabel("Queue status", { exact: true }).selectOption("All");
  await page.screenshot({
    path: "artifacts/operations-workflow-desktop.png",
    fullPage: true,
  });
  const history = page
    .getByRole("heading", { name: "Operational activity and audit history" })
    .locator("..");
  await expect(history).toContainText("Staff assignment updated");
  await expect(history).toContainText("Follow-up note added");
  await expect(history).toContainText("Casey Brooks");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(task.getByLabel("Assigned staff")).toHaveValue("");
  await expect(task).not.toContainText("Reviewed fictional source");
  await expect(measurement).toContainText("Local reviews completed0");
  await expect(
    member.getByText("Local workflow: Open", { exact: false }),
  ).toBeVisible();
  expect(external).toEqual([]);
});

test("daily schedule, overdue work and responsive desk", async ({ page }) => {
  await page.goto("/#admin");
  const daily = page.locator("#daily-operations");
  await expect(daily).toContainText("Youth league session");
  await page.getByLabel("Operating date (demo)").fill("2026-11-15");
  await expect(daily).toContainText("Evening pickup");
  await expect(daily).toContainText("Overdue open2");
  await page.getByLabel("Operating date (demo)").fill("2026-11-16");
  await expect(daily).toContainText("No sessions on this date");
  await page
    .getByLabel("Queue owner", { exact: true })
    .selectOption("Unassigned");
  await expect(page.locator(".ops-task")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/operations-desk-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Member lookup", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeInViewport();
  await page.getByRole("searchbox").fill("PP-R-200");
  await expect(
    page.getByRole("heading", {
      name: "Youth development league",
      exact: true,
    }),
  ).toBeVisible();
});

test("legacy saved demo keeps its resolution and audit when the desk is opened", async ({
  page,
}) => {
  const seed = initial(),
    record = Object.values(seed.records).find((r) => r.kind === "requirement")!;
  const { tasks: _tasks, ...legacy } = resolve(seed, record);
  await page.goto("/");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: KEY, state: legacy },
  );
  await page.goto("/#admin");
  await page.reload();
  await expect(
    page.getByRole("article", {
      name: "Task: Participation waiver",
      exact: true,
    }),
  ).toContainText("Locally resolved");
  await expect(
    page.getByText("Local workflow resolved", { exact: true }),
  ).toBeVisible();
});

test("downloadable self-contained preview works without an app server", async ({
  page,
}) => {
  const network: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  const preview = fileURLToPath(
    new URL("../artifacts/operations-desk-preview.html", import.meta.url),
  );
  await page.goto(pathToFileURL(preview).href);
  await expect(
    page.getByRole("heading", {
      name: "Soccer City Operations Desk",
      exact: true,
    }),
  ).toBeVisible();
  const task = page.getByRole("article", {
    name: "Task: Participation waiver",
    exact: true,
  });
  await task.getByLabel("Assigned staff").selectOption("morgan");
  await task.getByLabel("Staff follow-up note").fill("Offline preview review.");
  await task.getByRole("button", { name: "Save follow-up note" }).click();
  await task
    .getByRole("button", {
      name: "Resolve local workflow (simulated)",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(task).toContainText("Locally resolved");
  await page
    .getByRole("button", { name: "Member portal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Jordan." }),
  ).toBeVisible();
  expect(network).toEqual([]);
});
