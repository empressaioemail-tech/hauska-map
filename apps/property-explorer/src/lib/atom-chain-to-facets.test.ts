// Unit tests: atom-chain → PE facets adapter + PROPERTY_ATOM_PATH flag gate.
// Run: `pnpm --filter property-explorer test`

import { describe, it, expect } from "vitest";
import {
  adaptAtomChainToBakedFacets,
  atomChainIsUsable,
  isPropertyAtomPathEnabled,
  isDepthWarmPromoted,
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
