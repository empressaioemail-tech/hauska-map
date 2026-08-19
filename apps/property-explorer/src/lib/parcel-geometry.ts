// apps/property-explorer/src/lib/parcel-geometry.ts
//
// Pure GEOMETRY helpers for the parcel fact sheet. Invariant I5 makes geometry
// the navigation authority: `ParcelGeometry.centroid` is the only thing that
// moves the map. Everything that turns a GeoJSON payload into that centroid,
// its bbox, and its lot area lives here so exactly one implementation exists.
//
// Why this file exists at all: `parcel-lookup.ts` geocoded the situs ADDRESS to
// decide where to fly, and its own comment admitted that a null centre means
// "the inspect card opens but the map does not move". A parcel with no address
// therefore never moved the map, so a DATA gap presented as a broken Find.
//
// Areas are computed on a local equirectangular projection about the ring's own
// latitude. That is accurate to well under a percent at parcel scale and needs
// no projection library; the method string travels with the value as
// `shoelace-wgs84` so nobody mistakes it for a survey.

import type { Measurement, ParcelGeometry, Ring } from "@empressaio/parcel-fact-sheet";

/** Metres per degree of latitude on the WGS84 ellipsoid, mid-latitude mean. */
const M_PER_DEG_LAT = 110_574;
/** Metres per degree of longitude at the equator (scaled by cos(lat)). */
const M_PER_DEG_LON_EQUATOR = 111_320;
const SQFT_PER_SQM = 10.763910416709722;
const SQFT_PER_ACRE = 43560;

function isFinitePair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

function ringFromCoords(coords: unknown): Ring | null {
  if (!Array.isArray(coords)) return null;
  const ring: Ring = [];
  for (const pt of coords) {
    if (isFinitePair(pt)) ring.push([pt[0], pt[1]]);
  }
  return ring.length >= 3 ? ring : null;
}

/**
 * Every OUTER ring in a GeoJSON geometry, Feature, or FeatureCollection.
 * Holes are dropped: the contract's `rings` are the parcel outline, and a hole
 * silently treated as an outline is how a lot becomes two lots.
 */
export function ringsFromGeoJson(input: unknown): Ring[] {
  if (!input || typeof input !== "object") return [];
  const node = input as Record<string, unknown>;

  if (node.type === "FeatureCollection" && Array.isArray(node.features)) {
    return node.features.flatMap((f) => ringsFromGeoJson(f));
  }
  if (node.type === "Feature") return ringsFromGeoJson(node.geometry);

  if (node.type === "Polygon") {
    const first = Array.isArray(node.coordinates) ? node.coordinates[0] : null;
    const ring = ringFromCoords(first);
    return ring ? [ring] : [];
  }
  if (node.type === "MultiPolygon" && Array.isArray(node.coordinates)) {
    const out: Ring[] = [];
    for (const poly of node.coordinates) {
      const first = Array.isArray(poly) ? poly[0] : null;
      const ring = ringFromCoords(first);
      if (ring) out.push(ring);
    }
    return out;
  }
  // A bare geometry nested under an unexpected key (some wires wrap it).
  if (node.geometry) return ringsFromGeoJson(node.geometry);
  return [];
}

/** Signed planar area of one ring in squared degrees (shoelace). */
function signedDegreeArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/** Mean latitude of a ring, for the local longitude scale. */
function meanLat(ring: Ring): number {
  let sum = 0;
  for (const [, lat] of ring) sum += lat;
  return ring.length ? sum / ring.length : 0;
}

/**
 * AREA-WEIGHTED centroid of the outer rings. Falls back to the vertex mean for
 * a degenerate (zero-area) ring rather than returning NaN, because the centroid
 * is what moves the map and a NaN centre is the null-centre bug all over again.
 */
export function centroidOfRings(rings: Ring[]): { lat: number; lng: number } | null {
  // Shift to a LOCAL origin before the shoelace. A Texas parcel sits at about
  // (-97.3, 30.1) and encloses roughly 1e-6 square degrees, so the raw cross
  // products are ~1e9 times the area they divide into: computed in place the
  // centroid loses centimetres to floating-point cancellation, and the centroid
  // is what moves the map.
  const origin = rings[0]?.[0] ?? null;
  if (!origin) return null;
  const [ox, oy] = origin;

  let cxAcc = 0;
  let cyAcc = 0;
  let areaAcc = 0;
  for (const ring of rings) {
    let cx = 0;
    let cy = 0;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xj = ring[j][0] - ox;
      const yj = ring[j][1] - oy;
      const xi = ring[i][0] - ox;
      const yi = ring[i][1] - oy;
      const cross = xj * yi - xi * yj;
      a += cross;
      cx += (xj + xi) * cross;
      cy += (yj + yi) * cross;
    }
    a /= 2;
    if (a !== 0) {
      cxAcc += cx / 6;
      cyAcc += cy / 6;
      areaAcc += a;
    }
  }
  if (areaAcc !== 0) {
    return { lat: cyAcc / areaAcc + oy, lng: cxAcc / areaAcc + ox };
  }
  // Degenerate: no enclosed area. Use the vertex mean.
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      sx += lng;
      sy += lat;
      n += 1;
    }
  }
  return n ? { lat: sy / n, lng: sx / n } : null;
}

/** [minLng, minLat, maxLng, maxLat] over every ring. */
export function bboxOfRings(
  rings: Ring[],
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return Number.isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null;
}

/**
 * Ring area in square feet on a local equirectangular projection. The `method`
 * that travels with this number is `shoelace-wgs84` — never "survey".
 */
export function areaSqFtOfRings(rings: Ring[]): number {
  let sqm = 0;
  for (const ring of rings) {
    const lat = meanLat(ring);
    const mPerDegLon = M_PER_DEG_LON_EQUATOR * Math.cos((lat * Math.PI) / 180);
    sqm += Math.abs(signedDegreeArea(ring)) * mPerDegLon * M_PER_DEG_LAT;
  }
  return sqm * SQFT_PER_SQM;
}

/** Acres -> square feet, the CAD roll's own unit into the contract's. */
export function acresToSqFt(acres: number): number {
  return acres * SQFT_PER_ACRE;
}

/** Ray-casting point-in-polygon over the outer rings. */
export function ringsContainPoint(
  rings: Ring[],
  point: { lat: number; lng: number },
): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects =
        yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** A small bbox around a seed point, in degrees, for a viewport-keyed query. */
export function bboxAround(
  point: { lat: number; lng: number },
  metres: number,
): { west: number; south: number; east: number; north: number } {
  const dLat = metres / M_PER_DEG_LAT;
  const cos = Math.max(Math.cos((point.lat * Math.PI) / 180), 1e-6);
  const dLon = metres / (M_PER_DEG_LON_EQUATOR * cos);
  return {
    west: point.lng - dLon,
    south: point.lat - dLat,
    east: point.lng + dLon,
    north: point.lat + dLat,
  };
}

/**
 * Build the contract's `ParcelGeometry`.
 *
 * `rings` may legitimately be EMPTY: no anonymous browse route serves a parcel
 * boundary by parcel node id, so a parcel whose boundary could not be resolved
 * still gets a real centroid (and therefore still moves the map) while making
 * no claim about its outline. An empty ring list is an honest absence of a
 * boundary; it is never a fabricated square.
 *
 * `lotArea` prefers a measured ring, then the CAD roll's recorded acreage, and
 * is NULL when neither exists (AMENDMENT 3). Null means no lot area is known.
 * It is never 0, and it is no longer a non-finite sentinel: the absence lives
 * in the type, where the compiler can see it and a later reader cannot mistake
 * it for a bug to "fix".
 */
export function buildParcelGeometry(opts: {
  rings: Ring[];
  centroidFallback: { lat: number; lng: number } | null;
  cadAcreageSqFt: number | null;
}): ParcelGeometry | null {
  const rings = opts.rings;
  const centroid = centroidOfRings(rings) ?? opts.centroidFallback;
  if (!centroid) return null;

  const bbox =
    bboxOfRings(rings) ??
    ([centroid.lng, centroid.lat, centroid.lng, centroid.lat] as [
      number,
      number,
      number,
      number,
    ]);

  const measured = rings.length ? areaSqFtOfRings(rings) : null;
  const known =
    measured != null && Number.isFinite(measured) && measured > 0
      ? measured
      : opts.cadAcreageSqFt != null && Number.isFinite(opts.cadAcreageSqFt)
        ? opts.cadAcreageSqFt
        : null;
  const lotArea: Measurement<"sqft"> | null =
    known === null ? null : { value: known, unit: "sqft" };

  return { rings, centroid, bbox, lotArea, crs: "EPSG:4326" };
}
