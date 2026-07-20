/**
 * Shared lightweight maplibre-gl / pmtiles / DOM mocks for the crash-guard
 * regression fences (W3). Extends the fakeMap pattern in
 * parcel-tiles.smoke.test.js with the extra surface createMapRenderer's mount +
 * load path exercises (event registration + firing, controls, LngLatBounds,
 * canvas, queryRenderedFeatures, teardown). Pure — no DOM, no real maplibre-gl.
 *
 * Filename ends in .js (not .test.js), so the node --test glob does not run it
 * as a suite; the fence files import from it.
 */

/**
 * A fake MapLibre Map that records source/layer mutations, stores registered
 * event handlers so a test can fire "load", and reports a caller-controlled
 * isStyleLoaded() value (default false, to prove overlay writes are gated on the
 * `load` EVENT and not on isStyleLoaded()).
 */
export function makeFakeMap(opts = {}) {
  const sources = new Map();
  const layers = new Map();
  const handlers = new Map();
  const calls = {
    setFeatureState: [],
    removeFeatureState: [],
    setLayoutProperty: [],
    setPaintProperty: [],
    addControl: 0,
    remove: 0,
    fitBounds: 0,
    resize: 0,
  };
  // isStyleLoaded stays false unless a test opts in — the whole point of the
  // gating fence is that overlays apply on `load` even while this is false.
  let styleLoaded = opts.isStyleLoaded ?? false;

  const canvas = { style: {} };

  const map = {
    sources,
    layers,
    handlers,
    calls,
    // event wiring
    on(evt, handler) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(handler);
      return map;
    },
    off() {
      return map;
    },
    /** Fire every handler registered for an event (test seam). */
    fire(evt, arg) {
      for (const h of handlers.get(evt) || []) h(arg);
    },
    // style-mutation surface (matches fakeMap in the smoke test)
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, def),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, def),
    removeLayer: (id) => layers.delete(id),
    removeSource: (id) => sources.delete(id),
    setLayoutProperty: (id, prop, val) =>
      calls.setLayoutProperty.push({ id, prop, val }),
    setPaintProperty: (id, prop, val) =>
      calls.setPaintProperty.push({ id, prop, val }),
    setFeatureState: (target, state) =>
      calls.setFeatureState.push({ target, state }),
    removeFeatureState: (target, key) =>
      calls.removeFeatureState.push({ target, key }),
    isStyleLoaded: () => styleLoaded,
    setStyleLoaded: (v) => {
      styleLoaded = v;
    },
    // view + control surface touched during mount / load / teardown
    addControl: () => {
      calls.addControl += 1;
      return map;
    },
    getCanvas: () => canvas,
    getCenter: () => ({ lng: -97.3153, lat: 30.1109 }),
    getZoom: () => 15.2,
    getPitch: () => 0,
    getBearing: () => 0,
    getBounds: () => ({
      getWest: () => -97.4,
      getSouth: () => 30.0,
      getEast: () => -97.2,
      getNorth: () => 30.2,
    }),
    fitBounds: () => {
      calls.fitBounds += 1;
    },
    jumpTo: () => {},
    resize: () => {
      calls.resize += 1;
    },
    queryRenderedFeatures: () => [],
    remove: () => {
      calls.remove += 1;
    },
  };
  return map;
}

/**
 * A mock DOM element usable as the mount slot. Supports the surface ensureMap()
 * touches on both the slot and the created canvas div: innerHTML, appendChild,
 * className, style, querySelector, remove.
 */
export function makeMockEl() {
  const el = {
    className: "",
    style: {},
    children: [],
    innerHTML: "",
    textContent: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector: () => null,
    remove() {},
  };
  return el;
}

/** Minimal LngLatBounds so fitToSlots (used on the fixture load path) runs. */
class FakeLngLatBounds {
  extend() {
    return this;
  }
}

/**
 * Build a maplibregl namespace mock. `addProtocol` is a spy: it records every
 * (name, action) call so the double-register fence can assert at-most-once.
 * Construction of `Map` is recorded and returns the shared fake map instance the
 * caller supplies (so the test can fire "load" on it).
 */
export function makeMaplibreMock({ mapFactory } = {}) {
  const addProtocolCalls = [];
  const removeProtocolCalls = [];
  const constructed = [];
  const factory = mapFactory || (() => makeFakeMap());

  const Map = function MapCtor(config) {
    const m = factory(config);
    constructed.push({ config, map: m });
    return m;
  };

  const NavigationControl = function NavigationControl() {};

  const namespace = {
    Map,
    NavigationControl,
    LngLatBounds: FakeLngLatBounds,
    addProtocol: (name, action) => {
      addProtocolCalls.push({ name, action });
    },
    removeProtocol: (name) => {
      removeProtocolCalls.push({ name });
    },
    addProtocolCalls,
    removeProtocolCalls,
    constructed,
  };
  // createMapRenderer imports the default export (`import maplibregl from ...`).
  return { default: namespace, ...namespace };
}

/** pmtiles mock — a Protocol whose `.tile` is a stable stub action fn. */
export function makePmtilesMock() {
  const instances = [];
  class Protocol {
    constructor() {
      this.tile = () => {};
      instances.push(this);
    }
  }
  return { Protocol, instances };
}

/**
 * Install minimal DOM globals (document.createElement + ResizeObserver) that
 * createMapRenderer's mount() path touches. Returns a restore() to undo them so
 * fences don't leak globals into sibling suites.
 */
export function installDomGlobals() {
  const prevDocument = globalThis.document;
  const prevRO = globalThis.ResizeObserver;

  globalThis.document = { createElement: () => makeMockEl() };
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.disconnectCalls = 0;
      installDomGlobals._lastRO = this;
    }
    observe() {}
    disconnect() {
      this.disconnectCalls += 1;
    }
  };

  return function restore() {
    globalThis.document = prevDocument;
    globalThis.ResizeObserver = prevRO;
  };
}
