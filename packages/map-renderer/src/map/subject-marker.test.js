/**
 * W3 — subject / compare markers.
 *
 * Operator, on the live surface: "when I hit find I can not find the property,
 * it will not zoom in or place an arrow on the lot" and "I am comparing 2
 * properties and I have no idea where they are, there should be some point of
 * visual reference to show each location."
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUBJECT_MARKER_CORE_ID,
  SUBJECT_MARKER_FONT,
  SUBJECT_MARKER_HALO_ID,
  SUBJECT_MARKER_LABEL_ID,
  SUBJECT_MARKER_RING_ID,
  SUBJECT_MARKER_SOURCE_ID,
  addSubjectMarkers,
  markersToFeatureCollection,
  raiseSubjectMarkers,
  removeSubjectMarkers,
  setSubjectMarkerData,
} from "./subject-marker.js";
import { SUBJECT_AMBER, SUBJECT_AMBER_BRIGHT } from "./layer-role-taxonomy.js";

/** A MapLibre stand-in that records what was added, in order. */
function fakeMap() {
  const sources = new Map();
  const layers = [];
  const moved = [];
  return {
    layers,
    moved,
    sources,
    getSource: (id) => sources.get(id),
    addSource(id, spec) {
      sources.set(id, { ...spec, setData(d) { this.data = d; } });
    },
    getLayer: (id) => layers.find((l) => l.id === id),
    addLayer(spec, beforeId) {
      const idx = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (idx >= 0) layers.splice(idx, 0, spec);
      else layers.push(spec);
    },
    removeLayer(id) {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
    },
    removeSource(id) {
      sources.delete(id);
    },
    moveLayer(id) {
      moved.push(id);
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.push(layers.splice(i, 1)[0]);
    },
  };
}

describe("subject markers (W3)", () => {
  it("drops markers without finite coordinates rather than drawing them at 0,0", () => {
    const fc = markersToFeatureCollection([
      { id: "a", longitude: -97.3184, latitude: 30.1105 },
      { id: "no-coords" },
      { id: "nan", longitude: Number.NaN, latitude: 30 },
      { id: "string", longitude: "-97", latitude: "30" },
      null,
    ]);
    assert.equal(fc.features.length, 1);
    assert.equal(fc.features[0].properties.markerId, "a");
    assert.deepEqual(fc.features[0].geometry.coordinates, [-97.3184, 30.1105]);
  });

  it("accepts either longitude/latitude or lng/lat", () => {
    const fc = markersToFeatureCollection([{ lng: -97.3, lat: 30.1 }]);
    assert.deepEqual(fc.features[0].geometry.coordinates, [-97.3, 30.1]);
  });

  it("defaults the compare pair to A and B", () => {
    const fc = markersToFeatureCollection([
      { longitude: -97, latitude: 30 },
      { longitude: -96, latitude: 31, role: "secondary" },
    ]);
    assert.equal(fc.features[0].properties.role, "primary");
    assert.equal(fc.features[0].properties.label, "A");
    assert.equal(fc.features[1].properties.role, "secondary");
    assert.equal(fc.features[1].properties.label, "B");
    // An explicit label always wins.
    const named = markersToFeatureCollection([{ longitude: -97, latitude: 30, label: "1" }]);
    assert.equal(named.features[0].properties.label, "1");
  });

  it("adds the source and all four layers, idempotently", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    addSubjectMarkers(map);
    assert.ok(map.getSource(SUBJECT_MARKER_SOURCE_ID));
    const ids = map.layers.map((l) => l.id);
    assert.deepEqual(ids, [
      SUBJECT_MARKER_HALO_ID,
      SUBJECT_MARKER_RING_ID,
      SUBJECT_MARKER_CORE_ID,
      SUBJECT_MARKER_LABEL_ID,
    ]);
  });

  it("distinguishes compare property B by SHAPE, not by a second reserved hue", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    const core = map.getLayer(SUBJECT_MARKER_CORE_ID);
    const ring = map.getLayer(SUBJECT_MARKER_RING_ID);
    // Secondary gets a zero-radius core, so it renders as a hollow ring.
    const radius = JSON.stringify(core.paint["circle-radius"]);
    assert.ok(radius.includes("secondary"), "core radius must branch on role");
    const opacity = JSON.stringify(core.paint["circle-opacity"]);
    assert.ok(opacity.includes("secondary"));
    // …and a thicker ring stroke, so the difference survives at small sizes.
    assert.ok(JSON.stringify(ring.paint["circle-stroke-width"]).includes("secondary"));
    // Both wear the reserved SUBJECT amber; no second hue is minted.
    assert.equal(map.getLayer(SUBJECT_MARKER_HALO_ID).paint["circle-color"], SUBJECT_AMBER);
    assert.equal(core.paint["circle-color"], SUBJECT_AMBER);
    assert.equal(ring.paint["circle-stroke-color"], SUBJECT_AMBER_BRIGHT);
  });

  it("uses a font stack that exists at the configured glyph endpoint", () => {
    // Probed 2026-08-18 against protomaps basemaps-assets: "Noto Sans Medium"
    // and "Noto Sans Regular" return 200; "Open Sans Regular" and
    // "Noto Sans Bold" return 404. A wrong stack draws nothing, silently.
    assert.deepEqual(SUBJECT_MARKER_FONT, ["Noto Sans Medium"]);
    const map = fakeMap();
    addSubjectMarkers(map);
    assert.deepEqual(map.getLayer(SUBJECT_MARKER_LABEL_ID).layout["text-font"], SUBJECT_MARKER_FONT);
  });

  it("replaces the whole marker set on every push, and clears on empty", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    setSubjectMarkerData(map, [{ id: "a", longitude: -97, latitude: 30 }]);
    assert.equal(map.getSource(SUBJECT_MARKER_SOURCE_ID).data.features.length, 1);
    setSubjectMarkerData(map, [
      { id: "a", longitude: -97, latitude: 30 },
      { id: "b", longitude: -96, latitude: 31, role: "secondary" },
    ]);
    assert.equal(map.getSource(SUBJECT_MARKER_SOURCE_ID).data.features.length, 2);
    setSubjectMarkerData(map, []);
    assert.equal(map.getSource(SUBJECT_MARKER_SOURCE_ID).data.features.length, 0);
  });

  it("no-ops safely before the source exists", () => {
    const map = fakeMap();
    assert.doesNotThrow(() => setSubjectMarkerData(map, [{ longitude: -97, latitude: 30 }]));
    assert.doesNotThrow(() => raiseSubjectMarkers(map));
    assert.doesNotThrow(() => setSubjectMarkerData(null, []));
    assert.doesNotThrow(() => addSubjectMarkers(null));
  });

  it("re-lifts to the top so a reorder cannot bury the SUBJECT role", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    map.addLayer({ id: "some-overlay-fill" });
    raiseSubjectMarkers(map);
    assert.deepEqual(map.layers.map((l) => l.id).slice(-4), [
      SUBJECT_MARKER_HALO_ID,
      SUBJECT_MARKER_RING_ID,
      SUBJECT_MARKER_CORE_ID,
      SUBJECT_MARKER_LABEL_ID,
    ]);
  });

  it("tears down cleanly", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    removeSubjectMarkers(map);
    assert.equal(map.layers.length, 0);
    assert.equal(map.getSource(SUBJECT_MARKER_SOURCE_ID), undefined);
  });

  it("drives no dasharray, gradient, or feature-state (blank-map crash guard)", () => {
    const map = fakeMap();
    addSubjectMarkers(map);
    const serialized = JSON.stringify(map.layers);
    assert.ok(!serialized.includes("line-dasharray"));
    assert.ok(!serialized.includes("line-gradient"));
    assert.ok(!serialized.includes("feature-state"));
  });
});
