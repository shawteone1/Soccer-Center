import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { UploadAssignModal } from "./PlayerMediaTab";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
it("retries attachment without uploading a second file and treats 409 as failure", async () => {
  let attempts = 0;
  const done = vi.fn();
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes("/media?")) return ok({ media: [], total: attempts ? 20 : 19 });
    if (url.endsWith("/media/upload")) return ok({ id: "saved-file" });
    if (url.endsWith("/media-assignments") && options?.method === "POST")
      return ++attempts === 1
        ? {
            ok: false,
            status: 409,
            json: async () => ({ error: "Attached to another game" }),
          }
        : ok({ id: "assignment" });
    return ok({ events: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(
    <UploadAssignModal playerId="p" onClose={vi.fn()} onDone={done} />,
  );
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: {
      files: [new File(["video"], "test.mov", { type: "video/quicktime" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload & add" }));
  await screen.findByText(/File saved in your library. Attachment failed/);
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry attachment" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(
    fetcher.mock.calls.filter(([u]) => u.endsWith("/media/upload")),
  ).toHaveLength(1);
});
it("clears upload quota errors in the library and attaches without upload", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("/media?"))
      return ok({
        media: [
          {
            id: "v",
            mediaType: "video",
            originalName: "Goal.mov",
            publicUrl: "/api/parent/uploads/media/v",
          },
          {
            id: "p",
            mediaType: "image",
            originalName: "Photo.jpg",
            publicUrl: "/p.jpg",
          },
        ],
        total: 20,
      });
    if (url.endsWith("/media/upload"))
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "Quota reached" }),
      };
    return ok({ events: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  const done = vi.fn();
  const { container } = render(
    <UploadAssignModal playerId="p" onClose={vi.fn()} onDone={done} />,
  );
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: {
      files: [new File(["v"], "test.mov", { type: "video/quicktime" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload & add" }));
  await screen.findAllByText(/Your library is full/);
  fireEvent.click(screen.getByRole("button", { name: "From library" }));
  await screen.findByRole("button", { name: "Goal.mov" });
  expect(screen.queryByText("Quota reached")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Videos" }));
  expect(screen.queryByRole("button", { name: "Photo.jpg" })).toBeNull();
  const tile = screen.getByRole("button", { name: "Goal.mov" });
  expect(tile).toHaveStyle({ height: "144px", minHeight: "144px" });
  fireEvent.click(tile);
  fireEvent.click(screen.getByRole("button", { name: "Attach selected (1)" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(
    fetcher.mock.calls.filter(([u]) => u.endsWith("/media/upload")),
  ).toHaveLength(0);
});
it("shows a library fetch failure instead of an empty library", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
  );
  render(<UploadAssignModal playerId="p" onClose={vi.fn()} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "From library" }));
  await screen.findByRole("button", { name: "Retry library" });
  expect(screen.queryByText(/No media in your library yet/)).toBeNull();
});
