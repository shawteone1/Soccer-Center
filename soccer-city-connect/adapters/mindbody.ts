import { source, type Adapter } from "../model";
export const mindbody: Adapter = {
  provider: "Mindbody",
  mode: "simulated",
  access: "read-only",
  maxAttempts: 3,
  read(fail) {
    if (fail) throw new Error("Simulated source unavailable");
    return [
      source(
        "Mindbody",
        "membership",
        "MB-M-100",
        "parent",
        "Family membership",
        "Active",
        "active",
        { renewal: "2026-12-13" },
      ),
      source(
        "Mindbody",
        "event",
        "MB-B-101",
        "parent",
        "Evening pickup",
        "Booked",
        "confirmed",
        {
          startAt: "2026-11-16T01:00:00Z",
          endAt: "2026-11-16T02:00:00Z",
          location: "Field 1",
        },
      ),
      source(
        "Mindbody",
        "requirement",
        "MB-W-102",
        "athlete",
        "Participation waiver",
        "Missing",
        "missing",
      ),
      source(
        "Mindbody",
        "membership",
        "MB-M-999",
        null,
        "Unconfirmed Alex Rivera identity",
        "Expired",
        "expired",
      ),
    ];
  },
};
