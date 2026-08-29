import { describe, expect, it } from "vitest";
import {
  enrichLayerAbsenceWireFromRegistry,
  isLayerAbsenceWire,
  isSilentEmptyStructuralLayer,
  layerWireToCardFacet,
} from "./layer-absence";

describe("layer-absence", () => {
  const lookupFailed = {
    status: "absent" as const,
    verdict: "lookup-failed" as const,
    authority: "tad",
    scopeSearched: "cad_property",
    asOf: "2026-08-22T00:00:00.000Z",
    basis: "CAMA not loaded",
  };

  it("isLayerAbsenceWire accepts doc 19 required fields", () => {
    expect(isLayerAbsenceWire(lookupFailed)).toBe(true);
    expect(isLayerAbsenceWire({ ...lookupFailed, verdict: "bogus" })).toBe(false);
  });

  it("isLayerAbsenceWire accepts stamp-missing and unmeasured; still rejects bogus", () => {
    const stampMissing = { ...lookupFailed, verdict: "stamp-missing" };
    const unmeasured = { ...lookupFailed, verdict: "unmeasured" };
    expect(isLayerAbsenceWire(stampMissing)).toBe(true);
    expect(isLayerAbsenceWire(unmeasured)).toBe(true);
    expect(isLayerAbsenceWire({ ...lookupFailed, verdict: "bogus" })).toBe(false);
  });

  it("layerWireToCardFacet maps absence to verdict label + provenance", () => {
    const facet = layerWireToCardFacet(lookupFailed, () => null);
    expect(facet.state).toBe("absent");
    expect(facet.value).toBe("lookup-failed");
    expect(facet.layerAbsence?.basis).toBe("CAMA not loaded");
  });

  it("enrichLayerAbsenceWireFromRegistry adds cad serveLayer from structural-fact", () => {
    const enriched = enrichLayerAbsenceWireFromRegistry(
      lookupFailed,
      "structural-fact",
    );
    expect(enriched).toMatchObject({
      provenanceClass: "Record",
      serveLayer: "cad",
      entityType: "cad-parcel-roll",
      chainAnchoring: "backfill",
    });
    const facet = layerWireToCardFacet(enriched, () => null, {
      factSource: "structural-fact",
    });
    expect(facet.layerAbsence?.serveLayer).toBe("cad");
  });

  it("isSilentEmptyStructuralLayer flags structural coverage without wire", () => {
    expect(
      isSilentEmptyStructuralLayer({ facetCoverage: { structural: true } }),
    ).toBe(true);
    expect(
      isSilentEmptyStructuralLayer({
        facetCoverage: { structural: true },
        livingAreaSqft: lookupFailed,
      }),
    ).toBe(false);
  });
});
