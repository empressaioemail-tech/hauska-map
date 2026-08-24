/**
 * Hover peel hit-test. Hover keys on the click-layer promote id, never
 * live-mesh hits[0].
 *
 * Run: node --test src/map/hover-hit.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PARCEL_TILES_FILL_ID } from "./parcel-tiles.js";
import { hoverHitFromRenderedFeatures, hoverQueryLayerIds } from "./hover-hit.js";

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

function tileFill(nodeId, geometry = TILE_RING) {
  return {
    id: nodeId,
    layer: { id: PARCEL_TILES_FILL_ID },
    properties: { parcel_node_id: nodeId, county_fips: String(nodeId).split(":")[0] },
    geometry,
  };
}

function meshFill(apn, geometry) {
  return {
    id: apn,
    layer: { id: "hauska-ovl-live-parcels-fill" },
    properties: { apn, layerKey: "live-parcels" },
    geometry,
  };
}

test("hover queries the click layer id, not overlay fill ids", () => {
  assert.deepEqual(hoverQueryLayerIds(), [PARCEL_TILES_FILL_ID]);
  assert.ok(!hoverQueryLayerIds().some((id) => String(id).includes("ovl")));
});

test("two overlapping mesh features under one pixel: hover key is promote id, geometry is the tile fill", () => {
  const meshA = meshFill("280210-edge-a", MESH_A_RING);
  const meshB = meshFill("280210-edge-b", MESH_B_RING);
  const tile = tileFill("48021:280210");
  // Old composer painted hits[0] = mesh. Entry edge swapped A vs B.
  const fromEdgeA = hoverHitFromRenderedFeatures([meshA, meshB, tile]);
  const fromEdgeB = hoverHitFromRenderedFeatures([meshB, meshA, tile]);

  assert.equal(fromEdgeA.parcelNodeId, "48021:280210");
  assert.equal(fromEdgeB.parcelNodeId, "48021:280210");
  assert.deepEqual(fromEdgeA.feature.geometry, TILE_RING);
  assert.deepEqual(fromEdgeB.feature.geometry, TILE_RING);
  assert.deepEqual(
    fromEdgeA.feature.geometry,
    fromEdgeB.feature.geometry,
    "same promote id keeps the same ring across entry edges",
  );
  assert.notDeepEqual(fromEdgeA.feature.geometry, MESH_A_RING);
  assert.notDeepEqual(fromEdgeA.feature.geometry, MESH_B_RING);
});

test("mesh-only hits do not paint (no live-mesh hits[0] fallback)", () => {
  const hits = [
    meshFill("nested-outer", MESH_A_RING),
    meshFill("nested-inner", MESH_B_RING),
  ];
  assert.equal(hoverHitFromRenderedFeatures(hits), null);
});

test("empty or missing hits are a miss", () => {
  assert.equal(hoverHitFromRenderedFeatures([]), null);
  assert.equal(hoverHitFromRenderedFeatures(null), null);
  assert.equal(hoverHitFromRenderedFeatures(undefined), null);
});

test("tile fill without a promote id is a miss", () => {
  const noId = {
    layer: { id: PARCEL_TILES_FILL_ID },
    properties: {},
    geometry: TILE_RING,
  };
  assert.equal(hoverHitFromRenderedFeatures([noId]), null);
});
