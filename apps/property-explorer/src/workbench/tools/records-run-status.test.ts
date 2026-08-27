import { describe, expect, it } from "vitest";
import { liveRecordsRunStatus } from "./records-run-status";

describe("liveRecordsRunStatus", () => {
  it("queued live job uses honest copy, not design scaffold queue position", () => {
    const copy = liveRecordsRunStatus({
      phase: "queued",
      parcelNodeId: "48021:34137",
      searchedAt: "2026-08-27T00:00:00.000Z",
      instrumentCount: 0,
      filters: [],
      instruments: [],
      verdicts: [],
      live: true,
    });
    expect(copy.title).toBe("Queued");
    expect(copy.body).not.toContain("position 3");
    expect(copy.body).not.toContain("Bastrop County runs ahead");
  });
});
