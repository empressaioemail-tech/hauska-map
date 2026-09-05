import { describe, expect, it } from "vitest";
import {
  TAX_VALUATION_STUDIO_UPGRADE_CUE,
  gateTaxValuationPresentation,
  taxValuationPaintAllowed,
} from "./tax-valuation-paint";

describe("taxValuationPaintAllowed", () => {
  it("studio and team grant; free/solo/null refuse — same predicate as ownerPaintAllowed", () => {
    expect(taxValuationPaintAllowed("studio")).toBe(true);
    expect(taxValuationPaintAllowed("team")).toBe(true);
    expect(taxValuationPaintAllowed("solo")).toBe(false);
    expect(taxValuationPaintAllowed(null)).toBe(false);
  });
});

describe("gateTaxValuationPresentation", () => {
  it("strips a present CAD roll figure on Solo", () => {
    const gated = gateTaxValuationPresentation(
      { state: "present", value: "Market $397,260 · Land $80,000 · Improvement $317,260" },
      "solo",
    );
    expect(gated).toEqual({
      state: "absent-covered",
      reason: TAX_VALUATION_STUDIO_UPGRADE_CUE,
      provenance: null,
    });
    expect(JSON.stringify(gated)).not.toMatch(/397,260/);
  });

  it("strips a present CAD roll figure when subscriptionTier is null (Property Unlock / Free / anonymous)", () => {
    const gated = gateTaxValuationPresentation(
      { state: "present", value: "Market $397,260" },
      null,
    );
    expect(gated).toEqual({
      state: "absent-covered",
      reason: TAX_VALUATION_STUDIO_UPGRADE_CUE,
      provenance: null,
    });
  });

  it("passes a present CAD roll figure through on Studio", () => {
    const fact = {
      state: "present" as const,
      value: "Market $397,260 · Land $80,000 · Improvement $317,260",
    };
    const gated = gateTaxValuationPresentation(fact, "studio");
    expect(gated).toEqual(fact);
  });

  it("passes a present CAD roll figure through on Team", () => {
    const fact = { state: "present" as const, value: "Market $397,260" };
    const gated = gateTaxValuationPresentation(fact, "team");
    expect(gated).toEqual(fact);
  });

  it("the upgrade cue names tax-assessed value, never 'valuation' or 'worth' alone", () => {
    // Guards the operator's own distinction (A-103 item 5): this is a
    // sourced CAD-roll fact, not a market-value opinion, and the copy must
    // not blur that line.
    expect(TAX_VALUATION_STUDIO_UPGRADE_CUE).toMatch(/tax-assessed/i);
  });
});
