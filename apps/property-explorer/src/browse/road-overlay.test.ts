import { describe, expect, it } from "vitest";

import {
  roadOverlaysFromAttachingRoads,
  ROAD_CENTERLINE_LAYER_KEY,
  ROAD_ROW_BAND_LAYER_KEY,
  ROAD_GREY,
  ROAD_BEFORE_PARCEL_FILL_ID,
} from "./road-overlay";

function isZoomInterp(expr: unknown): boolean {
  return (
    Array.isArray(expr) &&
    expr[0] === "interpolate" &&
    Array.isArray(expr[1]) &&
    expr[1][0] === "linear" &&
    Array.isArray(expr[2]) &&
    expr[2][0] === "zoom"
  );
}

describe("roadOverlaysFromAttachingRoads (QA1 feathered grey)", () => {
  const sample = [
    {
      roadNodeId: "48021:road:123",
      displayName: "Chestnut St",
      centerline: {
        type: "LineString",
        coordinates: [
          [-97.3153, 30.1101],
          [-97.3153, 30.1105],
        ] as Array<[number, number]>,
      },
      row: {
        assumedWidthFt: 50,
        provenance: { kind: "approximate-assumed-per-class" },
        leftEdge: {
          coordinates: [
            [-97.31535, 30.1101],
            [-97.31535, 30.1105],
          ] as Array<[number, number]>,
        },
        rightEdge: {
          coordinates: [
            [-97.31525, 30.1101],
            [-97.31525, 30.1105],
          ] as Array<[number, number]>,
        },
      },
      sourceCitation: "OpenStreetMap way/123",
    },
  ];

  it("emits feathered grey ROW band + faint centerline (no hard edge strokes)", () => {
    const specs = roadOverlaysFromAttachingRoads(sample);

    expect(specs.map((s) => s.layerKey)).toEqual([
      ROAD_ROW_BAND_LAYER_KEY,
      ROAD_CENTERLINE_LAYER_KEY,
    ]);
    expect(specs.every((s) => s.beforeId === ROAD_BEFORE_PARCEL_FILL_ID)).toBe(
      true,
    );

    const band = specs.find((s) => s.layerKey === ROAD_ROW_BAND_LAYER_KEY)!;
    const center = specs.find((s) => s.layerKey === ROAD_CENTERLINE_LAYER_KEY)!;
    const bandFc = band.geojson as {
      features: Array<{ properties?: Record<string, unknown> }>;
    };
    const centerFc = center.geojson as {
      features: Array<{ properties?: Record<string, unknown> }>;
    };
    expect(bandFc.features).toHaveLength(1);
    expect(centerFc.features).toHaveLength(1);
    expect(centerFc.features[0]!.properties?.name).toBe("Chestnut St");
    expect(centerFc.features[0]!.properties?.rowProvenanceKind).toBe(
      "approximate-assumed-per-class",
    );

    // Grey, not the retired blue bands.
    expect(band.paint!["line-color"]).toBe(ROAD_GREY);
    expect(center.paint!["line-color"]).toBe(ROAD_GREY);
    expect(band.paint!["line-color"]).not.toBe("#1a5f9e");
    expect(band.paint!["line-color"]).not.toBe("#3b82b0");

    // Safe feather + zoom scale.
    expect(band.paint!["line-blur"]).toBeDefined();
    expect(isZoomInterp(band.paint!["line-blur"])).toBe(true);
    expect(isZoomInterp(band.paint!["line-width"])).toBe(true);
    expect(isZoomInterp(band.paint!["line-opacity"])).toBe(true);
    expect(isZoomInterp(center.paint!["line-width"])).toBe(true);
  });

  it("does not paint leftEdge/rightEdge as visible stroke layers", () => {
    const specs = roadOverlaysFromAttachingRoads(sample);
    expect(specs.some((s) => s.layerKind === "road-node-row-edges")).toBe(
      false,
    );
    for (const spec of specs) {
      const fc = spec.geojson as {
        features: Array<{ properties?: { role?: string } }>;
      };
      for (const f of fc.features) {
        expect(f.properties?.role).not.toMatch(/Edge$/);
      }
    }
  });

  it("returns empty overlays when no road-node attaches (honest absence)", () => {
    expect(roadOverlaysFromAttachingRoads([])).toEqual([]);
  });
});
