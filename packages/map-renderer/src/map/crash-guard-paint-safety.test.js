/**
 * Regression fence 3 — feature-state paint safety (broadened).
 *
 * Load-bearing crash guard: the parcel fill/line/glow paint must NEVER drive
 * `line-dasharray` or `line-gradient` from a `["feature-state", ...]` expression.
 * A feature-state dasharray/gradient re-triggers a documented per-frame
 * "Cannot read properties of null (setConstantDashPositions)" crash that blanks
 * the map. The existing smoke test asserts the substrings are simply absent; this
 * fence goes deeper: it walks the actual paint expression trees enumerated from
 * addParcelTiles and asserts (a) no line-dasharray / line-gradient key exists at
 * all, and (b) if any dasharray/gradient key WERE present, it must be a literal
 * (no nested feature-state), never a feature-state-driven expression.
 *
 * Pure — reuses the smoke-test fakeMap pattern, no maplibre-gl mock needed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  addParcelTiles,
  PARCEL_TILES_FILL_ID,
  PARCEL_TILES_LINE_ID,
  PARCEL_TILES_GLOW_ID,
} from "./parcel-tiles.js";

/** Minimal fake map recording addSource/addLayer (matches the smoke test). */
function fakeMap() {
  const sources = new Map();
  const layers = new Map();
  return {
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, def),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, def),
  };
}

const CFG = {
  url: "https://tiles.example/parcels.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

/** True if `node` (any nesting depth) is/contains a ["feature-state", ...] expr. */
function containsFeatureState(node) {
  if (Array.isArray(node)) {
    if (node[0] === "feature-state") return true;
    return node.some(containsFeatureState);
  }
  if (node && typeof node === "object") {
    return Object.values(node).some(containsFeatureState);
  }
  return false;
}

/** Collect the paint objects for all three parcel layers off a populated map. */
function collectParcelPaints() {
  const map = fakeMap();
  addParcelTiles(map, CFG);
  return [PARCEL_TILES_FILL_ID, PARCEL_TILES_LINE_ID, PARCEL_TILES_GLOW_ID].map(
    (id) => {
      const layer = map.getLayer(id);
      assert.ok(layer, `${id} layer added`);
      return { id, paint: layer.paint || {} };
    },
  );
}

const FORBIDDEN_FEATURE_STATE_KEYS = ["line-dasharray", "line-gradient"];

test("no parcel paint key is a feature-state-driven line-dasharray or line-gradient", () => {
  for (const { id, paint } of collectParcelPaints()) {
    for (const key of FORBIDDEN_FEATURE_STATE_KEYS) {
      if (key in paint) {
        assert.ok(
          !containsFeatureState(paint[key]),
          `${id}.${key} must NOT be driven by feature-state (setConstantDashPositions crash guard)`,
        );
      }
    }
  }
});

test("parcel paints declare NO line-dasharray or line-gradient key at all", () => {
  for (const { id, paint } of collectParcelPaints()) {
    for (const key of FORBIDDEN_FEATURE_STATE_KEYS) {
      assert.ok(
        !(key in paint),
        `${id} must not declare ${key} (glow is solid stroke + blur only)`,
      );
    }
  }
});

test("any static dasharray present is a literal array, never a feature-state expression", () => {
  // Defensive: if a future edit adds a static dash, this fence forces it to stay
  // a plain literal array. Today none is present, so this asserts absence too.
  for (const { id, paint } of collectParcelPaints()) {
    const dash = paint["line-dasharray"];
    if (dash !== undefined) {
      assert.ok(
        Array.isArray(dash) && dash.every((n) => typeof n === "number"),
        `${id} line-dasharray must be a literal number array, not an expression`,
      );
      assert.ok(
        !containsFeatureState(dash),
        `${id} line-dasharray must not embed feature-state`,
      );
    }
  }
});

test("feature-state IS used, but only via the safe fill/line/glow properties", () => {
  const paints = collectParcelPaints();
  const serialized = JSON.stringify(paints.map((p) => p.paint));
  assert.ok(serialized.includes("feature-state"), "feature-state drives paint");
  // The safe keys that MAY carry feature-state.
  const SAFE_FS_KEYS = new Set([
    "fill-color",
    "fill-opacity",
    "line-color",
    "line-width",
    "line-blur",
  ]);
  for (const { id, paint } of paints) {
    for (const [key, val] of Object.entries(paint)) {
      if (containsFeatureState(val)) {
        assert.ok(
          SAFE_FS_KEYS.has(key),
          `${id}.${key} carries feature-state but is not in the safe set ${[...SAFE_FS_KEYS].join(", ")}`,
        );
      }
    }
  }
});
