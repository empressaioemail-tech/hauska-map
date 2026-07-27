/**
 * QA1 road-feather styling regression (map-renderer choke point).
 *
 * Contract:
 *   1. OverlaySpec.paint may pass line-blur + zoom-interpolate width/opacity
 *      (safe feather — same channel as gis-hydrology-flow / parcel glow).
 *   2. OverlaySpec.beforeId inserts the line beneath the named sibling and
 *      re-asserts via moveLayer on subsequent reconcile (pan/zoom upserts).
 *   3. No feature-state line-gradient is invented (crash guard).
 *
 * Run: node --test src/map/overlay-render.road-feather.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";

import { reconcileOverlays, overlaySourceId } from "./overlay-render.js";

function fakeMap() {
  const sources = new Map();
  /** @type {Map<string, { id: string, type: string, source: string, paint: Record<string, unknown>, beforeId?: string }>} */
  const layers = new Map();
  /** Insertion order approximates MapLibre stack (first = bottom). */
  const order = [];
  return {
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, def),
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (def, beforeId) => {
      layers.set(def.id, { ...def, beforeId });
      const idx =
        beforeId && order.includes(beforeId)
          ? order.indexOf(beforeId)
          : order.length;
      order.splice(idx, 0, def.id);
    },
    removeLayer: (id) => {
      layers.delete(id);
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
    },
    moveLayer: (id, beforeId) => {
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      const idx =
        beforeId && order.includes(beforeId)
          ? order.indexOf(beforeId)
          : order.length;
      order.splice(idx, 0, id);
      const layer = layers.get(id);
      if (layer) layer.beforeId = beforeId;
    },
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) l.paint[prop] = val;
    },
    setLayoutProperty: () => {},
    _layers: layers,
    _order: order,
  };
}

const LINE_FC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { role: "centerline" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-97.3, 30.1],
          [-97.3, 30.11],
        ],
      },
    },
  ],
};

const GREY = "#c4c4c4";
const FORBIDDEN_BLUE = ["#1a5f9e", "#3b82b0"];
const WIDTH_EXPR = ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 28, 18, 40];
const BLUR_EXPR = ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 8, 18, 12];
const OPACITY_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  0.1,
  16,
  0.22,
  18,
  0.28,
];

test("road paint uses line-blur + zoom-interp width + grey (not legacy blue)", () => {
  const map = fakeMap();
  // Parcels mounted first — the beforeId anchor.
  map.addLayer({
    id: "hauska-parcel-tiles-fill",
    type: "fill",
    source: "hauska-parcel-tiles",
    paint: {},
  });
  map.addLayer({
    id: "hauska-parcel-tiles-line",
    type: "line",
    source: "hauska-parcel-tiles",
    paint: {},
  });

  reconcileOverlays(
    map,
    [
      {
        layerKey: "road-node-row-band",
        geojson: LINE_FC,
        beforeId: "hauska-parcel-tiles-fill",
        paint: {
          "line-color": GREY,
          "line-width": WIDTH_EXPR,
          "line-opacity": OPACITY_EXPR,
          "line-blur": BLUR_EXPR,
        },
      },
    ],
    new Set(),
  );

  const lineId = `${overlaySourceId("road-node-row-band")}-line`;
  const line = map.getLayer(lineId);
  assert.ok(line, "road band produced a line layer");
  assert.equal(line.paint["line-color"], GREY, "grey corridor color");
  for (const blue of FORBIDDEN_BLUE) {
    assert.notEqual(line.paint["line-color"], blue, `must not use ${blue}`);
  }
  assert.deepEqual(
    line.paint["line-blur"],
    BLUR_EXPR,
    "line-blur zoom expression passed through (safe feather)",
  );
  assert.deepEqual(
    line.paint["line-width"],
    WIDTH_EXPR,
    "line-width zoom interpolate passed through",
  );
  assert.deepEqual(
    line.paint["line-opacity"],
    OPACITY_EXPR,
    "line-opacity zoom interpolate passed through",
  );
  assert.ok(
    !JSON.stringify(line.paint).includes("line-gradient"),
    "no line-gradient (crash guard)",
  );
  assert.ok(
    !JSON.stringify(line.paint).includes("feature-state"),
    "no feature-state in road paint",
  );

  const order = map._order;
  const roadIdx = order.indexOf(lineId);
  const fillIdx = order.indexOf("hauska-parcel-tiles-fill");
  assert.ok(roadIdx >= 0 && fillIdx >= 0, "both layers present");
  assert.ok(
    roadIdx < fillIdx,
    "road band inserted with beforeId below parcel fill",
  );
});

test("beforeId is re-asserted on reconcile upsert (pan/zoom)", () => {
  const map = fakeMap();
  map.addLayer({
    id: "hauska-parcel-tiles-fill",
    type: "fill",
    source: "hauska-parcel-tiles",
    paint: {},
  });

  const keys = new Set();
  const spec = {
    layerKey: "road-node-centerline",
    geojson: LINE_FC,
    beforeId: "hauska-parcel-tiles-fill",
    paint: {
      "line-color": GREY,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 0.8],
      "line-opacity": 0.2,
    },
  };

  reconcileOverlays(map, [spec], keys);
  const lineId = `${overlaySourceId("road-node-centerline")}-line`;

  // Simulate something else floating above parcels, then roads re-reconcile.
  map.moveLayer(lineId); // no beforeId => top
  assert.equal(
    map._order[map._order.length - 1],
    lineId,
    "precondition: road floated to top",
  );

  reconcileOverlays(map, [spec], keys);
  const roadIdx = map._order.indexOf(lineId);
  const fillIdx = map._order.indexOf("hauska-parcel-tiles-fill");
  assert.ok(
    roadIdx < fillIdx,
    "second reconcile moveLayer keeps road beneath parcels",
  );
});

test("overlays without beforeId still add on top (flood/envelope unchanged)", () => {
  const map = fakeMap();
  map.addLayer({
    id: "hauska-parcel-tiles-fill",
    type: "fill",
    source: "hauska-parcel-tiles",
    paint: {},
  });
  reconcileOverlays(
    map,
    [
      {
        layerKey: "envelope",
        geojson: LINE_FC,
        paint: { "line-color": "#f2a23c", "line-width": 2 },
      },
    ],
    new Set(),
  );
  const lineId = `${overlaySourceId("envelope")}-line`;
  assert.ok(map.getLayer(lineId));
  assert.equal(
    map._order[map._order.length - 1],
    lineId,
    "no-beforeId overlay still stacks on top",
  );
});
