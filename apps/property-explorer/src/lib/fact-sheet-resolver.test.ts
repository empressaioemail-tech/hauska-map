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
    floodHazardFact: {
      state: "present",
      floodZone: "AE",
      inSpecialFloodHazardArea: true,
      source: "flood-hazard-fact",
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

/** AMENDMENT 1: resolve() returns a union. Narrow to the sheet or fail loudly. */
async function sheetOf(
  resolver: PeFactSheetResolver,
  parcelNodeId: string,
) {
  const result = await resolver.resolve(parcelNodeId);
  if (result.kind !== "sheet") {
    throw new Error(`expected a sheet, got ${result.kind}`);
  }
  return result;
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
    const sheet = await sheetOf(resolver, NODE_ID);
    const byId = await resolver.bySheetId(sheet.factSheetId);
    expect(byId?.factSheetId).toBe(sheet.factSheetId);
    // The SAME sealed sheet, not a re-resolve.
    expect(byId).toBe(await resolver.bySheetId(sheet.factSheetId));
    expect(await resolver.bySheetId("fs_deadbeefdeadbeef")).toBeNull();
    // resolveSheet is the sheet-or-null convenience for callers with nothing
    // to render for an unplaceable parcel.
    expect((await resolver.resolveSheet(NODE_ID))?.factSheetId).toBe(
      sheet.factSheetId,
    );
  });

  it("centres on the parcel RING, not on the address (I5)", async () => {
    const stub = installFetchStub({ gisFeatures: [NEIGHBOUR_FEATURE, SUBJECT_FEATURE] });
    const resolver = makeResolver(stub);
    const sheet = await sheetOf(resolver, NODE_ID);
    expect(sheet.geometry.rings).toHaveLength(1);
    expect(sheet.geometry.centroid.lat).toBeCloseTo(SUBJECT_CENTRE.lat, 6);
    expect(sheet.geometry.centroid.lng).toBeCloseTo(SUBJECT_CENTRE.lng, 6);
    // Measured from the ring, not read off the CAD roll.
    expect(sheet.geometry.lotArea?.unit).toBe("sqft");
    expect(sheet.geometry.lotArea?.value).toBeGreaterThan(0);
    expect(sheet.geometry.lotArea?.value).not.toBe(10214);
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
    const sheet = await sheetOf(resolver, NODE_ID);
    expect(sheet.identity.situsAddress.state).toBe("absent-covered");
    expect(Number.isFinite(sheet.geometry.centroid.lat)).toBe(true);
    expect(sheet.geometry.centroid.lng).toBeCloseTo(SUBJECT_CENTRE.lng, 4);
    // No ring resolved: the sheet claims no boundary rather than inventing one.
    expect(sheet.geometry.rings).toHaveLength(0);
    // …and the lot area falls back to the CAD roll's own acreage.
    expect(sheet.geometry.lotArea?.value).toBe(10214);
  });

  it("always names the county (never 'not on file')", async () => {
    const wire = facetsWire();
    delete (wire.facets as Record<string, unknown>).countyName;
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.identity.county).toEqual({ fips: "48021", name: "Bastrop" });
  });

  it("carries provenance as a SIBLING of the value, never inside it (I3)", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
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
    const derived = await sheetOf(makeResolver(withEnvelope), NODE_ID);
    expect(derived.envelope.kind).toBe("derived");
    if (derived.envelope.kind !== "derived") throw new Error("unreachable");
    expect(derived.envelope.area.value).toBe(6325);
    // AMENDMENT 1: an axis carries its own governance, note and provenance.
    expect(derived.envelope.setbacksUsed.front.distance).toEqual({
      value: 25,
      unit: "ft",
    });
    // Tier-1 envelopes are shape-only: always approximate.
    expect(derived.envelope.approximate).toBe(true);

    vi.unstubAllGlobals();
    const declinedWire = facetsWire();
    (declinedWire.facets as Record<string, unknown>).envelope = {
      status: "declined",
      declineReason: "no-setback-table",
    };
    const declined = installFetchStub({ facets: declinedWire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(declined), NODE_ID);
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
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.envelope.kind).toBe("consumed");
  });

  it("widens the served scalar flood zone into a SET (I6)", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.flood.state).toBe("present");
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    // AMENDMENT 4.3: the share is NULL, not 1. The scalar upstream named a
    // zone; it never measured how much of the parcel lies in it, and deriving
    // 1 from set length would assert total containment nobody measured —
    // destroying exactly the AE-vs-AO information the operator corrected us on.
    expect(sheet.flood.value.zones).toEqual([
      { zone: "AE", subtype: null, isSfha: true, areaShare: null },
    ]);
    expect(sheet.flood.value.inSfha).toBe(true);
    // MEMBERSHIP still stands, and it is the only thing upstream actually said.
    expect(sheet.flood.value.primaryZone).toBe("AE");
    expect(sheet.flood.provenance.method).toBe("single-zone-from-scalar");
  });

  it("reads a multi-zone wire when one is served, ordered by share", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "AE",
      inSpecialFloodHazardArea: true,
      source: "flood-hazard-fact",
      zones: [
        { zone: "AO", isSfha: true, areaShare: 0.3 },
        { zone: "AE", isSfha: true, areaShare: 0.7 },
      ],
    };
    const multi = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(multi), NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones.map((z) => z.zone)).toEqual(["AE", "AO"]);
    expect(sheet.flood.value.primaryZone).toBe("AE");
    // And the verdict names BOTH — a headline that hides the second zone is a
    // contract breach.
    expect(sheet.verdict).toContain("Zones AE and AO");
  });

  it("seals the verdict onto the sheet, composed once", async () => {
    const stub = installFetchStub({ gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.verdict).toContain("Inside the FEMA flood hazard area (Zone AE)");
    expect(sheet.verdict).toContain("zoned R-1");
    expect(sheet.sealedAt).toBe("2026-08-18T12:00:00.000Z");
    expect(sheet.resolverVersion).toBe("pe-fact-sheet-2");
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

// ---------------------------------------------------------------------------
// AMENDMENT 1 (2026-08-18): atom DIDs, setback axes, and the unplaceable result.
// ---------------------------------------------------------------------------

describe("AMENDMENT 1 — Provenance.atomDids", () => {
  it("names the atoms behind each fact, and is EMPTY rather than absent", async () => {
    const wire = facetsWire();
    (wire.facets.envelope as Record<string, unknown>).provenanceRefs = {
      zoning: { atomDid: "did:atom:zoning-1" },
      setback: { atomDid: "did:atom:setback-1" },
      envelope: { atomDid: "did:atom:envelope-1" },
      codeSections: [{ atomDid: "did:atom:code-1", sectionNumber: "4.2.1" }],
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.zoning.state !== "present") throw new Error("unreachable");
    if (sheet.setbacks.state !== "present") throw new Error("unreachable");
    if (sheet.envelope.kind !== "derived") throw new Error("unreachable");
    // AMENDMENT 2: each ref carries its display LABEL. A code section keeps its
    // section number, which is exactly what the shipped chip renders.
    expect(sheet.zoning.provenance.atomDids).toEqual([
      { did: "did:atom:zoning-1", label: null },
    ]);
    expect(sheet.setbacks.provenance.atomDids).toEqual([
      { did: "did:atom:setback-1", label: null },
      { did: "did:atom:code-1", label: "4.2.1" },
    ]);
    expect(sheet.envelope.provenance.atomDids).toEqual([
      { did: "did:atom:envelope-1", label: null },
      { did: "did:atom:code-1", label: "4.2.1" },
    ]);
    // An empty list means NO atom backs the fact. It never means unknown.
    expect(sheet.landUse.state).toBe("present");
    if (sheet.landUse.state !== "present") throw new Error("unreachable");
    expect(sheet.landUse.provenance.atomDids).toEqual([]);
  });
});

describe("AMENDMENT 1 — SetbackAxis", () => {
  it("carries the governing rule and the X-ray note per axis", async () => {
    const wire = facetsWire();
    (wire.facets.envelope as Record<string, unknown>).setbacks = {
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
      side_corner_ft: 15,
      fieldNotes: { front: "Measured from the right-of-way line." },
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.setbacks.state !== "present") throw new Error("unreachable");
    expect(sheet.setbacks.value.front.note).toBe(
      "Measured from the right-of-way line.",
    );
    expect(sheet.setbacks.value.cornerSide?.distance?.value).toBe(15);
    expect(sheet.setbacks.value.rear.provenance.source).toBe("setback-table");
  });

  it("carries a NOT-SPECIFIED axis as NULL, never as 0 and never as a sentinel", async () => {
    // The B3 / Elgin case: no scalar on the axis, but a governing rule that
    // routes the reader to the answer. Rendering that as 0 ft is the defect the
    // not-specified treatment exists to prevent.
    const wire = facetsWire();
    (wire.facets.envelope as Record<string, unknown>).setbacks = {
      front_ft: 0,
      side_ft: 5,
      rear_ft: 10,
      not_specified: { front: true },
      governedBy: {
        front: { section_number: "4.2.1", district: "C-1" },
      },
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.setbacks.state !== "present") throw new Error("unreachable");
    const front = sheet.setbacks.value.front;
    // AMENDMENT 2: the absence lives in the TYPE. The wire carried front_ft: 0
    // beside not_specified.front, and 0 is exactly what must NOT survive.
    expect(front.distance).toBeNull();
    expect(front.governedBy).toBe("C-1 governs (§4.2.1)");
    // A specified axis is unaffected.
    expect(sheet.setbacks.value.side.distance?.value).toBe(5);
  });
});

describe("AMENDMENT 1 — UnplaceableParcel", () => {
  function unplaceableWire() {
    const wire = facetsWire();
    // No baked envelope polygon and no situs address: nothing can seed a
    // location, and the ring probe therefore never runs.
    (wire.facets.baseFacts as Record<string, unknown>).situsAddress = null;
    (wire.facets as Record<string, unknown>).envelope = {
      status: "declined",
      declineReason: "no-setback-table",
    };
    return wire;
  }

  it("returns a RESULT, never a throw and never a vanished parcel", async () => {
    const stub = installFetchStub({
      facets: unplaceableWire(),
      gisFeatures: [],
      geocodeHit: null,
    });
    const result = await makeResolver(stub).resolve(NODE_ID);
    expect(result.kind).toBe("unplaceable");
    if (result.kind !== "unplaceable") throw new Error("unreachable");
    expect(result.parcelNodeId).toBe(NODE_ID);
    // It carries the record we DO hold …
    expect(result.identity.county).toEqual({ fips: "48021", name: "Bastrop" });
    expect(result.identity.parcelNodeId).toBe(NODE_ID);
    // … a customer-readable reason …
    expect(result.reason).toContain("cannot be placed on the map");
    // … and what would fix it. An absence that cannot say that is just empty.
    expect(result.wouldBeFilledBy).toContain("Bastrop County");
  });

  it("never silently becomes a sheet", async () => {
    const stub = installFetchStub({
      facets: unplaceableWire(),
      gisFeatures: [],
      geocodeHit: null,
    });
    const resolver = makeResolver(stub);
    expect(await resolver.resolveSheet(NODE_ID)).toBeNull();
    // And nothing was sealed under a sheet id.
    const result = await resolver.resolve(NODE_ID);
    expect("factSheetId" in result).toBe(false);
  });

  it("still resolves a sheet when only the ADDRESS can seed a centre", async () => {
    // The demoted last resort: no geometry anywhere, but the address geocodes.
    // This is what keeps the unplaceable state rare rather than routine.
    const stub = installFetchStub({
      facets: (() => {
        const wire = facetsWire();
        (wire.facets as Record<string, unknown>).envelope = {
          status: "declined",
          declineReason: "no-setback-table",
        };
        return wire;
      })(),
      gisFeatures: [],
    });
    const result = await makeResolver(stub).resolve(NODE_ID);
    expect(result.kind).toBe("sheet");
  });
});

// ---------------------------------------------------------------------------
// AMENDMENT 3 (2026-08-18): the sentinel class, closed.
// ---------------------------------------------------------------------------

describe("AMENDMENT 3 - no sentinel stands in for absence", () => {
  it("carries an unmeasurable lot area as NULL, not as a non-finite number", async () => {
    // No ring resolves and the CAD roll carries no acreage, but the address
    // still seeds a centre, so the parcel IS placeable with no known lot area.
    const wire = facetsWire();
    delete (wire.facets.baseFacts as Record<string, unknown>).acreage;
    (wire.facets as Record<string, unknown>).envelope = {
      status: "declined",
      declineReason: "no-setback-table",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.geometry.lotArea).toBeNull();
    // Placeable all the same: geometry is required, lot area is not.
    expect(Number.isFinite(sheet.geometry.centroid.lat)).toBe(true);
  });

  it("never builds a DERIVED envelope around a non-finite area", async () => {
    // The A3.2 sweep found this: a payload serving a POLYGON but no area
    // number, with no lot area to convert a percentage against, used to build a
    // `derived` variant whose area was Number.NaN — a sentinel inside the one
    // place the contract says absence is already modelled by the union.
    const wire = facetsWire();
    delete (wire.facets.baseFacts as Record<string, unknown>).acreage;
    const env = wire.facets.envelope as Record<string, unknown>;
    delete env.buildableAreaSqFt;
    delete env.buildableAreaPct;
    const stub = installFetchStub({ facets: wire, gisFeatures: [] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.envelope.kind).toBe("derived");
    if (sheet.envelope.kind !== "derived") throw new Error("unreachable");
    // The polygon IS an area, so it is MEASURED rather than invented.
    expect(Number.isFinite(sheet.envelope.area.value)).toBe(true);
    expect(sheet.envelope.area.value).toBeGreaterThan(0);
  });

  it("is honestly NOT-DERIVED when nothing yields a real area", async () => {
    const wire = facetsWire();
    const env = wire.facets.envelope as Record<string, unknown>;
    delete env.buildableAreaSqFt;
    delete env.buildableAreaPct;
    delete env.geojson;
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.envelope.kind).toBe("not-derived");
    if (sheet.envelope.kind !== "not-derived") throw new Error("unreachable");
    expect(sheet.envelope.missing).toContain("envelope-area");
  });

  it("never presents an UNSERVED flood share as a measured one", async () => {
    // The other thing the sweep caught: FloodZoneShare.areaShare is a bare
    // number, so an unserved share was being written as 0 - which says none of
    // the parcel is in a zone the same record lists.
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "AO",
      inSpecialFloodHazardArea: true,
      source: "flood-hazard-fact",
      zones: [{ zone: "AE", isSfha: true }, { zone: "AO", isSfha: true }],
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    // AMENDMENT 4: the share is NULL, never a fabricated 0. A fake zero is
    // worse than an absence because it is arithmetically usable — it can be
    // summed, charted or thresholded on, and nothing will look wrong.
    expect(sheet.flood.value.zones.map((z) => z.areaShare)).toEqual([null, null]);
    // Wire order is preserved rather than sorted by a fabricated ranking …
    expect(sheet.flood.value.zones.map((z) => z.zone)).toEqual(["AE", "AO"]);
    // … the upstream's own declared zone stays primary, since an unranked list
    // has no largest …
    expect(sheet.flood.value.primaryZone).toBe("AO");
    // … and the provenance says the shares were not served.
    expect(sheet.flood.provenance.method).toBe("zone-set-without-shares");
    // Both zones still travel, so no surface can hide the second one (I6).
    expect(sheet.verdict).toContain("Zones AE and AO");
  });

  it("ranks by share, and says so, when shares ARE served", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "AO",
      inSpecialFloodHazardArea: true,
      source: "flood-hazard-fact",
      zones: [
        { zone: "AO", isSfha: true, areaShare: 0.3 },
        { zone: "AE", isSfha: true, areaShare: 0.7 },
      ],
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones.map((z) => z.zone)).toEqual(["AE", "AO"]);
    expect(sheet.flood.value.zones.map((z) => z.areaShare)).toEqual([0.7, 0.3]);
    expect(sheet.flood.value.primaryZone).toBe("AE");
    expect(sheet.flood.provenance.method).toBe("zone-set-with-shares");
  });
});

describe("AMENDMENT 4 - the last sentinel", () => {
  it("carries a NULL percentage when there is no lot area to compute one against", async () => {
    // A known buildable AREA with no known LOT area. The area is the fact the
    // customer came for; the percentage is derived convenience and simply has
    // no value here.
    const wire = facetsWire();
    delete (wire.facets.baseFacts as Record<string, unknown>).acreage;
    const env = wire.facets.envelope as Record<string, unknown>;
    delete env.buildableAreaPct;
    const stub = installFetchStub({ facets: wire, gisFeatures: [] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.geometry.lotArea).toBeNull();
    if (sheet.envelope.kind !== "derived") throw new Error("unreachable");
    expect(sheet.envelope.areaPctOfLot).toBeNull();
    // The AREA survives, non-null and real.
    expect(sheet.envelope.area.value).toBe(6325);
    // And the headline omits the share rather than printing one it lacks.
    expect(sheet.verdict).toContain("buildable (approximate)");
    expect(sheet.verdict).not.toMatch(/% of the lot/);
  });

  it("still computes the percentage when a lot area IS known", async () => {
    const stub = installFetchStub({ facets: facetsWire(), gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.envelope.kind !== "derived") throw new Error("unreachable");
    expect(sheet.envelope.areaPctOfLot).toBe(58);
  });
});

describe("AMENDMENT 4.3 - a set of length one does not imply a share of one", () => {
  it("gives an outside-SFHA determination a NULL share too", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "X",
      inSpecialFloodHazardArea: false,
      source: "flood-hazard-fact",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones).toEqual([
      { zone: "X", subtype: null, isSfha: false, areaShare: null },
    ]);
    expect(sheet.flood.value.inSfha).toBe(false);
    // The verdict still reads off MEMBERSHIP, which is what was determined.
    expect(sheet.verdict).toContain("outside mapped flood hazard");
  });

  it("KEEPS a share of 1 when upstream actually measured one", async () => {
    // This is the whole distinction: a real zone set of length one carrying a
    // SERVED share is a measurement, and 1 is then correct.
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "AE",
      inSpecialFloodHazardArea: true,
      source: "flood-hazard-fact",
      zones: [{ zone: "AE", isSfha: true, areaShare: 1 }],
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.zones[0].areaShare).toBe(1);
    expect(sheet.flood.provenance.method).toBe("zone-set-with-shares");
  });

  it("never derives a share from set length on any path", async () => {
    // The cheap regression guard: no unserved share anywhere becomes a number.
    for (const floodHazardFact of [
      {
        state: "present",
        floodZone: "AO",
        inSpecialFloodHazardArea: true,
        source: "flood-hazard-fact",
      },
      {
        state: "present",
        floodZone: "X500",
        inSpecialFloodHazardArea: false,
        source: "flood-hazard-fact",
      },
      {
        state: "present",
        floodZone: "X",
        inSpecialFloodHazardArea: false,
        source: "flood-hazard-fact",
      },
      {
        state: "present",
        floodZone: "AE",
        inSpecialFloodHazardArea: true,
        source: "flood-hazard-fact",
        zones: [{ zone: "AE", isSfha: true }],
      },
    ]) {
      const wire = facetsWire() as unknown as Record<string, unknown>;
      wire.floodHazardFact = floodHazardFact;
      const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
      const sheet = await sheetOf(makeResolver(stub), NODE_ID);
      if (sheet.flood.state !== "present") throw new Error("unreachable");
      for (const zone of sheet.flood.value.zones) {
        expect(zone.areaShare).toBeNull();
      }
    }
  });
});

describe("floodHazardFact only (WDLL 3 / SS-W16)", () => {
  it("does not copy tier2.flood — even a full in-SFHA snapshot stays off sheet.flood", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    delete wire.floodHazardFact;
    (wire.tier2 as Record<string, unknown>).flood = {
      status: "in-sfha",
      floodZone: "AE",
      zoneSubtype: "FLOODWAY",
      baseFloodElevationFt: 512.4,
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.flood.state).toBe("absent-uncovered");
    if (sheet.flood.state !== "absent-uncovered") throw new Error("unreachable");
    expect(sheet.flood.reason).toBe(
      "floodHazardFact was not on the inspect payload",
    );
    expect(JSON.stringify(sheet.flood)).not.toMatch(/FLOODWAY/);
    expect(JSON.stringify(sheet.flood)).not.toMatch(/512\.4/);
  });

  it("gold 48021 present Zone X from floodHazardFact", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "present",
      floodZone: "X",
      inSpecialFloodHazardArea: false,
      source: "flood-hazard-fact",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.flood.state).toBe("present");
    if (sheet.flood.state !== "present") throw new Error("unreachable");
    expect(sheet.flood.value.primaryZone).toBe("X");
    expect(sheet.flood.value.inSfha).toBe(false);
  });

  it("named refusals are unresolved, never a silent null", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.floodHazardFact = {
      state: "refused",
      code: "atom-miss",
      source: "flood-hazard-fact",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.flood.state).toBe("unresolved");
    if (sheet.flood.state !== "unresolved") throw new Error("unreachable");
    expect(sheet.flood.reason).toBe("atom-miss");
  });
});

describe("landUseFact only (WDLL 5 leftover)", () => {
  it("gold 48021 present landUseCode A1 from landUseFact with source=land-use-fact", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    (wire.facets as { baseFacts: { landUse: { code: string } } }).baseFacts.landUse = {
      code: "CADROLL",
      description: "baked only",
      source: "cad-roll",
    } as { code: string; description: string; source: string };
    wire.landUseFact = {
      state: "present",
      source: "land-use-fact",
      landUseCode: "A1",
      landUseLabel: "Single-family residential",
      taxYear: 2025,
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.landUse.state).toBe("present");
    if (sheet.landUse.state !== "present") throw new Error("unreachable");
    expect(sheet.landUse.value.code).toBe("A1");
    expect(sheet.landUse.value.description).toBe("Single-family residential");
    expect(sheet.landUse.provenance.source).toBe("land-use-fact");
    expect(sheet.landUse.provenance.source).not.toBe("cad-roll");
    expect(sheet.landUse.value.code).not.toBe("CADROLL");
  });

  it("cad-roll-only bake without landUseFact does not claim the atom (retiredStore)", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    delete wire.landUseFact;
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.landUse.state).toBe("present");
    if (sheet.landUse.state !== "present") throw new Error("unreachable");
    expect(sheet.landUse.value.code).toBe("A1");
    expect(sheet.landUse.provenance.source).toBe("cad-roll");
    expect(sheet.landUse.provenance.source).not.toBe("land-use-fact");
  });

  it("landUseFact that still cites cad-roll does not get relabelled as the atom", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.landUseFact = {
      state: "present",
      source: "cad-roll",
      landUseCode: "A1",
      landUseLabel: "Single-family residential",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.landUse.state).toBe("present");
    if (sheet.landUse.state !== "present") throw new Error("unreachable");
    expect(sheet.landUse.provenance.source).toBe("cad-roll");
    expect(sheet.landUse.provenance.source).not.toBe("land-use-fact");
  });

  it("named refusals are unresolved, never a silent cad-roll swap", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.landUseFact = {
      state: "refused",
      code: "atom-miss",
      source: "land-use-fact",
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.landUse.state).toBe("unresolved");
    if (sheet.landUse.state !== "unresolved") throw new Error("unreachable");
    expect(sheet.landUse.reason).toBe("atom-miss");
    expect(JSON.stringify(sheet.landUse)).not.toMatch(/cad-roll/);
  });

  it("typed absence stays visible and does not fall back to cad-roll", async () => {
    const wire = facetsWire() as unknown as Record<string, unknown>;
    wire.landUseFact = {
      state: "absent",
      source: "land-use-fact",
      absence: { kind: "no-land-use", reason: "no land-use-fact body on this parcel" },
    };
    const stub = installFetchStub({ facets: wire, gisFeatures: [SUBJECT_FEATURE] });
    const sheet = await sheetOf(makeResolver(stub), NODE_ID);
    expect(sheet.landUse.state).toBe("absent-covered");
    if (sheet.landUse.state !== "absent-covered") throw new Error("unreachable");
    expect(sheet.landUse.reason).toMatch(/no land-use-fact body/);
    expect(sheet.landUse.provenance.source).toBe("land-use-fact");
  });
});
