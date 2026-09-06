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

  it("resolves Elgin R-1 scalars after table port", () => {
    expect(
      resolveCodifiedSetbacksForStamp("elgin-development-code", "R-1"),
    ).toEqual({
      front_ft: 25,
      side_ft: 7.5,
      rear_ft: 10,
      side_corner_ft: 15,
    });
  });

  it("resolves San Antonio RE scalars after table port", () => {
    expect(resolveCodifiedSetbacksForStamp("san-antonio-tx", "RE")).toEqual({
      front_ft: 15,
      side_ft: 5,
      rear_ft: 30,
      side_corner_ft: 5,
    });
  });

  it("serves a supplied per-parcel record for a per-parcel-only jurisdiction", () => {
    const record = { front_ft: 25, side_ft: 5, rear_ft: 25, side_corner_ft: 5 };
    expect(
      resolveCodifiedSetbacksForStamp("bastrop-city-tx", "SF-1", record),
    ).toEqual(record);
  });

  it("still declines a per-parcel-only jurisdiction when no record is supplied", () => {
    expect(
      resolveCodifiedSetbacksForStamp("bastrop-city-tx", "SF-1", null),
    ).toBeNull();
  });

  it("ignores a supplied per-parcel record for a normal table jurisdiction", () => {
    const record = { front_ft: 999, side_ft: 999, rear_ft: 999, side_corner_ft: 999 };
    expect(
      resolveCodifiedSetbacksForStamp("austin-tx", "SF-3", record),
    ).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 10,
      side_corner_ft: 15,
    });
  });
});
