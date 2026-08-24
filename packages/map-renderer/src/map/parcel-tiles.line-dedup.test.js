/**
 * setParcelTilesLineSuppressed — the P-60e parcel-line dedup paint seam.
 *
 * While the live county mesh draws exact boundaries, the simplified tile base
 * lines fade to 0 opacity; subject/inspected feature-state strokes stay at 1.
 * Paint-only, on the `line-opacity` channel nothing else writes: the boundary
 * toggle owns layout visibility, the zoning toggle owns line-color, and the
 * FILL layer (click feedback / choropleth / feature-state) is never touched.
 *
 * Run: node --test (map-renderer test script).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  addParcelTiles,
  setParcelTilesToggles,
  setParcelTilesLineSuppressed,
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

test("suppressed → base line opacity 0, subject/inspected strokes stay at 1", () => {
  const map = freshMap();
  setParcelTilesLineSuppressed(map, true);

  const opacity = map.paint[PARCEL_TILES_LINE_ID]["line-opacity"];
  assert.ok(Array.isArray(opacity), "feature-state case expression");
  assert.equal(baseBranch(opacity), 0, "base tile lines fully transparent");
  // The subject, inspected, and hover branches keep full opacity so selection
  // and hover feedback never dim while the dedup is active (hover is
  // feature-state since the P-60 fragment peel).
  const branchValues = opacity.filter((v) => v === 1);
  assert.equal(branchValues.length, 3, "subject + inspected + hover branches stay 1");
  assert.match(JSON.stringify(opacity), /"hover"/, "hover branch present");
});

test("restored → countyRing demotes one lot, everyone else stays 1", () => {
  const map = freshMap();
  setParcelTilesLineSuppressed(map, true);
  setParcelTilesLineSuppressed(map, false);

  const opacity = map.paint[PARCEL_TILES_LINE_ID]["line-opacity"];
  assert.ok(Array.isArray(opacity), "fail-open is still a case expr");
  assert.equal(baseBranch(opacity), 1, "unsuppressed base stays painted");
  assert.match(JSON.stringify(opacity), /countyRing/, "sealed lot can demote");
});

test("countyRing branch is 0 even when viewport suppress is off", () => {
  const map = freshMap();
  setParcelTilesLineSuppressed(map, false);
  const opacity = map.paint[PARCEL_TILES_LINE_ID]["line-opacity"];
  assert.equal(opacity[0], "case");
  assert.equal(opacity[2], 0, "countyRing paint is transparent");
  assert.equal(baseBranch(opacity), 1);
});

test("paint-only and line-layer-only: fill/glow paint + all layouts untouched", () => {
  const map = freshMap();
  setParcelTilesLineSuppressed(map, true);

  assert.equal(map.paint[PARCEL_TILES_FILL_ID], undefined, "fill paint untouched");
  assert.equal(map.paint[PARCEL_TILES_GLOW_ID], undefined, "glow paint untouched");
  assert.equal(map.layout[PARCEL_TILES_LINE_ID], undefined, "no layout flip");
});

test("composes with the boundary toggle: toggles own layout, dedup owns opacity", () => {
  const map = freshMap();
  setParcelTilesLineSuppressed(map, true);
  setParcelTilesToggles(map, { zoningFill: true, boundaryLines: false });

  // The toggle write did not clobber the suppression (different channels).
  assert.equal(baseBranch(map.paint[PARCEL_TILES_LINE_ID]["line-opacity"]), 0);
  assert.equal(map.layout[PARCEL_TILES_LINE_ID].visibility, "none");
});

test("no source / no layer → no-op, no throw", () => {
  const bare = makeMapStub();
  assert.doesNotThrow(() => setParcelTilesLineSuppressed(bare, true));
  assert.equal(bare.paint[PARCEL_TILES_LINE_ID], undefined);
});
