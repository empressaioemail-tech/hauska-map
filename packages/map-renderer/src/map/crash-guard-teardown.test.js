/**
 * Regression fence 4 — teardown safety.
 *
 * destroy() must disconnect the ResizeObserver and call map.remove() so a
 * renderer unmount frees its MapLibre GL context (leaking contexts eventually
 * blanks/crashes the map). It must also be safe to call twice (idempotent-ish —
 * the second call is a no-op, not a throw) and safe to call before mount (never
 * constructed a map).
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

async function freshRenderer(fenceTag, mapRef) {
  const maplibre = makeMaplibreMock({ mapFactory: () => mapRef.map });
  const pmtiles = makePmtilesMock();
  mock.module("maplibre-gl", { defaultExport: maplibre.default, namedExports: maplibre });
  mock.module("pmtiles", { namedExports: { Protocol: pmtiles.Protocol } });
  const restoreDom = installDomGlobals();
  const { createMapRenderer } = await import(
    `../map-renderer.js?${fenceTag}=${Date.now()}`
  );
  return { createMapRenderer, restoreDom };
}

test("destroy() disconnects the ResizeObserver and calls map.remove()", async () => {
  const mapRef = { map: makeFakeMap() };
  const { createMapRenderer, restoreDom } = await freshRenderer("f4a", mapRef);
  try {
    const r = createMapRenderer();
    r.mount(makeMockEl());
    // The mount path constructs a ResizeObserver; installDomGlobals stashes the
    // most-recent instance so we can assert disconnect() ran.
    const ro = installDomGlobals._lastRO;
    assert.ok(ro, "a ResizeObserver was constructed on mount");
    assert.equal(ro.disconnectCalls, 0, "not disconnected before destroy");

    r.destroy();

    assert.equal(ro.disconnectCalls, 1, "resizeObs.disconnect() called on destroy");
    assert.equal(mapRef.map.calls.remove, 1, "map.remove() called on destroy");
  } finally {
    restoreDom();
    mock.reset();
  }
});

test("destroy() called twice does not throw and does not double-remove the map", async () => {
  const mapRef = { map: makeFakeMap() };
  const { createMapRenderer, restoreDom } = await freshRenderer("f4b", mapRef);
  try {
    const r = createMapRenderer();
    r.mount(makeMockEl());

    r.destroy();
    assert.doesNotThrow(() => r.destroy(), "second destroy() must not throw");
    assert.equal(
      mapRef.map.calls.remove,
      1,
      "map.remove() only fires once (map nulled after first destroy)",
    );
  } finally {
    restoreDom();
    mock.reset();
  }
});

test("destroy() before mount does not throw (no map ever constructed)", async () => {
  const mapRef = { map: makeFakeMap() };
  const { createMapRenderer, restoreDom } = await freshRenderer("f4c", mapRef);
  try {
    const r = createMapRenderer();
    assert.doesNotThrow(() => r.destroy(), "destroy() before mount must not throw");
    assert.equal(
      mapRef.map.calls.remove,
      0,
      "no map.remove() when nothing was ever mounted",
    );
  } finally {
    restoreDom();
    mock.reset();
  }
});
