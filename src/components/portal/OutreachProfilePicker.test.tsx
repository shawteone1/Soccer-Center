import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { useState } from "react";
import OutreachProfilePicker from "./OutreachProfilePicker";
import {
  emptyComposition,
  selectionKey,
  type DraftComposition,
} from "@/lib/portal/outreach-composition";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Harness({
  initial = emptyComposition(),
}: {
  initial?: DraftComposition;
}) {
  const [value, setValue] = useState(initial);
  return (
    <OutreachProfilePicker
      playerId="p"
      value={value}
      onChange={setValue}
      onContent={vi.fn()}
      demo={false}
    />
  );
}
it("does not create a link until explicit approval and button click", async () => {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => ({
    ok: true,
    json: async () =>
      url.endsWith("/coach-links")
        ? options?.method === "POST"
          ? {
              linkId: "l",
              shareUrl: "/coach/profile/token",
              expiresAt: "2099-01-01",
            }
          : { links: [{ id: "l", expiresAt: "2099-01-01" }] }
        : url.endsWith("/match-records")
          ? { records: [] }
          : url.endsWith("/collections")
            ? { collections: [] }
            : {
                profile: {
                  label: "Jordan",
                  highlights: [],
                  upcomingEvents: [],
                },
              },
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText("Player name")).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByLabelText("Player name"));
  const consent = await screen.findByLabelText(/I approve sharing/);
  await waitFor(() => expect(consent).not.toBeDisabled());
  expect(fetcher.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  fireEvent.click(consent);
  fireEvent.click(
    screen.getByRole("button", { name: "Create approved coach link" }),
  );
  await screen.findByText(/Approved coach link included/);
  const call = fetcher.mock.calls.find(([, o]) => o?.method === "POST")!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    approvedFields: ["label"],
    selectedMedia: [],
    selectedEvents: [],
    expiresInDays: 30,
  });
});
it("flags missing saved selections and allows their removal", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        profile: { highlights: [], upcomingEvents: [] },
        records: [],
        collections: [],
      }),
    })),
  );
  render(
    <Harness
      initial={{
        ...emptyComposition(),
        fields: ["highlights"],
        media: ["missing"],
      }}
    />,
  );
  await screen.findByText(/Some selected records are unavailable/);
  fireEvent.click(screen.getByLabelText(/Unavailable selection/));
  await waitFor(() =>
    expect(
      screen.queryByText(/Some selected records are unavailable/),
    ).toBeNull(),
  );
});
it("demo does not access live APIs", () => {
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  render(
    <OutreachProfilePicker
      playerId="demo"
      value={emptyComposition()}
      onChange={vi.fn()}
      onContent={vi.fn()}
      demo
    />,
  );
  expect(f).not.toHaveBeenCalled();
});

it('does not include an expired or revoked saved coach link', async () => {
 const value={...emptyComposition(),fields:['label']};
 const onContent=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('/coach-links')?{links:[{id:'old',revokedAt:'2026-01-01',expiresAt:'2099-01-01'}]}:{profile:{label:'Jordan'},records:[],collections:[]}})));
 render(<OutreachProfilePicker playerId="p" value={{...value,link:{id:'old',url:'/coach/profile/old',expiresAt:'2099-01-01',selection:selectionKey(value)}}} onChange={vi.fn()} onContent={onContent} demo={false}/>);
 await screen.findByText(/saved coach link is unavailable, expired, or revoked/);
 expect(onContent).toHaveBeenLastCalledWith('',false);
});
