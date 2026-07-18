/**
 * Smoke test for the PMTiles browse-parcel module (R1). Pure — stubs a minimal
 * MapLibre Map so it runs under `node --test` with no DOM / no real maplibre-gl.
 *
 * Run: node --test src/map/parcel-tiles.smoke.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  addParcelTiles,
  setParcelFeatureState,
  parcelNodeIdFromFeature,
  PARCEL_TILES_SOURCE_ID,
  PARCEL_TILES_FILL_ID,
  PARCEL_TILES_LINE_ID,
  PARCEL_TILES_GLOW_ID,
} from "./parcel-tiles.js";

/** Minimal fake MapLibre Map recording addSource/addLayer/setFeatureState. */
function fakeMap() {
  const sources = new Map();
  const layers = new Map();
  const featureStateCalls = [];
  return {
    sources,
    layers,
    featureStateCalls,
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, def),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, def),
    removeLayer: (id) => layers.delete(id),
    removeSource: (id) => sources.delete(id),
    setFeatureState: (target, state) =>
      featureStateCalls.push({ target, state }),
    removeFeatureState: () => {},
  };
}

const CFG = {
  url: "https://tiles.example/parcels.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

test("addParcelTiles creates a vector source with promoteId scoped to the source layer", () => {
  const map = fakeMap();
  addParcelTiles(map, CFG);
  const src = map.getSource(PARCEL_TILES_SOURCE_ID);
  assert.ok(src, "parcel source added");
  assert.equal(src.type, "vector");
  assert.equal(src.url, "pmtiles://https://tiles.example/parcels.pmtiles");
  assert.deepEqual(src.promoteId, { parcels: "parcel_node_id" });
});

test("addParcelTiles adds fill + line + glow layers, all with source-layer and no minzoom gate", () => {
  const map = fakeMap();
  addParcelTiles(map, CFG);
  for (const id of [PARCEL_TILES_FILL_ID, PARCEL_TILES_LINE_ID, PARCEL_TILES_GLOW_ID]) {
    const layer = map.getLayer(id);
    assert.ok(layer, `${id} added`);
    assert.equal(layer["source-layer"], "parcels");
    assert.ok(
      layer.minzoom == null,
      `${id} must render at all zooms (no browse minzoom gate)`,
    );
  }
});

test("glow paint uses ONLY feature-state fill/line color+width+blur — NO dasharray/gradient", () => {
  const map = fakeMap();
  addParcelTiles(map, CFG);
  const serialized = JSON.stringify([
    map.getLayer(PARCEL_TILES_FILL_ID).paint,
    map.getLayer(PARCEL_TILES_LINE_ID).paint,
    map.getLayer(PARCEL_TILES_GLOW_ID).paint,
  ]);
  // No forbidden crash-triggering paint keys anywhere in the parcel layers.
  assert.ok(!serialized.includes("line-dasharray"), "no line-dasharray");
  assert.ok(!serialized.includes("line-gradient"), "no line-gradient");
  // feature-state drives subject/inspected only via the safe properties.
  assert.ok(serialized.includes("feature-state"), "feature-state is used");
  assert.ok(serialized.includes("subject"), "subject state drives paint");
  assert.ok(serialized.includes("inspected"), "inspected state drives paint");
  assert.ok(serialized.includes("line-blur"), "line-blur present (safe glow)");
});

test("setParcelFeatureState keys setFeatureState on the parcel_node_id", () => {
  const map = fakeMap();
  addParcelTiles(map, CFG);
  setParcelFeatureState(map, "parcels", "48453:R12345", { subject: true });
  assert.equal(map.featureStateCalls.length, 1);
  const { target, state } = map.featureStateCalls[0];
  assert.equal(target.source, PARCEL_TILES_SOURCE_ID);
  assert.equal(target.sourceLayer, "parcels");
  assert.equal(target.id, "48453:R12345");
  assert.deepEqual(state, { subject: true });
});

test("setParcelFeatureState is a no-op when the source is absent (no throw)", () => {
  const map = fakeMap();
  setParcelFeatureState(map, "parcels", "48453:R12345", { subject: true });
  assert.equal(map.featureStateCalls.length, 0);
});

test("parcelNodeIdFromFeature reads the promoted id + derives county_fips", () => {
  const fromProp = parcelNodeIdFromFeature(
    { id: 7, properties: { parcel_node_id: "48453:R99", county_fips: "48453" } },
    "parcel_node_id",
  );
  assert.equal(fromProp.parcelNodeId, "48453:R99");
  assert.equal(fromProp.countyFips, "48453");

  // Falls back to feature.id (promoteId surfaces the value there) and splits fips.
  const fromId = parcelNodeIdFromFeature({ id: "48491:R42", properties: {} });
  assert.equal(fromId.parcelNodeId, "48491:R42");
  assert.equal(fromId.countyFips, "48491");
});
