/**
 * P-60 peel — prove the extra composer by violating it (WDLL item 6).
 * A check observed only passing has not been observed working.
 */

import { describe, expect, it } from "vitest";
import { shouldSuppressTileParcelLines, toLiveOverlays } from "./liveGis";
import type { FeatureCollectionLike, LiveLayerState } from "./liveGis";
import {
  STACKED_TRAVIS_BEFORE,
  PEELED_NEIGHBOR,
  PEELED_INSPECTED,
  PARCEL_RING_COMPOSERS,
  assertInspectedRingPlusEnvelope,
  assertOneRingNeighbor,
  liveOverlayVisibility,
  visibleParcelRings,
} from "./parcel-ring-peel";

function fc(n: number): FeatureCollectionLike {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: n }, (_, i) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon", coordinates: [] },
      properties: { apn: `apn-${i}` },
    })),
  };
}

function okParcels(n: number): LiveLayerState {
  return {
    status: "ok",
    response: { layer: "parcels", geojson: fc(n), truncated: false },
  };
}

const idleFema: LiveLayerState = { status: "idle" };

describe("composer inventory (WDLL 1)", () => {
  it("names every ring/fill composer with file:function", () => {
    const ids = PARCEL_RING_COMPOSERS.map((c) => c.id);
    expect(ids).toEqual([
      "pmtiles-line",
      "pmtiles-feature-state",
      "live-gis-mesh",
      "inspect-ring",
      "envelope",
      "search-highlight",
    ]);
    for (const row of PARCEL_RING_COMPOSERS) {
      expect(row.fileFn).toMatch(/:/);
    }
  });
});

describe("violation proves the peel (WDLL 6)", () => {
  it("stacked Travis paint (before) is two-plus rings on the inspected lot", () => {
    expect(visibleParcelRings(STACKED_TRAVIS_BEFORE)).toEqual([
      "pmtiles-line",
      "pmtiles-feature-state",
      "live-gis-mesh",
      "inspect-ring",
    ]);
    expect(() => assertInspectedRingPlusEnvelope(STACKED_TRAVIS_BEFORE)).toThrow(
      /one ring/,
    );
  });

  it("after peel a neighbor is one ring", () => {
    expect(visibleParcelRings(PEELED_NEIGHBOR)).toEqual(["pmtiles-line"]);
    expect(() => assertOneRingNeighbor(PEELED_NEIGHBOR)).not.toThrow();
  });

  it("after peel the inspected lot is one ring plus at most one envelope", () => {
    expect(visibleParcelRings(PEELED_INSPECTED)).toEqual(["inspect-ring"]);
    expect(() => assertInspectedRingPlusEnvelope(PEELED_INSPECTED)).not.toThrow();
  });

  it("forcing the live mesh back on a peeled neighbor shows two rings", () => {
    const leaked = { ...PEELED_NEIGHBOR, liveGisMeshLine: true };
    expect(visibleParcelRings(leaked)).toEqual(["pmtiles-line", "live-gis-mesh"]);
    expect(() => assertOneRingNeighbor(leaked)).toThrow(/one ring/);
  });
});

describe("toLiveOverlays peel (WDLL 2 / 5)", () => {
  it("peel omits the live parcel mesh even when fetch is ok with features", () => {
    const vis = liveOverlayVisibility({ parcelToggle: true, femaToggle: false });
    const specs = toLiveOverlays(okParcels(12), idleFema, vis);
    expect(vis.peelParcelMesh).toBe(true);
    expect(specs.some((s) => s.layerKey === "live-parcels" || s.interactive)).toBe(
      false,
    );
    expect(specs).toEqual([]);
  });

  it("without peel the ok mesh still emits (CC / violation direction)", () => {
    const specs = toLiveOverlays(okParcels(3), idleFema, {
      parcels: true,
      fema: false,
    });
    expect(specs).toHaveLength(1);
    expect(specs[0]?.paint?.["line-width"]).toBe(1.1);
  });

  it("tile-line suppress stays fail-open on the same ok mesh (WDLL 5)", () => {
    expect(shouldSuppressTileParcelLines(okParcels(12))).toBe(false);
    expect(shouldSuppressTileParcelLines(okParcels(1))).toBe(false);
  });
});
