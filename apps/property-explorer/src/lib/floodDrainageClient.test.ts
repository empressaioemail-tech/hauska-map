// Fix C — STALE-STYLE GATE unit tests for isCurrentStyledFloodStudy.
//
// The flood-drainage study is cached by the engine; studies produced before
// the current visual language shipped lack its DATA markers and render in the
// OLD look. The gate treats a study as current-styled only when it carries at
// least one current-era marker, so old-styled cached studies fail closed to a
// re-run instead of rendering stale.

import { describe, expect, it } from "vitest";
import {
  isCurrentStyledFloodStudy,
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
