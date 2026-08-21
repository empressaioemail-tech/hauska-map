import { afterEach, describe, it, expect, vi } from "vitest";
import {
  fetchAtomChainWithAlias,
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

  it("serves alias zoning + floodHazardFact and echoes REQUESTED padded parcelNodeId", async () => {
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
      facets: { parcelNodeId?: string; zoning?: { district?: string } };
    };
    expect(body.parcelNodeId).toBe(PADDED);
    expect(body.facets.parcelNodeId).toBe(PADDED);
    expect(body.facets.zoning?.district).toBe("SF-1");
    expect(body.floodHazardFact?.floodZone).toBe("X");
    expect(JSON.stringify(body.floodHazardFact)).not.toMatch(/"AE"/);
  });
});
