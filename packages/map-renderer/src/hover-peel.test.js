/**
 * Renderer-level hover peel: mousemove queries the click layer (PMTiles fill)
 * and paints that promote-id geometry, never live-mesh hits[0].
 *
 * Run: node --test src/hover-peel.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import maplibregl from "maplibre-gl";

import { createMapRenderer } from "./map-renderer.js";
import { PARCEL_TILES_FILL_ID } from "./map/parcel-tiles.js";

const TILE_RING = {
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
};

const MESH_A_RING = {
  type: "Polygon",
  coordinates: [
    [
      [-97.401, 30.299],
      [-97.388, 30.299],
      [-97.388, 30.312],
      [-97.401, 30.312],
      [-97.401, 30.299],
    ],
  ],
};

const MESH_B_RING = {
  type: "Polygon",
  coordinates: [
    [
      [-97.405, 30.295],
      [-97.385, 30.295],
      [-97.385, 30.315],
      [-97.405, 30.315],
      [-97.405, 30.295],
    ],
  ],
};

const HOVER_SOURCE_ID = "hauska-ovl-hover-highlight";
const MESH_FILL_ID = "hauska-ovl-live-parcels-fill";

function makeFakeMap() {
  const state = { center: { lng: -97.3153, lat: 30.1109 }, zoom: 15.2, pitch: 0, bearing: 0 };
  const sources = new Map();
  const layers = new Map();
  const calls = { on: [], query: [] };
  const canvas = { style: { cursor: "" } };
  const map = {
    _state: state,
    calls,
    sources,
    layers,
    tileHits: [],
    meshHits: [],
    canvas,
    on: (evt, cb) => calls.on.push({ evt, cb }),
    once: () => {},
    off: () => {},
    addControl: () => {},
    removeControl: () => {},
    resize: () => {},
    remove: () => {},
    getCenter: () => ({ lng: state.center.lng, lat: state.center.lat }),
    getZoom: () => state.zoom,
    getPitch: () => state.pitch,
    getBearing: () => state.bearing,
    isStyleLoaded: () => false,
    getSource: (id) => sources.get(id),
    getLayer: (id) => layers.get(id),
    addSource: (id, def) => {
      const src = {
        ...def,
        setData(data) {
          this.data = data;
        },
      };
      sources.set(id, src);
    },
    addLayer: (def) => layers.set(def.id, def),
    moveLayer: () => {},
    removeLayer: (id) => layers.delete(id),
    removeSource: (id) => sources.delete(id),
    project: ([lng, lat]) => ({ x: (lng + 180) * 10, y: (90 - lat) * 10 }),
    queryRenderedFeatures: (point, opts) => {
      calls.query.push({ point, layers: opts?.layers });
      const wanted = opts?.layers;
      if (!wanted) return [...map.meshHits, ...map.tileHits];
      const out = [];
      if (wanted.includes(PARCEL_TILES_FILL_ID)) out.push(...map.tileHits);
      if (wanted.includes(MESH_FILL_ID)) out.push(...map.meshHits);
      return out;
    },
    setFeatureState: () => {},
    removeFeatureState: () => {},
    setPaintProperty: () => {},
    setLayoutProperty: () => {},
    getStyle: () => ({ layers: [...layers.values()] }),
    getCanvas: () => canvas,
    easeTo: () => {},
    fitBounds: () => {},
    flyTo: () => {},
    jumpTo: () => {},
  };
  return map;
}

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

function tileFeature(nodeId) {
  return {
    id: nodeId,
    layer: { id: PARCEL_TILES_FILL_ID },
    properties: { parcel_node_id: nodeId, county_fips: String(nodeId).split(":")[0] },
    geometry: TILE_RING,
  };
}

function meshFeature(apn, geometry) {
  return {
    id: apn,
    layer: { id: MESH_FILL_ID },
    properties: { apn, layerKey: "live-parcels" },
    geometry,
  };
}

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

function mountWithParcelTiles(built) {
  const r = createMapRenderer();
  r.mount(makeEl());
  const map = built[0];
  r.setParcelTiles({
    url: "https://tiles.example/parcels.pmtiles",
    sourceLayer: "parcels",
    promoteId: "parcel_node_id",
  });
  const loadHandler = map.calls.on.find((c) => c.evt === "load");
  if (loadHandler) loadHandler.cb();
  return { r, map };
}

function fireMousemove(map, point = { x: 10, y: 10 }) {
  const handler = map.calls.on.find((c) => c.evt === "mousemove");
  assert.ok(handler, "mousemove handler registered");
  handler.cb({ point });
}

test("mousemove queries PARCEL_TILES_FILL_ID, not overlay fill ids", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFeature("48021:280210")];
    map.meshHits = [
      meshFeature("edge-a", MESH_A_RING),
      meshFeature("edge-b", MESH_B_RING),
    ];
    seedInteractiveOverlay(map);

    fireMousemove(map);

    assert.ok(map.calls.query.length >= 1, "queryRenderedFeatures ran");
    const last = map.calls.query[map.calls.query.length - 1];
    assert.deepEqual(last.layers, [PARCEL_TILES_FILL_ID]);
    assert.ok(!last.layers.includes(MESH_FILL_ID));
  });
});

test("hover paints the tile promote-id ring; entry edge does not swap to mesh hits[0]", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFeature("48021:280210")];
    map.meshHits = [meshFeature("edge-a", MESH_A_RING)];

    fireMousemove(map, { x: 4, y: 4 });
    const src = map.sources.get(HOVER_SOURCE_ID);
    assert.ok(src, "hover source created");
    assert.deepEqual(src.data.features[0].geometry, TILE_RING);

    map.meshHits = [meshFeature("edge-b", MESH_B_RING)];
    fireMousemove(map, { x: 8, y: 8 });
    assert.deepEqual(
      src.data.features[0].geometry,
      TILE_RING,
      "same promote id keeps the tile ring when mesh hits[0] changes",
    );
    assert.equal(map.canvas.style.cursor, "pointer");
  });
});

test("queryParcelAt and hover share the same promote id", () => {
  withStubbedMaplibre((built) => {
    const { r, map } = mountWithParcelTiles(built);
    map.tileHits = [tileFeature("48021:280210")];
    map.meshHits = [meshFeature("edge-a", MESH_A_RING)];

    const at = r.queryParcelAt({ x: 1, y: 1 });
    fireMousemove(map);
    const src = map.sources.get(HOVER_SOURCE_ID);

    assert.equal(at.parcelNodeId, "48021:280210");
    assert.deepEqual(at.feature.geometry, TILE_RING);
    assert.deepEqual(src.data.features[0].geometry, at.feature.geometry);
  });
});

/** Pre-seed the live-mesh overlay fill so a leaked hover query would see it. */
function seedInteractiveOverlay(map) {
  map.layers.set(MESH_FILL_ID, { id: MESH_FILL_ID, type: "fill" });
}
