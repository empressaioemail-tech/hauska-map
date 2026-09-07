// apps/property-explorer/src/lib/sheet-to-card.test.ts
//
// 9-4 UI review: "typing a real street address lands on the correct parcel
// but the page header shows a parcel number instead of the street address."
// cardFromSheet correctly nulls situsAddress on an honest absent county
// record; cardFromSheetWithSearchFallback is the part that keeps the
// already-confirmed searched/clicked address as the heading instead of
// regressing to "Parcel <id>" when the county has nothing on file.

import { describe, expect, it } from "vitest";
import type { ParcelFactSheet, Provenance } from "@empressaio/parcel-fact-sheet";
import { cardFromSheet, cardFromSheetWithSearchFallback } from "./sheet-to-card";

function prov(): Provenance {
  return {
    source: "cad-roll",
    sourceLabel: "Bastrop County appraisal roll",
    vintage: "2026",
    method: null,
    retrievedAt: "2026-08-01T00:00:00.000Z",
    confidence: null,
    confidenceBasis: "asserted",
    sourceUrl: null,
    atomDids: [],
  };
}

function sheet(over: Partial<ParcelFactSheet["identity"]> = {}): ParcelFactSheet {
  return {
    factSheetId: "fs_abc123",
    resolverVersion: "pe-fact-sheet-1",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId: "48021:36521",
      county: { fips: "48021", name: "Bastrop" },
      apn: { state: "present", value: "R12345", provenance: prov() },
      situsAddress: { state: "absent", reason: "not on file", wouldBeFilledBy: null },
      owner: {
        state: "absent-uncovered",
        reason: "owner is not served on the public tier",
        wouldBeFilledBy: "the paid owner facet",
      },
      ...over,
    },
    geometry: {
      rings: [],
      centroid: { lat: 30.1105, lng: -97.3184 },
      bbox: [-97.32, 30.11, -97.31, 30.12],
      lotArea: { value: 10890, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: { state: "absent", reason: "not on file", wouldBeFilledBy: null },
    zoning: { state: "absent", reason: "not on file", wouldBeFilledBy: null },
    setbacks: { state: "absent", reason: "not on file", wouldBeFilledBy: null },
  } as ParcelFactSheet;
}

describe("cardFromSheet — the plain projection", () => {
  it("situsAddress is null on an absent county record (nothing invented)", () => {
    expect(cardFromSheet(sheet()).situsAddress).toBeNull();
  });

  it("situsAddress is the county's value when present", () => {
    const s = sheet({
      situsAddress: { state: "present", value: "1503 Farm St", provenance: prov() },
    });
    expect(cardFromSheet(s).situsAddress).toBe("1503 Farm St");
  });
});

describe("cardFromSheetWithSearchFallback — the heading keeps a known-good address", () => {
  it("falls back to the searched address when the county record is absent", () => {
    const card = cardFromSheetWithSearchFallback(sheet(), "1127 N Pine St");
    expect(card.situsAddress).toBe("1127 N Pine St");
  });

  it("the county's own present value always wins over the fallback", () => {
    const s = sheet({
      situsAddress: { state: "present", value: "1503 Farm St", provenance: prov() },
    });
    const card = cardFromSheetWithSearchFallback(s, "1127 N Pine St");
    expect(card.situsAddress).toBe("1503 Farm St");
  });

  it("stays null when there is no fallback to offer either (a bare parcel-id lookup)", () => {
    const card = cardFromSheetWithSearchFallback(sheet(), null);
    expect(card.situsAddress).toBeNull();
  });

  it("touches nothing but situsAddress — every other field matches the plain projection", () => {
    const s = sheet();
    const plain = cardFromSheet(s);
    const withFallback = cardFromSheetWithSearchFallback(s, "1127 N Pine St");
    expect({ ...withFallback, situsAddress: plain.situsAddress }).toEqual(plain);
  });
});
