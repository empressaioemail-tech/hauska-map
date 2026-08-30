// Smart Site mark assets. The write path is scripts/render-mark.mjs; this pins its output.
// Runs under the app's vitest (pnpm test). The same checks run with no dependencies via
//   node scripts/render-mark.mjs --self-test
//   node scripts/render-mark.mjs --check
import { describe, expect, it } from "vitest";
import { checkAssets, selfTest } from "./render-mark.mjs";

describe("Smart Site mark (scripts/render-mark.mjs)", () => {
  it("self-test: tile, dot, ring, corner, SVG fill and element assertions each fail on a violating render; PNG and ICO codecs round-trip", () => {
    expect(selfTest()).toEqual([]);
  });

  it("assets on disk: ink tile, gold centre, white ring, transparent corners at 32 and 180; favicon.ico wraps favicon-32.png; SVGs carry the ink fill and no void hex; icon links carry the cache-buster", () => {
    const { findings } = checkAssets();
    expect(findings).toEqual([]);
  });
});
