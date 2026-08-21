import { describe, it, expect } from "vitest";
import {
  isRetrievalAuthFailure,
  stripCortexEnvelopeProductTruth,
} from "../../api/_lib/pe-property-atoms";

describe("isRetrievalAuthFailure", () => {
  it("detects atom-chain HTTP 401 as auth/config failure", () => {
    expect(isRetrievalAuthFailure("atom-chain HTTP 401")).toBe(true);
    expect(isRetrievalAuthFailure("atom-chain HTTP 503")).toBe(false);
  });
});

describe("stripCortexEnvelopeProductTruth (anti-zombie)", () => {
  it("nulls cortex envelope product truth and sets atom_path_pending", () => {
    const stripped = stripCortexEnvelopeProductTruth({
      parcelNodeId: "48055:10068",
      facets: {
        baseFacts: { landUse: { code: "A1" } },
        zoning: null,
        envelope: { status: "ok", confidence: 0.315, district: "AG" },
        facetCoverage: { landUse: true, envelope: true },
      },
      tier2: {
        flood: { status: "outside-sfha" },
        envelope: { status: "ok", edgeSignal: "road" },
      },
    }) as {
      facets: { envelope: { declineReason: string }; facetCoverage: { envelope: boolean } };
      tier2: { envelope: null; flood: { status: string } };
      cortexEnvelopeRetired: boolean;
    };

    expect(stripped.facets.envelope.declineReason).toBe("atom_path_pending");
    expect(stripped.facets.facetCoverage.envelope).toBe(false);
    expect(stripped.tier2.envelope).toBeNull();
    expect(stripped.tier2.flood.status).toBe("outside-sfha");
    expect(stripped.cortexEnvelopeRetired).toBe(true);
  });

  it("preserves cortex-root floodHazardFact and does not invent one from tier2.flood", () => {
    const goldFact = {
      state: "present",
      source: "flood-hazard-fact",
      floodZone: "X",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      floodHazardFact: goldFact,
      tier2: { flood: { status: "in-sfha", floodZone: "AE" }, envelope: { status: "ok" } },
    }) as {
      floodHazardFact: { floodZone: string };
      tier2: { flood: { floodZone: string }; envelope: null };
    };
    expect(withRoot.floodHazardFact.floodZone).toBe("X");
    expect(withRoot.tier2.flood.floodZone).toBe("AE");

    const noRoot = stripCortexEnvelopeProductTruth({
      tier2: { flood: { status: "outside-sfha" }, envelope: { status: "ok" } },
    }) as Record<string, unknown>;
    expect("floodHazardFact" in noRoot).toBe(false);
  });
});
