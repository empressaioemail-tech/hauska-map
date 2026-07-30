// FD2 — the flood & drainage MAIN-MAP overlay: pure model + apply/clear +
// controller lifecycle tests over a structural fake map (node env).
//
// Pins:
//   - the gradient PNG becomes a MapLibre IMAGE source anchored to its bbox
//     corners, drawn as a raster at 0.8 opacity BELOW the parcel-tile layers;
//   - FEATURE-DETECT fallback: a study without `gradient` renders the served
//     zone/ponding polygons as translucent fills instead — the overlay ships
//     before the engine v2 deploys;
//   - PROMINENT arrows: along-flow arrows carry the containing segment's
//     bearing; exit arrows carry the engine's own bearingDeg (icon points
//     north → icon-rotate == bearing);
//   - lifecycle: apply → clear removes everything; the controller auto-clears
//     when the active property switches away (the WB6 dossier precedent) and
//     never draws for honestEmpty studies;
//   - animation: node has no rAF → static-dash fallback (apply returns null);
//     the dash sequence is all LITERAL arrays (the crash-guard safe channel).

import { describe, expect, it } from "vitest";
import type { FloodDrainageStudyView } from "../lib/floodDrainageClient";
import {
  FLOOD_ARROW_ICON_ID,
  FLOOD_ARROW_LAYER_ID,
  FLOOD_CATCHMENT_GLOW_ID,
  FLOOD_CATCHMENT_LINE_ID,
  FLOOD_DIM_OPACITY,
  FLOOD_EXIT_ICON_ID,
  FLOOD_EXIT_LAYER_ID,
  FLOOD_FLOW_BASE_ID,
  FLOOD_FLOW_DASH_ID,
  FLOOD_GRADIENT_LAYER_ID,
  FLOOD_GRADIENT_SOURCE_ID,
  FLOOD_HYDRO_THIN_WIDTH,
  FLOOD_OVERLAY_LAYER_IDS,
  FLOOD_PONDING_FILL_ID,
  FLOOD_SCRIM_LAYER_ID,
  FLOOD_SCRIM_SOURCE_ID,
  FLOOD_SWATH_CASING_ID,
  FLOOD_SWATH_FILL_ID,
  FLOOD_VECTOR_SOURCE_ID,
  FLOOD_ZONE_FILL_ID,
  FLOW_DASH_SEQUENCE,
  applyFloodDominance,
  applyFloodMapOverlay,
  buildArrowIconData,
  buildFloodMapOverlayModel,
  classifyFloodDominanceTargets,
  clearFloodMapOverlay,
  createFloodMapOverlayController,
  exitCrossingPoint,
  flowArrowPoints,
  flowArrowPointsScaled,
  pickBelowParcelsBeforeId,
  restoreFloodDominance,
  segmentBearingDeg,
  type FloodOverlayMapLike,
} from "./flood-map-overlay";

/* ----------------------------- fixtures -------------------------------- */

const BBOX = { westLng: -97.324, southLat: 30.106, eastLng: -97.314, northLat: 30.116 };

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

const GRADIENT = { pngBase64: "iVBORw0KGgo=", bbox: BBOX, note: "ramp" };

/* ----------------------------- fake map -------------------------------- */

interface FakeLayer {
  def: { id: string; type: string; source?: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
  beforeId?: string;
}

function fakeMap(
  styleLayers: Array<{ id: string; type?: string; paint?: Record<string, unknown> }> = [],
) {
  const layers = new Map<string, FakeLayer>();
  // Pre-existing style layers are real layers too (paint mutable via
  // set/getPaintProperty — the dominance capture/restore seam).
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
      src.updateImage = (o: { url: string; coordinates: unknown }) => {
        src.url = o.url;
        src.coordinates = o.coordinates;
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

describe("buildFloodMapOverlayModel — gradient vs feature-detect fallback", () => {
  it("gradient present → image anchored to its bbox corners [TL,TR,BR,BL], NO fallback fills", () => {
    const model = buildFloodMapOverlayModel(fixtureStudy({ gradient: GRADIENT }));
    expect(model.gradient).not.toBeNull();
    expect(model.gradient!.url).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(model.gradient!.coordinates).toEqual([
      [BBOX.westLng, BBOX.northLat],
      [BBOX.eastLng, BBOX.northLat],
      [BBOX.eastLng, BBOX.southLat],
      [BBOX.westLng, BBOX.southLat],
    ]);
    expect(model.usesFallbackFills).toBe(false);
    const kinds = model.vectors.features.map(
      (f) => (f as { properties: { kind: string } }).properties.kind,
    );
    expect(kinds).not.toContain("zone");
    expect(kinds).not.toContain("ponding");
    // The rest of the picture still draws: catchment, flow, arrows, exit.
    expect(kinds).toContain("catchment");
    expect(kinds).toContain("flow");
    expect(kinds).toContain("arrow");
    expect(kinds).toContain("exit");
  });

  it("NO gradient (pre-v2 study) → the served zone/ponding polygons become the water fills", () => {
    const model = buildFloodMapOverlayModel(fixtureStudy());
    expect(model.gradient).toBeNull();
    expect(model.usesFallbackFills).toBe(true);
    const kinds = model.vectors.features.map(
      (f) => (f as { properties: { kind: string } }).properties.kind,
    );
    expect(kinds).toContain("zone");
    expect(kinds).toContain("ponding");
  });

  it("a malformed gradient bbox is rejected → fallback (never a mis-anchored image)", () => {
    const model = buildFloodMapOverlayModel(
      fixtureStudy({
        gradient: {
          pngBase64: "iVBORw0KGgo=",
          bbox: { westLng: 1, southLat: 1, eastLng: 1, northLat: 1 },
        },
      }),
    );
    expect(model.gradient).toBeNull();
    expect(model.usesFallbackFills).toBe(true);
  });

  it("honestEmpty → an empty model (the map stays untouched)", () => {
    const model = buildFloodMapOverlayModel(
      fixtureStudy({ honestEmpty: { reason: "flat terrain" }, gradient: GRADIENT }),
    );
    expect(model.gradient).toBeNull();
    expect(model.vectors.features).toHaveLength(0);
  });

  it("exit arrows carry the ENGINE's bearingDeg verbatim", () => {
    const model = buildFloodMapOverlayModel(fixtureStudy());
    const exit = model.vectors.features.find(
      (f) => (f as { properties: { kind: string } }).properties.kind === "exit",
    ) as { geometry: { coordinates: [number, number] }; properties: { bearing: number } };
    expect(exit.properties.bearing).toBe(135);
    expect(exit.geometry.coordinates).toEqual([-97.3185, 30.1102]);
  });
});

describe("flow arrows — built from the flow lines' segment bearings", () => {
  it("bearing math: north=0, east=90, south=180, west=270", () => {
    expect(segmentBearingDeg([0, 0], [0, 0.001])).toBeCloseTo(0, 5);
    expect(segmentBearingDeg([0, 0], [0.001, 0])).toBeCloseTo(90, 5);
    expect(segmentBearingDeg([0, 0], [0, -0.001])).toBeCloseTo(180, 5);
    expect(segmentBearingDeg([0, 0], [-0.001, 0])).toBeCloseTo(270, 5);
  });

  it("a short line gets ONE midpoint arrow pointing along its segment", () => {
    // ~55 m due east at the equator.
    const arrows = flowArrowPoints([
      [0, 0],
      [0.0005, 0],
    ]);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].bearingDeg).toBeCloseTo(90, 1);
    expect(arrows[0].lng).toBeCloseTo(0.00025, 6);
  });

  it("a long (>120 m) line gets THREE arrows spread along it", () => {
    // ~550 m due north.
    const arrows = flowArrowPoints([
      [0, 0],
      [0, 0.005],
    ]);
    expect(arrows).toHaveLength(3);
    for (const a of arrows) expect(a.bearingDeg).toBeCloseTo(0, 1);
    expect(arrows[0].lat).toBeLessThan(arrows[1].lat);
    expect(arrows[1].lat).toBeLessThan(arrows[2].lat);
  });

  it("a bent line's arrows use the CONTAINING segment's bearing (real direction)", () => {
    // ~220 m east then ~220 m north — first arrow east, last arrow north.
    const arrows = flowArrowPoints([
      [0, 0],
      [0.002, 0],
      [0.002, 0.002],
    ]);
    expect(arrows).toHaveLength(3);
    expect(arrows[0].bearingDeg).toBeCloseTo(90, 1);
    expect(arrows[2].bearingDeg).toBeCloseTo(0, 1);
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
    expect(fillPx).toBeGreaterThan(100); // a BOLD arrow, not a sliver.
    expect(haloPx).toBeGreaterThan(50); // the halo ring exists.
    // Corners stay transparent (it's an arrow, not a plate).
    expect(icon.data[3]).toBe(0);
  });
});

describe("apply/clear — layer stack + below-parcels anchoring", () => {
  const styleLayers = [
    { id: "hauska-basemap", type: "raster" },
    { id: "hauska-parcel-tiles-fill", type: "fill" },
    { id: "hauska-parcel-tiles-line", type: "line" },
    { id: "some-label", type: "symbol" },
  ];

  it("gradient study → image source + raster layer at 0.8 opacity BELOW the parcel layers", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy({ gradient: GRADIENT })));
    const src = map._sources.get(FLOOD_GRADIENT_SOURCE_ID)!;
    expect(src.type).toBe("image");
    expect(src.url).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(src.coordinates).toEqual([
      [BBOX.westLng, BBOX.northLat],
      [BBOX.eastLng, BBOX.northLat],
      [BBOX.eastLng, BBOX.southLat],
      [BBOX.westLng, BBOX.southLat],
    ]);
    const raster = map._layers.get(FLOOD_GRADIENT_LAYER_ID)!;
    expect(raster.def.type).toBe("raster");
    expect(raster.def.paint!["raster-opacity"]).toBe(0.8);
    expect(raster.beforeId).toBe("hauska-parcel-tiles-fill");
    // The full vector picture on top.
    for (const id of [
      FLOOD_CATCHMENT_GLOW_ID,
      FLOOD_CATCHMENT_LINE_ID,
      FLOOD_FLOW_BASE_ID,
      FLOOD_FLOW_DASH_ID,
      FLOOD_ARROW_LAYER_ID,
      FLOOD_EXIT_LAYER_ID,
    ]) {
      expect(map._layers.has(id)).toBe(true);
    }
    // Both arrow icons registered; symbol layers rotate by the bearing prop.
    expect(map._images.has(FLOOD_ARROW_ICON_ID)).toBe(true);
    expect(map._images.has(FLOOD_EXIT_ICON_ID)).toBe(true);
    const arrows = map._layers.get(FLOOD_ARROW_LAYER_ID)!;
    expect(arrows.def.layout!["icon-rotate"]).toEqual(["get", "bearing"]);
    expect(arrows.def.layout!["icon-rotation-alignment"]).toBe("map");
  });

  it("no parcel layers in the style → the raster anchors before the first symbol layer", () => {
    const map = fakeMap([
      { id: "hauska-basemap", type: "raster" },
      { id: "some-label", type: "symbol" },
    ]);
    expect(pickBelowParcelsBeforeId(map)).toBe("some-label");
  });

  it("no anchor at all → top-of-stack (undefined beforeId), never a throw", () => {
    expect(pickBelowParcelsBeforeId(fakeMap([]))).toBeUndefined();
  });

  it("FEATURE-DETECT fallback: no gradient → NO raster; zone/ponding fills carry the water", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy()));
    expect(map._layers.has(FLOOD_GRADIENT_LAYER_ID)).toBe(false);
    expect(map._sources.has(FLOOD_GRADIENT_SOURCE_ID)).toBe(false);
    expect(map._layers.get(FLOOD_ZONE_FILL_ID)!.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(map._layers.get(FLOOD_PONDING_FILL_ID)!.beforeId).toBe("hauska-parcel-tiles-fill");
    const data = map._sources.get(FLOOD_VECTOR_SOURCE_ID)!.data as {
      features: Array<{ properties: { kind: string } }>;
    };
    const kinds = data.features.map((f) => f.properties.kind);
    expect(kinds).toContain("zone");
    expect(kinds).toContain("ponding");
  });

  it("re-apply is idempotent and drops a stale raster when the new study has no gradient", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy({ gradient: GRADIENT })));
    expect(map._layers.has(FLOOD_GRADIENT_LAYER_ID)).toBe(true);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy()));
    expect(map._layers.has(FLOOD_GRADIENT_LAYER_ID)).toBe(false);
    expect(map._sources.has(FLOOD_GRADIENT_SOURCE_ID)).toBe(false);
    // One vector source, refreshed via setData — not duplicated.
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(true);
  });

  it("node has no rAF → apply returns null (static-but-bold dash fallback)", () => {
    const map = fakeMap(styleLayers);
    const stop = applyFloodMapOverlay(
      map,
      buildFloodMapOverlayModel(fixtureStudy({ gradient: GRADIENT })),
    );
    expect(stop).toBeNull();
  });

  it("the animated dash sequence is all LITERAL numeric arrays (crash-guard safe channel)", () => {
    expect(FLOW_DASH_SEQUENCE.length).toBeGreaterThan(4);
    for (const dash of FLOW_DASH_SEQUENCE) {
      expect(Array.isArray(dash)).toBe(true);
      for (const n of dash) expect(typeof n).toBe("number");
    }
    // The flow-dash layer starts on the sequence's literal first frame.
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy()));
    expect(map._layers.get(FLOOD_FLOW_DASH_ID)!.def.paint!["line-dasharray"]).toEqual(
      FLOW_DASH_SEQUENCE[0],
    );
  });

  it("clear removes EVERY overlay layer + source", () => {
    const map = fakeMap(styleLayers);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(fixtureStudy({ gradient: GRADIENT })));
    clearFloodMapOverlay(map);
    for (const id of FLOOD_OVERLAY_LAYER_IDS) expect(map._layers.has(id)).toBe(false);
    expect(map._sources.has(FLOOD_VECTOR_SOURCE_ID)).toBe(false);
    expect(map._sources.has(FLOOD_GRADIENT_SOURCE_ID)).toBe(false);
  });
});

/* ------------------- v3 watershed graphics (feature-detect) ------------- */

const RING: Array<[number, number]> = [
  [-97.322, 30.108],
  [-97.316, 30.108],
  [-97.316, 30.114],
  [-97.322, 30.114],
  [-97.322, 30.108],
];

/** Exit path: starts inside RING, leaves eastward; ~330 m long. */
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

const INTERIOR_PATH = {
  coordinates: [
    [-97.3235, 30.115],
    [-97.3232, 30.1148],
    [-97.323, 30.1146],
  ] as Array<[number, number]>,
  strength: 0.3,
  kind: "interior" as const,
};

const SWATHS = [
  {
    coordinates: [
      [-97.3201, 30.1102],
      [-97.3144, 30.1087],
      [-97.3146, 30.1083],
      [-97.3199, 30.1098],
      [-97.3201, 30.1102],
    ] as Array<[number, number]>,
    strength: 1,
    kind: "exit" as const,
  },
  {
    coordinates: [
      [-97.3236, 30.1151],
      [-97.3229, 30.1147],
      [-97.323, 30.1145],
      [-97.3237, 30.1149],
      [-97.3236, 30.1151],
    ] as Array<[number, number]>,
    strength: 0.3,
    kind: "interior" as const,
  },
];

function v3Study(overrides?: Partial<FloodDrainageStudyView>): FloodDrainageStudyView {
  return fixtureStudy({
    gradient: GRADIENT,
    parcelRingWgs84: RING,
    flowPaths: [EXIT_PATH, INTERIOR_PATH],
    catchmentSwaths: SWATHS,
    flowPathsNote: "traced from the D8 model",
    ...overrides,
  });
}

describe("v3 watershed model — strength ribbons + swaths (feature-detected)", () => {
  it("flowPaths present → swath polygons + strength/exitBoost-tagged flow ribbons; flowLinesGeoJson NOT drawn", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    expect(model.usesFlowRibbons).toBe(true);
    const feats = model.vectors.features as Array<{
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
    const swaths = feats.filter((f) => f.properties.kind === "swath");
    expect(swaths).toHaveLength(2);
    expect(swaths[0].geometry.type).toBe("Polygon");
    expect(swaths[0].properties.strength).toBe(1);
    const flows = feats.filter((f) => f.properties.kind === "flow");
    expect(flows).toHaveLength(2); // the two paths — not the legacy flow line.
    const exitFlow = flows.find((f) => f.properties.strength === 1)!;
    expect(exitFlow.properties.exitBoost).toBe(1.3);
    const interiorFlow = flows.find((f) => f.properties.strength === 0.3)!;
    expect(interiorFlow.properties.exitBoost).toBe(1);
    // The legacy flow line's coordinates never appear (ribbons REPLACE it).
    expect(JSON.stringify(flows)).not.toContain("30.113");
  });

  it("arrows along ribbons carry the path strength; spacing scales with strength", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    const arrows = (model.vectors.features as Array<{ properties: Record<string, unknown> }>)
      .filter((f) => f.properties.kind === "arrow");
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      expect([1, 0.3]).toContain(a.properties.strength);
      expect(typeof a.properties.bearing).toBe("number");
    }
    // Direct spacing check: same long line, strong → more arrows than weak.
    const longLine: Array<[number, number]> = [
      [0, 0],
      [0, 0.005], // ~550 m
    ];
    const strong = flowArrowPointsScaled(longLine, 1);
    const weak = flowArrowPointsScaled(longLine, 0);
    expect(strong.length).toBeGreaterThan(weak.length);
    expect(weak.length).toBeGreaterThanOrEqual(1);
  });

  it("exit path → amber arrowhead AT the parcel-boundary crossing (not the engine flowExits duplicate)", () => {
    const model = buildFloodMapOverlayModel(v3Study());
    const exits = (model.vectors.features as Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>).filter((f) => f.properties.kind === "exit");
    expect(exits).toHaveLength(1);
    // The first path vertex OUTSIDE the ring, with the crossing bearing.
    expect(exits[0].geometry.coordinates).toEqual([-97.3155, 30.109]);
    expect(typeof exits[0].properties.bearing).toBe("number");
    // The fixture's engine flowExit (-97.3185, 30.1102) is NOT double-drawn.
    expect(exits[0].geometry.coordinates).not.toEqual([-97.3185, 30.1102]);
  });

  it("no exit-kind path → the engine's own flowExits still draw (never silently dropped)", () => {
    const model = buildFloodMapOverlayModel(
      v3Study({ flowPaths: [INTERIOR_PATH], catchmentSwaths: [SWATHS[1]] }),
    );
    const exits = (model.vectors.features as Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>).filter((f) => f.properties.kind === "exit");
    expect(exits).toHaveLength(1);
    expect(exits[0].geometry.coordinates).toEqual([-97.3185, 30.1102]);
  });

  it("FEATURE-DETECT fallback: absent/malformed flowPaths → the exact pre-v3 model (no swaths, no strength)", () => {
    for (const study of [
      fixtureStudy({ gradient: GRADIENT }),
      v3Study({ flowPaths: [], catchmentSwaths: [] }),
      v3Study({
        flowPaths: [{ coordinates: [[1, 1]], strength: 0.5, kind: "interior" }], // 1 vertex = malformed
        catchmentSwaths: [],
      }),
    ]) {
      const model = buildFloodMapOverlayModel(study);
      expect(model.usesFlowRibbons).toBe(false);
      const feats = model.vectors.features as Array<{ properties: Record<string, unknown> }>;
      expect(feats.some((f) => f.properties.kind === "swath")).toBe(false);
      const flow = feats.find((f) => f.properties.kind === "flow")!;
      expect(flow.properties.strength).toBeUndefined();
    }
  });

  it("exitCrossingPoint: ring crossing wins; no ring → the terminal vertex stands in", () => {
    const withRing = exitCrossingPoint(EXIT_PATH.coordinates, RING)!;
    expect([withRing.lng, withRing.lat]).toEqual([-97.3155, 30.109]);
    const noRing = exitCrossingPoint(EXIT_PATH.coordinates, undefined)!;
    expect([noRing.lng, noRing.lat]).toEqual([-97.3145, 30.1085]);
    expect(exitCrossingPoint([[0, 0]], RING)).toBeNull();
  });

  it("apply draws the swath corridor pair below the parcels with strength-driven paint", () => {
    const map = fakeMap([
      { id: "hauska-parcel-tiles-fill", type: "fill" },
      { id: "some-label", type: "symbol" },
    ]);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    const casing = map._layers.get(FLOOD_SWATH_CASING_ID)!;
    const fill = map._layers.get(FLOOD_SWATH_FILL_ID)!;
    expect(casing.def.type).toBe("line");
    expect(casing.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(fill.def.type).toBe("fill");
    expect(fill.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(JSON.stringify(fill.def.paint!["fill-opacity"])).toContain('"strength"');
    // Ribbon widths are strength-driven with the exitBoost multiplier.
    const base = map._layers.get(FLOOD_FLOW_BASE_ID)!;
    expect(JSON.stringify(base.def.paint!["line-width"])).toContain('"strength"');
    expect(JSON.stringify(base.def.paint!["line-width"])).toContain('"exitBoost"');
    const dash = map._layers.get(FLOOD_FLOW_DASH_ID)!;
    expect(JSON.stringify(dash.def.paint!["line-width"])).toContain('"strength"');
    // The animated core still starts on the literal first dash frame.
    expect(dash.def.paint!["line-dasharray"]).toEqual(FLOW_DASH_SEQUENCE[0]);
  });
});

/* ------------------- overlay dominance — scrim + dim/restore ------------ */

describe("overlay dominance — scrim + dim + exact paint restoration", () => {
  const domStyle = [
    { id: "hauska-basemap", type: "raster" },
    { id: "hauska-ovl-live-parcels-fill", type: "fill", paint: { "fill-opacity": 0.5 } },
    { id: "hauska-ovl-live-parcels-line", type: "line", paint: { "line-opacity": 0.9 } },
    { id: "hauska-gis-zoning-fill", type: "fill", paint: { "fill-opacity": 0.35 } },
    { id: "hauska-ovl-live-topography-line", type: "line", paint: { "line-opacity": 0.8 } },
    { id: "hauska-ovl-live-hydrography-line", type: "line", paint: { "line-width": 2.4 } },
    { id: "hauska-parcel-tiles-fill", type: "fill", paint: { "fill-opacity": 0.08 } },
    { id: "hauska-parcel-tiles-line", type: "line", paint: { "line-opacity": 1 } },
    { id: "some-label", type: "symbol" },
  ];

  it("classifier: zoning/land-use fills + contour lines dim; hydrography thins; parcels + our own layers untouched", () => {
    const targets = classifyFloodDominanceTargets([
      ...domStyle,
      { id: "pe-flood-zone-fill", type: "fill" }, // ours — never dimmed.
    ]);
    const byId = new Map(targets.map((t) => [t.layerId, t]));
    expect(byId.get("hauska-ovl-live-parcels-fill")).toEqual({
      layerId: "hauska-ovl-live-parcels-fill",
      prop: "fill-opacity",
      value: FLOOD_DIM_OPACITY,
    });
    expect(byId.get("hauska-gis-zoning-fill")!.value).toBe(FLOOD_DIM_OPACITY);
    expect(byId.get("hauska-ovl-live-topography-line")!.prop).toBe("line-opacity");
    expect(byId.get("hauska-ovl-live-hydrography-line")).toEqual({
      layerId: "hauska-ovl-live-hydrography-line",
      prop: "line-width",
      value: FLOOD_HYDRO_THIN_WIDTH,
    });
    // Parcel boundaries + tiles + basemap + labels + our own: untouched.
    expect(byId.has("hauska-ovl-live-parcels-line")).toBe(false);
    expect(byId.has("hauska-parcel-tiles-fill")).toBe(false);
    expect(byId.has("hauska-parcel-tiles-line")).toBe(false);
    expect(byId.has("hauska-basemap")).toBe(false);
    expect(byId.has("some-label")).toBe(false);
    expect(byId.has("pe-flood-zone-fill")).toBe(false);
  });

  it("apply inserts the scrim UNDER the flood stack at the below-parcels anchor and dims the competitors", () => {
    const map = fakeMap(domStyle);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // Scrim: first entry of the documented bottom→top stack, anchored below
    // the parcel tiles like every below-parcels flood layer.
    expect(FLOOD_OVERLAY_LAYER_IDS[0]).toBe(FLOOD_SCRIM_LAYER_ID);
    const scrim = map._layers.get(FLOOD_SCRIM_LAYER_ID)!;
    expect(scrim.def.type).toBe("fill");
    expect(scrim.beforeId).toBe("hauska-parcel-tiles-fill");
    expect(map._sources.has(FLOOD_SCRIM_SOURCE_ID)).toBe(true);
    // Competitors dimmed / thinned.
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(FLOOD_DIM_OPACITY);
    expect(map._paint("hauska-gis-zoning-fill", "fill-opacity")).toBe(FLOOD_DIM_OPACITY);
    expect(map._paint("hauska-ovl-live-topography-line", "line-opacity")).toBe(FLOOD_DIM_OPACITY);
    expect(map._paint("hauska-ovl-live-hydrography-line", "line-width")).toBe(
      FLOOD_HYDRO_THIN_WIDTH,
    );
    // Untargeted layers keep their paint.
    expect(map._paint("hauska-parcel-tiles-fill", "fill-opacity")).toBe(0.08);
  });

  it("teardown restores EVERY captured paint value exactly (capture-before-mutate, no hardcoded restores)", () => {
    const map = fakeMap(domStyle);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    clearFloodMapOverlay(map);
    expect(map._layers.has(FLOOD_SCRIM_LAYER_ID)).toBe(false);
    expect(map._sources.has(FLOOD_SCRIM_SOURCE_ID)).toBe(false);
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(0.5);
    expect(map._paint("hauska-gis-zoning-fill", "fill-opacity")).toBe(0.35);
    expect(map._paint("hauska-ovl-live-topography-line", "line-opacity")).toBe(0.8);
    expect(map._paint("hauska-ovl-live-hydrography-line", "line-width")).toBe(2.4);
  });

  it("re-apply while dominant never re-captures the dimmed values as original", () => {
    const map = fakeMap(domStyle);
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    // Second apply (study refresh) — must NOT capture 0.12 as "original".
    applyFloodMapOverlay(map, buildFloodMapOverlayModel(v3Study()));
    clearFloodMapOverlay(map);
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(0.5);
    expect(map._paint("hauska-ovl-live-hydrography-line", "line-width")).toBe(2.4);
  });

  it("no getPaintProperty seam → dominance skipped entirely (never a restore-by-guess)", () => {
    const map = fakeMap(domStyle);
    // Strip the read seam: exact restoration impossible → honest no-op.
    (map as { getPaintProperty?: unknown }).getPaintProperty = undefined;
    applyFloodDominance(map);
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(0.5);
    restoreFloodDominance(map); // no captures → no-op, no throw.
    expect(map._paint("hauska-ovl-live-parcels-fill", "fill-opacity")).toBe(0.5);
  });

  it("controller clear path (set(null)) restores dominance too", () => {
    const map = fakeMap(domStyle);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(v3Study(), "48021:1");
    expect(map._paint("hauska-gis-zoning-fill", "fill-opacity")).toBe(FLOOD_DIM_OPACITY);
    ctl.set(null);
    expect(map._paint("hauska-gis-zoning-fill", "fill-opacity")).toBe(0.35);
    expect(map._layers.has(FLOOD_SCRIM_LAYER_ID)).toBe(false);
  });
});

describe("controller — the setDossierOverlay lifecycle precedent", () => {
  const styleLayers = [{ id: "hauska-parcel-tiles-line", type: "line" }];

  it("set(study) draws and records the owning property; set(null) clears", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    expect(ctl.appliedFor()).toBe("48021:1");
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(true);
    ctl.set(null);
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(false);
  });

  it("ACTIVE-PROPERTY SWITCH auto-clears a stale overlay — never leaks across properties", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    ctl.onActivePropertyChange("48021:1"); // same property → stays.
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(true);
    ctl.onActivePropertyChange("48055:2"); // switched → clears.
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(false);
    // No overlay drawn → a further switch is a no-op (no throw).
    ctl.onActivePropertyChange(null);
  });

  it("honestEmpty studies NEVER draw (and clear whatever was there)", () => {
    const map = fakeMap(styleLayers);
    const ctl = createFloodMapOverlayController(() => map);
    ctl.set(fixtureStudy(), "48021:1");
    ctl.set(fixtureStudy({ honestEmpty: { reason: "flat" } }), "48021:1");
    expect(ctl.appliedFor()).toBeNull();
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(false);
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
    expect(map._layers.has(FLOOD_FLOW_BASE_ID)).toBe(false);
    expect(ctl.appliedFor()).toBeNull();
  });
});
