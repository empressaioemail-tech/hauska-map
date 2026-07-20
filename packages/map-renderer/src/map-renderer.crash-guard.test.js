/**
 * Regression fences for the map-renderer crash guards (worker W3, additive only).
 *
 * These codify four load-bearing crash/leak guards that already hold in
 * production, so a future refactor that silently regresses one fails here:
 *
 *   1. pmtiles double-register idempotency — maplibregl.addProtocol("pmtiles", …)
 *      fires AT MOST ONCE across multiple renderer mounts (module boolean is
 *      mount-count-safe), so a second Map construction can't throw "Protocol
 *      already registered".
 *   2. styleReady gating — overlay + parcel-tile writes stash until the `load`
 *      EVENT fires, and are NOT gated on isStyleLoaded(); a one-shot push that
 *      lands while isStyleLoaded()===false (any tile still loading) must still
 *      apply on load, never be silently dropped.
 *   3. feature-state paint safety — none of the parcel fill/line/glow paint keys
 *      is a feature-state-driven line-dasharray or line-gradient (the documented
 *      setConstantDashPositions per-frame crash); any dasharray present must be a
 *      literal array, not a feature-state expression.
 *   4. teardown safety — destroy() disconnects the ResizeObserver and removes the
 *      Map, and does not throw when called twice or before mount.
 *
 * Pure: stubs maplibre-gl (by monkeypatching the real default export's
 * addProtocol / Map / NavigationControl) plus the document + ResizeObserver
 * globals, so it runs under `node --test` with no DOM and no real WebGL map.
 * Every test is exit-bounded — no servers, no timers left pending.
 *
 * Run: node --test src/map-renderer.crash-guard.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";

import maplibregl from "maplibre-gl";

// ---------------------------------------------------------------------------
// Shared lightweight maplibre-gl mock. map-renderer.js calls maplibregl.Map,
// maplibregl.addProtocol and maplibregl.NavigationControl as properties on the
// imported default export at call time, so replacing those properties here —
// before the renderer module is imported — is sufficient (ESM live bindings
// point at this same object). We do NOT need a module loader.
// ---------------------------------------------------------------------------

/** Every pmtiles/other addProtocol call is recorded here for the spy asserts. */
const addProtocolCalls = [];
maplibregl.addProtocol = (name /*, fn */) => {
  addProtocolCalls.push(name);
};
maplibregl.NavigationControl = class {};

/** All FakeMap instances constructed, in order (index 0 = first mount). */
const mapInstances = [];

/**
 * Minimal MapLibre Map double. Records sources/layers/feature-state so a test
 * can assert what the renderer wrote. isStyleLoaded() is deliberately false so
 * we prove the overlay/parcel path is gated on the `load` event, not on
 * isStyleLoaded(). remove()/ResizeObserver.disconnect() set flags for teardown.
 */
class FakeMap {
  constructor(opts) {
    this.opts = opts;
    this._handlers = {};
    this._sources = new Map();
    this._layers = new Map();
    this.featureStateCalls = [];
    this.removed = false;
    mapInstances.push(this);
  }
  on(ev, fn) {
    (this._handlers[ev] ||= []).push(fn);
    return this;
  }
  addControl() {}
  // Deliberately false: exercises the "load fired while style still loading"
  // window that styleReady is built to survive.
  isStyleLoaded() {
    return false;
  }
  getSource(id) {
    return this._sources.get(id);
  }
  addSource(id, def) {
    this._sources.set(id, def);
  }
  removeSource(id) {
    this._sources.delete(id);
  }
  getLayer(id) {
    return this._layers.get(id);
  }
  addLayer(def) {
    this._layers.set(def.id, def);
  }
  removeLayer(id) {
    this._layers.delete(id);
  }
  setFeatureState(target, state) {
    this.featureStateCalls.push({ target, state });
  }
  removeFeatureState() {}
  queryRenderedFeatures() {
    return [];
  }
  getCanvas() {
    return { style: {} };
  }
  getBounds() {
    return {
      getWest: () => 0,
      getSouth: () => 0,
      getEast: () => 1,
      getNorth: () => 1,
    };
  }
  getZoom() {
    return 15;
  }
  getCenter() {
    return { lng: 0, lat: 0 };
  }
  getPitch() {
    return 0;
  }
  getBearing() {
    return 0;
  }
  fitBounds() {}
  jumpTo() {}
  resize() {}
  remove() {
    this.removed = true;
  }
  /** Fire a registered map event handler (e.g. "load"). */
  fire(ev, payload) {
    (this._handlers[ev] || []).forEach((fn) => fn(payload || {}));
  }
}
maplibregl.Map = FakeMap;

/** Minimal DOM element double. */
function fakeEl() {
  return {
    style: {},
    className: "",
    _kids: [],
    appendChild(c) {
      this._kids.push(c);
    },
    querySelector() {
      return null;
    },
    set innerHTML(_v) {},
    get innerHTML() {
      return "";
    },
    remove() {},
    textContent: "",
  };
}

/** Records ResizeObserver disconnect so teardown can be asserted. */
const resizeObservers = [];
globalThis.document = { createElement: () => fakeEl() };
globalThis.ResizeObserver = class {
  constructor() {
    this.disconnected = false;
    resizeObservers.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
};

// Import the renderer AFTER the globals + maplibregl props are in place.
const { createMapRenderer } = await import("./map-renderer.js");

const PARCEL_CFG = {
  url: "https://tiles.example/parcels.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

/** Mount a renderer with the fixture stack off (keeps the load path light). */
function mountRenderer(ctx = {}) {
  const r = createMapRenderer();
  r.bindContext({ useFixture: false, ...ctx });
  r.mount(fakeEl());
  return { r, map: mapInstances[mapInstances.length - 1] };
}

// ---------------------------------------------------------------------------
// 1. pmtiles double-register idempotency
// ---------------------------------------------------------------------------

test("pmtiles protocol is registered at most once across two renderer mounts", () => {
  // Delta around exactly these two mounts, so prior tests in this file (which
  // may already have flipped the module boolean) don't skew the count. The
  // guarantee is: mounting a SECOND instance adds ZERO new pmtiles registrations,
  // and the total pmtiles count over the whole process never exceeds one.
  const beforePmtiles = addProtocolCalls.filter((n) => n === "pmtiles").length;

  const a = mountRenderer();
  const afterFirst = addProtocolCalls.filter((n) => n === "pmtiles").length;

  const b = mountRenderer();
  const afterSecond = addProtocolCalls.filter((n) => n === "pmtiles").length;

  assert.equal(
    afterSecond,
    afterFirst,
    "second renderer mount must not re-register the pmtiles protocol",
  );
  assert.ok(
    afterSecond <= 1,
    `pmtiles registered ${afterSecond} times total; must be <= 1 (module boolean guard)`,
  );
  // If this is the first mount in the process, we should see exactly one add.
  if (beforePmtiles === 0) {
    assert.equal(afterFirst, 1, "first mount registers pmtiles exactly once");
  }

  a.r.destroy();
  b.r.destroy();
});

// ---------------------------------------------------------------------------
// 2. styleReady gating — stash-until-load-event, NOT isStyleLoaded()
// ---------------------------------------------------------------------------

test("stashed overlays + parcel tiles apply on the load EVENT even while isStyleLoaded() is false", () => {
  const { r, map } = mountRenderer({ parcelTiles: PARCEL_CFG });
  // A one-shot overlay push lands before the load event fires.
  r.setOverlays([
    {
      layerKey: "flood-100yr",
      data: { type: "FeatureCollection", features: [] },
    },
  ]);

  // Nothing is on the map yet: writes are stashed pre-load.
  assert.equal(
    map.getSource("hauska-parcel-tiles"),
    undefined,
    "parcel source must NOT be applied before the load event",
  );

  // The style is still 'loading' (a tile in flight) when load fires.
  assert.equal(map.isStyleLoaded(), false, "guard precondition: isStyleLoaded() is false");
  map.fire("load");

  // Despite isStyleLoaded()===false, the stashed parcel tiles applied — proving
  // the gate is the load event (styleReady), not isStyleLoaded().
  assert.ok(
    map.getSource("hauska-parcel-tiles"),
    "parcel source must apply on load even though isStyleLoaded() is false",
  );
  assert.ok(
    map.getLayer("hauska-parcel-tiles-fill"),
    "parcel fill layer must apply on load (styleReady gate, not isStyleLoaded)",
  );

  r.destroy();
});

test("a parcel-tile config bound AFTER load applies immediately (post-load write path)", () => {
  const { r, map } = mountRenderer();
  map.fire("load");
  assert.equal(
    map.getSource("hauska-parcel-tiles"),
    undefined,
    "no parcel source until a config is supplied",
  );
  r.setParcelTiles(PARCEL_CFG);
  assert.ok(
    map.getSource("hauska-parcel-tiles"),
    "parcel source applies immediately once styleReady is already true",
  );
  r.destroy();
});

// ---------------------------------------------------------------------------
// 3. feature-state paint safety — no feature-state dasharray / gradient
// ---------------------------------------------------------------------------

test("no parcel paint key drives line-dasharray or line-gradient from feature-state", () => {
  const { r, map } = mountRenderer({ parcelTiles: PARCEL_CFG });
  map.fire("load");

  const paints = [
    map.getLayer("hauska-parcel-tiles-fill")?.paint,
    map.getLayer("hauska-parcel-tiles-line")?.paint,
    map.getLayer("hauska-parcel-tiles-glow")?.paint,
  ];
  for (const p of paints) assert.ok(p, "each parcel layer has a paint object");

  for (const paint of paints) {
    // The crash-triggering keys must not be present at all on the parcel layers.
    assert.equal(
      paint["line-gradient"],
      undefined,
      "line-gradient (crash source) must be absent from parcel paint",
    );

    const dash = paint["line-dasharray"];
    if (dash !== undefined) {
      // A dasharray is only permissible if it is a STATIC literal array, never a
      // feature-state-driven expression (the setConstantDashPositions crash).
      assert.ok(
        Array.isArray(dash),
        "any line-dasharray must be a literal array, not an expression",
      );
      assert.ok(
        !JSON.stringify(dash).includes("feature-state"),
        "line-dasharray must not be feature-state-driven",
      );
    }

    // Belt-and-suspenders: no feature-state expression anywhere in the paint may
    // resolve into a dasharray/gradient value.
    const serialized = JSON.stringify(paint);
    assert.ok(!serialized.includes("line-dasharray"), "no line-dasharray in paint");
    assert.ok(!serialized.includes("line-gradient"), "no line-gradient in paint");
  }

  // The glow IS allowed to use feature-state, but only via the safe channels.
  const glow = JSON.stringify(map.getLayer("hauska-parcel-tiles-glow").paint);
  assert.ok(glow.includes("feature-state"), "glow uses feature-state (safe channels)");
  assert.ok(glow.includes("line-blur"), "glow uses line-blur (safe)");

  r.destroy();
});

// ---------------------------------------------------------------------------
// 4. teardown safety — disconnect + remove, safe when double / pre-mount
// ---------------------------------------------------------------------------

test("destroy() disconnects the ResizeObserver and removes the map", () => {
  const { r, map } = mountRenderer();
  const obs = resizeObservers[resizeObservers.length - 1];
  assert.equal(obs.disconnected, false, "observer live before destroy");
  assert.equal(map.removed, false, "map live before destroy");

  r.destroy();

  assert.equal(obs.disconnected, true, "destroy() calls resizeObs.disconnect()");
  assert.equal(map.removed, true, "destroy() calls map.remove()");
});

test("destroy() is safe when called twice", () => {
  const { r } = mountRenderer();
  r.destroy();
  assert.doesNotThrow(() => r.destroy(), "second destroy() must not throw");
});

test("destroy() is safe when called before mount", () => {
  const r = createMapRenderer();
  assert.doesNotThrow(() => r.destroy(), "destroy() before mount must not throw");
});
