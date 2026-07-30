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
  FLOOD_ZONE_LINE_COLOR,
  FLOOD_ZONE_LINE_ID,
  FLOOD_ZONE_LINE_WIDTH,
  FLOOD_ZONE_LOW_COLOR,
  FLOOD_ZONE_LOW_OPACITY,
  FLOOD_ZONE_MED_COLOR,
  FLOOD_ZONE_MED_OPACITY,
  FLOOD_CATCHMENT_LINE_COLOR,
  FLOOD_EXIT_ICON_SIZE,
  FLOOD_FLOW_LINE_COLOR,
  MAX_FLOW_ARROWS,
  PARCEL_RELEVANCE_BUFFER_M,
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

function kindsOf(model: { vectors: { features: unknown[] } }): string[] {
  return (model.vectors.features as Feat[]).map((f) => String(f.properties.kind));
}

function featuresOfKind(model: { vectors: { features: unknown[] } }, kind: string): Feat[] {
  return (model.vectors.features as Feat[]).filter((f) => f.properties.kind === kind);
}

/* ----------------------------- fake map -------------------------------- */

interface FakeLayer {
  def: { id: string; type: string; source?: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
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
    const icon = buildArrowIconData(48, [168, 95, 34, 255], [255, 255, 255, 225]);
    expect(icon.width).toBe(48);
    expect(icon.height).toBe(48);
    expect(icon.data.length).toBe(48 * 48 * 4);
    let fillPx = 0;
    let haloPx = 0;
    for (let i = 0; i < icon.data.length; i += 4) {
      if (icon.data[i] === 168 && icon.data[i + 1] === 95 && icon.data[i + 3] > 0) fillPx++;
      if (icon.data[i] === 255 && icon.data[i + 3] === 225) haloPx++;
    }
    expect(fillPx).toBeGreaterThan(100);
    expect(haloPx).toBeGreaterThan(50);
    // Corners stay transparent (it's an arrow, not a plate).
    expect(icon.data[3]).toBe(0);
  });

  it("the EXIT DIAMOND rasterizes a #7a3f12 core inside a white stroke, corners clear", () => {
    const icon = buildDiamondIconData(48, [122, 63, 18, 255], [255, 255, 255, 255]);
    expect(icon.width).toBe(48);
    expect(icon.height).toBe(48);
    expect(icon.data.length).toBe(48 * 48 * 4);
    const at = (x: number, y: number) => {
      const i = (y * 48 + x) * 4;
      return [icon.data[i], icon.data[i + 1], icon.data[i + 2], icon.data[i + 3]];
    };
    // Center is the dark fill; the mid-edge along the diagonal is white stroke.
    expect(at(24, 24).slice(0, 3)).toEqual([122, 63, 18]);
    expect(at(24, 24)[3]).toBe(255);
    // A point beyond the fill radius but inside the diamond → white stroke.
    expect(at(24, 10).slice(0, 3)).toEqual([255, 255, 255]);
    // The square CORNERS are outside the rotated square → fully transparent.
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
      if (icon.data[i] === 122 && icon.data[i + 3] > 0) fillPx++;
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
    expect(FLOOD_ZONE_LOW_COLOR).toBe("#e8b579");
    expect(FLOOD_ZONE_MED_COLOR).toBe("#d98a3d");
    expect(FLOOD_ZONE_HIGH_COLOR).toBe("#a85f22");

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
    expect([FLOOD_ZONE_LOW_OPACITY, FLOOD_ZONE_MED_OPACITY, FLOOD_ZONE_HIGH_OPACITY]).toEqual([
      0.5, 0.6, 0.55,
    ]);
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

  it("zone + ponding fills and outlines insert BELOW the parcel tiles with the AMBER paint constants", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // Ponding: the pooled deep treatment — #c46a2b core + a heavier #7a3f12
    // rim standing in for the spec's radial gradient (MapLibre has none).
    const pondFill = map._layers.get(FLOOD_PONDING_FILL_ID)!;
    expect(pondFill.def.type).toBe("fill");
    expect(pondFill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(pondFill.def.paint!["fill-color"]).toBe(FLOOD_PONDING_FILL_COLOR);
    expect(FLOOD_PONDING_FILL_COLOR).toBe("#c46a2b");
    expect(pondFill.def.paint!["fill-opacity"]).toBe(FLOOD_PONDING_FILL_OPACITY);
    const pondLine = map._layers.get(FLOOD_PONDING_LINE_ID)!;
    expect(pondLine.def.paint!["line-color"]).toBe(FLOOD_PONDING_LINE_COLOR);
    expect(FLOOD_PONDING_LINE_COLOR).toBe("#7a3f12"); // the gradient's outer stop
    expect(pondLine.def.paint!["line-width"]).toBe(FLOOD_PONDING_LINE_WIDTH);
    expect(FLOOD_PONDING_LINE_WIDTH).toBeGreaterThan(1); // heavier than a hairline
    // Zones: the amber outline, subtle (the bands are dissolved shapes).
    const zoneFill = map._layers.get(FLOOD_ZONE_FILL_ID)!;
    expect(zoneFill.beforeId).toBe("hauska-parcel-tiles-fill");
    const zoneLine = map._layers.get(FLOOD_ZONE_LINE_ID)!;
    expect(zoneLine.def.paint!["line-color"]).toBe(FLOOD_ZONE_LINE_COLOR);
    expect(zoneLine.def.paint!["line-width"]).toBe(FLOOD_ZONE_LINE_WIDTH);
    // Catchment + flow are the spec's amber, not the retired blue.
    expect(FLOOD_CATCHMENT_LINE_COLOR).toBe("#a85f22");
    expect(FLOOD_FLOW_LINE_COLOR).toBe("#a85f22");
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
});
