import { describe, expect, it } from "vitest";

import {
  roadOverlaysFromAttachingRoads,
  ROAD_CENTERLINE_LAYER_KEY,
  ROAD_ROW_BAND_LAYER_KEY,
  ROAD_EDGE_LAYER_KEY,
  ROAD_BAND_GREY,
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

function interpStops(expr: unknown): { zooms: number[]; values: number[] } {
  // ["interpolate", ["linear"], ["zoom"], z0, v0, z1, v1, ...]
  if (!Array.isArray(expr) || expr[0] !== "interpolate") {
    return { zooms: [], values: [] };
  }
  const zooms: number[] = [];
  const values: number[] = [];
  for (let i = 3; i < expr.length; i += 2) {
    if (typeof expr[i] === "number" && typeof expr[i + 1] === "number") {
      zooms.push(expr[i] as number);
      values.push(expr[i + 1] as number);
    }
  }
  return { zooms, values };
}

function valueAtZoom(expr: unknown, zoom: number): number | null {
  const { zooms, values } = interpStops(expr);
  const idx = zooms.indexOf(zoom);
  return idx >= 0 ? values[idx]! : null;
}

describe("roadOverlaysFromAttachingRoads (hairline→band)", () => {
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

  it("emits only the ROW band beneath parcels (no edge/centerline wireframe)", () => {
    const specs = roadOverlaysFromAttachingRoads(sample);

    expect(specs.map((s) => s.layerKey)).toEqual([ROAD_ROW_BAND_LAYER_KEY]);
    expect(specs.every((s) => s.beforeId === ROAD_BEFORE_PARCEL_FILL_ID)).toBe(
      true,
    );
    expect(specs.find((s) => s.layerKey === ROAD_EDGE_LAYER_KEY)).toBeUndefined();
    expect(
      specs.find((s) => s.layerKey === ROAD_CENTERLINE_LAYER_KEY),
    ).toBeUndefined();

    const band = specs.find((s) => s.layerKey === ROAD_ROW_BAND_LAYER_KEY)!;
    expect(band.paint!["line-color"]).toBe(ROAD_BAND_GREY);
    expect(band.paint!["line-color"]).not.toBe("#1a5f9e");
    expect(isZoomInterp(band.paint!["line-width"])).toBe(true);
    expect(isZoomInterp(band.paint!["line-opacity"])).toBe(true);
    expect(isZoomInterp(band.paint!["line-blur"])).toBe(true);

    // Overview = hairline; close = soft band. Opacity stays modest vs chalk.
    expect(valueAtZoom(band.paint!["line-width"], 12)).toBeLessThanOrEqual(2);
    expect(valueAtZoom(band.paint!["line-width"], 16)!).toBeGreaterThan(8);
    expect(valueAtZoom(band.paint!["line-opacity"], 12)!).toBeLessThanOrEqual(
      0.15,
    );
    expect(
      Math.max(...interpStops(band.paint!["line-opacity"]).values),
    ).toBeLessThanOrEqual(0.35);
    expect(
      Math.max(...interpStops(band.paint!["line-blur"]).values),
    ).toBeLessThanOrEqual(2);
  });

  it("still emits band when left/right edges are absent", () => {
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
    expect(specs.map((s) => s.layerKey)).toEqual([ROAD_ROW_BAND_LAYER_KEY]);
  });

  it("returns empty overlays when no road-node attaches (honest absence)", () => {
    expect(roadOverlaysFromAttachingRoads([])).toEqual([]);
  });
});
