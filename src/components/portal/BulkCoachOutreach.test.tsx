import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import BulkCoachOutreach from "./BulkCoachOutreach";
let created: Array<{ player: string; fields: string[] }>;
let sent: Array<Record<string, any>>;
let rejectFirst: boolean;
const request = vi.fn();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  created = [];
  sent = [];
  rejectFirst = true;
  vi.stubGlobal("fetch", request);
  request.mockImplementation(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, window.location.origin),
      path = url.pathname;
    if (path === "/api/parent/players")
      return json({
        players: [
          { id: "p1", label: "Alex", ageBand: "U17" },
          { id: "p2", label: "Taylor", ageBand: "U18" },
          { id: "p3", label: "Young", ageBand: "U12" },
        ],
      });
    if (path.endsWith("/bulk-outreach")) {
      if (init.method === "POST") {
        const body = JSON.parse(init.body as string);
        sent.push(body);
        const failed = body.coachId === "c1" && rejectFirst;
        if (failed) rejectFirst = false;
        return json({
          messageId: body.messageId,
          state: failed ? "failed" : "accepted",
          retryable: failed,
          retryAfterSeconds: 60,
        });
      }
      return json({ ready: true, replyTo: "parent@example.org", history: [] });
    }
    if (path.endsWith("/coaches"))
      return json({
        coaches: [
          {
            coachId: "c1",
            name: "Coach One",
            email: "one@example.edu",
            program: {
              institution: "College One",
              gender: "mens",
              division: "NCAA D1",
              state: "CO",
            },
          },
          {
            coachId: "c2",
            name: "Coach Two",
            email: "two@example.edu",
            program: {
              institution: "College Two",
              gender: "womens",
              division: "NCAA D2",
              state: "AZ",
            },
          },
        ],
      });
    if (path.endsWith("/coach-fields"))
      return json({
        fields: [
          { key: "label", label: "Player name" },
          { key: "academics", label: "Academics" },
        ],
      });
    if (path.endsWith("/match-records")) return json({ records: [] });
    if (path.endsWith("/coach-preview"))
      return json({
        profile: {
          label: "Alex",
          ukEducation: {
            system: "England",
            documents: { private: "PRIVATE-CHECKLIST-MARKER" },
            exams: [
              {
                qualification: "GCSE",
                subject: "Maths",
                grade: "8",
                status: "Achieved",
              },
            ],
          },
          highlights: [],
          upcomingEvents: [],
        },
      });
    if (path.endsWith("/coach-links") && init.method === "POST") {
      const body = JSON.parse(init.body as string);
      created.push({ player: path.split("/")[4], fields: body.approvedFields });
      return json({
        linkId: `link-${created.length}`,
        shareUrl: `${window.location.origin}/coach/profile/${String(created.length).repeat(43)}`,
      });
    }
    if (init.method === "DELETE") return json({ revoked: true });
    throw new Error(`Unexpected fixture request ${path}`);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function selectPlayers() {
  await screen.findByLabelText(/Alex · U17/);
  fireEvent.click(screen.getByLabelText(/Alex · U17/));
  fireEvent.click(screen.getByLabelText(/Taylor · U18/));
  await waitFor(() =>
    expect(screen.getAllByLabelText("Player name")).toHaveLength(2),
  );
  for (const c of screen.getAllByLabelText("Player name")) fireEvent.click(c);
  await waitFor(() =>
    expect(screen.getAllByText("Selected profile information")).toHaveLength(2),
  );
}
it("prepares four unique links and sends two private messages; retries only the rejected coach", async () => {
  render(<BulkCoachOutreach />);
  await selectPlayers();
  expect(screen.getByLabelText(/Young · U12/)).toBeDisabled();
  for (const name of ["Alex", "Taylor"])
    for (const coach of ["One", "Two"])
      fireEvent.click(
        screen.getByLabelText(`Send ${name} profile to Coach ${coach}`),
      );
  expect(
    screen.getByRole("button", { name: "Prepare links & review emails" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I approve these assignments/));
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare links & review emails" }),
  );
  await screen.findByRole("heading", {
    name: "4. Review each recipient’s email",
  });
  expect(created).toHaveLength(4);
  expect(sent).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: "Send 2 separate emails" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I reviewed every recipient/));
  fireEvent.click(
    screen.getByRole("button", { name: "Send 2 separate emails" }),
  );
  await waitFor(() => expect(sent).toHaveLength(2));
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Check / resume unfinished messages",
      }),
    ).toBeEnabled(),
  );
  expect(sent.map((m) => m.recipientEmail)).toEqual([
    "one@example.edu",
    "two@example.edu",
  ]);
  expect(
    new Set(sent.flatMap((m) => m.profiles.map((p: { url: string }) => p.url)))
      .size,
  ).toBe(4);
  expect(sent.every((m) => m.profiles.length === 2 && !m.cc && !m.bcc)).toBe(
    true,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check / resume unfinished messages" }),
  );
  await waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2]).toEqual(sent[0]);
  await screen.findByRole("button", { name: /Start a new batch/ });
  expect(sent.filter((m) => m.coachId === "c2")).toHaveLength(1);
});
it("invalidates approval on assignment changes, keeps UK academics opt-in and supports discarding links", async () => {
  render(<BulkCoachOutreach />);
  await selectPlayers();
  expect(screen.queryByText("Maths")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getAllByLabelText("Academics — UK exams or US GPA")[0],
  );
  await screen.findByText("Maths");
  expect(
    screen.queryByText("PRIVATE-CHECKLIST-MARKER"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Send Alex profile to Coach One"));
  fireEvent.click(screen.getByLabelText(/I approve these assignments/));
  fireEvent.click(screen.getByLabelText("Send Taylor profile to Coach One"));
  expect(
    screen.getByLabelText(/I approve these assignments/),
  ).not.toBeChecked();
  fireEvent.click(screen.getByLabelText(/I approve these assignments/));
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare links & review emails" }),
  );
  await screen.findByRole("heading", {
    name: "4. Review each recipient’s email",
  });
  expect(created[0].fields).toContain("academics");
  expect(created[1].fields).not.toContain("academics");
  const emails = screen
    .getByRole("region", { name: "Bulk coach outreach" })
    .querySelectorAll("pre");
  for (const email of emails) expect(email.textContent).not.toContain("Maths");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Discard prepared batch & revoke its links",
    }),
  );
  await screen.findByRole("button", { name: "Prepare links & review emails" });
  expect(sent).toHaveLength(0);
  expect(
    request.mock.calls.filter(([, i]) => i?.method === "DELETE"),
  ).toHaveLength(2);
});
it("offers a clearly discoverable section with no automatic sending", async () => {
  render(<BulkCoachOutreach />);
  await screen.findByLabelText(/Alex · U17/);
  expect(
    within(
      screen.getByRole("region", { name: "Bulk coach outreach" }),
    ).getByRole("heading", { name: "Reach multiple coaches" }),
  ).toBeInTheDocument();
  expect(sent).toHaveLength(0);
});

it("combines program, division, state and text filters without dropping selected coaches", async () => {
  render(<BulkCoachOutreach />);
  await selectPlayers();
  fireEvent.click(screen.getByLabelText("Send Alex profile to Coach One"));
  fireEvent.change(screen.getByLabelText("Program"), {
    target: { value: "womens" },
  });
  fireEvent.change(screen.getByLabelText("Division"), {
    target: { value: "NCAA D2" },
  });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "AZ" } });
  expect(
    screen.getByText(
      /1 matching coaches in the loaded directory; 1 selected outside/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Send Alex profile to Coach One")).toBeChecked();
  expect(
    screen.getByText("Selected — outside current filters"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find coaches or colleges"), {
    target: { value: "missing" },
  });
  expect(
    screen.getByText(/No coaches match these filters/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Coach Two · College Two" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search filters" }));
  expect(screen.getByLabelText("State")).toHaveValue("");
  expect(
    screen.getByRole("heading", { name: "Coach Two · College Two" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Send Alex profile to Coach One")).toBeChecked();
  expect(sent).toHaveLength(0);
});
it("offers unknown metadata and does not invent a matching state or division", async () => {
  render(<BulkCoachOutreach />);
  await screen.findByLabelText(/Alex · U17/);
  fireEvent.change(screen.getByLabelText("State"), {
    target: { value: "__unknown" },
  });
  expect(
    screen.getByText(/No coaches match these filters/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search filters" }));
  fireEvent.click(screen.getByLabelText("Has a published email"));
  expect(
    screen.getByText(/2 matching coaches in the loaded directory/),
  ).toBeInTheDocument();
  expect(sent).toHaveLength(0);
});
