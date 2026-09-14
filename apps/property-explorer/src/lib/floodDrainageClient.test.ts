// Fix C — STALE-STYLE GATE unit tests for isCurrentStyledFloodStudy.
//
// The flood-drainage study is cached by the engine; studies produced before
// the current visual language shipped lack its DATA markers and render in the
// OLD look. The gate treats a study as current-styled only when it carries at
// least one current-era marker, so old-styled cached studies fail closed to a
// re-run instead of rendering stale.

import { describe, expect, it } from "vitest";
import {
  buildFloodDrainageRefreshBody,
  depthInchesForReturnPeriod,
  isCurrentStyledFloodStudy,
  returnPeriodYearsForDepthInches,
  type FloodDrainageStudyView,
} from "./floodDrainageClient";

/** A minimally-shaped study with only the always-present fields. */
function base(over: Partial<FloodDrainageStudyView> = {}): FloodDrainageStudyView {
  return {
    parcelNodeId: "48021:105129",
    catchmentGeoJson: { type: "FeatureCollection", features: [] },
    drainageZonesGeoJson: { type: "FeatureCollection", features: [] },
    rainfallResultGeoJson: null,
    flowLinesGeoJson: { type: "FeatureCollection", features: [] },
    rainfallDepthInches: 6,
    rainfallSource: "noaa-atlas14",
    demProvenance: { source: "USGS 3DEP", resolutionMeters: 1 },
    briefing: "…",
    ...over,
  };
}

describe("isCurrentStyledFloodStudy — stale-style gate (Fix C)", () => {
  it("null / non-object → not current-styled", () => {
    expect(isCurrentStyledFloodStudy(null)).toBe(false);
    expect(isCurrentStyledFloodStudy(undefined)).toBe(false);
  });

  it("OLD-styled: raw flow lines + zones without concentration → stale", () => {
    const legacy = base({
      flowLinesGeoJson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] },
            properties: {},
          },
        ],
      },
      drainageZonesGeoJson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [] },
            properties: { note: "upstream" },
          },
        ],
      },
    });
    expect(isCurrentStyledFloodStudy(legacy)).toBe(false);
  });

  it("honestEmpty → exempt (nothing to style)", () => {
    expect(
      isCurrentStyledFloodStudy(base({ honestEmpty: { reason: "flat terrain" } })),
    ).toBe(true);
  });

  it("v3 flowPaths present → current-styled", () => {
    expect(
      isCurrentStyledFloodStudy(
        base({
          flowPaths: [
            { coordinates: [[0, 0], [1, 1]], strength: 0.5, kind: "exit" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("v3 catchmentSwaths present → current-styled", () => {
    expect(
      isCurrentStyledFloodStudy(
        base({
          catchmentSwaths: [
            { coordinates: [[0, 0], [1, 1]], strength: 0.4, kind: "interior" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("v2 gradient PNG present → current-styled", () => {
    expect(
      isCurrentStyledFloodStudy(
        base({
          gradient: {
            pngBase64: "iVBORw0KGgo=",
            bbox: { westLng: 0, southLat: 0, eastLng: 1, northLat: 1 },
          },
        }),
      ),
    ).toBe(true);
  });

  it("v4 dissolved zone with numeric concentration → current-styled", () => {
    expect(
      isCurrentStyledFloodStudy(
        base({
          drainageZonesGeoJson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Polygon", coordinates: [] },
                properties: { concentration: 2 },
              },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it("empty flowPaths array does NOT qualify (marker must be non-empty)", () => {
    expect(isCurrentStyledFloodStudy(base({ flowPaths: [] }))).toBe(false);
  });
});

// G-125 — the rainfall depth / return-period control.
describe("buildFloodDrainageRefreshBody — G-125 optional depth passthrough", () => {
  const target = {
    factSheetId: "fs_48021105129",
    parcelNodeId: "48021:105129",
    address: "714 Spring St",
    countyName: "Bastrop",
  };

  it("omits rainfallDepthInches when no override is given -- the pre-G-125 default call, unchanged", () => {
    const body = buildFloodDrainageRefreshBody(target);
    expect(body).not.toHaveProperty("rainfallDepthInches");
    expect(body).toMatchObject({
      factSheetId: target.factSheetId,
      parcelNodeId: target.parcelNodeId,
      address: target.address,
      countyName: target.countyName,
    });
  });

  it("includes rainfallDepthInches verbatim when an override is supplied", () => {
    const body = buildFloodDrainageRefreshBody(target, { rainfallDepthInches: 4 });
    expect(body.rainfallDepthInches).toBe(4);
  });

  it("omits address when the target has none, same as before G-125", () => {
    const body = buildFloodDrainageRefreshBody({ ...target, address: null });
    expect(body).not.toHaveProperty("address");
  });
});

describe("rainfall curve interpolation (G-125 two-vocabulary control)", () => {
  const curve = [
    { returnPeriodYears: 2, depthInches: 3.5 },
    { returnPeriodYears: 10, depthInches: 5.5 },
    { returnPeriodYears: 25, depthInches: 7.1 },
    { returnPeriodYears: 100, depthInches: 9.5 },
    { returnPeriodYears: 500, depthInches: 13.0 },
  ];

  it("converts an inches depth to its return-period equivalent (Sylvia's 4-inch question)", () => {
    const result = returnPeriodYearsForDepthInches(curve, 4)!;
    expect(result.value).toBeGreaterThan(2);
    expect(result.value).toBeLessThan(10);
    expect(result.clamped).toBeUndefined();
  });

  it("converts a return period to its depth equivalent (the engineer's vocabulary)", () => {
    const result = depthInchesForReturnPeriod(curve, 10)!;
    expect(result.value).toBeCloseTo(5.5, 5);
  });

  it("clamps at the curve ends instead of extrapolating", () => {
    expect(returnPeriodYearsForDepthInches(curve, 20)).toMatchObject({ value: 500, clamped: "high" });
    expect(depthInchesForReturnPeriod(curve, 1)).toMatchObject({ value: 3.5, clamped: "low" });
  });

  it("returns null when no curve is available (honest absence, never a guess)", () => {
    expect(returnPeriodYearsForDepthInches(undefined, 4)).toBeNull();
    expect(depthInchesForReturnPeriod([], 10)).toBeNull();
  });
});
