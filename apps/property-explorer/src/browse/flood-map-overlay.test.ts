// FD5 — the flood & drainage MAIN-MAP overlay, WARM AMBER HYDRO FAMILY: pure
// model + apply/clear + controller lifecycle tests over a structural fake map.
//
// Pins (the 2026-07-30 operator restyle; FEMA keeps the blue as the reference
// layer and hydro moves entirely out of it):
//   - THREE dissolved zone concentration bands painted by ONE fill layer via
//     a `["match", ["get","concentration"], ...]` expression (low #e8b579,
//     medium #d98a3d, high #a85f22) whose fallback covers features with NO
//     `concentration` — older cached studies must still render;
//   - ponding is the pooled deep treatment (#c46a2b core + #7a3f12 rim),
//     catchment a single dashed #a85f22 boundary line with NO fill;
//   - exits are DIAMOND markers (#7a3f12 fill, white stroke, unrotated);
//     flow-path arrows stay arrows and keep `icon-rotate`;
//   - NOTHING in the hydro stack paints in the FEMA blue family;
//   - NO scrim, NO dimming of other layers, NO raster gradient, NO swath
//     corridors, NO animated dash — apply touches nothing but its own
//     source/layers and other layers' paint stays exactly as it was;
//   - PARCEL-RELEVANT FLOW ONLY: exit-kind paths always survive; interior
//     paths survive only when their geometry intersects the parcel ring or
//     comes within ~15 m; everything else is DROPPED;
//   - small static arrows: sparse along-line arrows + one clear arrow at
//     each parcel-boundary crossing, capped at MAX_FLOW_ARROWS (6) total
//     with crossing arrows claiming slots first;
//   - lifecycle: apply → clear removes everything; the controller auto-clears
//     when the active property switches away (the WB6 dossier precedent) and
//     never draws for honestEmpty studies.

import { describe, expect, it } from "vitest";
import type { FloodDrainageStudyView } from "../lib/floodDrainageClient";
import {
  FLOOD_ARROW_ICON_ID,
  FLOOD_ARROW_LAYER_ID,
  FLOOD_CATCHMENT_DASH,
  FLOOD_CATCHMENT_LINE_ID,
  FLOOD_EXIT_ICON_ID,
  FLOOD_EXIT_LAYER_ID,
  FLOOD_FLOW_LINE_ID,
  FLOOD_OVERLAY_LAYER_IDS,
  FLOOD_PONDING_FILL_COLOR,
  FLOOD_PONDING_FILL_ID,
  FLOOD_PONDING_FILL_OPACITY,
  FLOOD_PONDING_LINE_COLOR,
  FLOOD_PONDING_LINE_ID,
  FLOOD_PONDING_LINE_WIDTH,
  FLOOD_VECTOR_SOURCE_ID,
  FLOOD_ZONE_FILL_COLOR_EXPR,
  FLOOD_ZONE_FILL_ID,
  FLOOD_ZONE_FILL_OPACITY_EXPR,
  FLOOD_ZONE_HIGH_COLOR,
  FLOOD_ZONE_HIGH_OPACITY,
  FLOOD_ZONE_LOW_COLOR,
  FLOOD_ZONE_LOW_OPACITY,
  FLOOD_ZONE_MED_COLOR,
  FLOOD_ZONE_MED_OPACITY,
  FLOOD_CATCHMENT_LINE_COLOR,
  FLOOD_EXIT_ICON_SIZE,
  FLOOD_FLOW_LINE_COLOR,
  FLOOD_TEARDOWN_LAYER_IDS,
  FEMA_FILL_OPACITY_MAX,
  FEMA_FILL_OPACITY_MIN,
  MAX_FLOW_ARROWS,
  PARCEL_RELEVANCE_BUFFER_M,
  RETIRED_FLOOD_ZONE_LINE_ID,
  pondingFeatureCount,
  validFeatureGeometry,
  applyFloodMapOverlay,
  buildArrowIconData,
  buildDiamondIconData,
  buildFloodMapOverlayModel,
  clearFloodMapOverlay,
  createFloodMapOverlayController,
  flowArrowPoints,
  isParcelRelevantPath,
  pickBelowParcelsBeforeId,
  ringCrossingPoints,
  segmentBearingDeg,
  zoneConcentrationOf,
  type FloodOverlayMapLike,
} from "./flood-map-overlay";

/* ----------------------------- fixtures -------------------------------- */

const BBOX = { westLng: -97.324, southLat: 30.106, eastLng: -97.314, northLat: 30.116 };

/** Parcel ring used across relevance tests (~570 x 660 m box). */
const RING: Array<[number, number]> = [
  [-97.322, 30.108],
  [-97.316, 30.108],
  [-97.316, 30.114],
  [-97.322, 30.114],
  [-97.322, 30.108],
];

function fixtureStudy(overrides?: Partial<FloodDrainageStudyView>): FloodDrainageStudyView {
  return {
    parcelNodeId: "48021:54321",
    catchmentGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.324, 30.106],
                [-97.314, 30.106],
                [-97.314, 30.116],
                [-97.324, 30.116],
                [-97.324, 30.106],
              ],
            ],
          },
          properties: {},
        },
      ],
    },
    drainageZonesGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.322, 30.108],
                [-97.316, 30.108],
                [-97.316, 30.114],
                [-97.322, 30.108],
              ],
            ],
          },
          properties: {},
        },
      ],
    },
    rainfallResultGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.3195, 30.1105],
                [-97.3185, 30.1105],
                [-97.3185, 30.1115],
                [-97.3195, 30.1105],
              ],
            ],
          },
          properties: {},
        },
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
              [-97.3185, 30.1102],
            ],
          },
          properties: {},
        },
      ],
    },
    rainfallDepthInches: 9.5,
    rainfallSource: "noaa-atlas14",
    demProvenance: { source: "usgs:3dep-dem", resolutionMeters: 10 },
    briefing: "b",
    flowExits: [{ lng: -97.3185, lat: 30.1102, bearingDeg: 135 }],
    ...overrides,
  };
}

/** The pre-restyle gradient payload — must now be IGNORED by the overlay. */
const GRADIENT = { pngBase64: "iVBORw0KGgo=", bbox: BBOX, note: "ramp" };

/** Exit path: starts inside RING, leaves eastward. */
const EXIT_PATH = {
  coordinates: [
    [-97.32, 30.11],
    [-97.318, 30.1095],
    [-97.3165, 30.109],
    [-97.3155, 30.109], // first vertex OUTSIDE the ring (crossing)
    [-97.3145, 30.1085],
  ] as Array<[number, number]>,
  strength: 1,
  kind: "exit" as const,
};

/** Interior path THROUGH the parcel (vertices inside the ring). */
const THROUGH_PATH = {
  coordinates: [
    [-97.321, 30.113],
    [-97.3185, 30.1102],
  ] as Array<[number, number]>,
  strength: 0.5,
  kind: "interior" as const,
};

/** Far-field interior path — kilometers from the ring; must be DROPPED. */
const FAR_PATH = {
  coordinates: [
    [-97.35, 30.15],
    [-97.349, 30.149],
    [-97.348, 30.148],
  ] as Array<[number, number]>,
  strength: 0.9,
  kind: "interior" as const,
};

function v3Study(overrides?: Partial<FloodDrainageStudyView>): FloodDrainageStudyView {
  return fixtureStudy({
    parcelRingWgs84: RING,
    flowPaths: [EXIT_PATH, THROUGH_PATH, FAR_PATH],
    flowPathsNote: "traced from the D8 model",
    ...overrides,
  });
}

type Feat = {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

/** The FD5 banded zone payload the engine now emits: three dissolved,
 *  nested bands each carrying `concentration: 0|1|2`. */
function bandedZonesFc() {
  const ringAt = (n: number): Array<[number, number]> => [
    [-97.322 + n * 0.0005, 30.108 + n * 0.0005],
    [-97.316 - n * 0.0005, 30.108 + n * 0.0005],
    [-97.316 - n * 0.0005, 30.114 - n * 0.0005],
    [-97.322 + n * 0.0005, 30.108 + n * 0.0005],
  ];
  return {
    type: "FeatureCollection" as const,
    features: [0, 1, 2].map((concentration) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon", coordinates: [ringAt(concentration)] },
      properties: { concentration },
    })),
  };
}

/** #rrggbb → {h: 0-360, s: 0-1, l: 0-1}; lets the hue-family pin assert on
 *  perceptual facts (one warm arc, descending lightness) not on literals. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

function kindsOf(model: { vectors: { features: unknown[] } }): string[] {
  return (model.vectors.features as Feat[]).map((f) => String(f.properties.kind));
}

function featuresOfKind(model: { vectors: { features: unknown[] } }, kind: string): Feat[] {
  return (model.vectors.features as Feat[]).filter((f) => f.properties.kind === kind);
}

/* ----------------------------- fake map -------------------------------- */

interface FakeLayer {
  def: {
    id: string;
    type: string;
    source?: string;
    filter?: unknown;
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
  };
  beforeId?: string;
}

function fakeMap(
  styleLayers: Array<{ id: string; type?: string; paint?: Record<string, unknown> }> = [],
) {
  const layers = new Map<string, FakeLayer>();
  for (const l of styleLayers) {
    layers.set(l.id, {
      def: { id: l.id, type: l.type ?? "fill", paint: { ...(l.paint ?? {}) } },
    });
  }
  const sources = new Map<string, Record<string, unknown>>();
  const images = new Map<string, unknown>();
  const map: FloodOverlayMapLike & {
    _layers: Map<string, FakeLayer>;
    _sources: Map<string, Record<string, unknown>>;
    _images: Map<string, unknown>;
    _paint: (id: string, prop: string) => unknown;
  } = {
    getLayer: (id) => layers.get(id),
    addLayer: (layer, beforeId) => {
      const def = layer as FakeLayer["def"];
      layers.set(def.id, { def, beforeId });
    },
    removeLayer: (id) => layers.delete(id),
    getSource: (id) => sources.get(id),
    addSource: (id, source) => {
      const src = { ...(source as Record<string, unknown>) };
      src.setData = (d: unknown) => {
        src.data = d;
      };
      sources.set(id, src);
    },
    removeSource: (id) => sources.delete(id),
    getStyle: () => ({ layers: styleLayers }),
    setPaintProperty: (layerId, prop, value) => {
      const layer = layers.get(layerId);
      if (!layer) return;
      layer.def.paint = { ...(layer.def.paint ?? {}), [prop]: value };
    },
    getPaintProperty: (layerId, prop) => layers.get(layerId)?.def.paint?.[prop],
    hasImage: (id) => images.has(id),
    addImage: (id, image) => images.set(id, image),
    _layers: layers,
    _sources: sources,
    _images: images,
    _paint: (id, prop) => layers.get(id)?.def.paint?.[prop],
  };
  return map;
}

/* ------------------------------- model --------------------------------- */

describe("buildFloodMapOverlayModel — FEMA-zone-style categorical classes", () => {
  it("zones + ponding + catchment ALWAYS render from the served GeoJSON (gradient payload ignored)", () => {
    for (const study of [fixtureStudy(), fixtureStudy({ gradient: GRADIENT })]) {
      const model = buildFloodMapOverlayModel(study);
      const kinds = kindsOf(model);
      expect(kinds).toContain("zone");
      expect(kinds).toContain("ponding");
      expect(kinds).toContain("catchment");
      // The retired mechanisms never come back as features.
      expect(kinds).not.toContain("swath");
    }
  });

  it("honestEmpty → an empty model (the map stays untouched)", () => {
    const model = buildFloodMapOverlayModel(
      fixtureStudy({ honestEmpty: { reason: "flat terrain" } }),
    );
    expect(model.vectors.features).toHaveLength(0);
  });

  it("no strength/exitBoost props anywhere — flow lines are uniform, not ribbons", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    for (const f of model.vectors.features as Feat[]) {
      expect(f.properties.strength).toBeUndefined();
      expect(f.properties.exitBoost).toBeUndefined();
    }
  });
});

describe("parcel-relevance filter — only flow that matters to the subject parcel", () => {
  it("isParcelRelevantPath: far path → false; path through the ring → true; near-miss within 15 m → true", () => {
    expect(isParcelRelevantPath(FAR_PATH.coordinates, RING)).toBe(false);
    expect(isParcelRelevantPath(THROUGH_PATH.coordinates, RING)).toBe(true);
    // ~11 m east of the ring's east edge (-97.316): inside the 15 m buffer.
    expect(
      isParcelRelevantPath(
        [
          [-97.315885, 30.11],
          [-97.315885, 30.111],
        ],
        RING,
      ),
    ).toBe(true);
    // ~100 m east of the east edge: outside the buffer.
    expect(
      isParcelRelevantPath(
        [
          [-97.31496, 30.11],
          [-97.31496, 30.111],
        ],
        RING,
      ),
    ).toBe(false);
  });

  it("a segment CROSSING the ring between far-apart vertices is still relevant", () => {
    // Both vertices outside (west and east of the ring), segment crosses it.
    expect(
      isParcelRelevantPath(
        [
          [-97.324, 30.111],
          [-97.314, 30.111],
        ],
        RING,
      ),
    ).toBe(true);
  });

  it("no usable ring → the path is KEPT (relevance unprovable, honest inclusion)", () => {
    expect(isParcelRelevantPath(FAR_PATH.coordinates, undefined)).toBe(true);
    expect(isParcelRelevantPath(FAR_PATH.coordinates, [])).toBe(true);
  });

  it("model: exit path kept, through path kept, far path DROPPED", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    const flows = featuresOfKind(model, "flow");
    expect(flows).toHaveLength(2);
    // The far path's coordinates never appear.
    expect(JSON.stringify(flows)).not.toContain("30.15");
    // The exit path survives on kind alone.
    expect(JSON.stringify(flows)).toContain("-97.3145");
  });

  it("FD5 PIN: the restyle did NOT change the 15 m buffer or the 6-arrow cap", () => {
    // The operator explicitly approved this behavior — the amber restyle is
    // paint-only and must never regress it.
    expect(PARCEL_RELEVANCE_BUFFER_M).toBe(15);
    expect(MAX_FLOW_ARROWS).toBe(6);
    // Same survivors as before the restyle, banded zones or not.
    for (const study of [v3Study(), v3Study({ drainageZonesGeoJson: bandedZonesFc() })]) {
      const flows = featuresOfKind(buildFloodMapOverlayModel(study), "flow");
      expect(flows).toHaveLength(2); // exit + through; far path DROPPED
      expect(JSON.stringify(flows)).not.toContain("30.15");
    }
  });

  it("legacy studies (no flowPaths) filter flowLinesGeoJson by the same rule", () => {
    const farLine = {
      type: "Feature" as const,
      geometry: {
        type: "LineString",
        coordinates: [
          [-97.35, 30.15],
          [-97.348, 30.148],
        ],
      },
      properties: {},
    };
    const study = fixtureStudy({ parcelRingWgs84: RING });
    study.flowLinesGeoJson = {
      type: "FeatureCollection",
      features: [...study.flowLinesGeoJson.features, farLine],
    };
    const model = buildFloodMapOverlayModel(study);
    const flows = featuresOfKind(model, "flow");
    // The fixture line runs through the parcel → kept; the far line dropped.
    expect(flows).toHaveLength(1);
    expect(JSON.stringify(flows)).not.toContain("30.148");
  });
});

describe("direction arrows — small, sparse, parcel-anchored, capped", () => {
  it("bearing math: north=0, east=90, south=180, west=270", () => {
    expect(segmentBearingDeg([0, 0], [0, 0.001])).toBeCloseTo(0, 5);
    expect(segmentBearingDeg([0, 0], [0.001, 0])).toBeCloseTo(90, 5);
    expect(segmentBearingDeg([0, 0], [0, -0.001])).toBeCloseTo(180, 5);
    expect(segmentBearingDeg([0, 0], [-0.001, 0])).toBeCloseTo(270, 5);
  });

  it("a short line gets ONE midpoint arrow; a long (>200 m) line gets TWO (sparse, not a wall)", () => {
    const short = flowArrowPoints([
      [0, 0],
      [0.0005, 0], // ~55 m
    ]);
    expect(short).toHaveLength(1);
    expect(short[0].bearingDeg).toBeCloseTo(90, 1);
    const long = flowArrowPoints([
      [0, 0],
      [0, 0.005], // ~550 m
    ]);
    expect(long).toHaveLength(2);
    for (const a of long) expect(a.bearingDeg).toBeCloseTo(0, 1);
  });

  it("degenerate input draws nothing", () => {
    expect(flowArrowPoints([])).toEqual([]);
    expect(flowArrowPoints([[0, 0]])).toEqual([]);
    expect(
      flowArrowPoints([
        [0, 0],
        [0, 0],
      ]),
    ).toEqual([]);
  });

  it("ringCrossingPoints marks EVERY inside↔outside flip with the crossing segment's bearing", () => {
    const crossings = ringCrossingPoints(EXIT_PATH.coordinates, RING);
    expect(crossings).toHaveLength(1);
    expect([crossings[0].lng, crossings[0].lat]).toEqual([-97.3155, 30.109]);
    // A path that enters AND leaves → two crossings (enter + exit points).
    const throughAndOut: Array<[number, number]> = [
      [-97.324, 30.111], // outside (west)
      [-97.319, 30.111], // inside
      [-97.314, 30.111], // outside (east)
    ];
    expect(ringCrossingPoints(throughAndOut, RING)).toHaveLength(2);
    // No ring → no invented crossings.
    expect(ringCrossingPoints(EXIT_PATH.coordinates, undefined)).toEqual([]);
  });

  it("exit-path crossing arrows use the path geometry (not the engine flowExits duplicate)", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    const exits = featuresOfKind(model, "exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].geometry.coordinates).toEqual([-97.3155, 30.109]);
    expect(exits[0].geometry.coordinates).not.toEqual([-97.3185, 30.1102]);
  });

  it("no path-derived crossing → the engine's own flowExits still draw (never silently dropped)", () => {
    const model = buildFloodMapOverlayModel(
      v3Study({ flowPaths: [THROUGH_PATH] }), // interior only, THROUGH_PATH stays inside
    );
    const exits = featuresOfKind(model, "exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].geometry.coordinates).toEqual([-97.3185, 30.1102]);
    expect(exits[0].properties.bearing).toBe(135);
  });

  it("TOTAL arrows capped at MAX_FLOW_ARROWS (6), crossing arrows claiming slots first", () => {
    // Ten long exit paths, each crossing the ring → way over the cap raw.
    const manyExits = Array.from({ length: 10 }, (_, i) => ({
      coordinates: [
        [-97.319, 30.109 + i * 0.0004], // inside
        [-97.3155, 30.109 + i * 0.0004], // outside (crossing)
        [-97.31, 30.109 + i * 0.0004], // far outside (long tail)
      ] as Array<[number, number]>,
      strength: 1,
      kind: "exit" as const,
    }));
    const model = buildFloodMapOverlayModel(v3Study({ flowPaths: manyExits }));
    const arrowCount =
      featuresOfKind(model, "arrow").length + featuresOfKind(model, "exit").length;
    expect(arrowCount).toBeLessThanOrEqual(MAX_FLOW_ARROWS);
    // The crossing (exit) arrows own the budget.
    expect(featuresOfKind(model, "exit")).toHaveLength(MAX_FLOW_ARROWS);
    expect(featuresOfKind(model, "arrow")).toHaveLength(0);
  });

  it("under the cap, along-line arrows fill the remaining slots", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    const exits = featuresOfKind(model, "exit");
    const arrows = featuresOfKind(model, "arrow");
    expect(exits.length + arrows.length).toBeLessThanOrEqual(MAX_FLOW_ARROWS);
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) expect(typeof a.properties.bearing).toBe("number");
  });
});

describe("icons — pure rasterization (arrows keep the halo, exits are diamonds)", () => {
  it("the flow arrow emits an RGBA buffer with fill AND halo pixels", () => {
    const icon = buildArrowIconData(48, [42, 95, 109, 255], [255, 255, 255, 225]);
    expect(icon.width).toBe(48);
    expect(icon.height).toBe(48);
    expect(icon.data.length).toBe(48 * 48 * 4);
    let fillPx = 0;
    let haloPx = 0;
    for (let i = 0; i < icon.data.length; i += 4) {
      if (icon.data[i] === 42 && icon.data[i + 1] === 95 && icon.data[i + 3] > 0) fillPx++;
      if (icon.data[i] === 255 && icon.data[i + 3] === 225) haloPx++;
    }
    expect(fillPx).toBeGreaterThan(100);
    expect(haloPx).toBeGreaterThan(50);
    // Corners stay transparent (it's an arrow, not a plate).
    expect(icon.data[3]).toBe(0);
  });

  it("the EXIT DIAMOND rasterizes a #0d2a33 core inside a white stroke, corners clear", () => {
    const icon = buildDiamondIconData(48, [13, 42, 51, 255], [255, 255, 255, 255]);
    expect(icon.width).toBe(48);
    expect(icon.height).toBe(48);
    expect(icon.data.length).toBe(48 * 48 * 4);
    const at = (x: number, y: number) => {
      const i = (y * 48 + x) * 4;
      return [icon.data[i], icon.data[i + 1], icon.data[i + 2], icon.data[i + 3]];
    };
    expect(at(24, 24).slice(0, 3)).toEqual([13, 42, 51]);
    expect(at(24, 24)[3]).toBe(255);
    expect(at(24, 10).slice(0, 3)).toEqual([255, 255, 255]);
    for (const [x, y] of [
      [0, 0],
      [47, 0],
      [0, 47],
      [47, 47],
    ]) {
      expect(at(x, y)[3]).toBe(0);
    }
    let fillPx = 0;
    let strokePx = 0;
    for (let i = 0; i < icon.data.length; i += 4) {
      if (icon.data[i] === 13 && icon.data[i + 3] > 0) fillPx++;
      if (icon.data[i] === 255 && icon.data[i + 1] === 255 && icon.data[i + 3] > 0) strokePx++;
    }
    expect(fillPx).toBeGreaterThan(100);
    expect(strokePx).toBeGreaterThan(100);
  });
});

/* --------------------- FD5 zone concentration bands ---------------------- */

describe("zone concentration bands — three dissolved tones from ONE fill layer", () => {
  it("zoneConcentrationOf reads 0/1/2 and returns undefined for anything else", () => {
    expect(zoneConcentrationOf({ concentration: 0 })).toBe(0);
    expect(zoneConcentrationOf({ concentration: 1 })).toBe(1);
    expect(zoneConcentrationOf({ concentration: 2 })).toBe(2);
    // Legacy / malformed payloads → undefined (the match fallback paints).
    expect(zoneConcentrationOf({})).toBeUndefined();
    expect(zoneConcentrationOf(undefined)).toBeUndefined();
    expect(zoneConcentrationOf(null)).toBeUndefined();
    expect(zoneConcentrationOf({ concentration: "high" })).toBeUndefined();
    expect(zoneConcentrationOf({ concentration: 3 })).toBeUndefined();
  });

  it("the model carries the served band through onto each zone feature", () => {
    const model = buildFloodMapOverlayModel(
      v3Study({ drainageZonesGeoJson: bandedZonesFc() }),
    );
    const zones = featuresOfKind(model, "zone");
    expect(zones).toHaveLength(3);
    expect(zones.map((z) => z.properties.concentration)).toEqual([0, 1, 2]);
  });

  it("FEATURE-DETECT: zones with NO concentration still render, prop simply omitted", () => {
    // The stock fixture's zones have `properties: {}` — the pre-banding shape.
    const model = buildFloodMapOverlayModel(v3Study());
    const zones = featuresOfKind(model, "zone");
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) {
      expect(z.properties.kind).toBe("zone");
      expect("concentration" in z.properties).toBe(false);
    }
  });

  it("ONE zone fill layer paints all three bands via a match on ['get','concentration']", () => {
    const map = fakeMap([{ id: "hauska-parcel-tiles-fill", type: "fill" }]);
    applyFloodMapOverlay(
      map,
      buildFloodMapOverlayModel(v3Study({ drainageZonesGeoJson: bandedZonesFc() })),
    );
    // Exactly one zone fill layer — the match expression replaces 3 layers.
    const zoneFills = [...map._layers.keys()].filter(
      (id) => id.startsWith("pe-flood-") && id.includes("zone") && id.includes("fill"),
    );
    expect(zoneFills).toEqual([FLOOD_ZONE_FILL_ID]);

    const color = map._layers.get(FLOOD_ZONE_FILL_ID)!.def.paint!["fill-color"];
    expect(color).toEqual([
      "match",
      ["get", "concentration"],
      0,
      FLOOD_ZONE_LOW_COLOR,
      1,
      FLOOD_ZONE_MED_COLOR,
      2,
      FLOOD_ZONE_HIGH_COLOR,
      FLOOD_ZONE_LOW_COLOR, // the missing-`concentration` fallback tone
    ]);
    expect(FLOOD_ZONE_LOW_COLOR).toBe("#8ebfc9");
    expect(FLOOD_ZONE_MED_COLOR).toBe("#4f8f9e");
    expect(FLOOD_ZONE_HIGH_COLOR).toBe("#2a5f6d");

    const opacity = map._layers.get(FLOOD_ZONE_FILL_ID)!.def.paint!["fill-opacity"];
    expect(opacity).toEqual([
      "match",
      ["get", "concentration"],
      0,
      FLOOD_ZONE_LOW_OPACITY,
      1,
      FLOOD_ZONE_MED_OPACITY,
      2,
      FLOOD_ZONE_HIGH_OPACITY,
      FLOOD_ZONE_LOW_OPACITY,
    ]);
    // FD6: ONE graded warm family — a MONOTONIC ramp light → medium → deep,
    // every step inside the FEMA envelope (the spec's 0.6 medium was above
    // it and broke both the envelope and the monotonic read).
    const ramp = [FLOOD_ZONE_LOW_OPACITY, FLOOD_ZONE_MED_OPACITY, FLOOD_ZONE_HIGH_OPACITY];
    expect(ramp).toEqual([0.1, 0.125, 0.15]);
    for (const o of ramp) {
      expect(o).toBeGreaterThanOrEqual(FEMA_FILL_OPACITY_MIN);
      expect(o).toBeLessThanOrEqual(FEMA_FILL_OPACITY_MAX);
    }
    expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
  });

  it("Phase 0A: the three bands + ponding are ONE slate-teal family (NOT SUBJECT amber)", () => {
    // Every fill tone the overlay paints, parsed to HSL. A single graded
    // CONTEXT family means every hue sits in the teal arc (~170-200°) and
    // lightness DESCENDS across the ramp. Amber (SUBJECT, ~20-45°) fails.
    const ramp = [
      FLOOD_ZONE_LOW_COLOR,
      FLOOD_ZONE_MED_COLOR,
      FLOOD_ZONE_HIGH_COLOR,
      FLOOD_PONDING_FILL_COLOR,
    ];
    const hsl = ramp.map(hexToHsl);
    for (const { h, s } of hsl) {
      expect(h).toBeGreaterThanOrEqual(170);
      expect(h).toBeLessThanOrEqual(205);
      expect(s).toBeGreaterThan(0.15);
    }
    const hues = hsl.map((c) => c.h);
    expect(Math.max(...hues) - Math.min(...hues)).toBeLessThanOrEqual(25);
    const zoneL = hsl.slice(0, 3).map((c) => c.l);
    expect(zoneL[0]).toBeGreaterThan(zoneL[1]);
    expect(zoneL[1]).toBeGreaterThan(zoneL[2]);
    // Hard ban on SUBJECT amber literals.
    for (const c of ramp) {
      expect(c.toLowerCase()).not.toBe("#f2a23c");
      expect(c.toLowerCase()).not.toBe("#e8b579");
      expect(c.toLowerCase()).not.toBe("#d98a3d");
      expect(c.toLowerCase()).not.toBe("#a85f22");
      expect(c.toLowerCase()).not.toBe("#c46a2b");
    }
  });

  it("the band expressions are property READS only — never feature-state", () => {
    const serialized = JSON.stringify([
      FLOOD_ZONE_FILL_COLOR_EXPR,
      FLOOD_ZONE_FILL_OPACITY_EXPR,
    ]);
    expect(serialized).toContain('["get","concentration"]');
    expect(serialized).not.toContain("feature-state");
  });
});

/* ------------------------- apply / clear -------------------------------- */

describe("apply/clear — FEMA-style layer stack, below-parcels anchoring, no side effects", () => {
  const styleLayers = [
    { id: "hauska-basemap", type: "raster" },
    { id: "hauska-ovl-live-parcels-fill", type: "fill", paint: { "fill-opacity": 0.5 } },
    { id: "hauska-gis-zoning-fill", type: "fill", paint: { "fill-opacity": 0.35 } },
    { id: "hauska-ovl-live-topography-line", type: "line", paint: { "line-opacity": 0.8 } },
    { id: "hauska-ovl-live-hydrography-line", type: "line", paint: { "line-width": 2.4 } },
    { id: "hauska-parcel-tiles-fill", type: "fill", paint: { "fill-opacity": 0.08 } },
    { id: "hauska-parcel-tiles-line", type: "line" },
    { id: "some-label", type: "symbol" },
  ];

  it("zone + ponding fills and outlines insert BELOW the parcel tiles with CONTEXT teal paint", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const pondFill = map._layers.get(FLOOD_PONDING_FILL_ID)!;
    expect(pondFill.def.type).toBe("fill");
    expect(pondFill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(pondFill.def.paint!["fill-color"]).toBe(FLOOD_PONDING_FILL_COLOR);
    expect(FLOOD_PONDING_FILL_COLOR).toBe("#1a4552");
    expect(pondFill.def.paint!["fill-opacity"]).toBe(FLOOD_PONDING_FILL_OPACITY);
    const pondLine = map._layers.get(FLOOD_PONDING_LINE_ID)!;
    expect(pondLine.def.paint!["line-color"]).toBe(FLOOD_PONDING_LINE_COLOR);
    expect(FLOOD_PONDING_LINE_COLOR).toBe("#0d2a33");
    expect(pondLine.def.paint!["line-width"]).toBe(FLOOD_PONDING_LINE_WIDTH);
    expect(FLOOD_PONDING_LINE_WIDTH).toBeGreaterThan(1);
    const zoneFill = map._layers.get(FLOOD_ZONE_FILL_ID)!;
    expect(zoneFill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(FLOOD_CATCHMENT_LINE_COLOR).toBe("#2a5f6d");
    expect(FLOOD_FLOW_LINE_COLOR).toBe("#2a5f6d");
    expect(FLOOD_CATCHMENT_DASH).toEqual([5, 4]);
  });

  it("NOTHING in the hydro stack paints in the FEMA blue family (the whole point of FD5)", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const painted = JSON.stringify(
      [...map._layers.entries()]
        .filter(([id]) => id.startsWith("pe-flood-"))
        .map(([, l]) => l.def.paint ?? {}),
    ).toLowerCase();
    for (const blue of ["#3b82f6", "#60a5fa", "#1d4ed8", "#7dd3fc", "59,130,246", "96,165,250"]) {
      expect(painted).not.toContain(blue);
    }
  });

  it("catchment is a single dashed line with NO fill layer and a STATIC literal dash", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const catchment = map._layers.get(FLOOD_CATCHMENT_LINE_ID)!;
    expect(catchment.def.type).toBe("line");
    const dash = catchment.def.paint!["line-dasharray"] as number[];
    expect(dash).toEqual(FLOOD_CATCHMENT_DASH);
    for (const n of dash) expect(typeof n).toBe("number"); // literal, safe channel
    // No catchment fill / glow layer exists anywhere in the stack.
    for (const [id, layer] of map._layers) {
      if (!id.startsWith("pe-flood-")) continue;
      if (layer.def.type === "fill") {
        expect([FLOOD_ZONE_FILL_ID, FLOOD_PONDING_FILL_ID]).toContain(id);
      }
      expect(layer.def.paint?.["line-blur"]).toBeUndefined();
    }
  });

  it("NO scrim, NO raster, NO swaths, NO animated dash — and other layers' paint is untouched", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // Exactly the documented stack — nothing else was added.
    const added = [...map._layers.keys()].filter((id) => id.startsWith("pe-flood-"));
    expect(added.sort()).toEqual([...FLOOD_OVERLAY_LAYER_IDS].sort());
    expect(map._layers.has("pe-flood-scrim")).toBe(false);
    expect(map._layers.has("pe-flood-gradient")).toBe(false);
    expect(map._sources.size).toBe(1); // ONE geojson source, nothing else.
    // No raster/image anywhere in our stack.
    for (const id of FLOOD_OVERLAY_LAYER_IDS) {
      expect(map._layers.get(id)!.def.type).not.toBe("raster");
    }
    // No layer-dimming: every pre-existing paint value is exactly as seeded.
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(0.5);
    expect(map._paint("hauska-gis-zoning-fill", "fill-opacity")).toBe(0.35);
    expect(map._paint("hauska-ovl-live-topography-line", "line-opacity")).toBe(0.8);
    expect(map._paint("hauska-ovl-live-hydrography-line", "line-width")).toBe(2.4);
    expect(map._paint("hauska-parcel-tiles-fill", "fill-opacity")).toBe(0.08);
  });

  it("flow lines are thin static lines; arrows are small symbols rotated by the bearing prop", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const flow = map._layers.get(FLOOD_FLOW_LINE_ID)!;
    expect(flow.def.type).toBe("line");
    expect(typeof flow.def.paint!["line-width"]).toBe("number"); // uniform, not strength-scaled
    expect(flow.def.paint!["line-dasharray"]).toBeUndefined(); // no dash, no animation
    expect(map._images.has(FLOOD_ARROW_ICON_ID)).toBe(true);
    expect(map._images.has(FLOOD_EXIT_ICON_ID)).toBe(true);
    for (const id of [FLOOD_ARROW_LAYER_ID, FLOOD_EXIT_LAYER_ID]) {
      const sym = map._layers.get(id)!;
      expect(sym.def.type).toBe("symbol");
      expect(sym.def.layout!["icon-rotation-alignment"]).toBe("map");
      expect(typeof sym.def.layout!["icon-size"]).toBe("number"); // small + fixed
      expect(sym.def.layout!["icon-size"] as number).toBeLessThanOrEqual(0.6);
    }
    // Flow ARROWS keep the bearing rotation; the exit DIAMOND carries no
    // direction, so it is deliberately NOT rotated.
    expect(map._layers.get(FLOOD_ARROW_LAYER_ID)!.def.layout!["icon-rotate"]).toEqual([
      "get",
      "bearing",
    ]);
    expect(
      map._layers.get(FLOOD_EXIT_LAYER_ID)!.def.layout!["icon-rotate"],
    ).toBeUndefined();
    expect(map._layers.get(FLOOD_EXIT_LAYER_ID)!.def.layout!["icon-size"]).toBe(
      FLOOD_EXIT_ICON_SIZE,
    );
  });

  it("no parcel layers in the style → anchors before the first symbol layer; none at all → top-of-stack", () => {
    expect(
      pickBelowParcelsBeforeId(
        fakeMap([
          { id: "hauska-basemap", type: "raster" },
          { id: "some-label", type: "symbol" },
        ]),
      ),
    ).toBe("some-label");
    expect(pickBelowParcelsBeforeId(fakeMap([]))).toBeUndefined();
  });

  it("re-apply is idempotent: one source refreshed via setData, no duplicate layers", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy()));
    expect(map._sources.size).toBe(1);
    const added = [...map._layers.keys()].filter((id) => id.startsWith("pe-flood-"));
    expect(added).toHaveLength(FLOOD_OVERLAY_LAYER_IDS.length);
  });

  it("clear removes EVERY overlay layer + the source", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    clearFloodMapOverlay(map);
    for (const id of FLOOD_OVERLAY_LAYER_IDS) expect(map._layers.has(id)).toBe(false);
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(false);
  });
});

/* ------------------- FD6: no internal seams (paint cleanup) --------------- */

describe("FD6 seam removal — smooth fill, NO internal grid/seam mesh", () => {
  const styleLayers = [
    { id: "hauska-parcel-tiles-fill", type: "fill" },
    { id: "hauska-parcel-tiles-line", type: "line" },
  ];

  /** A study with SEVERAL zone features in the SAME band — the shape that
   *  produced the rejected mesh: any kind=="zone" stroke would draw on the
   *  edges these adjacent regions share. */
  function adjacentSameBandStudy(): FloodDrainageStudyView {
    const cell = (i: number) => {
      const x0 = -97.322 + i * 0.001;
      const x1 = x0 + 0.001; // each cell abuts the next EXACTLY — a shared edge.
      return {
        type: "Feature" as const,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [x0, 30.109],
              [x1, 30.109],
              [x1, 30.112],
              [x0, 30.112],
              [x0, 30.109],
            ],
          ],
        },
        properties: { concentration: 1 },
      };
    };
    return fixtureStudy({
      drainageZonesGeoJson: {
        type: "FeatureCollection",
        features: [cell(0), cell(1), cell(2), cell(3)],
      },
    });
  }

  it("NO layer strokes the zone features — the mesh cannot be drawn at all", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(adjacentSameBandStudy()));
    // The decisive pin: not one LINE layer in our stack is filtered on zones.
    // Zones are drawn by fill ONLY, so adjacent same-band regions share their
    // edge silently — there is no per-feature outline to become a seam.
    for (const [id, layer] of map._layers) {
      if (!id.startsWith("pe-flood-")) continue;
      if (layer.def.type !== "line") continue;
      expect(JSON.stringify(layer.def.filter ?? null)).not.toContain('"zone"');
    }
    // And the specific retired layer is not in the stack, by id.
    expect(map._layers.has(RETIRED_FLOOD_ZONE_LINE_ID)).toBe(false);
    expect([...FLOOD_OVERLAY_LAYER_IDS]).not.toContain(RETIRED_FLOOD_ZONE_LINE_ID);
    // The bands themselves still paint (removing the stroke removed the
    // seam, NOT the study).
    const zoneFill = map._layers.get(FLOOD_ZONE_FILL_ID)!;
    expect(zoneFill.def.type).toBe("fill");
    expect(zoneFill.def.paint!["fill-color"]).toEqual([...FLOOD_ZONE_FILL_COLOR_EXPR]);
    expect(featuresOfKind(buildFloodMapOverlayModel(adjacentSameBandStudy()), "zone")).toHaveLength(
      4,
    );
  });

  it("no fill-outline-color either — that would reintroduce the seam by another channel", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(adjacentSameBandStudy()));
    expect(
      map._layers.get(FLOOD_ZONE_FILL_ID)!.def.paint!["fill-outline-color"],
    ).toBeUndefined();
  });

  it("a pre-FD6 zone-line layer left on a live map is SWEPT by both apply and clear", () => {
    // A session that applied the old build then hot-reloads into this one:
    // the stale stroke must not survive and keep drawing the mesh.
    const map = fakeMap(styleLayers);
    map.addLayer({ id: RETIRED_FLOOD_ZONE_LINE_ID, type: "line", paint: {} });
    expect(map._layers.has(RETIRED_FLOOD_ZONE_LINE_ID)).toBe(true);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(adjacentSameBandStudy()));
    expect(map._layers.has(RETIRED_FLOOD_ZONE_LINE_ID)).toBe(false);

    const map2 = fakeMap(styleLayers);
    applyFloodMapOverlay(map2, buildFloodMapOverlayModel(adjacentSameBandStudy()));
    map2.addLayer({ id: RETIRED_FLOOD_ZONE_LINE_ID, type: "line", paint: {} });
    clearFloodMapOverlay(map2);
    expect(map2._layers.has(RETIRED_FLOOD_ZONE_LINE_ID)).toBe(false);
    expect([...FLOOD_TEARDOWN_LAYER_IDS]).toContain(RETIRED_FLOOD_ZONE_LINE_ID);
  });

  it("EVERY fill this overlay paints sits inside the CONTEXT fill budget (≤0.15)", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const opacities: number[] = [];
    for (const [id, layer] of map._layers) {
      if (!id.startsWith("pe-flood-") || layer.def.type !== "fill") continue;
      const o = layer.def.paint!["fill-opacity"];
      if (typeof o === "number") {
        opacities.push(o);
      } else if (Array.isArray(o) && o[0] === "match") {
        // ["match", input, key0, out0, key1, out1, …, fallback] — the OUTPUTS
        // are the odd slots from index 3, plus the trailing fallback. The
        // even slots are match KEYS (0/1/2), not opacities.
        for (let i = 3; i < o.length - 1; i += 2) opacities.push(o[i] as number);
        opacities.push(o[o.length - 1] as number);
      }
    }
    expect(opacities.length).toBeGreaterThan(0);
    for (const o of opacities) {
      expect(o).toBeGreaterThanOrEqual(FEMA_FILL_OPACITY_MIN);
      expect(o).toBeLessThanOrEqual(FEMA_FILL_OPACITY_MAX);
    }
  });

  it("PONDING is in Context budget and stays distinct via its RIM, not raw alpha", () => {
    expect(FLOOD_PONDING_FILL_OPACITY).toBe(0.15);
    expect(FLOOD_PONDING_FILL_OPACITY).toBeLessThanOrEqual(FEMA_FILL_OPACITY_MAX);
    expect(FLOOD_PONDING_FILL_OPACITY).toBeGreaterThanOrEqual(FEMA_FILL_OPACITY_MIN);
    expect(FLOOD_PONDING_LINE_WIDTH).toBeGreaterThanOrEqual(2);
    expect(FLOOD_PONDING_LINE_COLOR).toBe("#0d2a33");
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const pondWidth = map._layers.get(FLOOD_PONDING_LINE_ID)!.def.paint!["line-width"] as number;
    for (const [id, layer] of map._layers) {
      if (!id.startsWith("pe-flood-") || id === FLOOD_PONDING_LINE_ID) continue;
      const w = layer.def.paint?.["line-width"];
      if (typeof w === "number") expect(pondWidth).toBeGreaterThanOrEqual(w);
    }
  });
});

/* ------------------ FD6: reliability / honest degrade -------------------- */

describe("FD6 reliability — malformed payloads degrade, they never blank the map", () => {
  const styleLayers = [{ id: "hauska-parcel-tiles-fill", type: "fill" }];

  it("validFeatureGeometry rejects null / unknown-type / NaN-coordinate geometry", () => {
    expect(validFeatureGeometry(null)).toBe(false);
    expect(validFeatureGeometry(undefined)).toBe(false);
    expect(validFeatureGeometry("Polygon")).toBe(false);
    expect(validFeatureGeometry({ type: "Polygon" })).toBe(false); // no coordinates
    expect(validFeatureGeometry({ type: "Wormhole", coordinates: [[0, 0]] })).toBe(false);
    expect(validFeatureGeometry({ type: "Polygon", coordinates: [] })).toBe(false);
    expect(
      validFeatureGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, NaN], [1, 1]]] }),
    ).toBe(false);
    expect(
      validFeatureGeometry({ type: "Point", coordinates: [Infinity, 30.1] }),
    ).toBe(false);
    expect(validFeatureGeometry({ type: "Point", coordinates: [null, 30.1] })).toBe(false);
    // The good shapes still pass.
    expect(validFeatureGeometry({ type: "Point", coordinates: [-97.32, 30.11] })).toBe(true);
    expect(
      validFeatureGeometry({
        type: "Polygon",
        coordinates: [[[-97.32, 30.11], [-97.31, 30.11], [-97.31, 30.12], [-97.32, 30.11]]],
      }),
    ).toBe(true);
  });

  it("a study with GARBAGE GeoJSON fields builds an empty model instead of throwing", () => {
    const garbage = fixtureStudy({
      // Every field the wrong shape: null, a bare object, a string, a
      // non-array `features`. Nothing here may reach MapLibre.
      drainageZonesGeoJson: null as never,
      catchmentGeoJson: { type: "FeatureCollection" } as never,
      rainfallResultGeoJson: "not-geojson" as never,
      flowLinesGeoJson: { type: "FeatureCollection", features: "nope" } as never,
      flowPaths: { bad: true } as never,
      flowExits: "nope" as never,
      parcelRingWgs84: "nope" as never,
    });
    let model!: ReturnType<typeof buildFloodMapOverlayModel>;
    expect(() => {
      model = buildFloodMapOverlayModel(garbage);
    }).not.toThrow();
    expect(model.vectors.features).toHaveLength(0);
    // And applying that empty model is a clean no-op, not a crash.
    const map = fakeMap(styleLayers);
    expect(() => applyFloodMapOverlay(map, model)).not.toThrow();
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(true);
  });

  it("PARTIAL render: the bad features drop, the GOOD ones still draw", () => {
    const good = {
      type: "Feature" as const,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-97.322, 30.109],
            [-97.318, 30.109],
            [-97.318, 30.112],
            [-97.322, 30.109],
          ],
        ],
      },
      properties: { concentration: 2 },
    };
    const study = fixtureStudy({
      drainageZonesGeoJson: {
        type: "FeatureCollection",
        features: [
          null as never, // a null hole in the array
          { type: "Feature", geometry: null, properties: {} } as never, // legal GeoJSON!
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[-97.3, NaN], [0, 0], [1, 1]]] },
            properties: {},
          } as never,
          good,
        ],
      },
    });
    const model = buildFloodMapOverlayModel(study);
    const zones = featuresOfKind(model, "zone");
    expect(zones).toHaveLength(1); // exactly the good one — a PARTIAL render.
    expect(zones[0].properties.concentration).toBe(2);
    // Every coordinate that reached the model is finite.
    expect(JSON.stringify(model.vectors)).not.toContain("null,");
    const map = fakeMap(styleLayers);
    expect(() => applyFloodMapOverlay(map, model)).not.toThrow();
    expect(map._layers.has(FLOOD_ZONE_FILL_ID)).toBe(true);
  });

  it("a NaN-poisoned parcel ring does not silently drop every flow path", () => {
    // Relevance is unprovable without a usable ring → paths are KEPT (honest
    // inclusion), and no NaN reaches the geometry predicates.
    const study = v3Study({ parcelRingWgs84: [[NaN, 30.11], [-97.32, NaN]] as never });
    let model!: ReturnType<typeof buildFloodMapOverlayModel>;
    expect(() => {
      model = buildFloodMapOverlayModel(study);
    }).not.toThrow();
    expect(featuresOfKind(model, "flow").length).toBeGreaterThan(0);
  });

  it("apply ROLLS BACK a partial stack when the map throws mid-build", () => {
    const map = fakeMap(styleLayers);
    let added = 0;
    const realAdd = map.addLayer;
    map.addLayer = (layer, beforeId) => {
      if (added++ === 2) throw new Error("style went away mid-apply");
      return realAdd(layer, beforeId);
    };
    expect(() => applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()))).not.toThrow();
    // Nothing half-drawn is left claiming to be the study.
    expect([...map._layers.keys()].filter((id) => id.startsWith("pe-flood-"))).toHaveLength(0);
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(false);
  });

  it("teardown is COMPLETE and IDEMPOTENT, even after a partial apply", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // A removal that throws must not orphan the layers behind it.
    const realRemove = map.removeLayer;
    let threw = false;
    map.removeLayer = (id) => {
      if (!threw && id === FLOOD_PONDING_FILL_ID) {
        threw = true;
        throw new Error("layer removal failed");
      }
      return realRemove(id);
    };
    expect(() => clearFloodMapOverlay(map)).not.toThrow();
    map.removeLayer = realRemove;
    clearFloodMapOverlay(map); // second sweep gets the straggler.
    for (const id of FLOOD_TEARDOWN_LAYER_IDS) expect(map._layers.has(id)).toBe(false);
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(false);
    // Idempotent: clearing an untouched map is a silent no-op.
    expect(() => clearFloodMapOverlay(fakeMap(styleLayers))).not.toThrow();
    expect(() => clearFloodMapOverlay(map)).not.toThrow();
  });

  it("pondingFeatureCount counts only what the map will ACTUALLY draw", () => {
    expect(pondingFeatureCount(null)).toBe(0);
    expect(pondingFeatureCount(fixtureStudy({ rainfallResultGeoJson: null as never }))).toBe(0);
    expect(
      pondingFeatureCount(
        fixtureStudy({
          rainfallResultGeoJson: {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: null, properties: {} } as never],
          },
        }),
      ),
    ).toBe(0); // served, but undrawable — the dock must NOT claim ponding.
    const withPonding = fixtureStudy();
    expect(pondingFeatureCount(withPonding)).toBe(
      featuresOfKind(buildFloodMapOverlayModel(withPonding), "ponding").length,
    );
    expect(pondingFeatureCount(withPonding)).toBeGreaterThan(0);
  });
});

/* ---------------------------- controller -------------------------------- */

describe("controller — the setDossierOverlay lifecycle precedent", () => {
  const styleLayers = [{ id: "hauska-parcel-tiles-line", type: "line" }];

  it("set(study) draws and records the owning property; set(null) clears", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    expect(ctl.appliedFor()).toBe("48021:1");
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(true);
    ctl.set(null);
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
  });

  it("ACTIVE-PROPERTY SWITCH auto-clears a stale overlay — never leaks across properties", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    ctl.onActivePropertyChange("48021:1"); // same property → stays.
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(true);
    ctl.onActivePropertyChange("48055:2"); // switched → clears.
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
    // No overlay drawn → a further switch is a no-op (no throw).
    ctl.onActivePropertyChange(null);
  });

  it("honestEmpty studies NEVER draw (and clear whatever was there)", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    ctl.set(fixtureStudy({ honestEmpty: { reason: "flat" } }), "48021:1");
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
  });

  it("map not ready → honest no-op (nothing recorded, nothing thrown)", () => {
    const ctl = createFloodMapOverlayController(() => null);
    ctl.set(fixtureStudy(), "48021:1");
    expect(ctl.appliedFor()).toBeNull();
    ctl.destroy();
  });

  it("destroy clears the map (unmount path)", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    ctl.destroy();
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
    expect(ctl.appliedFor()).toBeNull();
  });

  it("clear cancels a deferred styledata apply — an old study cannot resurrect", () => {
    const listeners: Array<() => void> = [];
    const map = fakeMap(styleLayers) as ReturnType<typeof fakeMap> & {
      isStyleLoaded: () => boolean;
      once: (ev: string, cb: () => void) => void;
    };
    map.isStyleLoaded = () => false;
    map.once = (_ev, cb) => {
      listeners.push(cb);
    };
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
    ctl.set(null);
    for (const cb of listeners) cb();
    expect(map._layers.has(FLOOD_FLOW_LINE_ID)).toBe(false);
    expect(ctl.appliedFor()).toBeNull();
  });
});
