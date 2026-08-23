import { describe, expect, it } from "vitest";

import { resolveCodifiedSetbacksForStamp } from "./codified-setback-from-zoning";

describe("resolveCodifiedSetbacksForStamp", () => {
  it("resolves Austin SF-3 scalars from austin-tx table", () => {
    expect(resolveCodifiedSetbacksForStamp("austin-tx", "SF-3")).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
      side_corner_ft: 15,
    });
  });

  it("resolves Pflugerville SF-S after table port", () => {
    expect(resolveCodifiedSetbacksForStamp("pflugerville-tx", "SF-S")).toEqual({
      front_ft: 25,
      side_ft: 7.5,
      rear_ft: 20,
      side_corner_ft: 15,
    });
  });

  it("returns null for Bastrop city per-parcel-only jurisdiction", () => {
    expect(resolveCodifiedSetbacksForStamp("bastrop-city-tx", "SF-1")).toBeNull();
  });
});
