import { describe, expect, it, vi } from "vitest";
import {
  classifyLookupQuery,
  deepLinkLookupQuery,
  resolveParcelLookup,
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

describe("resolveParcelLookup", () => {
  it("resolves parcel-node-id via facets BFF", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/property-atoms/");
      expect(String(url)).toContain(encodeURIComponent("48209:156346"));
      return new Response(
        JSON.stringify({
          parcelNodeId: "48209:156346",
          adapterKey: "property-atom-chain",
          source: "atom-chain",
          snapshotAt: "2026-07-23T20:00:00.000Z",
          facets: {
            parcelNodeId: "48209:156346",
            countyFips: "48209",
            baseFacts: { apn: "156346" },
            zoning: { district: "RS" },
            envelope: {
              status: "ok",
              setbacks: { front_ft: 25, side_ft: 5, rear_ft: 10 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    // fetchBakedNodeFacets uses global fetch — stub it
    const prev = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48209:156346");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.target.parcelNodeId).toBe("48209:156346");
        expect(result.target.card.apn).toBe("156346");
        expect(result.target.source).toBe("parcel-node-id");
      }
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("returns honest miss when facets 404", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48209:99999999");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/No parcel found/);
    } finally {
      globalThis.fetch = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// NAVIGATION SEAM (workbench polish): the parcel-node-id path — the search
// bar's parcel fast path AND the W4 saved-property reopen (host.openProperty →
// runParcelLookup) — must return a card CARRYING A CENTER so the caller's
// camera block (rebindProperty + resolveSubjectAndFit) actually flies the map.
// Baked facets carry no coordinates, so the center is resolved through the
// buildable-envelope address path (the backend's authoritative geocode).
// ---------------------------------------------------------------------------

describe("resolveParcelLookup — parcel-node-id navigation seam", () => {
  const FACETS_RESPONSE = JSON.stringify({
    parcelNodeId: "48021:58867",
    adapterKey: "baked",
    source: "baked-snapshot",
    snapshotAt: "2026-07-23T20:00:00.000Z",
    facets: {
      parcelNodeId: "48021:58867",
      countyFips: "48021",
      countyName: "Bastrop",
      baseFacts: { apn: "58867", situsAddress: "1010 Pecan St, Bastrop, TX" },
      zoning: { district: "P-5" },
    },
  });

  it("resolves a CENTER (and matching-parcel geometry) via the envelope address path", async () => {
    const ring = {
      type: "Polygon",
      coordinates: [[[-97.31, 30.11], [-97.309, 30.11], [-97.309, 30.111], [-97.31, 30.11]]],
    };
    const calls: string[] = [];
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/facets")) {
        return new Response(FACETS_RESPONSE, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // The envelope resolve — must be the ADDRESS form (backend situs-match).
      expect(u).toContain("buildable-envelope");
      expect(JSON.parse(String(init?.body))).toEqual({
        address: "1010 Pecan St, Bastrop, TX",
      });
      return new Response(
        JSON.stringify({
          status: "ok",
          payload: {
            parcel: {
              parcel_node_id: "48021:58867",
              placeKey: "coord:30.1105:-97.3095",
            },
            geojson: {
              type: "FeatureCollection",
              features: [
                { geometry: ring, properties: { parcel_node_id: "48021:58867" } },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48021:58867");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The card now carries the backend's center → the caller FLIES the map.
      expect(result.target.card.lat).toBe(30.1105);
      expect(result.target.card.lng).toBe(-97.3095);
      expect(result.target.card.situsAddress).toBe("1010 Pecan St, Bastrop, TX");
      expect(result.target.source).toBe("parcel-node-id");
      // Both fetches happened: facets first, then the envelope center resolve.
      expect(calls.some((u) => u.includes("/facets"))).toBe(true);
      expect(calls.some((u) => u.includes("buildable-envelope"))).toBe(true);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("falls back to the geocode BFF for a center when the envelope declines", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/facets")) {
        return new Response(FACETS_RESPONSE, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("buildable-envelope")) {
        // Declined jurisdiction: honest ok:false, NO placeKey to center on.
        return new Response(
          JSON.stringify({ status: "no-setbacks", reason: "corpus gap" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(u).toContain("/api/pe-geocode");
      return new Response(
        JSON.stringify({
          features: [
            {
              name: "Pecan St",
              housenumber: "1010",
              street: "Pecan St",
              city: "Bastrop",
              state: "TX",
              type: "house",
              lat: 30.1104,
              lng: -97.3092,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48021:58867");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.target.card.lat).toBe(30.1104);
      expect(result.target.card.lng).toBe(-97.3092);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("degrades honestly when the center resolve fails — card still opens, no throw", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/facets")) {
        return new Response(FACETS_RESPONSE, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ status: "error" }), { status: 500 });
    }) as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48021:58867");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.target.card.apn).toBe("58867");
      expect(result.target.card.lat).toBeNull();
      expect(result.target.card.lng).toBeNull();
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("skips the center resolve entirely when facets carry no situs address", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          parcelNodeId: "48209:156346",
          adapterKey: "property-atom-chain",
          source: "atom-chain",
          snapshotAt: null,
          facets: { parcelNodeId: "48209:156346", baseFacts: { apn: "156346" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const prev = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const result = await resolveParcelLookup("48209:156346");
      expect(result.ok).toBe(true);
      // Only the facets fetch — no address to resolve a center from.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = prev;
    }
  });
});
