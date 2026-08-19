// apps/property-explorer/src/lib/parcel-geometry.test.ts
//
// I5 — geometry is the navigation authority. If the centroid is wrong, the map
// flies to the wrong place; if the area is wrong, an envelope percentage is
// wrong. Both are computed here, once.

import { describe, expect, it } from "vitest";
import {
  areaSqFtOfRings,
  bboxAround,
  bboxOfRings,
  buildParcelGeometry,
  centroidOfRings,
  ringsContainPoint,
  ringsFromGeoJson,
} from "./parcel-geometry";
import type { Ring } from "@empressaio/parcel-fact-sheet";

/** A closed square ring centred on (lng, lat). */
function square(lng: number, lat: number, half: number): Ring {
  return [
    [lng - half, lat - half],
    [lng + half, lat - half],
    [lng + half, lat + half],
    [lng - half, lat + half],
    [lng - half, lat - half],
  ];
}

describe("ringsFromGeoJson", () => {
  it("reads a Polygon, a MultiPolygon, a Feature and a FeatureCollection", () => {
    const ring = square(-97.3, 30.1, 0.001);
    const polygon = { type: "Polygon", coordinates: [ring] };
    expect(ringsFromGeoJson(polygon)).toHaveLength(1);
    expect(ringsFromGeoJson({ type: "Feature", geometry: polygon })).toHaveLength(1);
    expect(
      ringsFromGeoJson({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: polygon }],
      }),
    ).toHaveLength(1);
    expect(
      ringsFromGeoJson({ type: "MultiPolygon", coordinates: [[ring], [ring]] }),
    ).toHaveLength(2);
  });

  it("drops holes rather than treating one as a second outline", () => {
    const outer = square(-97.3, 30.1, 0.001);
    const hole = square(-97.3, 30.1, 0.0002);
    const rings = ringsFromGeoJson({ type: "Polygon", coordinates: [outer, hole] });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual(outer);
  });

  it("returns nothing for junk rather than throwing", () => {
    expect(ringsFromGeoJson(null)).toEqual([]);
    expect(ringsFromGeoJson({ type: "Point", coordinates: [1, 2] })).toEqual([]);
    expect(
      ringsFromGeoJson({ type: "Polygon", coordinates: [[[1, 2]]] }),
    ).toEqual([]);
  });
});

describe("centroidOfRings", () => {
  it("is exact at Texas longitudes, where naive shoelace loses centimetres", () => {
    const c = centroidOfRings([square(-97.3184, 30.1105, 0.0005)]);
    expect(c).not.toBeNull();
    // 1e-8 degrees is about a millimetre. The pre-translation implementation
    // was out by more than 1e-6 degrees (~13 cm) purely from cancellation.
    expect(c?.lng).toBeCloseTo(-97.3184, 8);
    expect(c?.lat).toBeCloseTo(30.1105, 8);
  });

  it("falls back to the vertex mean on a degenerate ring, never NaN", () => {
    const collapsed: Ring = [
      [-97.3, 30.1],
      [-97.3, 30.1],
      [-97.3, 30.1],
    ];
    const c = centroidOfRings([collapsed]);
    expect(c?.lat).toBeCloseTo(30.1, 10);
    expect(c?.lng).toBeCloseTo(-97.3, 10);
  });

  it("returns null when there is nothing to centre on", () => {
    expect(centroidOfRings([])).toBeNull();
  });
});

describe("areaSqFtOfRings", () => {
  it("measures a known square to within a percent", () => {
    // 0.001 deg lat ~ 110.574 m; 0.001 deg lon at 30.1105 deg ~ 96.24 m.
    // Expected ~ 10,643 m^2 ~ 114,560 sq ft.
    const area = areaSqFtOfRings([square(-97.3184, 30.1105, 0.0005)]);
    expect(area).toBeGreaterThan(113_000);
    expect(area).toBeLessThan(116_000);
  });
});

describe("bboxOfRings / bboxAround / ringsContainPoint", () => {
  it("brackets the ring", () => {
    const box = bboxOfRings([square(-97.3, 30.1, 0.001)]);
    expect(box?.[0]).toBeCloseTo(-97.301, 10);
    expect(box?.[1]).toBeCloseTo(30.099, 10);
    expect(box?.[2]).toBeCloseTo(-97.299, 10);
    expect(box?.[3]).toBeCloseTo(30.101, 10);
    expect(bboxOfRings([])).toBeNull();
  });

  it("builds a metre-sized probe box around a point", () => {
    const box = bboxAround({ lat: 30.1105, lng: -97.3184 }, 150);
    expect(box.north).toBeGreaterThan(30.1105);
    expect(box.south).toBeLessThan(30.1105);
    // 150 m of latitude is about 0.00136 degrees.
    expect(box.north - 30.1105).toBeCloseTo(0.001357, 5);
  });

  it("tells a lot from its neighbour", () => {
    const lot = [square(-97.3184, 30.1105, 0.0005)];
    expect(ringsContainPoint(lot, { lat: 30.1105, lng: -97.3184 })).toBe(true);
    expect(ringsContainPoint(lot, { lat: 30.1105, lng: -97.3174 })).toBe(false);
  });
});

describe("buildParcelGeometry", () => {
  it("measures the lot from the ring when one resolved", () => {
    const g = buildParcelGeometry({
      rings: [square(-97.3184, 30.1105, 0.0005)],
      centroidFallback: null,
      cadAcreageSqFt: 10214,
    });
    expect(g?.lotArea.value).toBeGreaterThan(113_000);
    expect(g?.crs).toBe("EPSG:4326");
  });

  it("keeps a real centroid with NO ring, and claims no boundary", () => {
    const g = buildParcelGeometry({
      rings: [],
      centroidFallback: { lat: 30.1105, lng: -97.3184 },
      cadAcreageSqFt: 10214,
    });
    expect(g?.rings).toEqual([]);
    expect(g?.centroid).toEqual({ lat: 30.1105, lng: -97.3184 });
    // The CAD roll's own acreage carries the lot area when no ring did.
    expect(g?.lotArea.value).toBe(10214);
    expect(g?.bbox).toEqual([-97.3184, 30.1105, -97.3184, 30.1105]);
  });

  it("reports an unmeasurable lot as not-a-number, never as zero", () => {
    const g = buildParcelGeometry({
      rings: [],
      centroidFallback: { lat: 30.1105, lng: -97.3184 },
      cadAcreageSqFt: null,
    });
    expect(Number.isNaN(g?.lotArea.value)).toBe(true);
  });

  it("returns null when nothing can place the parcel at all", () => {
    expect(
      buildParcelGeometry({ rings: [], centroidFallback: null, cadAcreageSqFt: 1 }),
    ).toBeNull();
  });
});
