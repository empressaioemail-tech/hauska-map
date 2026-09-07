import { describe, expect, it, vi } from "vitest";
import {
  augmentFacetsWithLiveEnvelope,
  facetsNeedLiveEnvelopeDerive,
} from "./live-envelope-augment";
import type { BakedFacetPayload } from "./baked-facets";

const GEO_ABSENT: BakedFacetPayload = {
  envelope: {
    status: "ok",
    district: "GC",
    setbacks: { front_ft: 20, side_ft: 5, rear_ft: 20 },
    disclosure:
      "Atom-chain setback scalars from live per-parcel record (layer-23); geometry absent on depth-warm proof atom — re-derive from live setbacks.",
    approximate: true,
  },
};

describe("facetsNeedLiveEnvelopeDerive", () => {
  it("true when setbacks present and geojson absent", () => {
    expect(facetsNeedLiveEnvelopeDerive(GEO_ABSENT)).toBe(true);
  });

  it("false when geojson already present", () => {
    expect(
      facetsNeedLiveEnvelopeDerive({
        envelope: {
          ...GEO_ABSENT.envelope!,
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
        },
      }),
    ).toBe(true);
  });
});

describe("augmentFacetsWithLiveEnvelope", () => {
  it("merges live POST geometry when geojson still absent", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        payload: {
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { buildableAreaSqFt: 4200 },
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
        },
      }),
    })) as unknown as typeof fetch;

    const out = await augmentFacetsWithLiveEnvelope(
      GEO_ABSENT,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
    );
    expect(out.envelope?.geojson).toBeTruthy();
    expect(out.envelope?.buildableAreaSqFt).toBe(4200);
  });

  it("rejects live geometry when parcelNodeId does not match expected", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        payload: {
          parcel: { parcel_node_id: "48021:99999" },
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { buildableAreaSqFt: 4200 },
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
        },
      }),
    })) as unknown as typeof fetch;

    const out = await augmentFacetsWithLiveEnvelope(
      GEO_ABSENT,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
      "48021:47595",
    );
    expect(out.envelope?.geojson).toBeUndefined();
  });

  it("degrades honestly when live POST throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const out = await augmentFacetsWithLiveEnvelope(
      GEO_ABSENT,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
      "48021:47595",
    );
    expect(out).toBe(GEO_ABSENT);
    expect(out.envelope?.geojson).toBeUndefined();
  });

  it("seals no-buildable-area when live derive returns consumed lot", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "no-buildable-area",
        payload: {
          empty: true,
          parcel: { parcel_node_id: "48453:280239" },
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { emptyReason: "Setbacks consume the lot." },
                geometry: null,
              },
            ],
          },
        },
      }),
    })) as unknown as typeof fetch;

    const out = await augmentFacetsWithLiveEnvelope(
      GEO_ABSENT,
      "101 Example St, Austin TX",
      "/api/spine/cortex/api",
      fetchImpl,
      "48453:280239",
    );
    expect(out.envelope?.status).toBe("no-buildable-area");
    expect(out.envelope?.geojson).toBeUndefined();
    expect(out.envelope?.emptyReason).toContain("consume");
  });
});

// Boundary-envelope atom program item 2's PE-side counterpart: when the bake
// already carries a real atom-derived buildableAreaSqFt, it must not be
// silently overridden by live-derive's own independently-recomputed number.
describe("augmentFacetsWithLiveEnvelope — atom-area reconciliation", () => {
  // Real figure from the pilot's live verification of 48021:105032 (a real
  // Elgin R-2 parcel) — buildableEnvelope.outcome = {kind:"buildable", areaSqFt:9160}.
  const ATOM_BUILDABLE: BakedFacetPayload = {
    envelope: {
      ...GEO_ABSENT.envelope!,
      buildableAreaSqFt: 9160,
      buildableAreaPct: 62.4,
    },
  };

  function liveGeometryResponse(buildableAreaSqFt: number) {
    return vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        payload: {
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { buildableAreaSqFt },
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
        },
      }),
    })) as unknown as typeof fetch;
  }

  it("atom's reported area wins when live-derive disagrees (positive)", async () => {
    const fetchImpl = liveGeometryResponse(8000);
    const out = await augmentFacetsWithLiveEnvelope(
      ATOM_BUILDABLE,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
    );
    expect(out.envelope?.buildableAreaSqFt).toBe(9160);
    expect(out.envelope?.buildableAreaPct).toBe(62.4);
    expect(out.envelope?.geojson).toBeTruthy();
    expect(out.envelope?.disclosure).toContain("property atom chain");
  });

  it("keeps live-derive's own result when it already agrees with the atom (falsifier: no gratuitous override)", async () => {
    const fetchImpl = liveGeometryResponse(9160);
    const out = await augmentFacetsWithLiveEnvelope(
      ATOM_BUILDABLE,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
    );
    expect(out.envelope?.buildableAreaSqFt).toBe(9160);
    expect(out.envelope?.disclosure).not.toContain("property atom chain");
    expect(out.envelope?.disclosure).toContain("live derive");
  });

  it("atom's reported area wins when live-derive finds no buildable area at all", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "no-buildable-area",
        payload: {
          empty: true,
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { emptyReason: "Setbacks consume the lot." },
                geometry: null,
              },
            ],
          },
        },
      }),
    })) as unknown as typeof fetch;

    const out = await augmentFacetsWithLiveEnvelope(
      ATOM_BUILDABLE,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
    );
    expect(out.envelope?.status).toBe("ok");
    expect(out.envelope?.buildableAreaSqFt).toBe(9160);
    expect(out.envelope?.geojson).toBeUndefined();
    expect(out.envelope?.disclosure).toContain("property atom chain");
  });

  it("regression: no atom area to reconcile against still lets live-derive's number stand (GEO_ABSENT cohort)", async () => {
    const fetchImpl = liveGeometryResponse(4200);
    const out = await augmentFacetsWithLiveEnvelope(
      GEO_ABSENT,
      "1010 PECAN ST, BASTROP, TX 78602",
      "/api/spine/cortex/api",
      fetchImpl,
    );
    expect(out.envelope?.buildableAreaSqFt).toBe(4200);
    expect(out.envelope?.disclosure).not.toContain("property atom chain");
  });
});
