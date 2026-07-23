import { describe, it, expect } from "vitest";
import { stripCortexEnvelopeProductTruth } from "../../api/_lib/pe-property-atoms";

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
});
