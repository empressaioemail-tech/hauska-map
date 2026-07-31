/**
 * setParcelTilesToggles — the LAYERS-panel binding for the PMTiles browse
 * parcels (map UX cluster item 3).
 *
 *   - "Zoning / land use" OFF → the land-use choropleth fill actually goes
 *     transparent (paint-only: the fill layer stays `visible` so parcel clicks
 *     keep working) and the base stroke color goes neutral.
 *   - "GIS Parcel Boundary" OFF → the line + glow layers hide via layout
 *     visibility; the fill layer's layout is never touched.
 *
 * Run: node --test (map-renderer test script).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  addParcelTiles,
  setParcelTilesToggles,
  PARCEL_TILES_SOURCE_ID,
  PARCEL_TILES_FILL_ID,
  PARCEL_TILES_LINE_ID,
  PARCEL_TILES_GLOW_ID,
} from "./parcel-tiles.js";

/** Minimal map stub: records paint/layout writes per layer. */
function makeMapStub() {
  const sources = new Map();
  const layers = new Map();
  return {
    paint: {},
    layout: {},
    addSource(id, def) {
      sources.set(id, def);
    },
    getSource(id) {
      return sources.get(id);
    },
    addLayer(def) {
      layers.set(def.id, def);
    },
    getLayer(id) {
      return layers.get(id);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    removeSource(id) {
      sources.delete(id);
    },
    setPaintProperty(id, prop, value) {
      (this.paint[id] ||= {})[prop] = value;
    },
    setLayoutProperty(id, prop, value) {
      (this.layout[id] ||= {})[prop] = value;
    },
  };
}

function freshMap() {
  const map = makeMapStub();
  addParcelTiles(map, { url: "pmtiles://x", sourceLayer: "parcels" });
  return map;
}

/** The base (non-selected) branch is the LAST value of the case expression. */
function baseBranch(expr) {
  return expr[expr.length - 1];
}

test("zoning OFF drops the base choropleth to transparent, paint-only (clicks keep working)", () => {
  const map = freshMap();
  setParcelTilesToggles(map, { zoningFill: false, boundaryLines: true });

  const opacity = map.paint[PARCEL_TILES_FILL_ID]["fill-opacity"];
  assert.equal(baseBranch(opacity), 0, "base parcels fully transparent");

  const color = map.paint[PARCEL_TILES_FILL_ID]["fill-color"];
  // Neutral highlight — the land-use choropleth (a nested case expr) is gone.
  assert.equal(typeof baseBranch(color), "string");
  // No layout visibility flip on the fill layer — it must keep rendering
  // (transparently) so queryRenderedFeatures click-to-inspect still hits it.
  assert.equal(map.layout[PARCEL_TILES_FILL_ID], undefined);

  // Boundary stroke loses the land-use color encoding too (neutral string).
  const line = map.paint[PARCEL_TILES_LINE_ID]["line-color"];
  assert.equal(typeof baseBranch(line), "string");
});

test("zoning ON restores the land-use choropleth (base branch is an expression)", () => {
  const map = freshMap();
  setParcelTilesToggles(map, { zoningFill: false, boundaryLines: true });
  setParcelTilesToggles(map, { zoningFill: true, boundaryLines: true });

  const opacity = map.paint[PARCEL_TILES_FILL_ID]["fill-opacity"];
  assert.equal(baseBranch(opacity), 0.22, "base choropleth opacity restored");
  const color = map.paint[PARCEL_TILES_FILL_ID]["fill-color"];
  assert.ok(Array.isArray(baseBranch(color)), "land-use choropleth expr restored");
});

test("boundary OFF hides line + glow via layout visibility; fill layout untouched", () => {
  const map = freshMap();
  setParcelTilesToggles(map, { zoningFill: true, boundaryLines: false });

  assert.equal(map.layout[PARCEL_TILES_LINE_ID].visibility, "none");
  assert.equal(map.layout[PARCEL_TILES_GLOW_ID].visibility, "none");
  assert.equal(map.layout[PARCEL_TILES_FILL_ID], undefined);

  setParcelTilesToggles(map, { zoningFill: true, boundaryLines: true });
  assert.equal(map.layout[PARCEL_TILES_LINE_ID].visibility, "visible");
  assert.equal(map.layout[PARCEL_TILES_GLOW_ID].visibility, "visible");
});

test("no source → no-op, no throw", () => {
  const map = makeMapStub();
  assert.doesNotThrow(() => setParcelTilesToggles(map, { zoningFill: false }));
  assert.equal(map.paint[PARCEL_TILES_FILL_ID], undefined);
  assert.ok(PARCEL_TILES_SOURCE_ID); // referenced: source id stays exported
});
