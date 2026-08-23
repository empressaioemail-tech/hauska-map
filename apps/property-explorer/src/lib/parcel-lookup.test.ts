import { describe, expect, it, vi } from "vitest";
import {
  classifyLookupQuery,
  deepLinkLookupQuery,
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

// UPDATED BEHAVIOUR (P-39). The removed suites here — "resolves parcel-node-id
// via facets BFF" and the four "parcel-node-id navigation seam" cases —
// exercised a module that built a whole inspect card and geocoded the situs
// ADDRESS to find a camera centre. Both jobs moved: facts to the one
// FactSheetResolver, centring to ParcelGeometry.centroid (invariant I5). What
// is left here is the one thing this path is authoritative for.

const CORTEX = "/api/spine/cortex/api";

function envelopeStub(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("resolveLookupToParcelNodeId", () => {
  it("returns a parcel id unchanged, with no network call at all", async () => {
    const fetchImpl = envelopeStub({});
    const result = await resolveLookupToParcelNodeId(" 48209:156346 ", {
      cortexBase: CORTEX,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48209:156346",
      source: "parcel-node-id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pins an address to exactly one parcel via the backend resolve", async () => {
    const fetchImpl = envelopeStub({
      status: "declined",
      parcel_node_id: "48453:812345",
      placeKey: "coord:30.45901:-97.63542",
      payload: {
        parcel: { parcel_node_id: "48453:812345" },
        geojson: { type: "FeatureCollection", features: [] },
      },
    });
    const result = await resolveLookupToParcelNodeId(
      "17005 Simsbrook Drive, Pflugerville, TX, 78660",
      { cortexBase: CORTEX, fetchImpl },
    );
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48453:812345",
      source: "address",
      resolvedPoint: { lat: 30.45901, lng: -97.63542 },
    });
  });

  it("forwards viewport bias coords with the address envelope body", async () => {
    const fetchImpl = vi.fn(async (_url, init) =>
      new Response(
        JSON.stringify({
          status: "declined",
          parcel_node_id: "48453:1",
          placeKey: "coord:30.46:-97.64",
          payload: { parcel: { parcel_node_id: "48453:1" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    await resolveLookupToParcelNodeId("17005 Simsbrook Dr, Pflugerville, TX", {
      cortexBase: CORTEX,
      fetchImpl,
      lat: 30.459,
      lng: -97.635,
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body));
    expect(body).toEqual({
      address: "17005 Simsbrook Dr, Pflugerville, TX",
      lat: 30.459,
      lng: -97.635,
    });
  });

  it("resolves the parcel even when the envelope itself is declined", async () => {
    // A no-setbacks jurisdiction is a corpus gap, not a missing parcel.
    const fetchImpl = envelopeStub({
      status: "no-setbacks",
      reason: "no setback table",
      parcel_node_id: "48021:36521",
    });
    const result = await resolveLookupToParcelNodeId("1503 Farm St", {
      cortexBase: CORTEX,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48021:36521",
      source: "address",
    });
  });

  it("is an honest miss when the address pins to no parcel", async () => {
    const fetchImpl = envelopeStub({
      status: "not-found",
      reason: "Address not matched to a parcel.",
    });
    const result = await resolveLookupToParcelNodeId("nowhere at all", {
      cortexBase: CORTEX,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: false,
      reason: "Address not matched to a parcel.",
    });
  });

  it("rejects an empty query before touching the network", async () => {
    const fetchImpl = envelopeStub({});
    const result = await resolveLookupToParcelNodeId("   ", {
      cortexBase: CORTEX,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
