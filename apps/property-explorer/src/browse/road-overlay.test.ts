import { describe, expect, it } from "vitest";

import {
  roadOverlaysFromAttachingRoads,
  roadIsPedestrianWay,
  ROAD_CENTERLINE_LAYER_KEY,
  ROAD_ROW_BAND_LAYER_KEY,
  ROAD_EDGE_LAYER_KEY,
  ROAD_PEDESTRIAN_LAYER_KEY,
  ROAD_BAND_GREY,
  ROAD_PEDESTRIAN_COLOR,
  ROAD_BEFORE_PARCEL_FILL_ID,
  PEDESTRIAN_OSM_HIGHWAY_TAGS,
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

const street = {
  roadNodeId: "48021:road:123",
  displayName: "Chestnut St",
  isPedestrianWay: false,
  centerline: {
    type: "LineString",
    coordinates: [
      [-97.3153, 30.1101],
      [-97.3153, 30.1105],
    ] as Array<[number, number]>,
  },
  row: {
    assumedWidthFt: 50,
    provenance: {
      kind: "approximate-assumed-per-class",
      osmHighwayTag: "residential",
    },
  },
  sourceCitation: "OpenStreetMap way/123",
};

const footway = {
  roadNodeId: "48021:road:999",
  displayName: "Sidewalk",
  isPedestrianWay: true,
  centerline: {
    type: "LineString",
    coordinates: [
      [-97.3154, 30.1101],
      [-97.3154, 30.1105],
    ] as Array<[number, number]>,
  },
  row: {
    assumedWidthFt: 8,
    provenance: {
      kind: "approximate-assumed-per-class",
      osmHighwayTag: "footway",
    },
  },
};

describe("roadOverlaysFromAttachingRoads (street vs pedestrian)", () => {
  it("puts streets on the grey band and pedestrians on a distinct delicate layer", () => {
    const specs = roadOverlaysFromAttachingRoads([street, footway], {
      pedestrianVisible: true,
    });
    expect(specs.map((s) => s.layerKey)).toEqual([
      ROAD_ROW_BAND_LAYER_KEY,
      ROAD_PEDESTRIAN_LAYER_KEY,
    ]);
    expect(specs.find((s) => s.layerKey === ROAD_EDGE_LAYER_KEY)).toBeUndefined();
    expect(
      specs.find((s) => s.layerKey === ROAD_CENTERLINE_LAYER_KEY),
    ).toBeUndefined();

    const band = specs.find((s) => s.layerKey === ROAD_ROW_BAND_LAYER_KEY)!;
    const ped = specs.find((s) => s.layerKey === ROAD_PEDESTRIAN_LAYER_KEY)!;
    expect(band.paint!["line-color"]).toBe(ROAD_BAND_GREY);
    expect(ped.paint!["line-color"]).toBe(ROAD_PEDESTRIAN_COLOR);
    expect(ped.paint!["line-color"]).not.toBe(ROAD_BAND_GREY);
    expect(band.visible).toBe(true);
    expect(ped.visible).toBe(true);

    const bandFc = band.geojson as { features: unknown[] };
    const pedFc = ped.geojson as { features: unknown[] };
    expect(bandFc.features).toHaveLength(1);
    expect(pedFc.features).toHaveLength(1);

    expect(valueAtZoom(band.paint!["line-width"], 12)).toBeLessThanOrEqual(2);
    // Pedestrian stays finer than the street band at parcel zoom.
    expect(valueAtZoom(ped.paint!["line-width"], 16)!).toBeLessThan(
      valueAtZoom(band.paint!["line-width"], 16)!,
    );
    expect(
      Math.max(...interpStops(ped.paint!["line-opacity"]).values),
    ).toBeLessThanOrEqual(0.55);
    expect(ped.paint!["line-dasharray"]).toEqual([2, 2]);
    expect(valueAtZoom(ped.paint!["line-width"], 16)!).toBeGreaterThanOrEqual(2);
    expect(isZoomInterp(band.paint!["line-blur"])).toBe(true);
  });

  it("keeps pedestrian overlay off by default (visible=false)", () => {
    const specs = roadOverlaysFromAttachingRoads([street, footway]);
    const ped = specs.find((s) => s.layerKey === ROAD_PEDESTRIAN_LAYER_KEY)!;
    expect(ped.visible).toBe(false);
  });

  it("omits pedestrian layer when only streets are present", () => {
    const specs = roadOverlaysFromAttachingRoads([street]);
    expect(specs.map((s) => s.layerKey)).toEqual([ROAD_ROW_BAND_LAYER_KEY]);
  });

  it("derives pedestrian from osmHighwayTag when flag is absent", () => {
    const legacy = {
      ...footway,
      isPedestrianWay: undefined,
    };
    expect(roadIsPedestrianWay(legacy)).toBe(true);
    expect(PEDESTRIAN_OSM_HIGHWAY_TAGS).toContain("footway");
  });

  it("returns empty overlays when no road-node attaches (honest absence)", () => {
    expect(roadOverlaysFromAttachingRoads([])).toEqual([]);
  });
});
