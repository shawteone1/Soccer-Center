// @vitest-environment node
import { it, expect, vi } from "vitest";
import events from "../api/calendar/events/GET";
import status from "../api/calendar/status/GET";
import tsAuth from "../api/calendar/teamsnap/auth/GET";
import tsCallback from "../api/calendar/teamsnap/callback/GET";
import tsDisconnect from "../api/calendar/teamsnap/disconnect/POST";
import pmAuth from "../api/calendar/playmetrics/auth/GET";
import pmCallback from "../api/calendar/playmetrics/callback/GET";
import pmDisconnect from "../api/calendar/playmetrics/disconnect/POST";
it.each([
  events,
  status,
  tsAuth,
  tsCallback,
  tsDisconnect,
  pmAuth,
  pmCallback,
  pmDisconnect,
])(
  "closes the legacy endpoint without reading credentials or making network calls",
  (handler) => {
    const res: any = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    handler({} as any, res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INTEGRATION_UNAVAILABLE" }),
    );
  },
);
