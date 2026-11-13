import { source, type Adapter } from "../model";
export const square: Adapter = {
  provider: "Square",
  mode: "simulated",
  access: "read-only",
  maxAttempts: 3,
  read(fail) {
    if (fail) throw new Error("Simulated source unavailable");
    return [
      source(
        "Square",
        "transaction",
        "SQ-T-300",
        "parent",
        "Winter camp transaction reference",
        "COMPLETED",
        "completed",
      ),
      source(
        "Square",
        "registration",
        "SQ-EN-301",
        "athlete",
        "Winter skills camp · explicit fixture enrollment",
        "Confirmed enrollment fixture",
        "enrolled",
      ),
      source(
        "Square",
        "event",
        "SQ-E-302",
        "athlete",
        "Winter skills camp",
        "Scheduled",
        "confirmed",
        {
          startAt: "2026-11-21T17:00:00Z",
          endAt: "2026-11-21T20:00:00Z",
          location: "Field 3",
        },
      ),
    ];
  },
};
