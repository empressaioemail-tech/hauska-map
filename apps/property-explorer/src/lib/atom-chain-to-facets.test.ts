// Unit tests: atom-chain → PE facets adapter + PROPERTY_ATOM_PATH flag gate.
// Run: `pnpm --filter property-explorer test`

import { describe, it, expect } from "vitest";
import {
  adaptAtomChainToBakedFacets,
  atomChainIsUsable,
  isPropertyAtomPathEnabled,
  isDepthWarmPromoted,
  mergeBakedBaseFacts,
  parsePropertyAtomsPath,
  shouldSkipColdDerive,
  DEPTH_WARM_PROMOTION_MARKER,
  type PropertyAtomChain,
} from "../../api/_lib/atom-chain-to-facets";

/** Hays-shaped fixture (aligned to live Gate C proof atom-chain). */
const haysChain: PropertyAtomChain = {
  parcelNodeId: "48209:156346",
  zoningFact: {
    district: "RS",
    fetchedAt: "2026-07-23T20:00:00.000Z",
    extractedAt: "2026-07-23T20:00:00.000Z",
  },
  setbackRule: {
    front: 25,
    side: 5,
    rear: 10,
    sideCornerFt: 10,
    districtCode: "RS",
  },
  buildableEnvelope: {
    outcome: { kind: "buildable", areaSqFt: 5100 },
    // geojson intentionally absent on proof atoms
    extractedAt: "2026-07-23T20:00:00.000Z",
  },
  atoms: [{}, {}, {}],
};

/** Bexar honest-absence fixture (no district invent). */
const bexarChain: PropertyAtomChain = {
  parcelNodeId: "48029:410119",
  zoningFact: {
    absence: {
      kind: "no-zoning-stamp",
      reason:
        "no-zoning-polygon-covers-parcel — honest absence, decline inventing any fallback district",
    },
    fetchedAt: "2026-07-23T20:00:00.000Z",
  },
  setbackRule: null,
  buildableEnvelope: null,
  atoms: [{}],
};

describe("adaptAtomChainToBakedFacets — corner side split (105054 / AMENDMENT 4)", () => {
  it("maps sideInteriorFt + sideCornerFt to distinct facet fields", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:105054",
      zoningFact: { district: "SF-1" },
      setbackRule: {
        front: 25,
        side: 5,
        sideInteriorFt: 5,
        sideCornerFt: 15,
        rear: 25,
        districtCode: "SF-1",
      },
      buildableEnvelope: {
        outcome: { kind: "buildable", areaSqFt: 4200 },
        depthWarmPromotion: DEPTH_WARM_PROMOTION_MARKER,
      },
      atoms: [{}, {}, {}],
    };
    const resp = adaptAtomChainToBakedFacets(chain);
    expect(resp!.facets.envelope?.setbacks).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 25,
      side_interior_ft: 5,
      side_corner_ft: 15,
    });
  });
});

describe("adaptAtomChainToBakedFacets — Hays-shaped", () => {
  it("maps RS district + setbacks; does not fabricate geojson", () => {
    const resp = adaptAtomChainToBakedFacets(haysChain);
    expect(resp).not.toBeNull();
    expect(resp!.source).toBe("atom-chain");
    expect(resp!.readPath).toBe("atom-chain");
    expect(resp!.facets.zoning).toEqual({ district: "RS" });
    expect(resp!.facets.facetCoverage?.zoning).toBe(true);
    expect(resp!.facets.envelope?.status).toBe("ok");
    expect(resp!.facets.envelope?.setbacks).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
      side_interior_ft: 5,
      side_corner_ft: 10,
    });
    expect(resp!.facets.envelope?.district).toBe("RS");
    expect(resp!.facets.envelope?.buildableAreaSqFt).toBe(5100);
    expect(resp!.facets.envelope?.geojson).toBeUndefined();
    expect(resp!.facets.facetCoverage?.envelope).toBe(true);
    expect(resp!.facets.countyFips).toBe("48209");
  });
});

describe("adaptAtomChainToBakedFacets — Bexar honest absence", () => {
  it("maps no-zoning-stamp to declined envelope; never invents a district", () => {
    const resp = adaptAtomChainToBakedFacets(bexarChain);
    expect(resp).not.toBeNull();
    expect(resp!.facets.zoning).toBeNull();
    expect(resp!.facets.facetCoverage?.zoning).toBe(false);
    expect(resp!.facets.envelope?.status).toBe("declined");
    expect(resp!.facets.envelope?.declineReason).toBe("no-zoning-stamp");
    expect(resp!.facets.facetCoverage?.envelope).toBe(false);
    const wire = JSON.stringify(resp);
    expect(wire).not.toMatch(/"I-2"/);
    expect(wire).not.toMatch(/heavy industrial/i);
  });
});

describe("adaptAtomChainToBakedFacets — jurisdictionKey from zoning source adapter", () => {
  it("surfaces the stamped corpus jurisdiction key onto facets.zoning (chat citation retrieval seam)", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:105129",
      zoningFact: {
        district: "SF-1",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: { front: 25, side: 5, rear: 25, districtCode: "SF-1" },
      atoms: [{}, {}],
    };
    const resp = adaptAtomChainToBakedFacets(chain);
    expect(resp!.facets.zoning).toEqual({
      district: "SF-1",
      jurisdictionKey: "bastrop-city-tx",
    });
  });

  it("omits jurisdictionKey when the source adapter carries no jurisdiction suffix (honest absence)", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:200000",
      zoningFact: {
        district: "SF-1",
        sourceAdapter: "bastrop-per-parcel-record-layer-23",
      },
      setbackRule: null,
      atoms: [{}],
    };
    const resp = adaptAtomChainToBakedFacets(chain);
    // District still resolves; no fabricated jurisdiction key on a bare adapter.
    expect(resp!.facets.zoning).toEqual({ district: "SF-1" });
  });
});

describe("atomChainIsUsable", () => {
  it("rejects empty chain (triggers cortex fallback upstream)", () => {
    expect(atomChainIsUsable(null)).toBe(false);
    expect(atomChainIsUsable({ parcelNodeId: "x", atoms: [] })).toBe(false);
    expect(atomChainIsUsable(haysChain)).toBe(true);
    expect(atomChainIsUsable(bexarChain)).toBe(true);
  });
});

describe("PROPERTY_ATOM_PATH flag — cortex-only when off", () => {
  it("flag unset / 0 → disabled (BFF serves cortex-only)", () => {
    expect(isPropertyAtomPathEnabled({})).toBe(false);
    expect(isPropertyAtomPathEnabled({ PROPERTY_ATOM_PATH: "" })).toBe(false);
    expect(isPropertyAtomPathEnabled({ PROPERTY_ATOM_PATH: "0" })).toBe(false);
    expect(isPropertyAtomPathEnabled({ PROPERTY_ATOM_PATH: "false" })).toBe(false);
  });

  it("flag === 1 → enabled (BFF prefers atom-chain)", () => {
    expect(isPropertyAtomPathEnabled({ PROPERTY_ATOM_PATH: "1" })).toBe(true);
    expect(isPropertyAtomPathEnabled({ PROPERTY_ATOM_PATH: " 1 " })).toBe(true);
  });
});

describe("parsePropertyAtomsPath", () => {
  it("accepts property-atoms/:id/facets", () => {
    expect(parsePropertyAtomsPath(["property-atoms", "48209:156346", "facets"])).toEqual({
      parcelNodeId: "48209:156346",
    });
  });

  it("rejects traversal and wrong tails", () => {
    expect(parsePropertyAtomsPath(["property-atoms", "..", "facets"])).toBeNull();
    expect(parsePropertyAtomsPath(["property-atoms", "48209:156346"])).toBeNull();
    expect(parsePropertyAtomsPath(["property-atoms", "48209:156346", "atoms"])).toBeNull();
  });
});

/** Live-shaped P-3: breadth bake said consume-lot; B3 side/rear are not_specified. */
const bastropP3Chain: PropertyAtomChain = {
  parcelNodeId: "48021:141209",
  zoningFact: {
    district: "P-3",
    fetchedAt: "2026-07-24T01:04:06.641Z",
    extractedAt: "2026-07-24T01:04:06.641Z",
  },
  setbackRule: {
    front: 25,
    side: 0,
    rear: 0,
    sideCornerFt: 0,
    districtCode: "P-3",
  },
  buildableEnvelope: {
    outcome: { kind: "no-buildable-area", areaSqFt: 0 },
    extractedAt: "2026-07-24T01:04:06.641Z",
  },
  atoms: [{}, {}, {}],
};

describe("adaptAtomChainToBakedFacets — Bastrop P-3 not_specified", () => {
  it("does not claim setbacks consume the lot when side/rear are not_specified", () => {
    const resp = adaptAtomChainToBakedFacets(bastropP3Chain);
    expect(resp).not.toBeNull();
    expect(resp!.facets.envelope?.status).toBe("ok");
    expect(resp!.facets.envelope?.buildableAreaPct).toBeUndefined();
    expect(resp!.facets.envelope?.emptyReason).toBeUndefined();
    expect(resp!.facets.envelope?.setbacks?.not_specified).toEqual({
      side: true,
      rear: true,
      sideCorner: true,
    });
    expect(resp!.facets.envelope?.disclosure).toMatch(/build-to-line/i);
    const wire = JSON.stringify(resp);
    expect(wire).not.toMatch(/consume the lot/i);
  });
});

/** 714 Spring depth-warm promoted fixture (27c R3 WDLL 8). */
const bastropWarm714Chain: PropertyAtomChain = {
  parcelNodeId: "48021:33512",
  zoningFact: {
    district: "P-5",
    extractedAt: "2026-07-25T22:00:00.000Z",
  },
  setbackRule: {
    front: 15,
    side: 5,
    rear: 5,
    districtCode: "P-5",
  },
  buildableEnvelope: {
    outcome: { kind: "buildable", areaSqFt: 17051 },
    sourceCitation: "depth-warm-verified mechanical promote (27c R3 WDLL 6)",
    depthWarmPromotion: DEPTH_WARM_PROMOTION_MARKER,
    geojson: {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [] } }],
    },
    extractedAt: "2026-07-25T22:00:00.000Z",
  },
  atoms: [{}, {}, {}],
};

describe("depth-warm read path (WDLL 8)", () => {
  it("detects depth-warm promoted chain", () => {
    expect(isDepthWarmPromoted(bastropWarm714Chain)).toBe(true);
    expect(shouldSkipColdDerive(bastropWarm714Chain)).toBe(true);
    expect(isDepthWarmPromoted(haysChain)).toBe(false);
  });

  it("adaptAtomChainToBakedFacets serves atom-chain-warm readPath with geojson", () => {
    const resp = adaptAtomChainToBakedFacets(bastropWarm714Chain);
    expect(resp).not.toBeNull();
    expect(resp!.readPath).toBe("atom-chain-warm");
    expect(resp!.facets.envelope?.status).toBe("ok");
    expect(resp!.facets.envelope?.geojson).toBeDefined();
    expect(resp!.facets.envelope?.disclosure).toMatch(/no live re-derive/i);
    expect(
      (resp!.facets.provenance as { depthWarmPromoted?: boolean }).depthWarmPromoted,
    ).toBe(true);
  });
});

/** Live gold 34785: P-5 build-to-line silent side/rear + warm buildable area. */
const bastropGold34785Chain: PropertyAtomChain = {
  parcelNodeId: "48021:34785",
  zoningFact: {
    district: "P-5",
    extractedAt: "2026-07-23T11:58:59.441Z",
  },
  setbackRule: {
    front: 15,
    side: 0,
    rear: 0,
    sideCornerFt: 0,
    districtCode: "P-5",
  },
  buildableEnvelope: {
    outcome: { kind: "buildable", areaSqFt: 13641 },
    sourceCitation: "depth-warm-verified mechanical promote (27c R3 WDLL 6)",
    depthWarmPromotion: DEPTH_WARM_PROMOTION_MARKER,
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.3156, 30.1105],
                [-97.3156, 30.1101],
                [-97.3153, 30.1101],
                [-97.3156, 30.1105],
              ],
            ],
          },
          properties: { kind: "buildable-envelope" },
        },
      ],
    },
    extractedAt: "2026-07-26T17:43:49.044Z",
  },
  atoms: [{}, {}, {}],
};

/** Cortex baked-facets body shaped like the live facets endpoint response. */
const bakedCortexBody = {
  parcelNodeId: "48209:156346",
  adapterKey: "county-gis",
  source: "baked-snapshot",
  facets: {
    parcelNodeId: "48209:156346",
    countyFips: "48209",
    countyName: "Hays",
    baseFacts: {
      apn: "R156346",
      situsAddress: "123 Ranch Rd, San Marcos, TX",
      situsCity: "San Marcos",
      situsState: "TX",
      landUse: { code: "A1", description: "Single-family residential", source: "cad-roll", vintage: "2025" },
      acreage: { value: 1.42, sqft: 61855, method: "cad-roll" },
    },
    zoning: { district: "ZOMBIE-DISTRICT" }, // must NEVER be adopted
    envelope: { status: "ok", district: "ZOMBIE-DISTRICT", buildableAreaPct: 99 }, // must NEVER be adopted
    facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
    provenance: {
      parcelSource: "county-gis",
      parcelVintage: "2025-01",
      landUseSource: "cad-roll",
      landUseGateBlocked: false,
    },
  },
};

describe("mergeBakedBaseFacts — atom path + baked base facts (item 6)", () => {
  it("merges land-use, acreage, situs and county name onto the atom-chain read", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    // Pre-merge: the adapter hardcodes landUse/acreage coverage false, no values.
    expect(adapted.facets.facetCoverage?.landUse).toBe(false);
    expect(adapted.facets.facetCoverage?.acreage).toBe(false);
    expect(adapted.facets.baseFacts?.landUse).toBeNull();

    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect(merged.baseFactsMerged).toBe(true);
    expect(merged.facets.baseFacts?.landUse?.code).toBe("A1");
    expect(merged.facets.baseFacts?.acreage?.value).toBe(1.42);
    expect(merged.facets.baseFacts?.situsAddress).toBe("123 Ranch Rd, San Marcos, TX");
    expect(merged.facets.countyName).toBe("Hays");
    expect(merged.facets.facetCoverage?.landUse).toBe(true);
    expect(merged.facets.facetCoverage?.acreage).toBe(true);
    expect(merged.facets.provenance?.landUseSource).toBe("cad-roll");
    // APN from the atom node id wins; baked apn only fills a gap.
    expect(merged.facets.baseFacts?.apn).toBe("156346");
  });

  it("NEVER adopts cortex zoning or envelope — atom chain stays product truth", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect(merged.facets.zoning).toEqual({ district: "RS" });
    expect(merged.facets.envelope?.district).toBe("RS");
    expect(merged.facets.envelope?.buildableAreaPct).toBeUndefined();
    expect(merged.facets.facetCoverage?.zoning).toBe(true);
    expect(merged.facets.facetCoverage?.envelope).toBe(true);
    expect(JSON.stringify(merged)).not.toMatch(/ZOMBIE-DISTRICT/);
  });

  it("baked-absent stays honestly absent (no defaulting, coverage stays false)", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      facets: {
        countyName: "Comal",
        baseFacts: { apn: null, situsAddress: null, landUse: null, acreage: null },
        facetCoverage: { baseFacts: true, landUse: false, acreage: false },
      },
    });
    expect(merged.facets.baseFacts?.landUse).toBeNull();
    expect(merged.facets.baseFacts?.acreage).toBeNull();
    expect(merged.facets.facetCoverage?.landUse).toBe(false);
    expect(merged.facets.facetCoverage?.acreage).toBe(false);
    expect(merged.facets.countyName).toBe("Comal");
  });

  it("unusable baked body returns the atom response unchanged", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    expect(mergeBakedBaseFacts(adapted, null)).toBe(adapted);
    expect(mergeBakedBaseFacts(adapted, "oops")).toBe(adapted);
    expect(mergeBakedBaseFacts(adapted, {})).toBe(adapted);
  });
});

describe("adaptAtomChainToBakedFacets — warm verify honest decline (141364 / superseded-prop-id)", () => {
  it("surfaces named superseded-prop-id decline instead of setback-rule-pending", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:141364",
      zoningFact: {
        district: "MU",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
        extractedAt: "2026-07-30T02:29:02.155Z",
      },
      setbackRule: null,
      buildableEnvelope: {
        outcome: {
          kind: "no-buildable-area",
          reason: "prop_id 141364 absent from county cadastral — superseded",
        },
        warmVerifyDeclineCode: "superseded-prop-id",
        warmVerifyDecline:
          "prop_id 141364 absent from county cadastral — superseded; re-key manifest to successor parcel(s)",
        sourceCitation: "depth-warm-verify-decline",
        extractedAt: "2026-08-03T15:11:03.320Z",
      },
      atoms: [{}, {}],
    };
    const resp = adaptAtomChainToBakedFacets(chain);
    expect(resp).not.toBeNull();
    expect(resp!.snapshotAt).toBe("2026-08-03T15:11:03.320Z");
    expect(resp!.facets.envelope?.status).toBe("declined");
    expect(resp!.facets.envelope?.declineReason).toBe("superseded-prop-id");
    expect(resp!.facets.envelope?.disclosure).toMatch(/superseded/i);
    expect(resp!.facets.facetCoverage?.envelope).toBe(false);
    expect(JSON.stringify(resp)).not.toMatch(/setback-rule-pending/);
  });
});

describe("adaptAtomChainToBakedFacets — P-5 silent axes keep warm area (Track B3)", () => {
  it("publishes buildableAreaSqFt when outcome is buildable even if side/rear not_specified", () => {
    const resp = adaptAtomChainToBakedFacets(bastropGold34785Chain);
    expect(resp).not.toBeNull();
    expect(resp!.readPath).toBe("atom-chain-warm");
    expect(resp!.facets.envelope?.status).toBe("ok");
    expect(resp!.facets.envelope?.setbacks?.not_specified?.side).toBe(true);
    expect(resp!.facets.envelope?.setbacks?.not_specified?.rear).toBe(true);
    expect(resp!.facets.envelope?.buildableAreaPct).toBeUndefined();
    expect(resp!.facets.envelope?.buildableAreaSqFt).toBe(13641);
    expect(resp!.facets.envelope?.geojson).toBeDefined();
  });
});
