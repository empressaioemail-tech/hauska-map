import { describe, expect, it } from "vitest";

import {
  roadOverlaysFromAttachingRoads,
  ROAD_CENTERLINE_LAYER_KEY,
  ROAD_ROW_BAND_LAYER_KEY,
  ROAD_EDGE_LAYER_KEY,
  ROAD_BAND_GREY,
  ROAD_EDGE_GREY,
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

function blurStops(expr: unknown): number[] {
  // ["interpolate", ["linear"], ["zoom"], z0, b0, z1, b1, ...]
  if (!Array.isArray(expr) || expr[0] !== "interpolate") return [];
  const stops: number[] = [];
  for (let i = 4; i < expr.length; i += 2) {
    if (typeof expr[i] === "number") stops.push(expr[i] as number);
  }
  return stops;
}

describe("roadOverlaysFromAttachingRoads (defined corridor)", () => {
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

  it("emits ROW band + crisp edges + centerline beneath parcels", () => {
    const specs = roadOverlaysFromAttachingRoads(sample);

    expect(specs.map((s) => s.layerKey)).toEqual([
      ROAD_ROW_BAND_LAYER_KEY,
      ROAD_EDGE_LAYER_KEY,
      ROAD_CENTERLINE_LAYER_KEY,
    ]);
    expect(specs.every((s) => s.beforeId === ROAD_BEFORE_PARCEL_FILL_ID)).toBe(
      true,
    );

    const band = specs.find((s) => s.layerKey === ROAD_ROW_BAND_LAYER_KEY)!;
    const edges = specs.find((s) => s.layerKey === ROAD_EDGE_LAYER_KEY)!;
    const center = specs.find((s) => s.layerKey === ROAD_CENTERLINE_LAYER_KEY)!;

    expect(band.paint!["line-color"]).toBe(ROAD_BAND_GREY);
    expect(edges.paint!["line-color"]).toBe(ROAD_EDGE_GREY);
    expect(center.paint!["line-color"]).toBe(ROAD_EDGE_GREY);
    expect(band.paint!["line-color"]).not.toBe("#1a5f9e");

    // Band keeps a light feather; edges stay crisp (blur 0).
    expect(isZoomInterp(band.paint!["line-blur"])).toBe(true);
    expect(Math.max(...blurStops(band.paint!["line-blur"]))).toBeLessThanOrEqual(2);
    expect(edges.paint!["line-blur"]).toBe(0);

    const edgeFc = edges.geojson as {
      features: Array<{ properties?: { role?: string } }>;
    };
    expect(edgeFc.features).toHaveLength(2);
    expect(edgeFc.features.map((f) => f.properties?.role).sort()).toEqual([
      "leftEdge",
      "rightEdge",
    ]);
  });

  it("omits edge layer when left/right edges are absent (band + centerline only)", () => {
    const noEdges = [
      {
        ...sample[0],
        row: {
          assumedWidthFt: 50,
          provenance: { kind: "approximate-assumed-per-class" },
        },
      },
    ];
    const specs = roadOverlaysFromAttachingRoads(noEdges);
    expect(specs.map((s) => s.layerKey)).toEqual([
      ROAD_ROW_BAND_LAYER_KEY,
      ROAD_CENTERLINE_LAYER_KEY,
    ]);
  });

  it("returns empty overlays when no road-node attaches (honest absence)", () => {
    expect(roadOverlaysFromAttachingRoads([])).toEqual([]);
  });
});
