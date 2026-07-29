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
  FLOOD_EXIT_ICON_ID,
  FLOOD_EXIT_LAYER_ID,
  FLOOD_FLOW_BASE_ID,
  FLOOD_FLOW_DASH_ID,
  FLOOD_GRADIENT_LAYER_ID,
  FLOOD_GRADIENT_SOURCE_ID,
  FLOOD_OVERLAY_LAYER_IDS,
  FLOOD_PONDING_FILL_ID,
  FLOOD_VECTOR_SOURCE_ID,
  FLOOD_ZONE_FILL_ID,
  FLOW_DASH_SEQUENCE,
  applyFloodMapOverlay,
  buildArrowIconData,
  buildFloodMapOverlayModel,
  clearFloodMapOverlay,
  createFloodMapOverlayController,
  flowArrowPoints,
  pickBelowParcelsBeforeId,
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

function fakeMap(styleLayers: Array<{ id: string; type?: string }> = []) {
  const layers = new Map<string, FakeLayer>();
  const sources = new Map<string, Record<string, unknown>>();
  const images = new Map<string, unknown>();
  const map: FloodOverlayMapLike & {
    _layers: Map<string, FakeLayer>;
    _sources: Map<string, Record<string, unknown>>;
    _images: Map<string, unknown>;
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
    setPaintProperty: () => {},
    hasImage: (id) => images.has(id),
    addImage: (id, image) => images.set(id, image),
    _layers: layers,
    _sources: sources,
    _images: images,
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
