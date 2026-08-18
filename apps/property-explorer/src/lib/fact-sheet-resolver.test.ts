// apps/property-explorer/src/lib/fact-sheet-resolver.test.ts
//
// The resolver is tested against the DEFECTS from the 2026-08-18 QA pass:
//
//   - a drainage study came back for 48027:498770 while 498778 was selected
//     -> one resolve per parcel, and the ring probe never accepts a neighbour;
//   - "County name is not on file for this parcel" on a parcel whose id begins
//     with the county FIPS -> county is not a Fact and can never be absent;
//   - sheet 1 said "buildable envelope not derived here" while sheet 4 measured
//     6,325 sq ft -> the envelope is ONE field with exclusive variants;
//   - a parcel with no situs address never moved the map -> the centroid comes
//     from geometry, and the address is not the navigation authority.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FactSheetResolveError,
  PeFactSheetResolver,
  computeFactSheetId,
  pickParcelRings,
} from "./fact-sheet-resolver";

const FACETS_BASE = "/api/spine/property-atoms";
const CORTEX_BASE = "/api/spine/cortex/api";
const NODE_ID = "48021:36521";

/** A square ring around a point, in degrees. */
function square(
  lng: number,
  lat: number,
  half = 0.0005,
): Array<[number, number]> {
  return [
    [lng - half, lat - half],
    [lng + half, lat - half],
    [lng + half, lat + half],
    [lng - half, lat + half],
    [lng - half, lat - half],
  ];
}

const SUBJECT_CENTRE = { lng: -97.3184, lat: 30.1105 };
const NEIGHBOUR_CENTRE = { lng: -97.3174, lat: 30.1105 };

function facetsWire(over: Record<string, unknown> = {}) {
  return {
    parcelNodeId: NODE_ID,
    adapterKey: "bastrop",
    source: "baked-snapshot",
    snapshotAt: "2026-08-01T00:00:00.000Z",
    facets: {
      parcelNodeId: NODE_ID,
      countyFips: "48021",
      countyName: "Bastrop",
      baseFacts: {
        apn: "R12345",
        situsAddress: "1503 Farm St",
        landUse: { code: "A1", description: "Single-family residential", source: "cad-roll", vintage: "2026" },
        acreage: { value: 0.2345, sqft: 10214, method: "cad-roll" },
      },
      zoning: { district: "R-1", jurisdictionKey: "bastrop_city_tx" },
      envelope: {
        status: "ok",
        approximate: true,
        buildableAreaPct: 58,
        buildableAreaSqFt: 6325,
        district: "R-1",
        setbacks: { front_ft: 25, side_ft: 5, rear_ft: 10 },
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [square(SUBJECT_CENTRE.lng, SUBJECT_CENTRE.lat, 0.0002)],
              },
            },
          ],
        },
      },
      facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
      provenance: { parcelSource: "cad-roll", parcelVintage: "data-export-01.14.2026" },
      bakedAt: "2026-08-01T00:00:00.000Z",
      ...over,
    },
    tier2: {
      flood: {
        status: "in-sfha",
        floodZone: "AE",
        zoneSubtype: null,
        provenance: { source: "fema-nfhl", vintage: "2025-11" },
      },
    },
  };
}

interface StubOpts {
  facets?: unknown;
  facetsStatus?: number;
  /** Features the parcel-layer bbox probe returns. */
  gisFeatures?: unknown[];
  gisStatus?: number;
  /** Photon hit the LAST-RESORT address geocode returns, if it is reached. */
  geocodeHit?: { lat: number; lng: number } | null;
}

function installFetchStub(opts: StubOpts = {}) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/facets")) {
      const status = opts.facetsStatus ?? 200;
      return new Response(JSON.stringify(opts.facets ?? facetsWire()), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("gis-layer")) {
      const status = opts.gisStatus ?? 200;
      return new Response(
        JSON.stringify({ layer: "parcels", geojson: { type: "FeatureCollection", features: opts.gisFeatures ?? [] } }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/api/pe-geocode")) {
      const hit = opts.geocodeHit === undefined ? SUBJECT_CENTRE : opts.geocodeHit;
      return new Response(
        JSON.stringify({
          attribution: "search © OSM",
          features: hit
            ? [
                {
                  name: null,
                  housenumber: "1503",
                  street: "Farm St",
                  city: "Bastrop",
                  county: null,
                  state: "TX",
                  postcode: "78602",
                  countrycode: "US",
                  osmKey: "place",
                  osmValue: "house",
                  type: "house",
                  lat: hit.lat,
                  lng: hit.lng,
                  extent: null,
                },
              ]
            : [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("buildable-envelope")) {
      return new Response(JSON.stringify({ status: "declined", reason: "not called in this test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", impl);
  return { impl: impl as unknown as typeof fetch, calls };
}

function makeResolver(stub: { impl: typeof fetch }) {
  return new PeFactSheetResolver({
    facetsBase: FACETS_BASE,
    cortexBase: CORTEX_BASE,
    fetchImpl: stub.impl,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
  });
}

const SUBJECT_FEATURE = {
  type: "Feature",
  properties: { parcel_node_id: NODE_ID, apn: "R12345" },
  geometry: { type: "Polygon", coordinates: [square(SUBJECT_CENTRE.lng, SUBJECT_CENTRE.lat)] },
};
const NEIGHBOUR_FEATURE = {
  type: "Feature",
  properties: { parcel_node_id: "48021:36522", apn: "R99999" },
  geometry: { type: "Polygon", coordinates: [square(NEIGHBOUR_CENTRE.lng, NEIGHBOUR_CENTRE.lat)] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("computeFactSheetId", () => {
  it("is stable for identical inputs and independent of key order", () => {
    const a = computeFactSheetId(NODE_ID, "v1", { b: 2, a: 1 });
    const b = computeFactSheetId(NODE_ID, "v1", { a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^fs_[0-9a-f]{16}$/);
  });

  it("changes when the parcel, the resolver version, or an input changes", () => {
    const base = computeFactSheetId(NODE_ID, "v1", { a: 1 });
    expect(computeFactSheetId("48021:36522", "v1", { a: 1 })).not.toBe(base);
    expect(computeFactSheetId(NODE_ID, "v2", { a: 1 })).not.toBe(base);
    expect(computeFactSheetId(NODE_ID, "v1", { a: 2 })).not.toBe(base);
  });
});

describe("pickParcelRings — the wrong-target guard", () => {
  it("picks by parcel node id, never the adjacent lot", () => {
    const rings = pickParcelRings(
      [NEIGHBOUR_FEATURE, SUBJECT_FEATURE] as never,
      NODE_ID,
      null,
      null,
    );
    expect(rings).toHaveLength(1);
    expect(rings[0][0][0]).toBeCloseTo(SUBJECT_CENTRE.lng - 0.0005, 6);
  });

  it("falls back to APN, then to containment, and returns nothing on a miss", () => {
    const noIds = [
      { ...NEIGHBOUR_FEATURE, properties: {} },
      { ...SUBJECT_FEATURE, properties: { apn: "R12345" } },
    ];
    expect(pickParcelRings(noIds as never, NODE_ID, "R12345", null)).toHaveLength(1);

    const bare = [
      { ...NEIGHBOUR_FEATURE, properties: {} },
      { ...SUBJECT_FEATURE, properties: {} },
    ];
    const byPoint = pickParcelRings(bare as never, NODE_ID, null, {
      lat: SUBJECT_CENTRE.lat,
      lng: SUBJECT_CENTRE.lng,
    });
    expect(byPoint).toHaveLength(1);

    // A seed that lands in NEITHER lot resolves to no ring rather than the
    // nearest one: an adjacent lot's boundary is the wrong-target defect.
    expect(
      pickParcelRings(bare as never, NODE_ID, null, { lat: 31, lng: -99 }),
    ).toHaveLength(0);
  });
});

describe("PeFactSheetResolver.resolve", () => {
  it("rejects anything that is not a parcel node id", async () => {
    const stub = installFetchStub();
    const resolver = makeResolver(stub);
    // The exact defect: a DXF export targeted "city of Bastrop" from the box.
    await expect(resolver.resolve("city of Bastrop")).rejects.toBeInstanceOf(
      FactSheetResolveError,
    );
  });

  it("resolves ONCE per parcel and hands back the identical sheet (I1)", async () => {
    const stub = installFetchStub({ gisFeatures: [NEIGHBOUR_FEATURE, SUBJECT_FEATURE] });
    const resolver = makeResolver(stub);
    const a = await resolver.resolve(NODE_ID);
    const b = await resolver.resolve(NODE_ID);
    expect(b).toBe(a);
    const facetCalls = stub.calls.filter((u) => u.includes("/facets"));
    expect(facetCalls).toHaveLength(1);
  });

  it("returns the SAME sheet by id, and null for an unknown id (I1)", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const resolver = makeResolver(stub);
    const sheet = await resolver.resolve(NODE_ID);
    expect(await resolver.bySheetId(sheet.factSheetId)).toBe(sheet);
    expect(await resolver.bySheetId("fs_deadbeefdeadbeef")).toBeNull();
  });

  it("centres on the parcel RING, not on the address (I5)", async () => {
    const stub = installFetchStub({ gisFeatures: [NEIGHBOUR_FEATURE, SUBJECT_FEATURE] });
    const resolver = makeResolver(stub);
    const sheet = await resolver.resolve(NODE_ID);
    expect(sheet.geometry.rings).toHaveLength(1);
    expect(sheet.geometry.centroid.lat).toBeCloseTo(SUBJECT_CENTRE.lat, 6);
    expect(sheet.geometry.centroid.lng).toBeCloseTo(SUBJECT_CENTRE.lng, 6);
    // Measured from the ring, not read off the CAD roll.
    expect(sheet.geometry.lotArea.unit).toBe("sqft");
    expect(sheet.geometry.lotArea.value).toBeGreaterThan(0);
    expect(sheet.geometry.lotArea.value).not.toBe(10214);
    // The address was never consulted for the camera: geometry was available,
    // so the demoted geocode path did not run at all.
    expect(stub.calls.some((u) => u.includes("/api/pe-geocode"))).toBe(false);
  });

  it("still produces a centroid for a parcel with NO situs address (I5)", async () => {
    // This is the case that used to open the card and leave the map still.
    const wire = facetsWire();
    (wire.facets.baseFacts as Record<string, unknown>).situsAddress = null;
    const stub = installFetchStub({ facets: wire, gisFeatures: [] });
    const resolver = makeResolver(stub);
    const sheet = await resolver.resolve(NODE_ID);
    expect(sheet.identity.situsAddress.state).toBe("absent-covered");
    expect(Number.isFinite(sheet.geometry.centroid.lat)).toBe(true);
    expect(sheet.geometry.centroid.lng).toBeCloseTo(SUBJECT_CENTRE.lng, 4);
    // No ring resolved: the sheet claims no boundary rather than inventing one.
    expect(sheet.geometry.rings).toHaveLength(0);
    // …and the lot area falls back to the CAD roll's own acreage.
    expect(sheet.geometry.lotArea.value).toBe(10214);
  });

  it("always names the county (never 'not on file')", async () => {
    const wire = facetsWire();
    delete (wire.facets as Record<string, unknown>).countyName;
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(stub).resolve(NODE_ID);
    expect(sheet.identity.county).toEqual({ fips: "48021", name: "Bastrop" });
  });

  it("carries provenance as a SIBLING of the value, never inside it (I3)", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(stub).resolve(NODE_ID);
    expect(sheet.landUse.state).toBe("present");
    if (sheet.landUse.state !== "present") throw new Error("unreachable");
    // The old formatLandUseDisplay returned "A1 — Single-family residential
    // (cad-roll · 2026)" as ONE string. The value must now be clean.
    expect(sheet.landUse.value.description).toBe("Single-family residential");
    expect(sheet.landUse.value.description).not.toContain("cad-roll");
    expect(sheet.landUse.provenance.source).toBe("cad-roll");
    expect(sheet.landUse.provenance.vintage).toBe("2026");
  });

  it("makes 'not derived' and an area mutually exclusive (I2)", async () => {
    const withEnvelope = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const derived = await makeResolver(withEnvelope).resolve(NODE_ID);
    expect(derived.envelope.kind).toBe("derived");
    if (derived.envelope.kind !== "derived") throw new Error("unreachable");
    expect(derived.envelope.area.value).toBe(6325);
    expect(derived.envelope.setbacksUsed.front).toEqual({ value: 25, unit: "ft" });
    // Tier-1 envelopes are shape-only: always approximate.
    expect(derived.envelope.approximate).toBe(true);

    vi.unstubAllGlobals();
    const declinedWire = facetsWire();
    (declinedWire.facets as Record<string, unknown>).envelope = {
      status: "declined",
      declineReason: "no-setback-table",
    };
    const declined = installFetchStub({ facets: declinedWire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(declined).resolve(NODE_ID);
    expect(sheet.envelope.kind).toBe("not-derived");
    if (sheet.envelope.kind !== "not-derived") throw new Error("unreachable");
    expect(sheet.envelope.missing).toContain("setbacks");
    // There is no `area` field on this variant at all — the two cannot coexist.
    expect("area" in sheet.envelope).toBe(false);
  });

  it("reports a consumed lot as its own variant, never as 0 sq ft buildable", async () => {
    const wire = facetsWire();
    (wire.facets as Record<string, unknown>).envelope = {
      status: "no-buildable-area",
      setbacks: { front_ft: 25, side_ft: 5, rear_ft: 10 },
      emptyReason: "Setbacks consume the lot.",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(stub).resolve(NODE_ID);
    expect(sheet.envelope.kind).toBe("consumed");
  });

  it("widens the served scalar flood zone into a SET (I6)", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(stub).resolve(NODE_ID);
    expect(sheet.flood.state).toBe("present");
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones).toEqual([
      { zone: "AE", subtype: null, isSfha: true, areaShare: 1 },
    ]);
    expect(sheet.flood.value.inSfha).toBe(true);
    expect(sheet.flood.value.primaryZone).toBe("AE");
    // The share is NOT measured — the served facet is scalar. Say so.
    expect(sheet.flood.provenance.method).toBe("single-zone-from-scalar");
  });

  it("reads a multi-zone wire when one is served, ordered by share", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    (wire.tier2 as Record<string, unknown>).flood = {
      status: "in-sfha",
      floodZone: "AE",
      zones: [
        { zone: "AO", isSfha: true, areaShare: 0.3 },
        { zone: "AE", isSfha: true, areaShare: 0.7 },
      ],
    };
    const multi = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(multi).resolve(NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones.map((z) => z.zone)).toEqual(["AE", "AO"]);
    expect(sheet.flood.value.primaryZone).toBe("AE");
    // And the verdict names BOTH — a headline that hides the second zone is a
    // contract breach.
    expect(sheet.verdict).toContain("Zones AE and AO");
  });

  it("seals the verdict onto the sheet, composed once", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await makeResolver(stub).resolve(NODE_ID);
    expect(sheet.verdict).toContain("Inside the FEMA flood hazard area (Zone AE)");
    expect(sheet.verdict).toContain("zoned R-1");
    expect(sheet.sealedAt).toBe("2026-08-18T12:00:00.000Z");
    expect(sheet.resolverVersion).toBe("pe-fact-sheet-1");
  });

  it("treats a missing parcel as not-found and does not poison the cache", async () => {
    const stub = installFetchStub({ facetsStatus: 404 });
    const resolver = makeResolver(stub);
    await expect(resolver.resolve(NODE_ID)).rejects.toMatchObject({
      kind: "not-found",
    });
    // A second attempt must re-query rather than replay the failure.
    await expect(resolver.resolve(NODE_ID)).rejects.toMatchObject({
      kind: "not-found",
    });
    expect(stub.calls.filter((u) => u.includes("/facets"))).toHaveLength(2);
  });

  it("treats an upstream error as unresolved, never as an absence (I4)", async () => {
    const stub = installFetchStub({ facetsStatus: 400 });
    await expect(makeResolver(stub).resolve(NODE_ID)).rejects.toMatchObject({
      kind: "unresolved",
    });
  });
});
