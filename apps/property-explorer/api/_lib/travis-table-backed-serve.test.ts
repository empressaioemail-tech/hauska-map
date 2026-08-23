/**
 * Travis/Central TX table-backed serve — SS-W5 audit follow-on (PE port).
 *
 * Serve-rate expectation: zoned Travis parcels with GIS stamp + codified table
 * row should surface setback scalars even when depth-warm geometry verify
 * declined (~97% of zoned cohort); only depth-warm-promoted geometry is ~3%.
 */
import { describe, expect, it } from "vitest";

import { adaptAtomChainToBakedFacets } from "./atom-chain-to-facets";

describe("adaptAtomChainToBakedFacets — Travis table-backed setbacks", () => {
  it("serves Austin SF-3 setbacks when envelope is warm-verify-decline without setback atom", () => {
    const out = adaptAtomChainToBakedFacets({
      parcelNodeId: "48453:280239",
      zoningFact: {
        district: "SF-3",
        sourceAdapter: "txgio-zoning-stamp:austin-tx",
      },
      setbackRule: null,
      buildableEnvelope: {
        sourceCitation: "depth-warm-verify-decline",
        warmVerifyDeclineCode: "front-orientation",
        warmVerifyDecline: "front edge index 2 != fresh 0",
        outcome: {
          kind: "no-buildable-area",
          reason: "front edge index 2 != fresh 0",
        },
      },
    });
    expect(out?.facets.envelope?.status).toBe("ok");
    expect(out?.facets.envelope?.setbacks).toMatchObject({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
    });
    expect(out?.facets.envelope?.declineReason).toBeUndefined();
    expect(out?.facets.facetCoverage?.envelope).toBe(true);
  });

  it("serves Pflugerville SF-S setbacks on warm-verify-decline envelope", () => {
    const out = adaptAtomChainToBakedFacets({
      parcelNodeId: "48453:907247",
      zoningFact: {
        district: "SF-S",
        sourceAdapter: "txgio-zoning-stamp:pflugerville-tx",
      },
      setbackRule: null,
      buildableEnvelope: {
        sourceCitation: "depth-warm-verify-decline",
        warmVerifyDeclineCode: "geometry",
        warmVerifyDecline: "inset ring is null",
        outcome: { kind: "no-buildable-area", reason: "inset ring is null" },
      },
    });
    expect(out?.facets.envelope?.status).toBe("ok");
    expect(out?.facets.envelope?.setbacks).toMatchObject({
      front_ft: 25,
      side_ft: 7.5,
      rear_ft: 20,
    });
  });

  it("still declines when no district (cascade absence cohort)", () => {
    const out = adaptAtomChainToBakedFacets({
      parcelNodeId: "48453:100000",
      zoningFact: {
        absence: { kind: "no-zoning-stamp", reason: "no stamp" },
        sourceAdapter: "cortex-tier1-snapshot-breadth-bake",
      },
      buildableEnvelope: {
        sourceCitation: "depth-warm-verify-decline",
        warmVerifyDeclineCode: "unzoned-no-district-basis",
        warmVerifyDecline:
          "unzoned jurisdiction — no district basis for setbacks or envelope",
        outcome: {
          kind: "no-buildable-area",
          reason: "unzoned jurisdiction",
        },
      },
    });
    expect(out?.facets.envelope?.status).toBe("declined");
    expect(out?.facets.envelope?.setbacks).toBeUndefined();
  });
});
