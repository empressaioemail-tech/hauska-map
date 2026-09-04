import { describe, expect, it } from "vitest";
import { shouldLightReportsDot } from "./reports-dot";

// The rail's ONE Reports dot now has two feeds — records-request completions
// and filed-report completions. These pin the combining rule so a future
// edit cannot quietly turn it into a sum (a count badge) or an AND (missing
// half the cases it exists to catch).

describe("shouldLightReportsDot — one dot, fed honestly by either source", () => {
  it("lights when only reports-seen has something unseen", () => {
    expect(shouldLightReportsDot(0, 1)).toBe(true);
    expect(shouldLightReportsDot(0, 3)).toBe(true);
  });

  it("lights when only records has something unread", () => {
    expect(shouldLightReportsDot(1, 0)).toBe(true);
    expect(shouldLightReportsDot(2, 0)).toBe(true);
  });

  it("lights when BOTH sources have something new", () => {
    expect(shouldLightReportsDot(2, 3)).toBe(true);
  });

  it("does NOT light when both are empty — the honest zero, not a guess", () => {
    expect(shouldLightReportsDot(0, 0)).toBe(false);
  });

  it("is an OR, not a sum: a huge count on one side alone still only means 'lit'", () => {
    // Guards against a future rewrite that surfaces recordsUnread + reportsUnread
    // as a number somewhere the dot renders — the rail's rule is one dot,
    // never a count.
    expect(shouldLightReportsDot(50, 0)).toBe(true);
    expect(shouldLightReportsDot(0, 50)).toBe(true);
  });
});
