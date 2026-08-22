import { afterEach, describe, it, expect, vi } from "vitest";
import {
  fetchAtomChainWithAlias,
  cortexInspectAuthorization,
  fetchCortexFacetsWithAlias,
  handlePropertyAtomsFacets,
  isRetrievalAuthFailure,
  stripCortexEnvelopeProductTruth,
} from "../../api/_lib/pe-property-atoms";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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

  it("preserves cortex-root landUseFact and does not invent one from cad-roll baseFacts.landUse", () => {
    const goldFact = {
      state: "present",
      source: "land-use-fact",
      landUseCode: "A1",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      landUseFact: goldFact,
      facets: {
        baseFacts: { landUse: { code: "CADROLL", source: "cad-roll" } },
        envelope: { status: "ok" },
      },
    }) as {
      landUseFact: { landUseCode: string; source: string };
      facets: { baseFacts: { landUse: { code: string } } };
    };
    expect(withRoot.landUseFact.landUseCode).toBe("A1");
    expect(withRoot.landUseFact.source).toBe("land-use-fact");
    expect(withRoot.facets.baseFacts.landUse.code).toBe("CADROLL");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        baseFacts: { landUse: { code: "A1", source: "cad-roll" } },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("landUseFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root specialDistrictFact and does not invent one from bake / mud-pid", () => {
    const goldFact = {
      state: "present",
      source: "special-district-fact",
      districtType: "MUD",
      districtName: "The Colony MUD 1C",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      specialDistrictFact: goldFact,
      facets: {
        mudPid: { districtType: "MUD", districtName: "BAKE MUD" },
        envelope: { status: "ok" },
      },
    }) as {
      specialDistrictFact: { districtName: string; source: string };
      facets: { mudPid: { districtName: string } };
    };
    expect(withRoot.specialDistrictFact.districtName).toBe("The Colony MUD 1C");
    expect(withRoot.specialDistrictFact.source).toBe("special-district-fact");
    expect(withRoot.facets.mudPid.districtName).toBe("BAKE MUD");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        mudPid: { districtType: "MUD", districtName: "BAKE MUD" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("specialDistrictFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root pipelineFact and does not invent one from bake / texas-rrc GIS", () => {
    const goldFact = {
      state: "present",
      source: "rrc-pipeline-fact",
      nearPipeline: false,
      t4permit: null,
      operatorName: null,
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      pipelineFact: goldFact,
      facets: {
        texasRrc: { operatorName: "ENERGY TRANSFER COMPANY", source: "texas-rrc" },
        envelope: { status: "ok" },
      },
    }) as {
      pipelineFact: { source: string; nearPipeline: boolean };
      facets: { texasRrc: { operatorName: string } };
    };
    expect(withRoot.pipelineFact.source).toBe("rrc-pipeline-fact");
    expect(withRoot.pipelineFact.nearPipeline).toBe(false);
    expect(withRoot.facets.texasRrc.operatorName).toBe("ENERGY TRANSFER COMPANY");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        texasRrc: { operatorName: "ENERGY TRANSFER COMPANY", source: "texas-rrc" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("pipelineFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root wellFact and does not invent one from bake / texas-rrc GIS", () => {
    const goldFact = {
      state: "refused",
      code: "atom-miss",
      source: "well-fact",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      wellFact: goldFact,
      facets: {
        texasRrc: { apiNumber14: "42000001030000", source: "texas-rrc" },
        tx_rrc_well: { apiNumber14: "42000001030000" },
        envelope: { status: "ok" },
      },
    }) as {
      wellFact: { source: string; code: string; state: string };
      facets: { texasRrc: { apiNumber14: string } };
    };
    expect(withRoot.wellFact.source).toBe("well-fact");
    expect(withRoot.wellFact.code).toBe("atom-miss");
    expect(withRoot.wellFact.state).toBe("refused");
    expect(withRoot.facets.texasRrc.apiNumber14).toBe("42000001030000");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        texasRrc: { apiNumber14: "42000001030000", source: "texas-rrc" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("wellFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root buildingFootprintFact and does not invent one from bake / GIS", () => {
    const goldFact = {
      state: "refused",
      code: "atom-miss",
      source: "building-footprint",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      buildingFootprintFact: goldFact,
      facets: {
        tx_building_footprint: { structureRole: "primary" },
        envelope: { status: "ok" },
      },
    }) as {
      buildingFootprintFact: { source: string; code: string; state: string };
      facets: { tx_building_footprint: { structureRole: string } };
    };
    expect(withRoot.buildingFootprintFact.source).toBe("building-footprint");
    expect(withRoot.buildingFootprintFact.code).toBe("atom-miss");
    expect(withRoot.buildingFootprintFact.state).toBe("refused");
    expect(withRoot.facets.tx_building_footprint.structureRole).toBe("primary");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        tx_building_footprint: { structureRole: "primary" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("buildingFootprintFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root boundaryEdgeFact and does not invent one from bake / GIS / txgio_parcel", () => {
    const goldFact = {
      state: "present",
      source: "property-boundary-edge",
      entityId: "48021:34137:boundary:2",
      role: "front",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      boundaryEdgeFact: goldFact,
      facets: {
        txgio_parcel: { ring: [[0, 0]], source: "txgio_parcel" },
        envelope: { status: "ok" },
      },
    }) as {
      boundaryEdgeFact: {
        source: string;
        role: string;
        state: string;
        entityId: string;
      };
      facets: { txgio_parcel: { source: string } };
    };
    expect(withRoot.boundaryEdgeFact.source).toBe("property-boundary-edge");
    expect(withRoot.boundaryEdgeFact.role).toBe("front");
    expect(withRoot.boundaryEdgeFact.state).toBe("present");
    expect(withRoot.boundaryEdgeFact.entityId).toBe("48021:34137:boundary:2");
    expect(withRoot.facets.txgio_parcel.source).toBe("txgio_parcel");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        txgio_parcel: { ring: [[0, 0]], source: "txgio_parcel" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("boundaryEdgeFact" in noRoot).toBe(false);
  });

  it("preserves cortex-root ownerFact and does not invent one from bake / CAD-roll / GIS owner", () => {
    const goldFact = {
      state: "refused",
      code: "identified-session-required",
      source: "owner-fact",
    };
    const withRoot = stripCortexEnvelopeProductTruth({
      ownerFact: goldFact,
      facets: {
        cadOwner: { ownerName: "BAKE CAD OWNER", source: "cad-parcel-roll" },
        envelope: { status: "ok" },
      },
    }) as {
      ownerFact: { source: string; code: string; state: string };
      facets: { cadOwner: { ownerName: string } };
    };
    expect(withRoot.ownerFact.source).toBe("owner-fact");
    expect(withRoot.ownerFact.code).toBe("identified-session-required");
    expect(withRoot.ownerFact.state).toBe("refused");
    expect(JSON.stringify(withRoot.ownerFact)).not.toMatch(/ownerName/);
    expect(withRoot.facets.cadOwner.ownerName).toBe("BAKE CAD OWNER");

    const noRoot = stripCortexEnvelopeProductTruth({
      facets: {
        cadOwner: { ownerName: "BAKE CAD OWNER", source: "cad-parcel-roll" },
        envelope: { status: "ok" },
      },
    }) as Record<string, unknown>;
    expect("ownerFact" in noRoot).toBe(false);
  });
});

const PADDED = "48021:34137.00000000";
const INTEGER = "48021:34137";
const GOLD_CHAIN = {
  parcelNodeId: INTEGER,
  zoningFact: {
    district: "SF-1",
    sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
    extractedAt: "2026-08-21T00:00:00.000Z",
  },
  setbackRule: {
    front: 25,
    side: 5,
    rear: 25,
    sideCornerFt: 15,
    sourceAdapter: "bastrop-per-parcel-record-layer-23",
  },
  buildableEnvelope: {
    outcome: { kind: "buildable", areaSqFt: 9350 },
    geojson: { type: "FeatureCollection", features: [] },
    extractedAt: "2026-08-21T00:00:00.000Z",
    depthWarmPromotion: "depth-warm-promoted-v1",
  },
  atoms: [{}, {}, {}],
};
const GOLD_FLOOD = {
  state: "present",
  source: "flood-hazard-fact",
  floodZone: "X",
  inSpecialFloodHazardArea: false,
};
const GOLD_LAND_USE = {
  state: "present",
  source: "land-use-fact",
  landUseCode: "A1",
  landUseLabel: "Single-family residential",
  taxYear: 2025,
};
const COLONY_MUD = {
  state: "present",
  source: "special-district-fact",
  districtId: "3504125",
  districtType: "MUD",
  districtName: "The Colony MUD 1C",
  entityId: "48021:102817:sd:3504125",
};
const GOLD_PIPELINE_OUTSIDE = {
  state: "present",
  source: "rrc-pipeline-fact",
  entityId: "48021:34137",
  nearPipeline: false,
  t4permit: null,
  operatorName: null,
};
const GOLD_WELL_MISS = {
  state: "refused",
  code: "atom-miss",
  source: "well-fact",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason:
    "No well-fact atom for parcel prefix 48021:34137 or 48021:34137.00000000. Atom miss, not a well determination.",
};
const GOLD_FOOTPRINT_MISS = {
  state: "refused",
  code: "atom-miss",
  source: "building-footprint",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason:
    "No building-footprint atom for parcel prefix 48021:34137 or 48021:34137.00000000. Atom miss, not a footprint determination.",
};
const GOLD_BOUNDARY_PRESENT = {
  state: "present",
  source: "property-boundary-edge",
  entityId: "48021:34137:boundary:2",
  role: "front",
  edgeIndex: 2,
  edges: [
    { entityId: "48021:34137:boundary:0", edgeIndex: 0, role: "rear" },
    { entityId: "48021:34137:boundary:1", edgeIndex: 1, role: "side" },
    { entityId: "48021:34137:boundary:2", edgeIndex: 2, role: "front" },
    { entityId: "48021:34137:boundary:3", edgeIndex: 3, role: "side_corner" },
  ],
};
const GOLD_OWNER_ANON = {
  state: "refused",
  code: "identified-session-required",
  source: "owner-fact",
  tried: ["48021:34137", "48021:34137.00000000"],
  reason: "owner-fact is identified-session only. Anonymous GET has no owner body.",
};
const GOLD_OWNER_PRESENT = {
  state: "present",
  source: "owner-fact",
  entityId: "48021:34137:2025",
  taxYear: 2025,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchAtomChainWithAlias (WDLL 5)", () => {
  const prev = {
    url: process.env.HAUSKA_RETRIEVAL_API_URL,
    key: process.env.HAUSKA_RETRIEVAL_API_KEY,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prev.url === undefined) delete process.env.HAUSKA_RETRIEVAL_API_URL;
    else process.env.HAUSKA_RETRIEVAL_API_URL = prev.url;
    if (prev.key === undefined) delete process.env.HAUSKA_RETRIEVAL_API_KEY;
    else process.env.HAUSKA_RETRIEVAL_API_KEY = prev.key;
  });

  it("padded gold fixture atom-chain empty then alias integer returns usable zoning", async () => {
    process.env.HAUSKA_RETRIEVAL_API_URL = "https://retrieval.test";
    process.env.HAUSKA_RETRIEVAL_API_KEY = "rk";
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({ parcelNodeId: PADDED, atoms: [] });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse(GOLD_CHAIN);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await fetchAtomChainWithAlias(PADDED);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected usable alias chain");
    expect(result.chain.zoningFact?.district).toBe("SF-1");
    expect(seen.some((u) => u.includes(encodeURIComponent(PADDED)))).toBe(true);
    expect(seen.some((u) => u.includes(encodeURIComponent(INTEGER)))).toBe(true);
  });

  it("does not alias a refused suffix", async () => {
    process.env.HAUSKA_RETRIEVAL_API_URL = "https://retrieval.test";
    process.env.HAUSKA_RETRIEVAL_API_KEY = "rk";
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      return jsonResponse({ parcelNodeId: "48021:34137.1", atoms: [] });
    });
    const result = await fetchAtomChainWithAlias("48021:34137.1");
    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(1);
  });
});

describe("fetchCortexFacetsWithAlias floodHazardFact (WDLL 5)", () => {
  const prev = {
    url: process.env.CORTEX_API_URL,
    key: process.env.CORTEX_SERVICE_API_KEY,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prev.url === undefined) delete process.env.CORTEX_API_URL;
    else process.env.CORTEX_API_URL = prev.url;
    if (prev.key === undefined) delete process.env.CORTEX_SERVICE_API_KEY;
    else process.env.CORTEX_SERVICE_API_KEY = prev.key;
  });

  it("padded cortex missing floodHazardFact aliases integer root Zone X and does not copy tier2.flood", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          facets: {},
          tier2: { flood: { status: "in-sfha", floodZone: "AE", zoneSubtype: "FLOODWAY" } },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          tier2: { flood: null },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      floodHazardFact?: { floodZone?: string };
      tier2?: { flood?: unknown };
    };
    expect(body.floodHazardFact?.floodZone).toBe("X");
    expect(JSON.stringify(body.floodHazardFact)).not.toMatch(/FLOODWAY/);
    expect(JSON.stringify(body.floodHazardFact)).not.toMatch(/"AE"/);
  });

  it("padded cortex missing landUseFact aliases integer root even when floodHazardFact is already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          facets: {
            baseFacts: { landUse: { code: "CADROLL", source: "cad-roll" } },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          facets: {
            baseFacts: { landUse: { code: "CADROLL", source: "cad-roll" } },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      landUseFact?: { landUseCode?: string; source?: string };
      parcelNodeId?: string;
    };
    expect(body.landUseFact?.landUseCode).toBe("A1");
    expect(body.landUseFact?.source).toBe("land-use-fact");
    expect(JSON.stringify(body.landUseFact)).not.toMatch(/CADROLL/);
    expect(JSON.stringify(body.landUseFact)).not.toMatch(/cad-roll/);
  });

  it("padded cortex missing specialDistrictFact aliases integer root even when floodHazardFact and landUseFact are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          facets: {
            mudPid: { districtType: "MUD", districtName: "BAKE MUD" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          facets: {
            mudPid: { districtType: "MUD", districtName: "BAKE MUD" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      specialDistrictFact?: { districtName?: string; source?: string };
    };
    expect(body.specialDistrictFact?.districtName).toBe("The Colony MUD 1C");
    expect(body.specialDistrictFact?.source).toBe("special-district-fact");
    expect(JSON.stringify(body.specialDistrictFact)).not.toMatch(/BAKE MUD/);
    expect(JSON.stringify(body.specialDistrictFact)).not.toMatch(/mud-pid/);
  });

  it("padded cortex missing pipelineFact aliases integer root even when flood / land-use / special-district are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          facets: {
            texasRrc: { operatorName: "BAKE ENERGY TRANSFER", source: "texas-rrc" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          facets: {
            texasRrc: { operatorName: "BAKE ENERGY TRANSFER", source: "texas-rrc" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      pipelineFact?: { source?: string; nearPipeline?: boolean; t4permit?: string | null };
    };
    expect(body.pipelineFact?.source).toBe("rrc-pipeline-fact");
    expect(body.pipelineFact?.nearPipeline).toBe(false);
    expect(body.pipelineFact?.t4permit).toBeNull();
    expect(JSON.stringify(body.pipelineFact)).not.toMatch(/BAKE ENERGY TRANSFER/);
    expect(JSON.stringify(body.pipelineFact)).not.toMatch(/texas-rrc/);
  });

  it("padded cortex missing wellFact aliases integer root even when flood / land-use / special-district / pipeline are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          facets: {
            texasRrc: { apiNumber14: "BAKE WELL", source: "texas-rrc" },
            tx_rrc_well: { apiNumber14: "BAKE WELL" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          facets: {
            texasRrc: { apiNumber14: "BAKE WELL", source: "texas-rrc" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      wellFact?: { source?: string; code?: string; state?: string };
    };
    expect(body.wellFact?.source).toBe("well-fact");
    expect(body.wellFact?.code).toBe("atom-miss");
    expect(body.wellFact?.state).toBe("refused");
    expect(JSON.stringify(body.wellFact)).not.toMatch(/BAKE WELL/);
    expect(JSON.stringify(body.wellFact)).not.toMatch(/42000001030000/);
    expect(JSON.stringify(body.wellFact)).not.toMatch(/:none/);
    expect(JSON.stringify(body.wellFact)).not.toMatch(/texas-rrc/);
  });

  it("padded cortex missing buildingFootprintFact aliases integer root even when flood / land-use / special-district / pipeline / well are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          facets: {
            tx_building_footprint: { structureRole: "BAKE FOOTPRINT" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          buildingFootprintFact: GOLD_FOOTPRINT_MISS,
          facets: {
            tx_building_footprint: { structureRole: "BAKE FOOTPRINT" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      buildingFootprintFact?: { source?: string; code?: string; state?: string };
    };
    expect(body.buildingFootprintFact?.source).toBe("building-footprint");
    expect(body.buildingFootprintFact?.code).toBe("atom-miss");
    expect(body.buildingFootprintFact?.state).toBe("refused");
    expect(JSON.stringify(body.buildingFootprintFact)).not.toMatch(/BAKE FOOTPRINT/);
    expect(JSON.stringify(body.buildingFootprintFact)).not.toMatch(/:primary/);
    expect(JSON.stringify(body.buildingFootprintFact)).not.toMatch(
      /tx_building_footprint/,
    );
  });

  it("padded cortex missing boundaryEdgeFact aliases integer root even when flood / land-use / special-district / pipeline / well / footprint are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          buildingFootprintFact: GOLD_FOOTPRINT_MISS,
          facets: {
            txgio_parcel: { ring: [[0, 0]], source: "BAKE PARCEL RING" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          buildingFootprintFact: GOLD_FOOTPRINT_MISS,
          boundaryEdgeFact: GOLD_BOUNDARY_PRESENT,
          facets: {
            txgio_parcel: { ring: [[0, 0]], source: "BAKE PARCEL RING" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      boundaryEdgeFact?: {
        source?: string;
        role?: string;
        state?: string;
        entityId?: string;
      };
    };
    expect(body.boundaryEdgeFact?.source).toBe("property-boundary-edge");
    expect(body.boundaryEdgeFact?.state).toBe("present");
    expect(body.boundaryEdgeFact?.role).toBe("front");
    expect(body.boundaryEdgeFact?.entityId).toBe("48021:34137:boundary:2");
    expect(JSON.stringify(body.boundaryEdgeFact)).not.toMatch(/BAKE PARCEL RING/);
    expect(JSON.stringify(body.boundaryEdgeFact)).not.toMatch(/txgio_parcel/);
  });

  it("padded cortex missing ownerFact aliases integer root even when flood / land-use / special-district / pipeline / well / footprint / boundary are already on the padded body", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          buildingFootprintFact: GOLD_FOOTPRINT_MISS,
          boundaryEdgeFact: GOLD_BOUNDARY_PRESENT,
          facets: {
            cadOwner: { ownerName: "BAKE CAD OWNER", source: "cad-parcel-roll" },
          },
        });
      }
      if (url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          wellFact: GOLD_WELL_MISS,
          buildingFootprintFact: GOLD_FOOTPRINT_MISS,
          boundaryEdgeFact: GOLD_BOUNDARY_PRESENT,
          ownerFact: GOLD_OWNER_PRESENT,
          facets: {
            cadOwner: { ownerName: "BAKE CAD OWNER", source: "cad-parcel-roll" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await fetchCortexFacetsWithAlias(PADDED);
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as {
      ownerFact?: {
        source?: string;
        state?: string;
        entityId?: string;
        taxYear?: number;
      };
    };
    expect(body.ownerFact?.source).toBe("owner-fact");
    expect(body.ownerFact?.state).toBe("present");
    expect(body.ownerFact?.entityId).toBe("48021:34137:2025");
    expect(body.ownerFact?.taxYear).toBe(2025);
    expect(JSON.stringify(body.ownerFact)).not.toMatch(/BAKE CAD OWNER/);
    expect(JSON.stringify(body.ownerFact)).not.toMatch(/cad-parcel-roll/);
    expect(JSON.stringify(body.ownerFact)).not.toMatch(/ownerName/);
  });

  it("forwards pe_session Bearer and does not send the service key or X-Hauska-Key as identified", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck-service";
    const seen: { authorization?: string; xHauska?: string } = {};
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.authorization = headers.Authorization;
      seen.xHauska = headers["X-Hauska-Key"];
      return jsonResponse({
        parcelNodeId: INTEGER,
        ownerFact: GOLD_OWNER_PRESENT,
      });
    });
    const result = await fetchCortexFacetsWithAlias(INTEGER, "dotted.user.session");
    expect(result.status).toBe(200);
    expect(seen.authorization).toBe("Bearer dotted.user.session");
    expect(seen.authorization).not.toBe("Bearer ck-service");
    expect(seen.xHauska).toBeUndefined();
    const body = JSON.parse(result.body) as { ownerFact?: { entityId?: string } };
    expect(body.ownerFact?.entityId).toBe("48021:34137:2025");
  });

  it("no session uses the service key Bearer (anonymous refusal stays correct)", async () => {
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck-service";
    const seen: { authorization?: string; xHauska?: string } = {};
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.authorization = headers.Authorization;
      seen.xHauska = headers["X-Hauska-Key"];
      return jsonResponse({
        parcelNodeId: INTEGER,
        ownerFact: GOLD_OWNER_ANON,
      });
    });
    const result = await fetchCortexFacetsWithAlias(INTEGER);
    expect(result.status).toBe(200);
    expect(seen.authorization).toBe("Bearer ck-service");
    expect(seen.xHauska).toBeUndefined();
    const body = JSON.parse(result.body) as {
      ownerFact?: { code?: string; source?: string };
    };
    expect(body.ownerFact?.code).toBe("identified-session-required");
    expect(body.ownerFact?.source).toBe("owner-fact");
    expect(JSON.stringify(body.ownerFact)).not.toMatch(/ownerName/);
  });
});

describe("cortexInspectAuthorization (P-54 session forward)", () => {
  it("session Bearer wins over the service key and never emits X-Hauska-Key", () => {
    const auth = cortexInspectAuthorization("dotted.user.session", "ck-service");
    expect(auth).toEqual({
      authorization: "Bearer dotted.user.session",
      usedSession: true,
    });
    expect(JSON.stringify(auth)).not.toMatch(/X-Hauska-Key/);
    expect(JSON.stringify(auth)).not.toMatch(/ck-service/);
  });

  it("absent session uses the service key (anonymous path)", () => {
    expect(cortexInspectAuthorization(null, "ck-service")).toEqual({
      authorization: "Bearer ck-service",
      usedSession: false,
    });
    expect(cortexInspectAuthorization("", "ck-service")).toEqual({
      authorization: "Bearer ck-service",
      usedSession: false,
    });
  });
});

describe("handlePropertyAtomsFacets dual-grammar echo (WDLL 5)", () => {
  const prev = {
    atom: process.env.PROPERTY_ATOM_PATH,
    rUrl: process.env.HAUSKA_RETRIEVAL_API_URL,
    rKey: process.env.HAUSKA_RETRIEVAL_API_KEY,
    cUrl: process.env.CORTEX_API_URL,
    cKey: process.env.CORTEX_SERVICE_API_KEY,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore("PROPERTY_ATOM_PATH", prev.atom);
    restore("HAUSKA_RETRIEVAL_API_URL", prev.rUrl);
    restore("HAUSKA_RETRIEVAL_API_KEY", prev.rKey);
    restore("CORTEX_API_URL", prev.cUrl);
    restore("CORTEX_SERVICE_API_KEY", prev.cKey);
  });

  it("serves alias zoning + floodHazardFact + landUseFact and echoes REQUESTED padded parcelNodeId", async () => {
    process.env.PROPERTY_ATOM_PATH = "1";
    process.env.HAUSKA_RETRIEVAL_API_URL = "https://retrieval.test";
    process.env.HAUSKA_RETRIEVAL_API_KEY = "rk";
    process.env.CORTEX_API_URL = "https://cortex.test";
    process.env.CORTEX_SERVICE_API_KEY = "ck";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/atom-chain") && url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({ parcelNodeId: PADDED, atoms: [] });
      }
      if (url.includes("/atom-chain") && url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse(GOLD_CHAIN);
      }
      if (url.includes("/facets") && url.includes(encodeURIComponent(PADDED))) {
        return jsonResponse({
          parcelNodeId: PADDED,
          facets: {},
          tier2: { flood: { status: "in-sfha", floodZone: "AE" } },
        });
      }
      if (url.includes("/facets") && url.includes(encodeURIComponent(INTEGER))) {
        return jsonResponse({
          parcelNodeId: INTEGER,
          floodHazardFact: GOLD_FLOOD,
          landUseFact: GOLD_LAND_USE,
          specialDistrictFact: COLONY_MUD,
          pipelineFact: GOLD_PIPELINE_OUTSIDE,
          facets: { baseFacts: {} },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const rec: {
      headers: Record<string, string>;
      statusCode: number;
      body: unknown;
      setHeader: (k: string, v: string) => void;
      status: (n: number) => typeof rec;
      json: (b: unknown) => typeof rec;
      send: (b: unknown) => typeof rec;
    } = {
      headers: {},
      statusCode: 0,
      body: undefined,
      setHeader(k, v) {
        rec.headers[k] = v;
      },
      status(n) {
        rec.statusCode = n;
        return rec;
      },
      json(b) {
        rec.body = b;
        return rec;
      },
      send(b) {
        rec.body = b;
        return rec;
      },
    };

    await handlePropertyAtomsFacets(
      { method: "GET" } as VercelRequest,
      rec as unknown as VercelResponse,
      ["property-atoms", PADDED, "facets"],
    );

    expect(rec.statusCode).toBe(200);
    const body = rec.body as {
      parcelNodeId: string;
      floodHazardFact?: { floodZone?: string };
      landUseFact?: { landUseCode?: string; source?: string };
      specialDistrictFact?: { districtName?: string; source?: string };
      pipelineFact?: { source?: string; nearPipeline?: boolean };
      facets: { parcelNodeId?: string; zoning?: { district?: string } };
    };
    expect(body.parcelNodeId).toBe(PADDED);
    expect(body.facets.parcelNodeId).toBe(PADDED);
    expect(body.facets.zoning?.district).toBe("SF-1");
    expect(body.floodHazardFact?.floodZone).toBe("X");
    expect(body.landUseFact?.landUseCode).toBe("A1");
    expect(body.landUseFact?.source).toBe("land-use-fact");
    expect(body.specialDistrictFact?.districtName).toBe("The Colony MUD 1C");
    expect(body.specialDistrictFact?.source).toBe("special-district-fact");
    expect(body.pipelineFact?.source).toBe("rrc-pipeline-fact");
    expect(body.pipelineFact?.nearPipeline).toBe(false);
    expect(JSON.stringify(body.floodHazardFact)).not.toMatch(/"AE"/);
    expect(JSON.stringify(body.pipelineFact)).not.toMatch(/ENERGY TRANSFER/);
  });
});
