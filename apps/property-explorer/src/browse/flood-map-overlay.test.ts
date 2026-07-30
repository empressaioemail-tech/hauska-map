// FD4 — the flood & drainage MAIN-MAP overlay, FEMA-ZONE STYLE: pure model +
// apply/clear + controller lifecycle tests over a structural fake map (node).
//
// Pins (the 2026-07-29 operator restyle):
//   - crisp categorical polygons in the live-FEMA visual language: ponding is
//     the headline (solid blue fill 0.42 + crisp 1px darker-blue outline),
//     drainage zones a subordinate light tint (0.18) with the live-FEMA thin
//     outline, catchment a single dashed boundary line with NO fill;
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
  FLOOD_ZONE_FILL_ID,
  FLOOD_ZONE_FILL_OPACITY,
  FLOOD_ZONE_LINE_COLOR,
  FLOOD_ZONE_LINE_ID,
  FLOOD_ZONE_LINE_WIDTH,
  MAX_FLOW_ARROWS,
  applyFloodMapOverlay,
  buildArrowIconData,
  buildFloodMapOverlayModel,
  clearFloodMapOverlay,
  createFloodMapOverlayController,
  flowArrowPoints,
  isParcelRelevantPath,
  pickBelowParcelsBeforeId,
  ringCrossingPoints,
  segmentBearingDeg,
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

describe("arrow icon — pure rasterization with the baked paper-halo", () => {
  it("emits an RGBA buffer of the right size with fill AND halo pixels", () => {
    const icon = buildArrowIconData(48, [224, 242, 254, 255], [6, 9, 13, 215]);
    expect(icon.width).toBe(48);
    expect(icon.height).toBe(48);
    expect(icon.data.length).toBe(48 * 48 * 4);
    let fillPx = 0;
    let haloPx = 0;
    for (let i = 0; i < icon.data.length; i += 4) {
      if (icon.data[i] === 224 && icon.data[i + 3] > 0) fillPx++;
      if (icon.data[i] === 6 && icon.data[i + 3] === 215) haloPx++;
    }
    expect(fillPx).toBeGreaterThan(100);
    expect(haloPx).toBeGreaterThan(50);
    // Corners stay transparent (it's an arrow, not a plate).
    expect(icon.data[3]).toBe(0);
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

  it("zone + ponding fills and outlines insert BELOW the parcel tiles with the FEMA paint constants", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // Ponding: headline solid fill in the 0.35-0.45 band + crisp 1px outline.
    const pondFill = map._layers.get(FLOOD_PONDING_FILL_ID)!;
    expect(pondFill.def.type).toBe("fill");
    expect(pondFill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(pondFill.def.paint!["fill-color"]).toBe(FLOOD_PONDING_FILL_COLOR);
    expect(FLOOD_PONDING_FILL_OPACITY).toBeGreaterThanOrEqual(0.35);
    expect(FLOOD_PONDING_FILL_OPACITY).toBeLessThanOrEqual(0.45);
    expect(pondFill.def.paint!["fill-opacity"]).toBe(FLOOD_PONDING_FILL_OPACITY);
    const pondLine = map._layers.get(FLOOD_PONDING_LINE_ID)!;
    expect(pondLine.def.paint!["line-color"]).toBe(FLOOD_PONDING_LINE_COLOR);
    expect(pondLine.def.paint!["line-width"]).toBe(FLOOD_PONDING_LINE_WIDTH);
    expect(FLOOD_PONDING_LINE_WIDTH).toBe(1);
    // Zones: subordinate light tint + the live-FEMA thin outline verbatim.
    const zoneFill = map._layers.get(FLOOD_ZONE_FILL_ID)!;
    expect(zoneFill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(FLOOD_ZONE_FILL_OPACITY).toBeGreaterThanOrEqual(0.15);
    expect(FLOOD_ZONE_FILL_OPACITY).toBeLessThanOrEqual(0.2);
    expect(zoneFill.def.paint!["fill-opacity"]).toBe(FLOOD_ZONE_FILL_OPACITY);
    expect(FLOOD_ZONE_FILL_OPACITY).toBeLessThan(FLOOD_PONDING_FILL_OPACITY);
    const zoneLine = map._layers.get(FLOOD_ZONE_LINE_ID)!;
    expect(zoneLine.def.paint!["line-color"]).toBe(FLOOD_ZONE_LINE_COLOR);
    expect(FLOOD_ZONE_LINE_COLOR).toBe("rgba(59,130,246,0.55)"); // live-FEMA outline
    expect(zoneLine.def.paint!["line-width"]).toBe(FLOOD_ZONE_LINE_WIDTH);
    expect(FLOOD_ZONE_LINE_WIDTH).toBe(0.8); // live-FEMA outline width
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
      expect(sym.def.layout!["icon-rotate"]).toEqual(["get", "bearing"]);
      expect(sym.def.layout!["icon-rotation-alignment"]).toBe("map");
      expect(typeof sym.def.layout!["icon-size"]).toBe("number"); // small + fixed
      expect(sym.def.layout!["icon-size"] as number).toBeLessThanOrEqual(0.6);
    }
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
