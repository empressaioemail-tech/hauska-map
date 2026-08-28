import { describe, expect, it } from "vitest";
import {
  effectiveSelectedDoc,
  routePick,
  shouldPromotePending,
} from "./reports-doc-selection";

// THESE EXIST BECAUSE THE FIRST VERSION OF THIS FIX WAS UNTESTED.
//
// The markup tests for it passed with the fix REVERTED — they only proved the
// picker and the header pill rendered, never that a pre-parcel choice was
// kept. Reverting the one line that keeps it changed nothing, which means
// they were decorative. The behaviour is interaction wiring and this repo has
// no click harness, so the decision is pure and pinned here instead.

describe("routePick — a pick with no parcel must go SOMEWHERE", () => {
  it("goes to per-property state when there is a property", () => {
    expect(routePick("48021:123")).toBe("store");
  });

  it("is HELD when there is not — the store would silently drop it", () => {
    // WorkbenchContext refuses writes with no parcel ("no phantom-property
    // writes"). Correct, and the reason this branch has to exist.
    expect(routePick(null)).toBe("pending");
  });
});

describe("effectiveSelectedDoc — never read another property's choice", () => {
  it("uses per-property state when a parcel is active", () => {
    expect(effectiveSelectedDoc("48021:123", "XRAY", null)).toBe("XRAY");
  });

  it("uses the HELD pick when no parcel is active", () => {
    expect(effectiveSelectedDoc(null, null, "FLOOD")).toBe("FLOOD");
  });

  it("ignores the store entirely with no parcel", () => {
    // The store is keyed BY property. With none active its value belongs to
    // whichever property was last open, not to this empty state. Showing it
    // would attribute a previous property's choice to no property at all.
    expect(effectiveSelectedDoc(null, "XRAY", null)).toBeNull();
    expect(effectiveSelectedDoc(null, "XRAY", "FLOOD")).toBe("FLOOD");
  });

  it("is null when nothing is chosen either way", () => {
    expect(effectiveSelectedDoc(null, null, null)).toBeNull();
    expect(effectiveSelectedDoc("48021:123", null, null)).toBeNull();
  });
});

describe("shouldPromotePending — the held pick lands exactly once", () => {
  it("promotes when a parcel arrives and something is held", () => {
    expect(shouldPromotePending("48021:123", "FLOOD")).toBe(true);
  });

  it("does not promote with nothing held", () => {
    expect(shouldPromotePending("48021:123", null)).toBe(false);
  });

  it("does not promote while there is still no parcel", () => {
    expect(shouldPromotePending(null, "FLOOD")).toBe(false);
  });

  it("does not promote on empty string, which is not a parcel", () => {
    // Guard against a falsy id being treated as present.
    expect(shouldPromotePending("", "FLOOD")).toBe(false);
  });
});
