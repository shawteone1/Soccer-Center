import { it, expect, vi, beforeEach } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const state = vi.hoisted(() => ({
  stored: null as string | null,
  allowed: true,
  owned: true,
  queries: [] as string[],
}));
vi.mock("../_guard.js", () => ({
  requireRecruitingAccess: vi.fn(async () =>
    state.allowed ? { userId: "owner" } : null,
  ),
}));
vi.mock("@/server/db/client.js", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      const { sql, params } = new MySqlDialect().sqlToQuery(query as never);
      state.queries.push(sql);
      if (
        sql.includes("SHOW TABLES") ||
        sql.includes("SELECT id FROM sc_college_coaches")
      )
        return [[{ id: "coach" }], []];
      if (sql.includes("INSERT INTO sc_outreach_drafts")) {
        state.stored = params[8] as string;
        return [[], []];
      }
      if (sql.includes("SELECT id, introduction"))
        return [
          state.owned ? [{ id: "draft", introduction: state.stored }] : [],
          [],
        ];
      if (sql.includes("UPDATE sc_outreach_drafts")) {
        const stored = params.find(
          (p) =>
            typeof p === "string" && p.includes("soccer-center-outreach-v1"),
        );
        if (stored) state.stored = stored as string;
        return [[], []];
      }
      if (sql.includes("FROM sc_outreach_drafts d"))
        return [
          [
            {
              id: "draft",
              player_id: "p",
              coach_id: "c",
              introduction: state.stored,
            },
          ],
          [],
        ];
      return [[], []];
    }),
  },
}));
import post from "./POST";
import patch from "./[draftId]/PATCH";
import get from "./GET";
const response = () => {
  const r = { status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  state.stored = null;
  state.allowed = true;
  state.owned = true;
  state.queries = [];
});
it("saves and reloads message and selected data through POST, PATCH and GET without schema changes", async () => {
  const r = response();
  await post(
    {
      body: {
        playerId: "p",
        coachId: "c",
        introduction: "Coach, here's my profile.\nThank you.",
        composition: {
          fields: ["label", "upcomingEvents"],
          events: ["camp"],
          media: [],
          matches: [],
        },
      },
    } as never,
    r as never,
  );
  expect(r.status).toHaveBeenCalledWith(201);
  expect(state.stored).toContain("soccer-center-outreach-v1");
  const read = response();
  await get({ query: { playerId: "p" } } as never, read as never);
  expect(read.json.mock.calls[0][0].drafts[0]).toMatchObject({
    introduction: "Coach, here's my profile.\nThank you.",
    composition: { fields: ["label", "upcomingEvents"], events: ["camp"] },
  });
  await patch(
    {
      params: { draftId: "draft" },
      body: { playerId: "p", introduction: "Revised message" },
    } as never,
    response() as never,
  );
  const read2 = response();
  await get({ query: { playerId: "p" } } as never, read2 as never);
  expect(read2.json.mock.calls[0][0].drafts[0]).toMatchObject({
    introduction: "Revised message",
    composition: { events: ["camp"] },
  });
});
it("does not write a draft owned by another parent", async () => {
  state.owned = false;
  const r = response();
  await patch(
    {
      params: { draftId: "other" },
      body: { playerId: "p", introduction: "changed" },
    } as never,
    r as never,
  );
  expect(r.status).toHaveBeenCalledWith(404);
  expect(state.queries.some((q) => q.includes("UPDATE"))).toBe(false);
});
it("does not access data if the recruiting guard denies access", async () => {
  state.allowed = false;
  await post(
    { body: { playerId: "p", coachId: "c" } } as never,
    response() as never,
  );
  expect(state.queries).toEqual([]);
});
