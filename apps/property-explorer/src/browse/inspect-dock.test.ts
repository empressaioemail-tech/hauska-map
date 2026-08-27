import { describe, expect, it } from "vitest";
import { inspectStealsWorkbenchDock } from "./inspect-dock";

describe("inspectStealsWorkbenchDock", () => {
  it("Find and map click steal the dock (violate: keepDock true by default)", () => {
    expect(inspectStealsWorkbenchDock(undefined)).toBe(true);
    expect(inspectStealsWorkbenchDock(false)).toBe(true);
  });

  it("My properties reopen and share landing do not steal (violate: treat keepDock as brief)", () => {
    expect(inspectStealsWorkbenchDock(true)).toBe(false);
  });
});
