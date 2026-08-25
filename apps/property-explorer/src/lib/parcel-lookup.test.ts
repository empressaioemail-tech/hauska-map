import { describe, expect, it, vi } from "vitest";
import {
  classifyLookupQuery,
  deepLinkLookupQuery,
  findQueryMatchesSubjectSitus,
  HONEST_SEARCH_MISS,
  resolveLookupToParcelNodeId,
} from "./parcel-lookup";

describe("classifyLookupQuery", () => {
  it("parses parcel node ids", () => {
    expect(classifyLookupQuery("48209:156346")).toEqual({
      kind: "parcel-node-id",
      value: "48209:156346",
    });
    expect(classifyLookupQuery(" 48491:R062578 ")).toEqual({
      kind: "parcel-node-id",
      value: "48491:R062578",
    });
  });

  it("treats everything else as address", () => {
    expect(classifyLookupQuery("709 Uhland Rd, San Marcos")).toEqual({
      kind: "address",
      value: "709 Uhland Rd, San Marcos",
    });
  });

  it("rejects empty", () => {
    expect(classifyLookupQuery("   ")).toBeNull();
  });
});

describe("deepLinkLookupQuery", () => {
  it("prefers parcelNodeId then parcel then address", () => {
    expect(
      deepLinkLookupQuery(new URLSearchParams("parcelNodeId=48209:156346")),
    ).toBe("48209:156346");
    expect(deepLinkLookupQuery(new URLSearchParams("parcel=48029:410119"))).toBe(
      "48029:410119",
    );
    expect(
      deepLinkLookupQuery(new URLSearchParams("address=1+Main+St")),
    ).toBe("1 Main St");
  });
});

const CORTEX = "/api/spine/cortex/api";
const SITUS = "/api/pe-situs-search";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envelopeOk(nodeId: string, placeKey?: string) {
  return {
    status: "ok",
    parcel_node_id: nodeId,
    placeKey: placeKey ?? `coord:30.459:-97.635`,
    payload: { parcel: { parcel_node_id: nodeId } },
  };
}

function routeFetch(opts: {
  situsHits?: unknown[];
  situsStatus?: number;
  onEnvelope?: (body: unknown) => Response;
}) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.includes("pe-situs-search") || href.includes("situs-search")) {
      if (opts.situsStatus && opts.situsStatus !== 200) {
        return jsonResponse({ error: "down" }, opts.situsStatus);
      }
      return jsonResponse({ hits: opts.situsHits ?? [] });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (opts.onEnvelope) return opts.onEnvelope(body);
    return jsonResponse(envelopeOk("48453:0"));
  }) as unknown as typeof fetch;
}

describe("resolveLookupToParcelNodeId", () => {
  it("returns a parcel id unchanged, with no network call at all", async () => {
    const fetchImpl = routeFetch({ situsHits: [] });
    const result = await resolveLookupToParcelNodeId(" 48209:156346 ", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48209:156346",
      source: "parcel-node-id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Photon long-form Simsbrook: unique address-point rooftop, not the Photon label (WDLL 1)", async () => {
    const fetchImpl = routeFetch({
      situsHits: [
        {
          parcelNodeId: null,
          situsAddress: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
          latitude: 30.459005,
          longitude: -97.635421,
          source: "address-point",
        },
      ],
      onEnvelope: (body) => {
        expect(body).toEqual({
          address: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
          lat: 30.459005,
          lng: -97.635421,
        });
        return jsonResponse(envelopeOk("48453:280239", "coord:30.459005:-97.635421"));
      },
    });
    const result = await resolveLookupToParcelNodeId(
      "17005 Simsbrook Drive, Pflugerville, Texas, 78660",
      {
        cortexBase: CORTEX,
        situsSearchUrl: SITUS,
        fetchImpl,
        lat: 30.11,
        lng: -97.31,
      },
    );
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48453:280239",
      source: "address",
      resolvedPoint: { lat: 30.459005, lng: -97.635421 },
    });
  });

  it("Photon Texas label with no pin: compact address-only, never the Photon label", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: (body) => {
        expect(body).toEqual({
          address: "17005 Simsbrook, Pflugerville TX",
        });
        expect(String(JSON.stringify(body))).not.toContain("Texas");
        return jsonResponse(envelopeOk("48453:280239", "coord:30.459:-97.635"));
      },
    });
    const result = await resolveLookupToParcelNodeId(
      "17005 Simsbrook Drive, Pflugerville, Texas, 78660",
      {
        cortexBase: CORTEX,
        situsSearchUrl: SITUS,
        fetchImpl,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parcelNodeId).toBe("48453:280239");
  });

  it("trusted situs rooftop is posted when the pin has no point", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: (body) => {
        expect(body).toEqual({
          address: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
          lat: 30.459005,
          lng: -97.635421,
        });
        return jsonResponse(envelopeOk("48453:280239", "coord:30.459005:-97.635421"));
      },
    });
    const result = await resolveLookupToParcelNodeId(
      "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
      {
        cortexBase: CORTEX,
        situsSearchUrl: SITUS,
        fetchImpl,
        lat: 30.26,
        lng: -97.74,
        trustedRooftop: { lat: 30.459005, lng: -97.635421 },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parcelNodeId).toBe("48453:280239");
  });

  it("does not forward Photon or viewport coords onto envelope (WDLL 2)", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: (body) => {
        expect(body).toEqual({ address: "17005 Simsbrook Dr, Pflugerville, TX" });
        expect(body).not.toHaveProperty("lat");
        expect(body).not.toHaveProperty("lng");
        return jsonResponse({
          status: "declined",
          reason: "Could not geocode the provided address",
        });
      },
    });
    const result = await resolveLookupToParcelNodeId(
      "17005 Simsbrook Dr, Pflugerville, TX",
      {
        cortexBase: CORTEX,
        situsSearchUrl: SITUS,
        fetchImpl,
        lat: 30.26,
        lng: -97.74,
      },
    );
    expect(result.ok).toBe(false);
  });

  it("unique node-bearing situs hit is the identity; envelope is not called", async () => {
    const fetchImpl = routeFetch({
      situsHits: [
        {
          parcelNodeId: "48021:34137",
          situsAddress: "908 PINE , BASTROP, TX 78602",
          countyFips: "48021",
        },
      ],
      onEnvelope: () => {
        throw new Error("envelope must not run when situs already has the node");
      },
    });
    const result = await resolveLookupToParcelNodeId("908 Pine, Bastrop TX", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48021:34137",
      source: "address",
    });
  });

  it("many-hit 908 Pine does not take Harker Heights hits[0]; address-only envelope (WDLL 3+4)", async () => {
    const fetchImpl = routeFetch({
      situsHits: [
        {
          parcelNodeId: "48027:70876",
          situsAddress: "908 PINEWOOD DR, HARKER HEIGHTS, TX 76548",
        },
        {
          parcelNodeId: "48491:R042064",
          situsAddress: "908 PINE ST, GEORGETOWN, TX 78626",
        },
        {
          parcelNodeId: null,
          situsAddress: "908 PINE ST, Georgetown, TX, 78626",
          latitude: 30.63,
          longitude: -97.67,
        },
      ],
      onEnvelope: (body) => {
        expect(body).toEqual({ address: "908 Pine, Bastrop TX" });
        return jsonResponse(envelopeOk("48021:34137", "coord:30.1103:-97.315"));
      },
    });
    const result = await resolveLookupToParcelNodeId("908 Pine, Bastrop TX", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parcelNodeId).toBe("48021:34137");
  });

  it("resolves the parcel even when the envelope itself is declined", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: () =>
        jsonResponse({
          status: "no-setbacks",
          reason: "no setback table",
          parcel_node_id: "48021:36521",
        }),
    });
    const result = await resolveLookupToParcelNodeId("1503 Farm St", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48021:36521",
      source: "address",
    });
  });

  it("is an honest miss when the address pins to no parcel", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: () =>
        jsonResponse({
          status: "not-found",
          reason: "Address not matched to a parcel.",
        }),
    });
    const result = await resolveLookupToParcelNodeId("nowhere at all", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: false,
      reason: "Address not matched to a parcel.",
    });
  });

  it("rejects an empty query before touching the network", async () => {
    const fetchImpl = routeFetch({ situsHits: [] });
    const result = await resolveLookupToParcelNodeId("   ", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("404 + matching subject situs resolves the current subject — not a naked 404 toast", async () => {
    const fetchImpl = routeFetch({
      situsStatus: 404,
      onEnvelope: () =>
        jsonResponse(
          {
            status: "http-404",
            message: "Error fetch property search results: 404 (Not Found)",
          },
          404,
        ),
    });
    const result = await resolveLookupToParcelNodeId(
      "906 CHESTNUT ST, BASTROP, TX 78602",
      {
        cortexBase: CORTEX,
        situsSearchUrl: SITUS,
        fetchImpl,
        currentSubject: {
          parcelNodeId: "48021:34097",
          situsAddress: "906 CHESTNUT ST, BASTROP, TX 78602",
        },
      },
    );
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48021:34097",
      source: "address",
    });
    expect(JSON.stringify(result)).not.toMatch(/Error fetch property search/);
  });

  it("404 + non-matching query is an honest miss — does not invent the subject id", async () => {
    const fetchImpl = routeFetch({
      situsHits: [],
      onEnvelope: () =>
        jsonResponse(
          {
            status: "http-404",
            message: "Error fetch property search results: 404 (Not Found)",
          },
          404,
        ),
    });
    const result = await resolveLookupToParcelNodeId("nowhere at all", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
      currentSubject: {
        parcelNodeId: "48021:34097",
        situsAddress: "906 CHESTNUT ST, BASTROP, TX 78602",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(HONEST_SEARCH_MISS);
    expect(result.reason).not.toMatch(/Error fetch property search/);
    expect(JSON.stringify(result)).not.toMatch(/48021:34097/);
  });

  it("findQueryMatchesSubjectSitus matches Chestnut long-form to the subject", () => {
    expect(
      findQueryMatchesSubjectSitus(
        "906 CHESTNUT ST, BASTROP, TX 78602",
        "906 Chestnut St, Bastrop, TX 78602",
      ),
    ).toBe(true);
    expect(
      findQueryMatchesSubjectSitus(
        "100 MAIN ST, AUSTIN, TX",
        "906 CHESTNUT ST, BASTROP, TX 78602",
      ),
    ).toBe(false);
  });

  it("situs down falls through to address-only envelope", async () => {
    const fetchImpl = routeFetch({
      situsStatus: 502,
      onEnvelope: (body) => {
        expect(body).toEqual({ address: "908 Pine, Bastrop TX" });
        return jsonResponse(envelopeOk("48021:34137", "coord:30.11:-97.31"));
      },
    });
    const result = await resolveLookupToParcelNodeId("908 Pine, Bastrop TX", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parcelNodeId).toBe("48021:34137");
  });
});
