import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cartoApiKey, keyedCartoTileUrls } from "./carto-key.js";

describe("carto-key (MAP-BASEMAP-KEY, F-01)", () => {
  it("cartoApiKey returns empty string, never undefined/null, when import.meta.env is absent (node:test has no Vite env)", () => {
    // In this test runner import.meta.env is genuinely undefined -- exercises
    // the real "no Vite context" branch, not a mock of it.
    assert.equal(cartoApiKey(), "");
  });

  it("keyedCartoTileUrls builds a/b/c subdomains, @2x, correct style, no key suffix when the key is empty (falsifier: an empty key must never produce a literal '?key=' with nothing after it)", () => {
    const tiles = keyedCartoTileUrls("dark_all");
    assert.equal(tiles.length, 3);
    assert.deepEqual(
      tiles,
      ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
    );
    for (const url of tiles) assert.doesNotMatch(url, /\?key=/);
  });

  it("keyedCartoTileUrls uses the bare style path, never a rastertiles/ prefix (falsifier: this is the exact premise the dispatch stated wrong -- live-verified 2026-09-02, dark_all/light_only_labels are not part of the rastertiles/voyager family)", () => {
    for (const style of ["dark_all", "light_only_labels"]) {
      for (const url of keyedCartoTileUrls(style)) {
        assert.doesNotMatch(url, /rastertiles\//);
        assert.match(url, new RegExp(`/${style}/\\{z\\}/\\{x\\}/\\{y\\}@2x\\.png`));
      }
    }
  });
});
