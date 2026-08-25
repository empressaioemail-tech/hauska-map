import { describe, expect, it } from "vitest";
import {
  OWNER_STUDIO_UPGRADE_CUE,
  gateOwnerPresentation,
  ownerPaintAllowed,
  resolveOwnerPaint,
} from "./owner-paint";

const LEAKY = {
  state: "present",
  source: "owner-fact",
  ownerName: "GEAUXNU HOLDINGS LLC",
};

describe("ownerPaintAllowed", () => {
  it("studio and team grant; free/solo/null refuse", () => {
    expect(ownerPaintAllowed("studio")).toBe(true);
    expect(ownerPaintAllowed("team")).toBe(true);
    expect(ownerPaintAllowed("solo")).toBe(false);
    expect(ownerPaintAllowed(null)).toBe(false);
  });
});

describe("resolveOwnerPaint — second gate + no CAD fallback", () => {
  it("free/Solo fixture with a name in a side channel does not render it", () => {
    const painted = resolveOwnerPaint({
      ownerFact: LEAKY,
      subscriptionTier: "solo",
      cadOwnerName: "GEAUXNU HOLDINGS LLC",
    });
    expect(painted.kind).toBe("absence");
    if (painted.kind !== "absence") throw new Error("unreachable");
    expect(painted.reason).toBe(OWNER_STUDIO_UPGRADE_CUE);
    expect(JSON.stringify(painted)).not.toMatch(/GEAUXNU/);
  });

  it("Studio fixture with ownerFact.ownerName may render it", () => {
    const painted = resolveOwnerPaint({
      ownerFact: LEAKY,
      subscriptionTier: "studio",
      cadOwnerName: "BAKE CAD OWNER",
    });
    expect(painted).toEqual({ kind: "name", display: "GEAUXNU HOLDINGS LLC" });
    expect(JSON.stringify(painted)).not.toMatch(/BAKE CAD OWNER/);
  });

  it("studio without ownerName is honest absence — never the CAD name", () => {
    const painted = resolveOwnerPaint({
      ownerFact: { state: "present", source: "owner-fact" },
      subscriptionTier: "studio",
      cadOwnerName: "BAKE CAD OWNER",
    });
    expect(painted.kind).toBe("absence");
    expect(JSON.stringify(painted)).not.toMatch(/BAKE CAD OWNER/);
  });
});

describe("gateOwnerPresentation", () => {
  it("strips a present name on Solo", () => {
    const gated = gateOwnerPresentation(
      { state: "present", value: "GEAUXNU HOLDINGS LLC" },
      "solo",
    );
    expect(gated).toEqual({
      state: "absent-covered",
      reason: OWNER_STUDIO_UPGRADE_CUE,
      provenance: null,
    });
    expect(JSON.stringify(gated)).not.toMatch(/GEAUXNU/);
  });

  it("passes a present name on Studio", () => {
    const gated = gateOwnerPresentation(
      { state: "present", value: "GEAUXNU HOLDINGS LLC" },
      "studio",
    );
    expect(gated).toEqual({ state: "present", value: "GEAUXNU HOLDINGS LLC" });
  });
});
