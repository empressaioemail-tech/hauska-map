import { describe, expect, it } from "vitest";
import {
  markRunsSeen,
  resolveSeenRuns,
  runKey,
  unseenRunCount,
} from "./records-seen";

// THE STUCK DOT, pinned.
//
// The rail's unread rule was isReadyForPickup: not queued, not running, no
// error. That answers "has this run finished", which stays true forever once
// it is true, and the product has no read state at all — no readAt, no
// acknowledge. So the dot was permanently lit and nothing could clear it. The
// operator called it stuck; it was, structurally.
//
// A dot that can never go dark spends the rail's only piece of ambient
// attention and returns nothing.

describe("runKey", () => {
  it("is the server's own job id", () => {
    expect(runKey({ jobId: "job-1" })).toBe("job-1");
  });
});

describe("resolveSeenRuns — absent is not unseen", () => {
  it("SEEDS on first run so an existing backlog does not all light up", () => {
    // Someone with finished runs the day this ships has not "not seen" them;
    // we never tracked it. Lighting them would assert something never
    // recorded, and would teach them to ignore the colour immediately.
    const seen = resolveSeenRuns(["a", "b", "c"], null);
    expect(unseenRunCount(["a", "b", "c"], seen)).toBe(0);
  });

  it("an EMPTY tracked set is preserved — tracked and nothing seen", () => {
    // The distinction the module exists for. Empty must NOT re-seed.
    const seen = resolveSeenRuns(["a", "b"], new Set<string>());
    expect(unseenRunCount(["a", "b"], seen)).toBe(2);
  });

  it("keeps what was tracked and lights only what arrived after", () => {
    const seen = resolveSeenRuns(["a", "b"], new Set(["a"]));
    expect(unseenRunCount(["a", "b"], seen)).toBe(1);
  });

  it("does not mutate the set it was handed", () => {
    const stored = new Set(["a"]);
    const seen = resolveSeenRuns(["a", "b"], stored);
    seen.add("b");
    expect(stored.has("b")).toBe(false);
  });
});

describe("markRunsSeen — opening the dock is what clears it", () => {
  it("darkens the dot for everything currently finished", () => {
    const seen = markRunsSeen(["a", "b"], new Set<string>());
    expect(unseenRunCount(["a", "b"], seen)).toBe(0);
  });

  it("a run that finishes AFTER you looked lights it again", () => {
    // This is the whole point: the dot means "something new", not "something
    // exists". If it could not come back on it would be as useless as one
    // that could not go off.
    const afterLooking = markRunsSeen(["a", "b"], new Set<string>());
    expect(unseenRunCount(["a", "b", "c"], afterLooking)).toBe(1);
  });

  it("does not mutate the set it was handed", () => {
    const before = new Set<string>();
    markRunsSeen(["a"], before);
    expect(before.size).toBe(0);
  });
});

describe("unseenRunCount", () => {
  it("is zero on an empty inbox, never a guess", () => {
    expect(unseenRunCount([], new Set())).toBe(0);
    expect(unseenRunCount([], resolveSeenRuns([], null))).toBe(0);
  });
});
