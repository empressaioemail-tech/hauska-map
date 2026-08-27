import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ExplorerMap tiles.json wiring (F-06)", () => {
  it("loads parcel tiles via resolveParcelTiles before passing to FloatingMap", () => {
    const text = readFileSync(resolve(__dirname, "ExplorerMap.tsx"), "utf8");
    expect(text).toContain("resolveParcelTiles");
    expect(text).toContain("setParcelTiles");
    expect(text).toMatch(/parcelTiles=\{parcelTiles\}/);
    expect(text).not.toMatch(/parcelTiles=\{PARCEL_TILES\}/);
  });
});
