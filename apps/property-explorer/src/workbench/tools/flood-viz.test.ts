// flood-viz tests — the pure SVG model over a fixture study (R3).
//
// Pins: zones/ponding/flow/exits all render paths from the served geometry;
// zone grades ramp; the parcel ring is drawn; exit arrows carry the
// bearing-derived SVG rotation; an honest-empty study renders an EMPTY model
// (nothing invented); malformed geometry degrades to absent paths.

import { describe, expect, it } from "vitest";
import type { FloodDrainageStudyView } from "../../lib/floodDrainageClient";
import { buildFloodVizModel } from "./flood-viz";

const RING: Array<[number, number]> = [
  [-97.32, 30.11],
  [-97.318, 30.11],
  [-97.318, 30.112],
  [-97.32, 30.112],
  [-97.32, 30.11],
];

function polygon(coords: Array<[number, number]>, properties: Record<string, unknown> = {}) {
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon", coordinates: [coords] },
    properties,
  };
}

function fixtureStudy(): FloodDrainageStudyView {
  return {
    parcelNodeId: "48021:54321",
    catchmentGeoJson: {
      type: "FeatureCollection",
      features: [
        polygon(
          [
            [-97.324, 30.106],
            [-97.314, 30.106],
            [-97.314, 30.116],
            [-97.324, 30.116],
            [-97.324, 30.106],
          ],
          { zone: "catchment" },
        ),
      ],
    },
    drainageZonesGeoJson: {
      type: "FeatureCollection",
      features: [
        polygon(
          [
            [-97.322, 30.108],
            [-97.316, 30.108],
            [-97.316, 30.114],
            [-97.322, 30.114],
            [-97.322, 30.108],
          ],
          { zone: "catchment" },
        ),
        polygon(
          [
            [-97.3205, 30.1095],
            [-97.3175, 30.1095],
            [-97.3175, 30.1125],
            [-97.3205, 30.1125],
            [-97.3205, 30.1095],
          ],
          { zone: "concentrated" },
        ),
      ],
    },
    rainfallResultGeoJson: {
      type: "FeatureCollection",
      features: [
        polygon([
          [-97.3195, 30.1105],
          [-97.3185, 30.1105],
          [-97.3185, 30.1115],
          [-97.3195, 30.1115],
          [-97.3195, 30.1105],
        ]),
      ],
    },
    flowLinesGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-97.321, 30.113],
              [-97.319, 30.111],
              [-97.3185, 30.1102],
            ],
          },
          properties: { accumulation: 120 },
        },
      ],
    },
    rainfallDepthInches: 9.5,
    rainfallSource: "noaa-atlas14",
    demProvenance: { source: "usgs:3dep-dem", resolutionMeters: 10 },
    briefing: "The upstream catchment delivers runoff toward the parcel pour point.",
    flowExits: [{ lng: -97.3185, lat: 30.1102, bearingDeg: 135 }],
    stats: {
      catchmentAreaSqFt: 500_000,
      pondedAreaSqFt: 12_000,
      flowExitCount: 1,
      pourPoint: { lng: -97.3185, lat: 30.1102 },
    },
    parcelRingWgs84: RING,
    catchmentBbox: {
      westLng: -97.324,
      southLat: 30.106,
      eastLng: -97.314,
      northLat: 30.116,
    },
  };
}

describe("buildFloodVizModel — fixture study renders every layer", () => {
  const model = buildFloodVizModel(fixtureStudy());

  it("is not empty and frames a viewBox", () => {
    expect(model.empty).toBe(false);
    expect(model.viewBox).toBe(`0 0 ${model.width} ${model.height}`);
  });

  it("draws the parcel ring as a closed path", () => {
    expect(model.parcelPath).toBeTruthy();
    expect(model.parcelPath).toMatch(/^M/);
    expect(model.parcelPath).toMatch(/Z$/);
  });

  it("renders the catchment boundary", () => {
    expect(model.catchmentPaths).toHaveLength(1);
    expect(model.catchmentPaths[0]).toMatch(/^M/);
  });

  it("renders drainage zones with a graded ramp (0..1, ascending)", () => {
    expect(model.zonePaths).toHaveLength(2);
    expect(model.zonePaths[0].grade).toBe(0);
    expect(model.zonePaths[1].grade).toBe(1);
  });

  it("renders rainfall ponding and flow lines", () => {
    expect(model.pondingPaths).toHaveLength(1);
    expect(model.flowPaths).toHaveLength(1);
    // Flow line is a polyline, not closed.
    expect(model.flowPaths[0]).not.toMatch(/Z$/);
  });

  it("places a flow-exit arrow with the bearing-derived rotation", () => {
    expect(model.exitArrows).toHaveLength(1);
    const arrow = model.exitArrows[0];
    // bearing 135 (SE) -> SVG rotation 45.
    expect(arrow.angleDeg).toBe(45);
    expect(arrow.x).toBeGreaterThan(0);
    expect(arrow.x).toBeLessThan(model.width);
    expect(arrow.y).toBeGreaterThan(0);
    expect(arrow.y).toBeLessThan(model.height);
  });

  it("keeps every projected coordinate inside the padded viewport", () => {
    const nums = (model.parcelPath ?? "")
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(0);
      expect(nums[i]).toBeLessThanOrEqual(model.width);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
      expect(nums[i + 1]).toBeLessThanOrEqual(model.height);
    }
  });
});

describe("buildFloodVizModel — honest empty", () => {
  it("an honestEmpty study renders the honest empty model (nothing invented)", () => {
    const study: FloodDrainageStudyView = {
      ...fixtureStudy(),
      catchmentGeoJson: { type: "FeatureCollection", features: [] },
      drainageZonesGeoJson: { type: "FeatureCollection", features: [] },
      rainfallResultGeoJson: null,
      flowLinesGeoJson: { type: "FeatureCollection", features: [] },
      flowExits: [],
      honestEmpty: { reason: "No significant drainage concentration modeled here." },
    };
    const model = buildFloodVizModel(study);
    expect(model.empty).toBe(true);
    expect(model.zonePaths).toHaveLength(0);
    expect(model.pondingPaths).toHaveLength(0);
    expect(model.flowPaths).toHaveLength(0);
    expect(model.exitArrows).toHaveLength(0);
  });

  it("a study with no usable extent degrades to the empty frame, never NaN paths", () => {
    const study: FloodDrainageStudyView = {
      ...fixtureStudy(),
      catchmentGeoJson: { type: "FeatureCollection", features: [] },
      drainageZonesGeoJson: { type: "FeatureCollection", features: [] },
      rainfallResultGeoJson: null,
      flowLinesGeoJson: { type: "FeatureCollection", features: [] },
      flowExits: [],
      parcelRingWgs84: [],
      catchmentBbox: undefined,
    };
    const model = buildFloodVizModel(study);
    expect(model.parcelPath).toBeNull();
    expect(model.catchmentPaths).toHaveLength(0);
  });

  it("malformed geometry degrades to absent paths, never a throw", () => {
    const study = fixtureStudy();
    study.drainageZonesGeoJson = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: null },
        { type: "Feature", geometry: { type: "Polygon", coordinates: "junk" } },
      ] as never,
    };
    const model = buildFloodVizModel(study);
    expect(model.zonePaths).toHaveLength(0);
    expect(model.parcelPath).toBeTruthy();
  });
});
