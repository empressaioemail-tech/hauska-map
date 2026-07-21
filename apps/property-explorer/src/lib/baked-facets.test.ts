// Pure tests for the baked node-facet client's view-model derivation — the
// honest-absence contract the inspect card renders. No DOM, no network; the
// fetch path is exercised end-to-end by the app's build + manual verify.
//
// Run: `npx vitest run src/lib/baked-facets.test.ts` (a vitest harness is not
// wired into property-explorer CI today; this file documents + locks the
// deriver contract and runs green under any vitest that picks it up).

import { describe, it, expect } from "vitest";
import { deriveBakedCardModel, type BakedFacetPayload } from "./baked-facets";

const fullPayload: BakedFacetPayload = {
  parcelNodeId: "48055:10068",
  countyFips: "48055",
  countyName: "Caldwell",
  baseFacts: {
    apn: "10068",
    situsAddress: "1391 FM 1854 , DALE, TX",
    landUse: { code: "A1", description: "Single-family residential", source: "cad-roll" },
    acreage: { value: 0.2388 },
  },
  zoning: { district: "R-1" },
  envelope: {
    status: "ok",
    setbacks: { front_ft: 35, side_ft: 20, rear_ft: 30 },
    buildableAreaPct: 62.4,
    disclosure: "Approximate buildable area.",
  },
  facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
  provenance: { parcelSource: "txgio", landUseSource: "cad-roll", parcelVintage: "v25" },
  bakedAt: "2026-07-20T22:34:46.946Z",
};

describe("deriveBakedCardModel — present facets", () => {
  it("marks real content as present with rendered values", () => {
    const m = deriveBakedCardModel(fullPayload);
    expect(m.apn).toEqual({ state: "present", value: "10068" });
    expect(m.landUse).toEqual({ state: "present", value: "Single-family residential" });
    expect(m.zoning).toEqual({ state: "present", value: "R-1" });
    expect(m.acreage.state).toBe("present");
    expect(m.setbacks).toEqual({ state: "present", value: "F 35′ · S 20′ · R 30′" });
    expect(m.buildablePct).toEqual({ state: "present", value: "62%" });
    expect(m.envelopeApproximate).toBe(true);
    expect(m.provenance.landUseSource).toBe("cad-roll");
    expect(m.bakedAt).toBe("2026-07-20T22:34:46.946Z");
  });

  it("NEVER surfaces an owner (no owner field is read or emitted)", () => {
    const withOwner = {
      ...fullPayload,
      baseFacts: { ...fullPayload.baseFacts, owner_name: "SHOULD NOT LEAK" },
    } as BakedFacetPayload;
    const m = deriveBakedCardModel(withOwner);
    expect(JSON.stringify(m)).not.toMatch(/owner/i);
    expect(JSON.stringify(m)).not.toMatch(/SHOULD NOT LEAK/);
  });
});

describe("deriveBakedCardModel — honest absence", () => {
  it("Comal land-use null (coverage false) is ABSENT, not fabricated", () => {
    const comal: BakedFacetPayload = {
      parcelNodeId: "48091:99999",
      countyFips: "48091",
      countyName: "Comal",
      baseFacts: { apn: "99999", landUse: null, acreage: { value: 1 } },
      zoning: null,
      envelope: { status: "declined", declineReason: "no-setback-table" },
      facetCoverage: { baseFacts: true, landUse: false, acreage: true, zoning: false, envelope: false },
      provenance: { parcelSource: "txgio", landUseSource: null },
    };
    const m = deriveBakedCardModel(comal);
    // Absent, not a blank and not a fake value.
    expect(m.landUse.state).toBe("absent");
    expect(m.landUse.value).toBeNull();
    expect(m.zoning.state).toBe("absent");
    // A declined envelope is honest absence, and it must NOT read as approximate.
    expect(m.setbacks.state).toBe("absent");
    expect(m.buildablePct.state).toBe("absent");
    expect(m.envelopeApproximate).toBe(false);
    expect(m.envelopeDeclineReason).toBe("no-setback-table");
    // Facets that DO resolve stay present.
    expect(m.acreage.state).toBe("present");
    expect(m.apn.state).toBe("present");
  });

  it("gate-blocked land-use surfaces the reconciliation reason", () => {
    const blocked: BakedFacetPayload = {
      parcelNodeId: "48491:5",
      countyName: "Williamson",
      baseFacts: { apn: "5", landUse: null, acreage: { value: 2 } },
      zoning: null,
      envelope: { status: "ok", setbacks: { front_ft: 25, side_ft: 10, rear_ft: 20 }, buildableAreaPct: 40 },
      facetCoverage: { baseFacts: true, landUse: false, acreage: true, zoning: false, envelope: true },
      provenance: { parcelSource: "txgio", landUseSource: null, landUseGateBlocked: true },
    };
    const m = deriveBakedCardModel(blocked);
    expect(m.landUse.state).toBe("absent");
    expect(m.provenance.landUseGateBlocked).toBe(true);
    // Envelope present -> approximate treatment still applies.
    expect(m.envelopeApproximate).toBe(true);
    expect(m.setbacks.state).toBe("present");
  });

  it("no-buildable-area envelope keeps setbacks present (honest empty, still Tier-1)", () => {
    const empty: BakedFacetPayload = {
      parcelNodeId: "48453:7",
      countyName: "Travis",
      baseFacts: { apn: "7", landUse: { code: "B", description: "Commercial" }, acreage: { value: 0.1 } },
      zoning: { district: "C-1" },
      envelope: { status: "no-buildable-area", setbacks: { front_ft: 50, side_ft: 25, rear_ft: 25 } },
      facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
    };
    const m = deriveBakedCardModel(empty);
    expect(m.setbacks.state).toBe("present");
    expect(m.envelopeApproximate).toBe(true);
  });
});
