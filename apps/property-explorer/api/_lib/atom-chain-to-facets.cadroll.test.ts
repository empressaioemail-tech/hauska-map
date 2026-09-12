import { describe, expect, it } from "vitest";

import { mergeBakedBaseFacts, type PeBakedFacetsResponse } from "./atom-chain-to-facets";

function atomResponse(): PeBakedFacetsResponse {
  return {
    parcelNodeId: "48021:34049",
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: null,
    readPath: "atom-chain",
    facets: {
      parcelNodeId: "48021:34049",
      countyFips: "48021",
      baseFacts: { apn: "34049" },
      zoning: { district: "RR" },
      envelope: null,
      facetCoverage: { baseFacts: true, landUse: false, acreage: false, zoning: true, envelope: false },
      provenance: { parcelSource: "property-atom-chain" },
    },
  };
}

/**
 * P152-PANEL fix (dispatch item 3): cortex gates the four cadRoll dollar
 * rails to Studio/Team/Property-Unlock and emits
 * `{state:"refused", code:"studio-gated"}` per field to everyone else
 * (legacy-design-tools `cadRollValue.ts`). Before this fix,
 * `isCadRollValueWire` rejected that shape, so `cadRollField` silently
 * dropped it to `null` and the whole `cadRoll` object collapsed to `null` —
 * indistinguishable from "no CAD data exists at all". The client's
 * `taxValuationFromCadRoll` already has a `kind === "refused"` branch
 * (`fact-sheet-resolver.ts`) that renders the correct upgrade cue; it was
 * simply unreachable through this BFF.
 */
describe("mergeBakedBaseFacts — cadRoll refusal passthrough (P152-PANEL)", () => {
  it("passes a studio-gated refusal through on all four dollar fields instead of collapsing cadRoll to null", () => {
    const refusal = { state: "refused" as const, code: "studio-gated" as const, reason: "Studio or Team only." };
    const bakedBody = {
      facets: {
        baseFacts: {
          cadRoll: { marketValue: refusal, assessedValue: refusal, landValue: refusal, improvementValue: refusal },
        },
      },
    };

    const merged = mergeBakedBaseFacts(atomResponse(), bakedBody);

    expect(merged.facets.baseFacts?.cadRoll).toEqual({
      marketValue: refusal,
      assessedValue: refusal,
      landValue: refusal,
      improvementValue: refusal,
    });
  });

  it("still carries a real present dollar value through unchanged (regression guard)", () => {
    const present = { state: "present" as const, v: 404630, source: "cad_property", vintage: "2026-01-01" };
    const bakedBody = {
      facets: { baseFacts: { cadRoll: { marketValue: present, assessedValue: present, landValue: null, improvementValue: null } } },
    };

    const merged = mergeBakedBaseFacts(atomResponse(), bakedBody);

    expect(merged.facets.baseFacts?.cadRoll?.marketValue).toEqual(present);
  });

  it("still carries a real stored zero through unchanged, never conflated with absent (regression guard)", () => {
    const zero = { state: "zero" as const, v: 0 as const, source: "cad_property", vintage: "2026-01-01" };
    const bakedBody = {
      facets: { baseFacts: { cadRoll: { marketValue: zero, assessedValue: null, landValue: null, improvementValue: null } } },
    };

    const merged = mergeBakedBaseFacts(atomResponse(), bakedBody);

    expect(merged.facets.baseFacts?.cadRoll?.marketValue).toEqual(zero);
  });

  it("still collapses a genuinely malformed field to null (never invents a shape)", () => {
    const bakedBody = {
      facets: { baseFacts: { cadRoll: { marketValue: { state: "not-a-real-state" }, assessedValue: null, landValue: null, improvementValue: null } } },
    };

    const merged = mergeBakedBaseFacts(atomResponse(), bakedBody);

    expect(merged.facets.baseFacts?.cadRoll).toBeNull();
  });
});
