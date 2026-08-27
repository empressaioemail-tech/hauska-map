import { afterEach, describe, expect, it } from "vitest";
import {
  notePropertyUnlockIntent,
  resetUnlockWeekForTests,
  shouldShowSoloCompare,
  unlocksThisWeek,
} from "./unlock-week";

afterEach(() => {
  resetUnlockWeekForTests();
});

describe("unlock week — Solo compare at the second property", () => {
  const monday = new Date("2026-08-24T12:00:00.000Z");

  it("first unlock this week does not show the Solo fact", () => {
    expect(notePropertyUnlockIntent("48021:1", monday)).toBe(1);
    expect(shouldShowSoloCompare(unlocksThisWeek(monday))).toBe(false);
  });

  it("second distinct property this week shows the Solo fact", () => {
    notePropertyUnlockIntent("48021:1", monday);
    expect(notePropertyUnlockIntent("48021:2", monday)).toBe(2);
    expect(shouldShowSoloCompare(unlocksThisWeek(monday))).toBe(true);
  });

  it("the same parcel twice is still one unlock", () => {
    notePropertyUnlockIntent("48021:1", monday);
    expect(notePropertyUnlockIntent("48021:1", monday)).toBe(1);
    expect(shouldShowSoloCompare(1)).toBe(false);
  });
});
