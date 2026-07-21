/**
 * Regression fence for the overlay line-dasharray passthrough (added for the
 * property-explorer buildable-envelope wedge: a bold dashed setback edge).
 *
 * The contract:
 *   1. A STATIC literal dash (e.g. [3, 2]) supplied via OverlaySpec.paint
 *      ["line-dasharray"] IS applied to the overlay's polygon/standalone line.
 *   2. Anything that is NOT a literal number array — a MapLibre expression, a
 *      feature-state lookup, a non-array — is DROPPED (the crash guard: only a
 *      literal dasharray is safe; a feature-state-driven one is the
 *      setConstantDashPositions per-frame crash).
 *
 * Pure: a tiny MapLibre Map double records addLayer paint. Exit-bounded.
 *
 * Run: node --test src/map/overlay-render.dash.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";

import { reconcileOverlays, overlaySourceId } from "./overlay-render.js";

/** Minimal MapLibre Map double: records sources/layers so we can read paint. */
function fakeMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, def),
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, def),
    removeLayer: (id) => layers.delete(id),
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) l.paint[prop] = val;
    },
    setLayoutProperty: () => {},
    _layers: layers,
  };
}

const POLY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
};

test("a STATIC literal line-dasharray is applied to the overlay line layer", () => {
  const map = fakeMap();
  reconcileOverlays(
    map,
    [
      {
        layerKey: "buildable-envelope",
        geojson: POLY,
        paint: { "line-color": "#f2a23c", "line-width": 2.2, "line-dasharray": [3, 2] },
      },
    ],
    new Set(),
  );
  const lineId = `${overlaySourceId("buildable-envelope")}-line`;
  const line = map.getLayer(lineId);
  assert.ok(line, "polygon overlay produced a line layer");
  assert.deepEqual(
    line.paint["line-dasharray"],
    [3, 2],
    "static literal dash is applied verbatim",
  );
});

test("a feature-state-driven dasharray is DROPPED (crash guard)", () => {
  const map = fakeMap();
  reconcileOverlays(
    map,
    [
      {
        layerKey: "bad-dash",
        geojson: POLY,
        paint: {
          "line-dasharray": ["case", ["feature-state", "x"], [1, 1], [2, 2]],
        },
      },
    ],
    new Set(),
  );
  const line = map.getLayer(`${overlaySourceId("bad-dash")}-line`);
  assert.ok(line, "line layer still created");
  assert.equal(
    line.paint["line-dasharray"],
    undefined,
    "a non-literal (expression / feature-state) dasharray must be dropped",
  );
  assert.ok(
    !JSON.stringify(line.paint).includes("feature-state"),
    "no feature-state leaks into the line paint",
  );
});

test("no dasharray supplied -> the key is absent (unchanged default line)", () => {
  const map = fakeMap();
  reconcileOverlays(
    map,
    [{ layerKey: "plain", geojson: POLY, paint: { "line-color": "#4a7ab5" } }],
    new Set(),
  );
  const line = map.getLayer(`${overlaySourceId("plain")}-line`);
  assert.equal(line.paint["line-dasharray"], undefined, "no dash key when none supplied");
});
