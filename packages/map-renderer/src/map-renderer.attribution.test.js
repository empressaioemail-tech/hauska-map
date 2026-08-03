/**
 * Attribution control placement fence (map polish, 2026-07-29; attribution-fold
 * 2026-08-03).
 *
 * LICENSING CONSTRAINT: OSM (ODbL) and the CARTO basemap terms REQUIRE visible
 * attribution — the credit must exist SOMEWHERE. This test pins the
 * implementation:
 *   1. The Map is ALWAYS constructed with `attributionControl: false` (no
 *      default bottom-right control carrying the "MapLibre |" prefix).
 *   2. DEFAULT path (e.g. Command Center's LiveMapTile, which does NOT surface
 *      the basemap credit in its own chrome): an explicit AttributionControl IS
 *      added — compact: true, at "bottom-right" — so the required credits stay
 *      visible.
 *   3. SUPPRESSED path (createMapRenderer({ suppressAttributionControl: true }),
 *      used by Property Explorer): NO AttributionControl is mounted, because PE
 *      folds the exact © OSM / © CARTO / Esri credits into its MapSourceInfo ⓘ
 *      "Sources" panel — mounting the control too would pile two attribution UIs
 *      into the same lower-right corner.
 *   4. No customAttribution is passed (drops the optional "MapLibre |" prefix;
 *      MapLibre does not require credit). The © OSM © CARTO / Esri credits
 *      flow from the style/source `attribution` strings, which stay intact.
 *
 * Pure: monkeypatches maplibre-gl's Map / NavigationControl /
 * AttributionControl before importing the renderer. Runs under `node --test`
 * with no DOM and no WebGL. Exit-bounded.
 */

import test from "node:test";
import assert from "node:assert/strict";

import maplibregl from "maplibre-gl";

maplibregl.addProtocol = () => {};

class FakeNavigationControl {
  constructor(opts) {
    this.opts = opts;
  }
}
maplibregl.NavigationControl = FakeNavigationControl;

class FakeAttributionControl {
  constructor(opts) {
    this.opts = opts;
  }
}
maplibregl.AttributionControl = FakeAttributionControl;

const mapInstances = [];
class FakeMap {
  constructor(opts) {
    this.opts = opts;
    this.controls = [];
    this._handlers = {};
    mapInstances.push(this);
  }
  on() {
    return this;
  }
  addControl(ctrl, position) {
    this.controls.push({ ctrl, position });
  }
  getCanvas() {
    return { style: {} };
  }
  remove() {}
}
maplibregl.Map = FakeMap;

function fakeEl() {
  return {
    style: {},
    className: "",
    appendChild() {},
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
globalThis.document = { createElement: () => fakeEl() };
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const { createMapRenderer } = await import("./map-renderer.js");

test("DEFAULT path: default attribution OFF, a compact bottom-right AttributionControl mounted", () => {
  const r = createMapRenderer();
  r.bindContext({ useFixture: false });
  r.mount(fakeEl());

  const map = mapInstances[mapInstances.length - 1];
  assert.ok(map, "a Map was constructed");

  // 1. Default control suppressed (it would carry the "MapLibre |" prefix);
  //    we add an explicit compact control below instead.
  assert.equal(map.opts.attributionControl, false);

  // 2. Explicit compact attribution at bottom-RIGHT — the required OSM/CARTO
  //    credits stay mounted for consumers that do NOT surface them in their own
  //    chrome (e.g. Command Center's LiveMapTile). The credit is REQUIRED
  //    (cannot be deleted); bottom-right co-locates it with the toolset cluster.
  const attrib = map.controls.find(
    (c) => c.ctrl instanceof FakeAttributionControl,
  );
  assert.ok(attrib, "an AttributionControl is added (licensing requires it)");
  assert.equal(attrib.position, "bottom-right");
  assert.equal(attrib.ctrl.opts.compact, true);

  // 3. No customAttribution → no "MapLibre |" prefix; source credits intact.
  assert.equal(attrib.ctrl.opts.customAttribution, undefined);

  // Navigation control unaffected (still top-right).
  const nav = map.controls.find((c) => c.ctrl instanceof FakeNavigationControl);
  assert.ok(nav);
  assert.equal(nav.position, "top-right");

  r.destroy();
});

test("SUPPRESSED path: no AttributionControl mounted (consumer folds the credits into its own chrome)", () => {
  const r = createMapRenderer({ suppressAttributionControl: true });
  r.bindContext({ useFixture: false });
  r.mount(fakeEl());

  const map = mapInstances[mapInstances.length - 1];
  assert.ok(map, "a Map was constructed");

  // Default control still off (no "MapLibre |" prefix control anywhere).
  assert.equal(map.opts.attributionControl, false);

  // NO explicit AttributionControl — PE renders the required © OSM / © CARTO /
  // Esri credits in its MapSourceInfo ⓘ panel, so mounting the control too would
  // pile two attribution UIs into the same lower-right corner.
  const attrib = map.controls.find(
    (c) => c.ctrl instanceof FakeAttributionControl,
  );
  assert.equal(
    attrib,
    undefined,
    "no AttributionControl is mounted on the suppressed path",
  );

  // Navigation control still mounted (suppression is attribution-scoped only).
  const nav = map.controls.find((c) => c.ctrl instanceof FakeNavigationControl);
  assert.ok(nav);
  assert.equal(nav.position, "top-right");

  r.destroy();
});

test("basemap style still carries the required © OSM © CARTO source attribution", async () => {
  const { HAUSKA_MAP_STYLE } = await import("./map/hauska-map-style.js");
  const src = HAUSKA_MAP_STYLE.sources["hauska-carto-light"];
  assert.match(src.attribution, /openstreetmap\.org/);
  assert.match(src.attribution, /OSM/);
  assert.match(src.attribution, /CARTO/);
});
