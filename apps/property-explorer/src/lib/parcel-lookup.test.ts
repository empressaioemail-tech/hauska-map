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
