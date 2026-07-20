/**
 * Regression fence 1 — pmtiles protocol double-register idempotency.
 *
 * createMapRenderer() registers the `pmtiles://` protocol via
 * maplibregl.addProtocol on first mount, guarded by a module-level
 * `pmtilesRegistered` boolean. Mounting two independent renderer instances (the
 * hot-reload / multi-map case) must call addProtocol AT MOST ONCE across both —
 * a second real registration throws in maplibre-gl and blanks the map.
 *
 * Uses node's experimental module mocks to stub maplibre-gl + pmtiles before
 * importing map-renderer.js. `node --test` does not pass the required flag, so
 * this file self-relaunches with it (keeps package.json's test script untouched).
 */

// --- self-relaunch guard: re-spawn under --experimental-test-module-mocks ---
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

test("pmtiles addProtocol is called AT MOST ONCE across two renderer mounts", async () => {
  const maplibre = makeMaplibreMock({ mapFactory: () => makeFakeMap() });
  const pmtiles = makePmtilesMock();

  mock.module("maplibre-gl", { defaultExport: maplibre.default, namedExports: maplibre });
  mock.module("pmtiles", { namedExports: { Protocol: pmtiles.Protocol } });

  const restoreDom = installDomGlobals();
  try {
    // Fresh import AFTER the mock is installed so the module boolean starts
    // false in this process.
    const { createMapRenderer } = await import(
      `../map-renderer.js?fence1=${Date.now()}`
    );

    const r1 = createMapRenderer();
    r1.mount(makeMockEl());
    const afterFirst = maplibre.addProtocolCalls.length;

    const r2 = createMapRenderer();
    r2.mount(makeMockEl());
    const afterSecond = maplibre.addProtocolCalls.length;

    assert.equal(
      afterFirst,
      1,
      "first mount registers the pmtiles protocol exactly once",
    );
    assert.equal(
      afterSecond,
      1,
      "second mount does NOT re-register (module boolean is mount-count-safe)",
    );
    assert.equal(
      maplibre.addProtocolCalls[0].name,
      "pmtiles",
      "the registered protocol name is pmtiles",
    );

    r1.destroy();
    r2.destroy();
  } finally {
    restoreDom();
    mock.reset();
  }
});
