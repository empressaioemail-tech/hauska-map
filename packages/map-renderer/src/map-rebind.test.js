/**
 * Rebind/re-point tests for the decoupled map renderer.
 *
 * Regression fence for the bindContext center NO-OP bug: a property/center change
 * must MOVE the live camera to the NEW center (it previously jumpTo'd the map's
 * current center, so re-pointing silently never happened). Also covers the
 * additive rebindProperty sugar and the getVisibleLayers/getLayerVisibility
 * getters.
 *
 * Pure: stubs maplibre-gl's Map/NavigationControl and a minimal DOM so mount()
 * builds a fake recording map — no WebGL, no real maplibre, no browser. Runs
 * under `node --test src/map-rebind.test.js`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import maplibregl from "maplibre-gl";

import { createMapRenderer, RENDERER_CONTRACT } from "./map-renderer.js";

/**
 * Fake MapLibre Map recording camera moves. Starts at a known Bastrop-ish view so
 * we can assert the camera actually moved to a DIFFERENT (new) center.
 */
function makeFakeMap() {
  const state = {
    center: { lng: -97.3153, lat: 30.1109 },
    zoom: 15.2,
    pitch: 0,
    bearing: 0,
  };
  const calls = { easeTo: [], jumpTo: [], flyTo: [], on: [] };
  const sources = new Map();
  const layers = new Map();
  const featureStateCalls = [];
  const map = {
    _state: state,
    calls,
    sources,
    layers,
    featureStateCalls,
    on: (evt, cb) => calls.on.push({ evt, cb }),
    off: () => {},
    addControl: () => {},
    removeControl: () => {},
    resize: () => {},
    remove: () => {},
    getCenter: () => ({ lng: state.center.lng, lat: state.center.lat }),
    getZoom: () => state.zoom,
    getPitch: () => state.pitch,
    getBearing: () => state.bearing,
    isStyleLoaded: () => true,
    getSource: (id) => sources.get(id),
    getLayer: (id) => layers.get(id),
    addSource: (id, def) => sources.set(id, def),
    addLayer: (def) => layers.set(def.id, def),
    moveLayer: () => {},
    removeLayer: (id) => layers.delete(id),
    removeSource: (id) => sources.delete(id),
    setFeatureState: (target, fstate) =>
      featureStateCalls.push({ target, state: fstate }),
    removeFeatureState: () => {},
    setPaintProperty: () => {},
    setLayoutProperty: () => {},
    getStyle: () => ({ layers: [...layers.values()] }),
    queryRenderedFeatures: () => [],
    easeTo: (opts) => {
      calls.easeTo.push(opts);
      applyCamera(state, opts);
    },
    jumpTo: (opts) => {
      calls.jumpTo.push(opts);
      applyCamera(state, opts);
    },
    flyTo: (opts) => {
      calls.flyTo.push(opts);
      applyCamera(state, opts);
    },
  };
  return map;
}

function applyCamera(state, opts) {
  if (Array.isArray(opts?.center)) {
    state.center = { lng: opts.center[0], lat: opts.center[1] };
  }
  if (typeof opts?.zoom === "number") state.zoom = opts.zoom;
  if (typeof opts?.pitch === "number") state.pitch = opts.pitch;
  if (typeof opts?.bearing === "number") state.bearing = opts.bearing;
}

/** Minimal DOM element sufficient for ensureMap()'s slot/mapEl handling. */
function makeEl() {
  const el = {
    className: "",
    style: {},
    innerHTML: "",
    children: [],
    appendChild: (c) => {
      el.children.push(c);
      return c;
    },
  };
  return el;
}

/**
 * Install stubs for maplibregl.Map + NavigationControl and a global document so
 * createMapRenderer().mount(slot) constructs our fake map. Returns { restore }.
 * Each mount records the fake map it built so the test can inspect camera calls.
 */
function withStubbedMaplibre(run) {
  const built = [];
  const origMap = maplibregl.Map;
  const origNav = maplibregl.NavigationControl;
  const origDoc = globalThis.document;
  const origRO = globalThis.ResizeObserver;

  maplibregl.Map = function FakeMap() {
    const m = makeFakeMap();
    built.push(m);
    // Fire the synchronous "load" handler path is not needed for camera tests;
    // we assert bindContext/rebindProperty re-point regardless of style load.
    return m;
  };
  maplibregl.NavigationControl = function FakeNav() {
    return {};
  };
  globalThis.document = { createElement: () => makeEl() };
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  try {
    return run(built);
  } finally {
    maplibregl.Map = origMap;
    maplibregl.NavigationControl = origNav;
    if (origDoc === undefined) delete globalThis.document;
    else globalThis.document = origDoc;
    if (origRO === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = origRO;
  }
}

test("bindContext with a new center re-points the camera to the NEW center (regression fence)", () => {
  withStubbedMaplibre((built) => {
    const r = createMapRenderer();
    // useFixture:false so no fit-to-fixture noise; center seeds the initial view.
    r.mount(makeEl());
    const map = built[0];
    assert.ok(map, "fake map constructed by mount");

    // The map starts at the seeded/default center.
    const before = map.getCenter();
    assert.equal(before.lng, -97.3153);
    assert.equal(before.lat, 30.1109);

    // New property center — a materially different location (Elgin-ish).
    const NEW = { longitude: -97.37, latitude: 30.35 };
    r.bindContext({ center: NEW });

    // A camera move must have fired with the NEW coordinates, NOT the old ones.
    assert.equal(map.calls.easeTo.length, 1, "easeTo fired exactly once");
    const move = map.calls.easeTo[0];
    assert.deepEqual(
      move.center,
      [NEW.longitude, NEW.latitude],
      "camera moved to the NEW center coords",
    );
    // The pre-fix bug jumpTo'd the CURRENT center; assert we did not do that.
    assert.notDeepEqual(
      move.center,
      [before.lng, before.lat],
      "camera did NOT re-point to the old (current) center",
    );
    // Zoom/pitch/bearing preserved when no new zoom supplied.
    assert.equal(move.zoom, 15.2, "zoom preserved");
    assert.equal(move.pitch, 0, "pitch preserved");
    assert.equal(move.bearing, 0, "bearing preserved");
  });
});

test("bindContext honors an explicit zoom on re-point", () => {
  withStubbedMaplibre((built) => {
    const r = createMapRenderer();
    r.mount(makeEl());
    const map = built[0];
    r.bindContext({ center: { longitude: -97.7, latitude: 30.27 }, zoom: 17 });
    const move = map.calls.easeTo.at(-1);
    assert.deepEqual(move.center, [-97.7, 30.27]);
    assert.equal(move.zoom, 17, "explicit zoom applied");
  });
});

test("rebindProperty composes the center re-point AND setParcelState", () => {
  withStubbedMaplibre((built) => {
    const r = createMapRenderer();
    r.mount(makeEl());
    const map = built[0];

    // Wire a parcel-tiles config so setParcelState's sourceLayer gate is open.
    // setParcelFeatureState additionally guards on the source existing on the
    // map, so seed that source directly (equivalent to what applyParcelTiles
    // does on `load`), avoiding the heavy full load-handler render path here.
    r.setParcelTiles({
      url: "https://tiles.example/parcels.pmtiles",
      sourceLayer: "parcels",
      promoteId: "parcel_node_id",
    });
    map.sources.set("hauska-parcel-tiles", { type: "vector" });

    const NEW = { longitude: -97.99, latitude: 30.51 };
    r.rebindProperty({
      center: NEW,
      address: "123 New Property Ln",
      parcelState: { parcelNodeId: "48453:R777", subject: true },
    });

    // Center re-point composed from the fixed bindContext.
    const move = map.calls.easeTo.at(-1);
    assert.deepEqual(
      move.center,
      [NEW.longitude, NEW.latitude],
      "rebindProperty moved the camera to the new center",
    );
    // setParcelState composed: subject state written for the new parcel node.
    assert.ok(
      map.featureStateCalls.some(
        (c) => c.target.id === "48453:R777" && c.state.subject === true,
      ),
      "rebindProperty lit the subject parcel via setParcelState",
    );
  });
});

test("rebindProperty never calls map.remove (never-unmount contract)", () => {
  withStubbedMaplibre((built) => {
    const r = createMapRenderer();
    r.mount(makeEl());
    const map = built[0];
    let removed = false;
    map.remove = () => {
      removed = true;
    };
    r.rebindProperty({ center: { longitude: -97.5, latitude: 30.4 } });
    assert.equal(removed, false, "the live map was never removed on rebind");
  });
});

test("getVisibleLayers returns a COPY (mutation does not leak into renderer state)", () => {
  const r = createMapRenderer();
  const seed = new Set(["parcels", "flood", "zoning"]);
  r.setLayerVisibility(seed);

  const got = r.getVisibleLayers();
  assert.deepEqual([...got].sort(), ["flood", "parcels", "zoning"]);

  // Mutating the returned set must NOT change internal state.
  got.add("__leak__");
  got.delete("parcels");
  const again = r.getVisibleLayers();
  assert.ok(!again.has("__leak__"), "added key did not leak into state");
  assert.ok(again.has("parcels"), "removed key still present in state");
  assert.deepEqual([...again].sort(), ["flood", "parcels", "zoning"]);
});

test("getLayerVisibility reflects setLayerVisibility per key", () => {
  const r = createMapRenderer();
  r.setLayerVisibility(new Set(["parcels", "flood"]));
  assert.equal(r.getLayerVisibility("parcels"), true);
  assert.equal(r.getLayerVisibility("flood"), true);
  assert.equal(r.getLayerVisibility("zoning"), false);
});

test("RENDERER_CONTRACT advertises the new signals", () => {
  const joined = RENDERER_CONTRACT.signals.join("|");
  assert.ok(joined.includes("rebindProperty"), "rebindProperty in signals");
  assert.ok(joined.includes("getVisibleLayers"), "getVisibleLayers in signals");
  assert.ok(
    joined.includes("getLayerVisibility"),
    "getLayerVisibility in signals",
  );
});
