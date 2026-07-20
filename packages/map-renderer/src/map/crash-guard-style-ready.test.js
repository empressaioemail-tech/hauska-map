/**
 * Regression fence 2 — styleReady gating uses the `load` EVENT, not
 * isStyleLoaded().
 *
 * Overlay + parcel-tile writes are stashed until the map `load` event fires, and
 * are explicitly NOT gated on map.isStyleLoaded(). MapLibre reports
 * isStyleLoaded()===false during any in-flight source/tile load, so a one-shot
 * overlay push gated on isStyleLoaded() would be stashed and never re-applied —
 * the report overlays would silently never render. This fence drives a mock map
 * whose isStyleLoaded() stays false and proves the stashed overlays + parcel
 * tiles still get applied the instant `load` fires.
 *
 * Self-relaunches under --experimental-test-module-mocks (package.json's test
 * script is left untouched).
 */

if (!process.execArgv.some((a) => a.includes("test-module-mocks"))) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--test", import.meta.filename],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

import {
  makeFakeMap,
  makeMaplibreMock,
  makePmtilesMock,
  installDomGlobals,
  makeMockEl,
} from "./crash-guard-mocks.js";
import {
  PARCEL_TILES_SOURCE_ID,
  PARCEL_TILES_FILL_ID,
} from "./parcel-tiles.js";
import { overlaySourceId } from "./overlay-render.js";

// A polygon overlay spec: enough for reconcileOverlays to add a source+layers.
const OVERLAY_KEY = "flood-zone";
const OVERLAY_SPEC = {
  layerKey: OVERLAY_KEY,
  geojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[-97.4, 30.0], [-97.2, 30.0], [-97.2, 30.2], [-97.4, 30.0]]],
        },
      },
    ],
  },
};

const PARCEL_CFG = {
  url: "https://tiles.example/parcels.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

async function freshRenderer(fenceTag) {
  const fakeMap = makeFakeMap({ isStyleLoaded: false });
  const maplibre = makeMaplibreMock({ mapFactory: () => fakeMap });
  const pmtiles = makePmtilesMock();
  mock.module("maplibre-gl", { defaultExport: maplibre.default, namedExports: maplibre });
  mock.module("pmtiles", { namedExports: { Protocol: pmtiles.Protocol } });
  const restoreDom = installDomGlobals();
  const { createMapRenderer } = await import(
    `../map-renderer.js?${fenceTag}=${Date.now()}`
  );
  return { createMapRenderer, fakeMap, restoreDom };
}

test("overlays stashed pre-load are NOT applied until the load event fires", async () => {
  const { createMapRenderer, fakeMap, restoreDom } = await freshRenderer("f2a");
  try {
    const r = createMapRenderer();
    // useFixture:false so the fixture fit path doesn't run on load — isolates
    // the overlay-apply behaviour.
    r.bindContext({ useFixture: false });
    r.mount(makeMockEl());

    // Stash an overlay BEFORE load. isStyleLoaded() is false; styleReady false.
    r.setOverlays([OVERLAY_SPEC]);

    assert.equal(
      fakeMap.getSource(overlaySourceId(OVERLAY_KEY)),
      undefined,
      "overlay source must NOT be added before the load event fires",
    );

    // Fire load. isStyleLoaded() is STILL false the whole time.
    fakeMap.fire("load");

    assert.equal(
      fakeMap.isStyleLoaded(),
      false,
      "guard precondition: isStyleLoaded() is still false at apply time",
    );
    assert.ok(
      fakeMap.getSource(overlaySourceId(OVERLAY_KEY)),
      "stashed overlay applied on `load` even though isStyleLoaded() is false — gating is on the load EVENT, not isStyleLoaded()",
    );
  } finally {
    restoreDom();
    mock.reset();
  }
});

test("parcel tiles stashed pre-load apply on the load event with isStyleLoaded() false", async () => {
  const { createMapRenderer, fakeMap, restoreDom } = await freshRenderer("f2b");
  try {
    const r = createMapRenderer();
    r.bindContext({ useFixture: false });
    r.mount(makeMockEl());

    // Stash parcel-tiles config before load.
    r.setParcelTiles(PARCEL_CFG);

    assert.equal(
      fakeMap.getSource(PARCEL_TILES_SOURCE_ID),
      undefined,
      "parcel source must NOT be added before load",
    );

    fakeMap.fire("load");

    assert.equal(fakeMap.isStyleLoaded(), false, "isStyleLoaded() still false");
    assert.ok(
      fakeMap.getSource(PARCEL_TILES_SOURCE_ID),
      "parcel source applied on load despite isStyleLoaded() false",
    );
    assert.ok(
      fakeMap.getLayer(PARCEL_TILES_FILL_ID),
      "parcel fill layer applied on load",
    );
  } finally {
    restoreDom();
    mock.reset();
  }
});

test("overlays pushed AFTER load apply immediately even while isStyleLoaded() is false", async () => {
  const { createMapRenderer, fakeMap, restoreDom } = await freshRenderer("f2c");
  try {
    const r = createMapRenderer();
    r.bindContext({ useFixture: false });
    r.mount(makeMockEl());
    fakeMap.fire("load"); // styleReady now true; isStyleLoaded() stays false.

    r.setOverlays([OVERLAY_SPEC]);

    assert.equal(fakeMap.isStyleLoaded(), false, "isStyleLoaded() still false");
    assert.ok(
      fakeMap.getSource(overlaySourceId(OVERLAY_KEY)),
      "post-load one-shot overlay push applies immediately (would be dropped if gated on isStyleLoaded())",
    );
  } finally {
    restoreDom();
    mock.reset();
  }
});
