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
});
