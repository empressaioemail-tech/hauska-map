/**
 * Hover feature-state — the P-60 fragment peel.
 *
 * The old hover path drew `hits[0].geometry` (the PER-TILE CLIPPED FRAGMENT of
 * the parcel) into a GeoJSON overlay. On a lot spanning a z16 tile seam the
 * drawn box is one fragment, cut at a constant longitude/latitude — a straight
 * line traceable across every seam lot (measured live on the Simsbrook block,
 * 2026-08-24). Feature-state keys on the promoted parcel_node_id and MapLibre
 * paints it across EVERY fragment of that id, so the highlight is always the
 * whole lot.
 *
 * This suite is the violation proof for that peel: it was run against the
 * pre-peel renderer (80c9ad4) and failed in both named ways (no feature-state
 * write from hover; fragment geometry setData'd; no mouseout handler) before
 * the overlay path was deleted.
 *
 * Run: node --test src/hover-feature-state.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import maplibregl from "maplibre-gl";

import { createMapRenderer } from "./map-renderer.js";
import {
  PARCEL_TILES_FILL_ID,
  PARCEL_TILES_LINE_ID,
  PARCEL_TILES_SOURCE_ID,
} from "./map/parcel-tiles.js";

const SEAM_ID = "48453:280236";
const NEIGHBOR_ID = "48453:280239";
const HOVER_OVERLAY_SOURCE_ID = "hauska-ovl-hover-highlight";

/**
 * Seam-span fixture: one parcel, two per-tile fragments. The EAST fragment is
 * what queryRenderedFeatures returns when the cursor is east of the seam —
 * it is missing the lot's western strip (cut at the seam+buffer longitude).
 */
const FRAG_EAST = {
  type: "Polygon",
  coordinates: [
    [
      [-97.63560, 30.45847],
      [-97.63531, 30.45847],
      [-97.63531, 30.45868],
      [-97.63560, 30.45868],
      [-97.63560, 30.45847],
    ],
  ],
};
const FRAG_WEST = {
  type: "Polygon",
  coordinates: [
    [
      [-97.63570, 30.45847],
      [-97.63539, 30.45847],
      [-97.63539, 30.45868],
      [-97.63570, 30.45868],
      [-97.63570, 30.45847],
    ],
  ],
};
/** Single-fragment control lot, away from any seam. */
const WHOLE_RING = {
  type: "Polygon",
  coordinates: [
    [
      [-97.63525, 30.45898],
      [-97.63488, 30.45898],
      [-97.63488, 30.45915],
      [-97.63525, 30.45915],
      [-97.63525, 30.45898],
    ],
  ],
};

function makeFakeMap() {
  const state = { center: { lng: -97.6354, lat: 30.4589 }, zoom: 18, pitch: 0, bearing: 0 };
  const sources = new Map();
  const layers = new Map();
  const calls = { on: [], query: [], featureState: [], removeFeatureState: [] };
  const canvas = { style: { cursor: "" } };
  const map = {
    _state: state,
    calls,
    sources,
    layers,
    tileHits: [],
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
      if (opts?.layers?.includes(PARCEL_TILES_FILL_ID)) return [...map.tileHits];
      return [];
    },
    setFeatureState: (target, stateObj) => {
      calls.featureState.push({ target, state: stateObj });
    },
    removeFeatureState: (target, key) => {
      calls.removeFeatureState.push({ target, key });
    },
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

function tileFragment(nodeId, geometry) {
  return {
    id: nodeId,
    layer: { id: PARCEL_TILES_FILL_ID },
    properties: { parcel_node_id: nodeId, county_fips: String(nodeId).split(":")[0] },
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

function fire(map, evt, payload = { point: { x: 10, y: 10 } }) {
  const handler = map.calls.on.find((c) => c.evt === evt);
  assert.ok(handler, `${evt} handler registered`);
  handler.cb(payload);
}

function hoverStates(map, id) {
  return map.calls.featureState.filter(
    (c) =>
      c.target?.source === PARCEL_TILES_SOURCE_ID &&
      c.target?.sourceLayer === "parcels" &&
      String(c.target?.id) === String(id) &&
      typeof c.state?.hover === "boolean",
  );
}

function hoverCleared(map, id) {
  const viaSet = hoverStates(map, id).some((c) => c.state.hover === false);
  const viaRemove = map.calls.removeFeatureState.some(
    (c) =>
      c.target?.source === PARCEL_TILES_SOURCE_ID &&
      String(c.target?.id) === String(id) &&
      (c.key === "hover" || c.key === undefined),
  );
  return viaSet || viaRemove;
}

test("hover is feature-state on the promote id, never fragment geometry", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    // Cursor east of the seam: the ONLY rendered-features hit is the EAST
    // fragment. The old path drew exactly this fragment.
    map.tileHits = [tileFragment(SEAM_ID, FRAG_EAST)];

    fire(map, "mousemove");

    const sets = hoverStates(map, SEAM_ID).filter((c) => c.state.hover === true);
    assert.equal(
      sets.length,
      1,
      "mousemove must set feature-state {hover:true} on the promoted parcel_node_id (feature-state spans every fragment of the id; a geometry draw spans one)",
    );

    const overlay = map.sources.get(HOVER_OVERLAY_SOURCE_ID);
    const drewFragment =
      overlay?.data?.features?.[0]?.geometry != null &&
      JSON.stringify(overlay.data.features[0].geometry) === JSON.stringify(FRAG_EAST);
    assert.equal(
      drewFragment,
      false,
      "the single tile fragment's geometry must never be drawn as the highlight",
    );
    assert.equal(map.canvas.style.cursor, "pointer");
  });
});

test("entry edge cannot change the highlight: west-side hit keys the same state", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFragment(SEAM_ID, FRAG_EAST)];
    fire(map, "mousemove", { point: { x: 12, y: 10 } });
    // Re-enter from the west: hits[0] is now the WEST fragment of the SAME id.
    map.tileHits = [tileFragment(SEAM_ID, FRAG_WEST)];
    fire(map, "mousemove", { point: { x: 8, y: 10 } });

    const sets = hoverStates(map, SEAM_ID).filter((c) => c.state.hover === true);
    assert.equal(
      sets.length,
      1,
      "same promote id from the other fragment must be a no-op (no re-set, no geometry swap)",
    );
    for (const src of map.sources.values()) {
      const g = src?.data?.features?.[0]?.geometry;
      if (!g) continue;
      assert.notDeepEqual(g, FRAG_EAST, "no source may hold the east fragment");
      assert.notDeepEqual(g, FRAG_WEST, "no source may hold the west fragment");
    }
  });
});

test("hover transition clears the previous id", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFragment(SEAM_ID, FRAG_EAST)];
    fire(map, "mousemove");
    map.tileHits = [tileFragment(NEIGHBOR_ID, WHOLE_RING)];
    fire(map, "mousemove", { point: { x: 20, y: 20 } });

    assert.ok(hoverCleared(map, SEAM_ID), "previous lot's hover state cleared");
    const sets = hoverStates(map, NEIGHBOR_ID).filter((c) => c.state.hover === true);
    assert.equal(sets.length, 1, "new lot's hover state set");
  });
});

test("miss clears hover", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFragment(SEAM_ID, FRAG_EAST)];
    fire(map, "mousemove");
    map.tileHits = [];
    fire(map, "mousemove", { point: { x: 30, y: 30 } });

    assert.ok(hoverCleared(map, SEAM_ID), "hover state cleared on miss");
    assert.equal(map.canvas.style.cursor, "");
  });
});

test("mouseleave (map mouseout) clears hover", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    map.tileHits = [tileFragment(SEAM_ID, FRAG_EAST)];
    fire(map, "mousemove");

    fire(map, "mouseout", {});

    assert.ok(
      hoverCleared(map, SEAM_ID),
      "leaving the canvas must clear hover (the old path only cleared on a mousemove miss)",
    );
    assert.equal(map.canvas.style.cursor, "");
  });
});

test("paint expressions carry the hover branch on safe channels only", () => {
  withStubbedMaplibre((built) => {
    const { map } = mountWithParcelTiles(built);
    const fill = map.layers.get(PARCEL_TILES_FILL_ID);
    const line = map.layers.get(PARCEL_TILES_LINE_ID);
    assert.ok(fill && line, "tile fill + line layers exist");
    const flat = JSON.stringify([fill.paint, line.paint]);
    assert.ok(
      flat.includes('"feature-state","hover"') || flat.includes('"feature-state", "hover"'),
      "fill/line paint expressions include a feature-state hover branch",
    );
    assert.ok(!flat.includes("dasharray"), "no dasharray from feature-state (crash guard)");
    assert.ok(!flat.includes("gradient"), "no gradient from feature-state (crash guard)");
  });
});
