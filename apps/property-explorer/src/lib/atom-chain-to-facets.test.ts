// Unit tests: atom-chain → PE facets adapter + PROPERTY_ATOM_PATH flag gate.
// Run: `pnpm --filter property-explorer test`

import { describe, it, expect } from "vitest";
import {
  adaptAtomChainToBakedFacets,
  atomChainIsUsable,
  isPropertyAtomPathEnabled,
  isDepthWarmPromoted,
  hasLiveAtomChainSetbackRule,
  attachBuildablePctFromKnownLotArea,
  mergeBakedBaseFacts,
  parsePropertyAtomsPath,
  shouldSkipColdDerive,
  BASTROP_LIVE_SETBACK_ADAPTER,
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

  it("adaptAtomChainToBakedFacets serves atom-chain-warm readPath; withholds depth-warm geojson", () => {
    const resp = adaptAtomChainToBakedFacets(bastropWarm714Chain);
    expect(resp).not.toBeNull();
    expect(resp!.readPath).toBe("atom-chain-warm");
    expect(resp!.facets.envelope?.status).toBe("ok");
    expect(resp!.facets.envelope?.geojson).toBeUndefined();
    expect(resp!.facets.envelope?.disclosure).toMatch(/live derive/i);
    expect(
      (resp!.facets.provenance as { depthWarmPromoted?: boolean }).depthWarmPromoted,
    ).toBe(true);
  });

  it("live layer-23 setback on depth-warm parcel serves scalars only; geometry from live derive", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:34177",
      zoningFact: {
        district: "MU",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
        extractedAt: "2026-07-25T22:00:00.000Z",
      },
      setbackRule: {
        front: 15,
        side: 5,
        rear: 15,
        districtCode: "MU",
        sourceAdapter: BASTROP_LIVE_SETBACK_ADAPTER,
      },
      buildableEnvelope: {
        outcome: { kind: "buildable", areaSqFt: 12000 },
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
    expect(hasLiveAtomChainSetbackRule(
      chain.parcelNodeId!,
      chain.setbackRule,
      chain.zoningFact?.sourceAdapter,
    )).toBe(true);
    expect(shouldSkipColdDerive(chain)).toBe(false);
    const resp = adaptAtomChainToBakedFacets(chain);
    expect(resp!.facets.envelope?.setbacks).toEqual({
      front_ft: 15,
      side_ft: 5,
      rear_ft: 15,
    });
    expect(resp!.facets.envelope?.geojson).toBeUndefined();
    expect(resp!.facets.envelope?.buildableAreaSqFt).toBe(12000);
    expect(resp!.facets.envelope?.disclosure).toMatch(/live derive/i);
  });

  it("gold 48021:34137 depth-warm + layer-23 serves scalars; geometry from live derive", () => {
    const chain: PropertyAtomChain = {
      parcelNodeId: "48021:34137",
      zoningFact: {
        district: "SF-1",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
        extractedAt: "2026-07-25T22:00:00.000Z",
      },
      setbackRule: {
        front: 25,
        side: 5,
        rear: 10,
        districtCode: "SF-1",
        sourceAdapter: BASTROP_LIVE_SETBACK_ADAPTER,
      },
      buildableEnvelope: {
        outcome: { kind: "buildable", areaSqFt: 6325 },
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
                    [-97.32, 30.11],
                    [-97.319, 30.11],
                    [-97.319, 30.109],
                    [-97.32, 30.109],
                    [-97.32, 30.11],
                  ],
                ],
              },
            },
          ],
        },
        extractedAt: "2026-07-25T22:00:00.000Z",
      },
      atoms: [{}, {}, {}],
    };
    const resp = adaptAtomChainToBakedFacets(chain);
    expect(resp!.facets.envelope?.setbacks).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
    });
    expect(resp!.facets.envelope?.geojson).toBeUndefined();
    expect(resp!.facets.envelope?.buildableAreaSqFt).toBe(6325);
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

describe("attachBuildablePctFromKnownLotArea — C4 (F-06)", () => {
  it("writes root and summary pct when sqft and lot area are both known (gold 48021:34137)", () => {
    const adapted = adaptAtomChainToBakedFacets({
      ...haysChain,
      parcelNodeId: "48021:34137",
      buildableEnvelope: {
        outcome: { kind: "buildable", areaSqFt: 9350 },
        extractedAt: "2026-07-31T15:13:47.773Z",
      },
    })!;
    expect(adapted.facets.envelope?.buildableAreaSqFt).toBe(9350);
    expect(adapted.facets.envelope?.buildableAreaPct).toBeUndefined();
    expect(adapted.facets.envelope?.summary).toBeUndefined();

    const merged = mergeBakedBaseFacts(adapted, {
      facets: {
        baseFacts: {
          acreage: { sqft: 16673, value: 0.3827, method: "shoelace-wgs84" },
        },
        facetCoverage: { acreage: true },
      },
    });
    const attached = attachBuildablePctFromKnownLotArea(merged);
    expect(attached.facets.envelope?.buildableAreaPct).toBe(56.1);
    expect(attached.facets.envelope?.summary).toEqual({
      buildableAreaPct: 56.1,
      buildableAreaSqFt: 9350,
      parcelAreaSqFt: 16673,
    });
  });

  it("leaves pct and summary absent when lot area is unknown — never a 0", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    expect(adapted.facets.envelope?.buildableAreaSqFt).toBe(5100);
    const attached = attachBuildablePctFromKnownLotArea(adapted);
    expect(attached.facets.envelope?.buildableAreaPct).toBeUndefined();
    expect(attached.facets.envelope?.summary).toBeUndefined();
    expect(attached).toBe(adapted);
  });

  it("keeps an atom-supplied percent and still writes the summary nest", () => {
    const adapted = adaptAtomChainToBakedFacets({
      ...haysChain,
      buildableEnvelope: {
        outcome: { kind: "buildable", areaSqFt: 9350, buildableAreaPct: 42 },
        extractedAt: "2026-07-31T15:13:47.773Z",
      },
    })!;
    const merged = mergeBakedBaseFacts(adapted, {
      facets: {
        baseFacts: {
          acreage: { sqft: 16673, value: 0.3827, method: "shoelace-wgs84" },
        },
      },
    });
    const attached = attachBuildablePctFromKnownLotArea(merged);
    expect(attached.facets.envelope?.buildableAreaPct).toBe(42);
    expect(attached.facets.envelope?.summary?.buildableAreaPct).toBe(42);
  });
});

const goldFloodHazardFact = {
  state: "present" as const,
  source: "flood-hazard-fact",
  floodZone: "X",
  inSpecialFloodHazardArea: false,
  zoneSubtype: null,
  baseFloodElevation: null,
  sourceAdapter: "fema-nfhl-bulk-v1",
  sourceVintage: "NFHL_48_20260101",
  evaluatedAt: "2026-08-11T23:13:43.774Z",
};

const retiredTier2Flood = {
  status: "in-sfha",
  floodZone: "AE",
  zoneSubtype: "FLOODWAY",
  baseFloodElevationFt: 512.4,
};

describe("mergeBakedBaseFacts — floodHazardFact from cortex JSON ROOT (WDLL 3)", () => {
  it("copies a fixture floodHazardFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      floodHazardFact: goldFloodHazardFact,
    });
    expect(merged.floodHazardFact).toEqual(goldFloodHazardFact);
    expect(merged.floodHazardFact?.floodZone).toBe("X");
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("does not copy tier2.flood — even a full in-SFHA snapshot stays off floodHazardFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      tier2: { flood: retiredTier2Flood },
    });
    expect("floodHazardFact" in merged).toBe(false);
    expect(merged.floodHazardFact).toBeUndefined();
    expect(JSON.stringify(merged)).not.toMatch(/FLOODWAY/);
    expect(JSON.stringify(merged)).not.toMatch(/"AE"/);
    expect(JSON.stringify(merged)).not.toMatch(/512\.4/);
  });

  it("missing field stays missing — never invents a zone", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("floodHazardFact" in merged).toBe(false);
  });

  it("early return (no facets) still attaches floodHazardFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      floodHazardFact: goldFloodHazardFact,
    });
    expect(merged.floodHazardFact).toEqual(goldFloodHazardFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("rejects a snapshot-shaped object parked on the root (no state present|absent|refused)", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      floodHazardFact: retiredTier2Flood,
    });
    expect("floodHazardFact" in merged).toBe(false);
  });
});

const goldLandUseFact = {
  state: "present" as const,
  source: "land-use-fact",
  landUseCode: "A1",
  landUseLabel: "Single-family residential",
  taxYear: 2025,
  entityId: "48021:34137:2025",
  sourceAdapter: "cad-property-land-use-v1",
  sourceVintage: "2025",
  evaluatedAt: "2026-08-21T00:00:00.000Z",
};

describe("mergeBakedBaseFacts — landUseFact from cortex JSON ROOT (WDLL 5 leftover)", () => {
  it("copies a fixture landUseFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      landUseFact: goldLandUseFact,
    });
    expect(merged.landUseFact).toEqual(goldLandUseFact);
    expect(merged.landUseFact?.landUseCode).toBe("A1");
    expect(merged.landUseFact?.source).toBe("land-use-fact");
    expect(merged.baseFactsMerged).toBe(true);
    // Cad-roll bake still copies onto baseFacts this pass (acreage/situs).
    expect(merged.facets.baseFacts?.landUse?.code).toBe("A1");
    expect(merged.facets.baseFacts?.acreage?.value).toBe(1.42);
  });

  it("does not copy cad-roll baseFacts.landUse onto landUseFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("landUseFact" in merged).toBe(false);
    expect(merged.landUseFact).toBeUndefined();
    expect(merged.facets.baseFacts?.landUse?.code).toBe("A1");
    expect(merged.facets.baseFacts?.landUse?.source).toBe("cad-roll");
    expect(JSON.stringify(merged.landUseFact ?? {})).not.toMatch(/cad-roll/);
  });

  it("does not adopt a cad-roll {code, description} object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      landUseFact: { code: "CADROLL", description: "not an atom" },
    });
    expect("landUseFact" in merged).toBe(false);
    expect(merged.facets.baseFacts?.landUse?.code).toBe("A1");
  });

  it("missing field stays missing — never invents a land-use code", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("landUseFact" in merged).toBe(false);
  });

  it("early return (no facets) still attaches landUseFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      landUseFact: goldLandUseFact,
    });
    expect(merged.landUseFact).toEqual(goldLandUseFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("root landUseFact wins over a different cad-roll bake on the same body", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          landUse: { code: "CADROLL", description: "baked only", source: "cad-roll" },
        },
      },
      landUseFact: goldLandUseFact,
    });
    expect(merged.landUseFact?.landUseCode).toBe("A1");
    expect(merged.landUseFact?.source).toBe("land-use-fact");
    expect(merged.facets.baseFacts?.landUse?.code).toBe("CADROLL");
  });
});

describe("mergeBakedBaseFacts — P-63 structuralFact and verdict facets", () => {
  it("copies structuralFact lookup-failed from cortex root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const structuralFact = {
      status: "absent" as const,
      verdict: "lookup-failed" as const,
      authority: "tad",
      scopeSearched: "cad_property tax_year=2026 tier=cad-export",
      asOf: "2026-08-22T00:00:00.000Z",
      basis: "bulk_primary=true; CAMA structural fields not loaded",
      source: "structural-fact",
    };
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      structuralFact,
    });
    expect(merged.structuralFact).toEqual(structuralFact);
    expect(merged.facets.livingAreaSqft).toMatchObject({
      status: "absent",
      verdict: "lookup-failed",
    });
    expect(merged.facets.facetCoverage?.structural).toBe(true);
  });

  it("copies CAD yearBuilt with source cad_property, never a listing year", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      structuralFact: {
        state: "present" as const,
        source: "cad_property",
        livingAreaSqft: 1850,
        yearBuilt: 2021,
      },
    });
    expect(merged.facets.yearBuilt).toEqual({
      status: "populated",
      value: 2021,
    });
    expect(merged.facets.yearBuiltSource).toBe("cad_property");
    expect(JSON.stringify(merged.facets)).not.toMatch(/listing/i);
  });
});

const colonyMudFact = {
  state: "present" as const,
  source: "special-district-fact",
  districtId: "3504125",
  districtType: "MUD",
  districtName: "The Colony MUD 1C",
  entityId: "48021:102817:sd:3504125",
  boundAs: "48021:102817:sd:3504125",
  evaluatedAt: "2026-08-12T21:33:03.719Z",
};

const goldOutsideFact = {
  state: "absent" as const,
  source: "special-district-fact",
  entityId: "48021:34137:sd:outside",
  boundAs: "48021:34137:sd:outside",
  absence: {
    kind: "outside-tceq-source-boundaries",
    reason: "parcel centroid is outside TCEQ source boundaries",
  },
};

const bakeDistrict = {
  districtType: "MUD",
  districtName: "BAKE MUD",
  source: "mud-pid",
};

describe("mergeBakedBaseFacts — specialDistrictFact from cortex JSON ROOT (P-48)", () => {
  it("copies a fixture specialDistrictFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      specialDistrictFact: colonyMudFact,
    });
    expect(merged.specialDistrictFact).toEqual(colonyMudFact);
    expect(merged.specialDistrictFact?.districtType).toBe("MUD");
    expect(merged.specialDistrictFact?.districtName).toBe("The Colony MUD 1C");
    expect(merged.specialDistrictFact?.source).toBe("special-district-fact");
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("does not copy bake onto specialDistrictFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        mudPid: bakeDistrict,
        specialDistrict: bakeDistrict,
      },
      mudPid: bakeDistrict,
    });
    expect("specialDistrictFact" in merged).toBe(false);
    expect(merged.specialDistrictFact).toBeUndefined();
    expect(JSON.stringify(merged.specialDistrictFact ?? {})).not.toMatch(/BAKE MUD/);
    expect(JSON.stringify(merged.specialDistrictFact ?? {})).not.toMatch(/mud-pid/);
  });

  it("does not adopt a bake {districtType, districtName} object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      specialDistrictFact: bakeDistrict,
    });
    expect("specialDistrictFact" in merged).toBe(false);
  });

  it("missing field stays missing — never invents a MUD", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("specialDistrictFact" in merged).toBe(false);
    expect(JSON.stringify(merged)).not.toMatch(/The Colony MUD 1C/);
  });

  it("early return (no facets) still attaches specialDistrictFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      specialDistrictFact: colonyMudFact,
    });
    expect(merged.specialDistrictFact).toEqual(colonyMudFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("gold-shaped absent fixture stays absent and does not invent a MUD", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      specialDistrictFact: goldOutsideFact,
    });
    expect(merged.specialDistrictFact?.state).toBe("absent");
    expect(merged.specialDistrictFact?.entityId).toBe("48021:34137:sd:outside");
    expect(merged.specialDistrictFact?.districtType).toBeUndefined();
    expect(merged.specialDistrictFact?.districtName).toBeUndefined();
    expect(JSON.stringify(merged.specialDistrictFact)).not.toMatch(/The Colony/);
  });
});

const goldPipelineOutsideFact = {
  state: "present" as const,
  source: "rrc-pipeline-fact",
  boundAs: "48021:34137",
  tried: ["48021:34137", "48021:34137.00000000"],
  entityId: "48021:34137",
  nearPipeline: false,
  bufferMeters: 152.4,
  nearestPipelineDistanceMeters: null,
  t4permit: null,
  p5Num: null,
  operatorName: null,
  systemName: null,
  commodity: null,
  sourceAdapter: "tx-rrc-pipeline-staged-v1",
  sourceVintage: "UNKNOWN",
  evaluatedAt: "2026-08-16T15:30:55.035Z",
};

const nearbyPipelineFact = {
  state: "present" as const,
  source: "rrc-pipeline-fact",
  boundAs: "48021:10048",
  tried: ["48021:10048", "48021:10048.00000000"],
  entityId: "48021:10048",
  nearPipeline: true,
  bufferMeters: 152.4,
  nearestPipelineDistanceMeters: 87.9,
  t4permit: "05781",
  p5Num: "252017",
  operatorName: "ENERGY TRANSFER COMPANY",
  systemName: "PRAIRIE LEA",
  commodity: "NATURAL GAS",
  sourceAdapter: "tx-rrc-pipeline-staged-v1",
  sourceVintage: "UNKNOWN",
  evaluatedAt: "2026-08-16T15:30:55.035Z",
};

const bakePipelineGis = {
  operatorName: "ENERGY TRANSFER COMPANY",
  t4permit: "05781",
  source: "texas-rrc",
};

describe("mergeBakedBaseFacts — pipelineFact from cortex JSON ROOT (P-49)", () => {
  it("copies a fixture pipelineFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      pipelineFact: nearbyPipelineFact,
    });
    expect(merged.pipelineFact).toEqual(nearbyPipelineFact);
    expect(merged.pipelineFact?.t4permit).toBe("05781");
    expect(merged.pipelineFact?.operatorName).toBe("ENERGY TRANSFER COMPANY");
    expect(merged.pipelineFact?.source).toBe("rrc-pipeline-fact");
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("does not copy bake / GIS onto pipelineFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        texasRrc: bakePipelineGis,
        pipeline: bakePipelineGis,
      },
      texasRrc: bakePipelineGis,
    });
    expect("pipelineFact" in merged).toBe(false);
    expect(merged.pipelineFact).toBeUndefined();
    expect(JSON.stringify(merged.pipelineFact ?? {})).not.toMatch(/ENERGY TRANSFER/);
    expect(JSON.stringify(merged.pipelineFact ?? {})).not.toMatch(/texas-rrc/);
  });

  it("does not adopt a bake / GIS object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      pipelineFact: bakePipelineGis,
    });
    expect("pipelineFact" in merged).toBe(false);
  });

  it("missing field stays missing — never invents ENERGY TRANSFER", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("pipelineFact" in merged).toBe(false);
    expect(JSON.stringify(merged)).not.toMatch(/ENERGY TRANSFER/);
  });

  it("early return (no facets) still attaches pipelineFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      pipelineFact: nearbyPipelineFact,
    });
    expect(merged.pipelineFact).toEqual(nearbyPipelineFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("gold-shaped present-outside fixture stays present-outside and does not invent ENERGY TRANSFER", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      pipelineFact: goldPipelineOutsideFact,
    });
    expect(merged.pipelineFact?.state).toBe("present");
    expect(merged.pipelineFact?.nearPipeline).toBe(false);
    expect(merged.pipelineFact?.t4permit).toBeNull();
    expect(merged.pipelineFact?.operatorName).toBeNull();
    expect(JSON.stringify(merged.pipelineFact)).not.toMatch(/ENERGY TRANSFER/);
    expect(JSON.stringify(merged.pipelineFact)).not.toMatch(/PRAIRIE LEA/);
  });
});

const goldWellAtomMissFact = {
  state: "refused" as const,
  code: "atom-miss",
  source: "well-fact",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason:
    "No well-fact atom for parcel prefix 48021:34137 or 48021:34137.00000000. Atom miss, not a well determination.",
};

const craneWellPresentFact = {
  state: "present" as const,
  source: "well-fact",
  entityId: "48103:100:42000001030000",
  parcelRelation: "on-parcel",
  apiNumber14: "42000001030000",
  wellStatus: "dry",
  operatorName: null,
};

const bakeWellGis = {
  apiNumber14: "42000001030000",
  wellStatus: "dry",
  source: "texas-rrc",
};

describe("mergeBakedBaseFacts — wellFact from cortex JSON ROOT (P-50)", () => {
  it("copies a fixture wellFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      wellFact: craneWellPresentFact,
    });
    expect(merged.wellFact).toEqual(craneWellPresentFact);
    expect(merged.wellFact?.apiNumber14).toBe("42000001030000");
    expect(merged.wellFact?.entityId).toBe("48103:100:42000001030000");
    expect(merged.wellFact?.wellStatus).toBe("dry");
    expect(merged.wellFact?.operatorName).toBeNull();
    expect(merged.wellFact?.source).toBe("well-fact");
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("does not copy bake / GIS onto wellFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        texasRrc: bakeWellGis,
        tx_rrc_well: bakeWellGis,
        well: bakeWellGis,
      },
      texasRrc: bakeWellGis,
      tx_rrc_well: bakeWellGis,
    });
    expect("wellFact" in merged).toBe(false);
    expect(merged.wellFact).toBeUndefined();
    expect(JSON.stringify(merged.wellFact ?? {})).not.toMatch(/42000001030000/);
    expect(JSON.stringify(merged.wellFact ?? {})).not.toMatch(/texas-rrc/);
    expect(JSON.stringify(merged.wellFact ?? {})).not.toMatch(/tx_rrc_well/);
  });

  it("does not adopt a bake / GIS object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      wellFact: bakeWellGis,
    });
    expect("wellFact" in merged).toBe(false);
  });

  it("missing field stays missing — never invents a well", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("wellFact" in merged).toBe(false);
    expect(JSON.stringify(merged)).not.toMatch(/42000001030000/);
  });

  it("early return (no facets) still attaches wellFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      wellFact: craneWellPresentFact,
    });
    expect(merged.wellFact).toEqual(craneWellPresentFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("gold-shaped atom-miss fixture stays atom-miss and does not invent a well or :none", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      wellFact: goldWellAtomMissFact,
    });
    expect(merged.wellFact?.state).toBe("refused");
    expect(merged.wellFact?.code).toBe("atom-miss");
    expect(merged.wellFact?.source).toBe("well-fact");
    expect(merged.wellFact?.apiNumber14).toBeUndefined();
    expect(JSON.stringify(merged.wellFact)).not.toMatch(/42000001030000/);
    expect(JSON.stringify(merged.wellFact)).not.toMatch(/:none/);
  });
});

const goldFootprintAtomMissFact = {
  state: "refused" as const,
  code: "atom-miss",
  source: "building-footprint",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason:
    "No building-footprint atom for parcel prefix 48021:34137 or 48021:34137.00000000. Atom miss, not a footprint determination.",
};

const andersonFootprintPresentFact = {
  state: "present" as const,
  source: "building-footprint",
  entityId: "48001:10136.00000000:footprint:primary",
  structureRole: "primary",
};

const bakeFootprintGis = {
  structureRole: "primary",
  entityId: "48001:10136.00000000:footprint:primary",
  source: "tx_building_footprint",
};

describe("mergeBakedBaseFacts — buildingFootprintFact from cortex JSON ROOT (P-51)", () => {
  it("copies a fixture buildingFootprintFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      buildingFootprintFact: andersonFootprintPresentFact,
    });
    expect(merged.buildingFootprintFact).toEqual(andersonFootprintPresentFact);
    expect(merged.buildingFootprintFact?.structureRole).toBe("primary");
    expect(merged.buildingFootprintFact?.entityId).toBe(
      "48001:10136.00000000:footprint:primary",
    );
    expect(merged.buildingFootprintFact?.source).toBe("building-footprint");
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("does not copy bake / GIS onto buildingFootprintFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        tx_building_footprint: bakeFootprintGis,
        footprint: bakeFootprintGis,
      },
      tx_building_footprint: bakeFootprintGis,
    });
    expect("buildingFootprintFact" in merged).toBe(false);
    expect(merged.buildingFootprintFact).toBeUndefined();
    expect(JSON.stringify(merged.buildingFootprintFact ?? {})).not.toMatch(
      /tx_building_footprint/,
    );
    expect(JSON.stringify(merged.buildingFootprintFact ?? {})).not.toMatch(
      /:primary/,
    );
  });

  it("does not adopt a bake / GIS object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      buildingFootprintFact: bakeFootprintGis,
    });
    expect("buildingFootprintFact" in merged).toBe(false);
  });

  it("missing field stays missing — never invents a footprint", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("buildingFootprintFact" in merged).toBe(false);
    expect(JSON.stringify(merged)).not.toMatch(/building-footprint/);
    expect(JSON.stringify(merged)).not.toMatch(/:footprint:primary/);
  });

  it("early return (no facets) still attaches buildingFootprintFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      buildingFootprintFact: andersonFootprintPresentFact,
    });
    expect(merged.buildingFootprintFact).toEqual(andersonFootprintPresentFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("gold-shaped atom-miss fixture stays atom-miss and does not invent a footprint or :primary", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      buildingFootprintFact: goldFootprintAtomMissFact,
    });
    expect(merged.buildingFootprintFact?.state).toBe("refused");
    expect(merged.buildingFootprintFact?.code).toBe("atom-miss");
    expect(merged.buildingFootprintFact?.source).toBe("building-footprint");
    expect(merged.buildingFootprintFact?.structureRole).toBeUndefined();
    expect(JSON.stringify(merged.buildingFootprintFact)).not.toMatch(/:primary/);
    expect(JSON.stringify(merged.buildingFootprintFact)).not.toMatch(
      /48001:10136/,
    );
  });

  it("role inversion: entity_id :footprint:primary with body.structureRole=accessory copies accessory", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const inverted = {
      state: "present" as const,
      source: "building-footprint",
      entityId: "48001:10136.00000000:footprint:primary",
      structureRole: "accessory",
    };
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      buildingFootprintFact: inverted,
    });
    expect(merged.buildingFootprintFact?.structureRole).toBe("accessory");
    expect(merged.buildingFootprintFact?.entityId).toMatch(/:footprint:primary$/);
  });

  it("role inversion: entity_id :footprint:accessory-1 with body.structureRole=primary copies primary", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const inverted = {
      state: "present" as const,
      source: "building-footprint",
      entityId: "48001:10136.00000000:footprint:accessory-1",
      structureRole: "primary",
    };
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      buildingFootprintFact: inverted,
    });
    expect(merged.buildingFootprintFact?.structureRole).toBe("primary");
    expect(merged.buildingFootprintFact?.entityId).toMatch(
      /:footprint:accessory-1$/,
    );
  });
});

const goldBoundaryPresentFact = {
  state: "present" as const,
  source: "property-boundary-edge",
  boundAs: "48021:34137:boundary:2",
  tried: ["48021:34137", "48021:34137.00000000"],
  entityId: "48021:34137:boundary:2",
  edgeIndex: 2,
  role: "front",
  adjacencyKind: "ROW",
  frontBasis: "situs-street-match",
  edges: [
    { entityId: "48021:34137:boundary:0", edgeIndex: 0, role: "rear" },
    { entityId: "48021:34137:boundary:1", edgeIndex: 1, role: "side" },
    { entityId: "48021:34137:boundary:2", edgeIndex: 2, role: "front" },
    { entityId: "48021:34137:boundary:3", edgeIndex: 3, role: "side_corner" },
  ],
  sourceAdapter: "descriptor-fixture",
  extractedAt: "2026-07-29T21:07:59.334Z",
};

const confirmatoryBoundaryPresentFact = {
  state: "present" as const,
  source: "property-boundary-edge",
  entityId: "48021:28286:boundary:2",
  role: "front",
  edges: [
    { entityId: "48021:28286:boundary:0", edgeIndex: 0, role: "rear" },
    { entityId: "48021:28286:boundary:1", edgeIndex: 1, role: "side" },
    { entityId: "48021:28286:boundary:2", edgeIndex: 2, role: "front" },
    { entityId: "48021:28286:boundary:3", edgeIndex: 3, role: "side_corner" },
  ],
};

const goldBoundaryAtomMissFact = {
  state: "refused" as const,
  code: "atom-miss",
  source: "property-boundary-edge",
  tried: ["48021:99999", "48021:99999.00000000"],
  reason:
    "No property-boundary-edge atom for parcel prefix 48021:99999 or 48021:99999.00000000. Atom miss, not a boundary determination.",
};

const bakeTxgioParcelRing = {
  source: "txgio_parcel",
  entityId: "48021:34137",
  ring: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
  parcelRing: true,
};

describe("mergeBakedBaseFacts — boundaryEdgeFact from cortex JSON ROOT (P-53)", () => {
  it("copies a fixture boundaryEdgeFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      boundaryEdgeFact: goldBoundaryPresentFact,
    });
    expect(merged.boundaryEdgeFact).toEqual(goldBoundaryPresentFact);
    expect(merged.boundaryEdgeFact?.role).toBe("front");
    expect(merged.boundaryEdgeFact?.entityId).toBe("48021:34137:boundary:2");
    expect(merged.boundaryEdgeFact?.source).toBe("property-boundary-edge");
    expect(
      Array.isArray(merged.boundaryEdgeFact?.edges) &&
        (merged.boundaryEdgeFact?.edges as unknown[]).length,
    ).toBe(4);
    expect(merged.baseFactsMerged).toBe(true);
  });

  it("copies confirmatory 48021:28286 present fixture role=front four edges", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      boundaryEdgeFact: confirmatoryBoundaryPresentFact,
    });
    expect(merged.boundaryEdgeFact?.role).toBe("front");
    expect(merged.boundaryEdgeFact?.entityId).toBe("48021:28286:boundary:2");
    expect(merged.boundaryEdgeFact?.source).toBe("property-boundary-edge");
    expect(
      Array.isArray(merged.boundaryEdgeFact?.edges) &&
        (merged.boundaryEdgeFact?.edges as unknown[]).length,
    ).toBe(4);
  });

  it("does not copy bake / GIS / txgio_parcel onto boundaryEdgeFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        txgio_parcel: bakeTxgioParcelRing,
        parcelRing: bakeTxgioParcelRing,
      },
      txgio_parcel: bakeTxgioParcelRing,
    });
    expect("boundaryEdgeFact" in merged).toBe(false);
    expect(merged.boundaryEdgeFact).toBeUndefined();
    expect(JSON.stringify(merged.boundaryEdgeFact ?? {})).not.toMatch(
      /txgio_parcel/,
    );
    expect(JSON.stringify(merged.boundaryEdgeFact ?? {})).not.toMatch(
      /parcelRing/,
    );
  });

  it("does not adopt a bake / GIS / txgio_parcel object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      boundaryEdgeFact: bakeTxgioParcelRing,
    });
    expect("boundaryEdgeFact" in merged).toBe(false);
  });

  it("missing field stays missing — never invents an edge or GIS ring", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("boundaryEdgeFact" in merged).toBe(false);
    expect(JSON.stringify(merged)).not.toMatch(/property-boundary-edge/);
    expect(JSON.stringify(merged)).not.toMatch(/txgio_parcel/);
  });

  it("early return (no facets) still attaches boundaryEdgeFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      boundaryEdgeFact: goldBoundaryPresentFact,
    });
    expect(merged.boundaryEdgeFact).toEqual(goldBoundaryPresentFact);
    expect(merged.baseFactsMerged).toBeUndefined();
  });

  it("gold-shaped atom-miss fixture stays atom-miss and does not paint a GIS ring", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      boundaryEdgeFact: goldBoundaryAtomMissFact,
    });
    expect(merged.boundaryEdgeFact?.state).toBe("refused");
    expect(merged.boundaryEdgeFact?.code).toBe("atom-miss");
    expect(merged.boundaryEdgeFact?.source).toBe("property-boundary-edge");
    expect(merged.boundaryEdgeFact?.role).toBeUndefined();
    expect(JSON.stringify(merged.boundaryEdgeFact)).not.toMatch(/txgio_parcel/);
    expect(JSON.stringify(merged.boundaryEdgeFact)).not.toMatch(/parcelRing/);
  });

  it("last token is not role: entity_id :boundary:0 with body.role=front copies front", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const inverted = {
      state: "present" as const,
      source: "property-boundary-edge",
      entityId: "48021:34137:boundary:0",
      edgeIndex: 0,
      role: "front",
    };
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      boundaryEdgeFact: inverted,
    });
    expect(merged.boundaryEdgeFact?.role).toBe("front");
    expect(merged.boundaryEdgeFact?.entityId).toMatch(/:boundary:0$/);
  });
});

const goldOwnerPresentFact = {
  state: "present" as const,
  source: "owner-fact",
  entityId: "48021:34137:2025",
  taxYear: 2025,
  tried: ["48021:34137", "48021:34137.00000000"],
};

const goldOwnerAnonymousFact = {
  state: "refused" as const,
  code: "identified-session-required",
  source: "owner-fact",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason: "owner-fact is identified-session only. Anonymous GET has no owner body.",
};

const goldOwnerAtomMissFact = {
  state: "refused" as const,
  code: "atom-miss",
  source: "owner-fact",
  tried: ["48021:99999", "48021:99999.00000000"],
  reason:
    "No owner-fact atom for parcel prefix 48021:99999 or 48021:99999.00000000. Atom miss, not an owner determination.",
};

const bakeCadParcelRollOwner = {
  source: "cad-parcel-roll",
  ownerName: "BAKE CAD OWNER",
  mailing: "1 BAKE ST",
};

describe("mergeBakedBaseFacts — ownerFact from cortex JSON ROOT (P-54)", () => {
  it("copies a fixture ownerFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      ownerFact: goldOwnerPresentFact,
    });
    expect(merged.ownerFact).toEqual(goldOwnerPresentFact);
    expect(merged.ownerFact?.source).toBe("owner-fact");
    expect(merged.ownerFact?.entityId).toBe("48021:34137:2025");
    expect(merged.ownerFact?.taxYear).toBe(2025);
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/ownerName/);
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/mailing/);
  });

  it("does not copy bake / CAD-roll / GIS owner onto ownerFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      cadOwner: { ownerName: "BAKE CAD OWNER" },
      owner: { name: "GIS OWNER" },
    });
    expect("ownerFact" in merged).toBe(false);
    expect(merged.ownerFact).toBeUndefined();
    expect(JSON.stringify(merged.ownerFact ?? {})).not.toMatch(/BAKE CAD OWNER/);
    expect(JSON.stringify(merged.ownerFact ?? {})).not.toMatch(/GIS OWNER/);
  });

  it("does not adopt a bake / cad-parcel-roll / GIS owner object parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      ownerFact: bakeCadParcelRollOwner,
    });
    expect("ownerFact" in merged).toBe(false);
  });

  it("leaves ownerFact absent when cortex has no root field", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("ownerFact" in merged).toBe(false);
  });

  it("early return (no facets) still attaches ownerFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ownerFact: goldOwnerPresentFact,
    });
    expect(merged.ownerFact).toEqual(goldOwnerPresentFact);
  });

  it("anonymous identified-session-required fixture has no ownerName", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      ownerFact: goldOwnerAnonymousFact,
    });
    expect(merged.ownerFact?.state).toBe("refused");
    expect(merged.ownerFact?.code).toBe("identified-session-required");
    expect(merged.ownerFact?.source).toBe("owner-fact");
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/ownerName/);
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/mailing/);
  });

  it("gold-shaped atom-miss fixture stays atom-miss and does not paint a CAD-roll name", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      ownerFact: goldOwnerAtomMissFact,
    });
    expect(merged.ownerFact?.state).toBe("refused");
    expect(merged.ownerFact?.code).toBe("atom-miss");
    expect(merged.ownerFact?.source).toBe("owner-fact");
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/BAKE CAD OWNER/);
    expect(JSON.stringify(merged.ownerFact)).not.toMatch(/cad-parcel-roll/);
  });
});

const goldCityLimitsIncorporated = {
  status: "incorporated" as const,
  etjStatus: "unresolved" as const,
  source: "tx_city_boundary" as const,
  basis: "point-in-polygon against tx_city_boundary",
  cityName: "Bastrop",
  geoId: "4805820",
  gnis: null,
};

const goldCityLimitsUnincorporated = {
  status: "unincorporated" as const,
  etjStatus: "unresolved" as const,
  source: "tx_city_boundary" as const,
  basis: "point outside incorporated index",
};

describe("mergeBakedBaseFacts — situs sentinel bind (P-74)", () => {
  const SIMSBROOK_TXGIO = "17005 SIMSBROOK DR, Pflugerville, TX, 78660";
  const GOLD_SITUS = "908 PINE , BASTROP, TX 78602";

  it("Travis sentinel baked situs falls through to cortex-root txgio_parcel.situs_address", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          situsAddress: ", TX",
        },
      },
      txgioParcelSitusAddress: SIMSBROOK_TXGIO,
    });
    expect(merged.facets.baseFacts?.situsAddress).toBe(SIMSBROOK_TXGIO);
    expect(merged.facets.baseFacts?.situsAddress).not.toMatch(/^,\s*TX/i);
  });

  it("gold 48021:34137 keeps baked 908 PINE when the bake situs is usable", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          situsAddress: GOLD_SITUS,
        },
      },
      txgioParcelSitusAddress: "999 OTHER ST, BASTROP, TX 78602",
    });
    expect(merged.facets.baseFacts?.situsAddress).toBe(GOLD_SITUS);
    expect(merged.facets.baseFacts?.situsAddress).toContain("908 PINE");
  });

  it("does not copy Find / Photon navigation strings parked on the root", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          situsAddress: ", TX",
        },
      },
      navigationAddress: "17005 Simsbrook Dr, Pflugerville, TX",
    });
    expect(merged.facets.baseFacts?.situsAddress).toBeNull();
  });

  it("sentinel with no txgio root leaves situs null", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          situsAddress: ", TX 78660",
        },
      },
    });
    expect(merged.facets.baseFacts?.situsAddress).toBeNull();
  });
});

describe("mergeBakedBaseFacts — cityLimitsFact from cortex JSON ROOT (P-76)", () => {
  it("copies a fixture cityLimitsFact from the cortex root onto the atom-chain payload", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      cityLimitsFact: goldCityLimitsIncorporated,
    });
    expect(merged.cityLimitsFact).toEqual(goldCityLimitsIncorporated);
    expect(merged.cityLimitsFact?.source).toBe("tx_city_boundary");
    expect(merged.cityLimitsFact?.cityName).toBe("Bastrop");
    expect(JSON.stringify(merged.cityLimitsFact)).not.toMatch(/situsCity/);
  });

  it("does not copy situsCity / bake city onto cityLimitsFact", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      ...bakedCortexBody,
      facets: {
        ...bakedCortexBody.facets,
        baseFacts: {
          ...bakedCortexBody.facets.baseFacts,
          situsCity: "Bastrop",
        },
      },
    });
    expect("cityLimitsFact" in merged).toBe(false);
    expect(merged.cityLimitsFact).toBeUndefined();
  });

  it("leaves cityLimitsFact absent when cortex has no root field", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, bakedCortexBody);
    expect("cityLimitsFact" in merged).toBe(false);
  });

  it("early return (no facets) still attaches cityLimitsFact when the root carries it", () => {
    const adapted = adaptAtomChainToBakedFacets(haysChain)!;
    const merged = mergeBakedBaseFacts(adapted, {
      cityLimitsFact: goldCityLimitsUnincorporated,
    });
    expect(merged.cityLimitsFact?.status).toBe("unincorporated");
    expect(merged.cityLimitsFact?.etjStatus).toBe("unresolved");
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
    expect(resp!.facets.envelope?.geojson).toBeUndefined();
  });
});
