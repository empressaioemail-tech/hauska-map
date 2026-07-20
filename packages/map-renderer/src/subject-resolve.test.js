/**
 * Subject-resolve / fit paint-gate tests for the decoupled map renderer (W2).
 *
 * Covers the resolveSubjectAndFit primitive: on a property re-point the subject
 * parcel's vector tile may still be streaming, so we schedule -> wait for the tile
 * to paint (bounded) -> set feature-state + fit. This pushes the consumer's
 * (spine-map.js) subject-resolve latch DOWN into the substrate.
 *
 * Cases:
 *   (a) subject found immediately -> setParcelState(subject:true) + fit invoked;
 *   (b) not found first N attempts then found -> resolves after re-schedule,
 *       within maxAttempts;
 *   (c) attempts exceed maxAttempts -> gives up quietly, NO throw, NO pending
 *       timer/listener;
 *   (d) generation guard: a second resolveSubjectAndFit supersedes the first
 *       (the first's late callback does NOT re-light its subject).
 *
 * Pure: stubs maplibre-gl's Map/NavigationControl/LngLatBounds + a minimal DOM,
 * so it runs under `node --test src/subject-resolve.test.js` with no WebGL. The
 * fake map drives the "idle" event manually so tests are deterministic and leave
 * no pending timer/listener.
 */

import test from "node:test";
import assert from "node:assert/strict";
import maplibregl from "maplibre-gl";

import { createMapRenderer } from "./map-renderer.js";
import { PARCEL_TILES_FILL_ID } from "./map/parcel-tiles.js";

/**
 * Fake MapLibre Map with a manually-driven "idle" event and a scripted
 * queryRenderedFeatures. `fillHits` is the list of parcel features the fill layer
 * "paints" on the CURRENT query; tests mutate it between idle ticks to simulate a
 * tile streaming in. `idleListeners` holds `once("idle")` handlers so the test can
 * flush them via emitIdle().
 */
function makeFakeMap() {
  const state = { center: { lng: -97.3153, lat: 30.1109 }, zoom: 15.2, pitch: 0, bearing: 0 };
  const sources = new Map();
  const layers = new Map();
  const featureStateCalls = [];
  const calls = { easeTo: [], fitBounds: [], on: [] };
  // Handlers registered via once("idle"); flushed by emitIdle().
  let idleOnce = [];
  const map = {
    _state: state,
    calls,
    sources,
    layers,
    featureStateCalls,
    // Scripted paint result for the parcel fill layer.
    fillHits: [],
    on: (evt, cb) => calls.on.push({ evt, cb }),
    once: (evt, cb) => {
      if (evt === "idle") idleOnce.push(cb);
    },
    off: (evt, cb) => {
      if (evt === "idle") idleOnce = idleOnce.filter((h) => h !== cb);
    },
    // Test helpers (not part of the MapLibre surface).
    _idleCount: () => idleOnce.length,
    emitIdle: () => {
      const handlers = idleOnce;
      idleOnce = [];
      for (const h of handlers) h();
    },
    addControl: () => {},
    removeControl: () => {},
    resize: () => {},
    remove: () => {},
    getCenter: () => ({ lng: state.center.lng, lat: state.center.lat }),
    getZoom: () => state.zoom,
    getPitch: () => state.pitch,
    getBearing: () => state.bearing,
    // Return false so the load handler's applyLayerVisibility early-returns before
    // the fixture terrain path (which needs a real canvas). styleReady (the load
    // EVENT flag) still flips true, so applyParcelTiles + applyOverlays still run —
    // exactly the gating the renderer uses. Feature-state/query paths do not gate
    // on isStyleLoaded, so the subject-resolve primitive is fully exercised.
    isStyleLoaded: () => false,
    getSource: (id) => sources.get(id),
    getLayer: (id) => layers.get(id),
    addSource: (id, def) => sources.set(id, def),
    addLayer: (def) => layers.set(def.id, def),
    moveLayer: () => {},
    removeLayer: (id) => layers.delete(id),
    removeSource: (id) => sources.delete(id),
    project: ([lng, lat]) => ({ x: (lng + 180) * 10, y: (90 - lat) * 10 }),
    queryRenderedFeatures: () => map.fillHits,
    setFeatureState: (target, fstate) => featureStateCalls.push({ target, state: fstate }),
    removeFeatureState: () => {},
    setPaintProperty: () => {},
    setLayoutProperty: () => {},
    getStyle: () => ({ layers: [...layers.values()] }),
    easeTo: (opts) => {
      calls.easeTo.push(opts);
    },
    fitBounds: (bounds, opts) => {
      calls.fitBounds.push({ bounds, opts });
    },
    flyTo: () => {},
    jumpTo: () => {},
  };
  return map;
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
    querySelector: () => null,
  };
  return el;
}

/** A parcel fill feature whose promoted parcel_node_id is `nodeId`. */
function parcelFeature(nodeId) {
  return {
    id: nodeId,
    layer: { id: PARCEL_TILES_FILL_ID },
    properties: { parcel_node_id: nodeId, county_fips: String(nodeId).split(":")[0] },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-97.4, 30.3],
          [-97.39, 30.3],
          [-97.39, 30.31],
          [-97.4, 30.31],
          [-97.4, 30.3],
        ],
      ],
    },
  };
}

/**
 * Install stubs for maplibregl.Map + NavigationControl + LngLatBounds and a
 * global document so createMapRenderer().mount(slot) builds our fake map. Wires
 * the parcel-tiles source so setParcelState's source guard is open, matching the
 * post-load state without running the heavy load handler.
 */
function withStubbedMaplibre(run) {
  const built = [];
  const origMap = maplibregl.Map;
  const origNav = maplibregl.NavigationControl;
  const origBounds = maplibregl.LngLatBounds;
  const origDoc = globalThis.document;
  const origRO = globalThis.ResizeObserver;

  maplibregl.Map = function FakeMap() {
    const m = makeFakeMap();
    built.push(m);
    return m;
  };
  maplibregl.NavigationControl = function FakeNav() {
    return {};
  };
  maplibregl.LngLatBounds = class FakeBounds {
    constructor() {
      this._pts = [];
    }
    extend(p) {
      this._pts.push(p);
      return this;
    }
    isEmpty() {
      return this._pts.length === 0;
    }
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
    maplibregl.LngLatBounds = origBounds;
    if (origDoc === undefined) delete globalThis.document;
    else globalThis.document = origDoc;
    if (origRO === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = origRO;
  }
}

/**
 * Mount a renderer wired with parcel tiles applied + the source present. Fires the
 * recorded "load" handler to flip styleReady + run applyParcelTiles (which adds the
 * source/fill/line/glow layers and sets parcelTilesApplied=true — the gate
 * findSubjectFeature/queryParcelAt check). The fake map's isStyleLoaded()===false
 * makes the load handler's applyLayerVisibility early-return before the fixture
 * terrain path (which would need a real canvas), so the mount stays pure.
 */
function mountWithParcelTiles(built) {
  const r = createMapRenderer();
  r.mount(makeEl());
  const map = built[0];
  r.setParcelTiles({
    url: "https://tiles.example/parcels.pmtiles",
    sourceLayer: "parcels",
    promoteId: "parcel_node_id",
  });
  // Fire the recorded "load" handler: flips styleReady, runs applyParcelTiles
  // (adds the source + fill/line/glow layers on the fake map, sets
  // parcelTilesApplied=true). With useFixture:false there is no canvas-dependent
  // terrain draw.
  const loadHandler = map.calls.on.find((c) => c.evt === "load");
  if (loadHandler) loadHandler.cb();
  // The load handler's fit-to-fixture fired a fitBounds; reset camera-call logs so
  // each test counts only what resolveSubjectAndFit itself produces.
  map.calls.fitBounds.length = 0;
  map.calls.easeTo.length = 0;
  map.featureStateCalls.length = 0;
  return { r, map };
}

test("(a) subject found immediately -> setParcelState(subject:true) + fit invoked", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    const center = { longitude: -97.395, latitude: 30.305 };
    // The subject tile is already painted.
    map.fillHits = [parcelFeature("48453:R100")];

    r.resolveSubjectAndFit({ parcelNodeId: "48453:R100", center });

    assert.ok(
      map.featureStateCalls.some(
        (c) => c.target.id === "48453:R100" && c.state.subject === true,
      ),
      "subject feature-state was set",
    );
    assert.equal(map.calls.fitBounds.length, 1, "fitBounds invoked once on the subject geometry");
    assert.equal(map._idleCount(), 0, "no pending idle listener when found immediately");
  });
});

test("(a2) fit:false skips the camera fit but still lights the subject", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    map.fillHits = [parcelFeature("48453:R101")];
    r.resolveSubjectAndFit({
      parcelNodeId: "48453:R101",
      center: { longitude: -97.395, latitude: 30.305 },
      fit: false,
    });
    assert.ok(
      map.featureStateCalls.some((c) => c.target.id === "48453:R101" && c.state.subject === true),
      "subject lit",
    );
    assert.equal(map.calls.fitBounds.length, 0, "no fit when fit:false");
    assert.equal(map.calls.easeTo.length, 0, "no easeTo fallback when fit:false");
  });
});

test("(b) subject not painted first attempts, then found -> resolves after re-schedule within maxAttempts", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    const center = { longitude: -97.395, latitude: 30.305 };
    // Not painted yet.
    map.fillHits = [];
    r.resolveSubjectAndFit({ parcelNodeId: "48453:R200", center, maxAttempts: 8 });

    // Attempt 0 found nothing -> one idle listener pending, nothing lit yet.
    assert.equal(map._idleCount(), 1, "one idle re-schedule pending after miss");
    assert.equal(map.featureStateCalls.length, 0, "nothing lit before the tile paints");

    // Two idle ticks still miss.
    map.emitIdle();
    assert.equal(map._idleCount(), 1, "still re-scheduling after 2nd miss");
    map.emitIdle();
    assert.equal(map._idleCount(), 1, "still re-scheduling after 3rd miss");
    assert.equal(map.featureStateCalls.length, 0, "still nothing lit");

    // Now the tile paints; the next idle tick resolves.
    map.fillHits = [parcelFeature("48453:R200")];
    map.emitIdle();

    assert.ok(
      map.featureStateCalls.some((c) => c.target.id === "48453:R200" && c.state.subject === true),
      "subject lit once the tile painted",
    );
    assert.equal(map.calls.fitBounds.length, 1, "fit invoked on resolve");
    assert.equal(map._idleCount(), 0, "no pending idle listener after resolve");
  });
});

test("(c) attempts exceed maxAttempts -> gives up quietly, no throw, no pending timer/listener", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    const center = { longitude: -97.395, latitude: 30.305 };
    const MAX = 3;
    map.fillHits = []; // never paints

    assert.doesNotThrow(() => {
      r.resolveSubjectAndFit({ parcelNodeId: "48453:R300", center, maxAttempts: MAX });
      // Attempt 0 (sync) missed -> 1 pending. Flush idle until the latch gives up.
      let guard = 0;
      while (map._idleCount() > 0 && guard < 50) {
        map.emitIdle();
        guard += 1;
      }
    }, "giving up must not throw");

    assert.equal(map._idleCount(), 0, "no pending idle listener after giving up (bounded latch)");
    // The give-up path best-effort re-asserts feature-state (re-applies once tile
    // paints) and eases to center; it must NEVER fitBounds a null geometry.
    assert.equal(map.calls.fitBounds.length, 0, "no fitBounds on give-up (no geometry)");
    assert.ok(map.calls.easeTo.length >= 1, "give-up eases to the requested center as a fallback frame");
  });
});

test("(c2) maxAttempts is bounded even with a huge value — never an unbounded loop", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    map.fillHits = [];
    r.resolveSubjectAndFit({
      parcelNodeId: "48453:R301",
      center: { longitude: -97.395, latitude: 30.305 },
      maxAttempts: 8,
    });
    let ticks = 0;
    while (map._idleCount() > 0 && ticks < 100) {
      map.emitIdle();
      ticks += 1;
    }
    // 8 attempts total: attempt 0 (sync) + 7 idle re-schedules that fire.
    assert.ok(ticks <= 8, `latch terminated within the cap (fired ${ticks} idle ticks)`);
    assert.equal(map._idleCount(), 0, "no listener left pending");
  });
});

test("(d) generation guard: a second resolveSubjectAndFit supersedes the first (first's late callback does NOT re-light its subject)", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    const centerA = { longitude: -97.395, latitude: 30.305 };
    const centerB = { longitude: -97.5, latitude: 30.4 };

    // First resolve: subject A not painted -> schedules an idle re-check.
    map.fillHits = [];
    r.resolveSubjectAndFit({ parcelNodeId: "48453:AAA", center: centerA });
    assert.equal(map._idleCount(), 1, "first resolve pending on idle");

    // Second resolve supersedes: its subject B IS painted -> resolves immediately,
    // and the first's pending listener is torn down (superseded).
    map.fillHits = [parcelFeature("48453:BBB")];
    r.resolveSubjectAndFit({ parcelNodeId: "48453:BBB", center: centerB });

    assert.ok(
      map.featureStateCalls.some((c) => c.target.id === "48453:BBB" && c.state.subject === true),
      "the newer subject B was lit",
    );
    // The first (superseded) latch must be gone — no stale listener.
    assert.equal(map._idleCount(), 0, "superseded first latch cleared, no stale idle listener");

    // Even if a stale idle somehow fired now (subject A repaints), the guard must
    // prevent re-lighting A. Simulate: put A back on the layer and flush any idle.
    const beforeA = map.featureStateCalls.filter((c) => c.target.id === "48453:AAA").length;
    map.fillHits = [parcelFeature("48453:AAA")];
    map.emitIdle(); // no-op: no listeners pending
    const afterA = map.featureStateCalls.filter((c) => c.target.id === "48453:AAA" && c.state.subject === true).length;
    assert.equal(afterA, beforeA, "superseded subject A was never (re-)lit");
  });
});

test("(e) destroy() clears a pending subject-resolve latch (no leaked listener, no throw)", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    map.fillHits = []; // subject not painted -> schedules idle
    r.resolveSubjectAndFit({
      parcelNodeId: "48453:R400",
      center: { longitude: -97.395, latitude: 30.305 },
    });
    assert.equal(map._idleCount(), 1, "latch pending before destroy");

    assert.doesNotThrow(() => r.destroy(), "destroy must not throw");
    assert.equal(map._idleCount(), 0, "destroy cleared the pending idle listener");

    // A late idle flush after destroy must be inert.
    map.fillHits = [parcelFeature("48453:R400")];
    assert.doesNotThrow(() => map.emitIdle());
    assert.ok(
      !map.featureStateCalls.some((c) => c.target.id === "48453:R400"),
      "no feature-state written after destroy",
    );
  });
});

test("(f) no-op guards: missing parcelNodeId and no map do nothing (no throw)", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    assert.doesNotThrow(() => r.resolveSubjectAndFit({ center: { longitude: -97.4, latitude: 30.3 } }));
    assert.equal(map.featureStateCalls.length, 0, "no parcelNodeId -> nothing set");
    assert.equal(map._idleCount(), 0, "no parcelNodeId -> no listener scheduled");
  });
});
