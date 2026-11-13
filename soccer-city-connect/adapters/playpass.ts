import { source, type Adapter } from "../model";
export const playpass: Adapter = {
  provider: "Playpass",
  mode: "simulated",
  access: "read-only",
  maxAttempts: 3,
  read(fail) {
    if (fail) throw new Error("Simulated source unavailable");
    return [
      source(
        "Playpass",
        "registration",
        "PP-R-200",
        "athlete",
        "Youth development league",
        "Registered",
        "enrolled",
      ),
      source(
        "Playpass",
        "event",
        "PP-E-201",
        "athlete",
        "Youth league session",
        "Scheduled",
        "confirmed",
        {
          startAt: "2026-11-14T17:00:00Z",
          endAt: "2026-11-14T18:30:00Z",
          location: "Field 2",
        },
      ),
    ];
  },
};
