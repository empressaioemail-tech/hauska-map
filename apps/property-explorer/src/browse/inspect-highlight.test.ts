// Pure tests for the county-exact inspect highlight (P-60d) — the overlay
// spec built from the sealed sheet's rings, and the consumed-lot outline
// precedence + parcel-identity guard. No DOM, no MapLibre: both are pure.
//
// The violation direction is tested explicitly: a stale click-time ref
// stashed for a DIFFERENT parcel node id must NOT be used, and an unproven
// identity (either id null) refuses rather than guessing.
//
// Run: `npx vitest run src/browse/inspect-highlight.test.ts`

import { describe, it, expect } from "vitest";
import {
  INSPECT_RING_LAYER_KEY,
  countyExactInspectOverlays,
  consumedLotOutlineGeometry,
} from "./inspect-highlight";

// A small closed parcel ring (~ Bastrop lat) — the sheet's county-exact ring.
const SHEET_RING: Array<[number, number]> = [
  [-97.432, 30.0067],
  [-97.43, 30.0067],
  [-97.43, 30.008],
  [-97.432, 30.008],
  [-97.432, 30.0067],
];
const SHEET_PARCEL_RING = { type: "Polygon", coordinates: [SHEET_RING] };

// A DIFFERENT polygon standing in for click-time (e.g. live-GIS) geometry.
const CLICK_GEOM = {
  type: "Polygon",
  coordinates: [
    [
      [-97.44, 30.01],
      [-97.438, 30.01],
      [-97.438, 30.012],
      [-97.44, 30.012],
      [-97.44, 30.01],
    ],
  ],
};

describe("countyExactInspectOverlays", () => {
  it("builds one overlay from the sheet's outer ring with the inspected visual", () => {
    const overlays = countyExactInspectOverlays([SHEET_RING]);
    expect(overlays).toHaveLength(1);
    const spec = overlays[0];
    expect(spec.layerKey).toBe(INSPECT_RING_LAYER_KEY);
    expect(spec.layerKind).toBe("inspected-parcel-ring");
    const feature = spec.geojson as {
      type: string;
      geometry: { type: string; coordinates: unknown };
    };
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.geometry.coordinates).toEqual([SHEET_RING]);
    // Same colors/opacities as the parcel-tiles.js inspected feature-state:
    // line #cfe8ff @ 1.8px; neutral selection fill @ 0.25.
    expect(spec.paint).toMatchObject({
      "line-color": "#cfe8ff",
      "line-width": 1.8,
      "fill-color": "#9ec9e8",
      "fill-opacity": 0.25,
    });
  });

  it("uses only the OUTER ring (rings[0]) — the app-wide sheet-rings convention", () => {
    const hole: Array<[number, number]> = [
      [-97.4315, 30.007],
      [-97.4305, 30.007],
      [-97.4305, 30.0075],
      [-97.4315, 30.0075],
      [-97.4315, 30.007],
    ];
    const overlays = countyExactInspectOverlays([SHEET_RING, hole]);
    const feature = overlays[0].geojson as {
      geometry: { coordinates: unknown };
    };
    expect(feature.geometry.coordinates).toEqual([SHEET_RING]);
  });

  it("returns [] for empty rings (caller keeps the feature-state highlight)", () => {
    expect(countyExactInspectOverlays([])).toEqual([]);
  });

  it("returns [] for non-array / malformed rings — never a fabricated shape", () => {
    expect(countyExactInspectOverlays(null)).toEqual([]);
    expect(countyExactInspectOverlays(undefined)).toEqual([]);
    expect(countyExactInspectOverlays("rings")).toEqual([]);
    // Outer ring too short to close a polygon.
    expect(
      countyExactInspectOverlays([
        [
          [-97.43, 30.0],
          [-97.43, 30.01],
          [-97.43, 30.0],
        ],
      ]),
    ).toEqual([]);
    // Outer ring carrying non-numeric positions.
    expect(
      countyExactInspectOverlays([[["x", "y"], ["x", "y"], ["x", "y"], ["x", "y"]]]),
    ).toEqual([]);
  });
});

describe("consumedLotOutlineGeometry — precedence", () => {
  it("sheet-sourced parcelRing WINS over click-time geometry (PR #198 precedence inverted)", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: SHEET_PARCEL_RING,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: "48021:12345",
      envelopeParcelNodeId: "48021:12345",
    });
    expect(out).toBe(SHEET_PARCEL_RING);
  });

  it("sheet ring wins even when the click ref is stale (different parcel)", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: SHEET_PARCEL_RING,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: "48021:99999",
      envelopeParcelNodeId: "48021:12345",
    });
    expect(out).toBe(SHEET_PARCEL_RING);
  });

  it("falls back to click geometry when the sheet carries no ring AND ids match", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: null,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: "48021:12345",
      envelopeParcelNodeId: "48021:12345",
    });
    expect(out).toBe(CLICK_GEOM);
  });
});

describe("consumedLotOutlineGeometry — parcel-identity guard (violation direction)", () => {
  it("REFUSES a stale click ref stashed for a DIFFERENT parcel node id", () => {
    // Click on parcel B stashed geometry; a late envelope resolve for parcel A
    // must not consume it. With no sheet ring the answer is nothing.
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: null,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: "48021:parcel-B",
      envelopeParcelNodeId: "48021:parcel-A",
    });
    expect(out).toBeNull();
  });

  it("REFUSES click geometry when the click ref carries no parcel id (unproven identity)", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: null,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: null,
      envelopeParcelNodeId: "48021:12345",
    });
    expect(out).toBeNull();
  });

  it("REFUSES click geometry when the envelope result carries no parcel id (unproven identity)", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: null,
      clickGeometry: CLICK_GEOM,
      clickParcelNodeId: "48021:12345",
      envelopeParcelNodeId: null,
    });
    expect(out).toBeNull();
  });

  it("returns null when nothing usable exists (card wording carries the 0% honesty)", () => {
    const out = consumedLotOutlineGeometry({
      sheetParcelRing: null,
      clickGeometry: null,
      clickParcelNodeId: null,
      envelopeParcelNodeId: null,
    });
    expect(out).toBeNull();
  });
});
