import { describe, expect, it } from "vitest";
import { pollDelayMs } from "./useRecordsUnread";

// WHAT THIS EXISTS TO PREVENT, stated so it cannot be casually undone.
//
// This poller ran unguarded on an empty dep array. On 2026-08-28 it put the
// operator over a per-user daily API cap and 429'd every authenticated
// surface at once: records-request/inbox was ~46% of a 3,000-row sample of
// that day's traffic, more than every human-clicked endpoint combined.
//
// The repo tests in node with no DOM, so the SCHEDULING DECISION is a pure
// function and these pin it. A hidden tab must cost nothing.

describe("pollDelayMs — a buried tab costs nothing", () => {
  it("does not poll at all when the tab is hidden", () => {
    expect(pollDelayMs({ visible: false, wired: true })).toBeNull();
  });

  it("stays silent when hidden EVEN IF the service is wired and has news", () => {
    // Hidden must win over every other condition. This is the whole fix: the
    // old code polled a backgrounded tab at full rate forever.
    expect(pollDelayMs({ visible: false, wired: true })).toBeNull();
    expect(pollDelayMs({ visible: false, wired: false })).toBeNull();
  });

  it("does not poll a service that said it is not wired", () => {
    // Signed out, or records not deployed. Polling cannot change either.
    expect(pollDelayMs({ visible: true, wired: false })).toBeNull();
  });

  it("polls on a slow cadence when visible AND wired", () => {
    const delay = pollDelayMs({ visible: true, wired: true });
    expect(delay).toBe(60_000);
  });

  it("never returns a fast cadence — this is an ambient dot, not a progress bar", () => {
    const delay = pollDelayMs({ visible: true, wired: true });
    expect(delay).not.toBeNull();
    expect(delay as number).toBeGreaterThanOrEqual(60_000);
  });

  it("the only polling state is visible AND wired", () => {
    // Guard against a future edit that loosens one branch: enumerate the
    // whole truth table so exactly one cell may poll.
    const cells = [
      { visible: true, wired: true },
      { visible: true, wired: false },
      { visible: false, wired: true },
      { visible: false, wired: false },
    ];
    const polling = cells.filter((c) => pollDelayMs(c) !== null);
    expect(polling).toEqual([{ visible: true, wired: true }]);
  });
});
