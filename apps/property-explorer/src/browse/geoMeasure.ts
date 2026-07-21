// apps/property-explorer/src/browse/geoMeasure.ts
//
// Dependency-free geometry helpers for the measure tool — ported from the
// Brief extension's geo-measure.js into TS. Distance + area for a handful of
// user-dropped vertices needs only haversine (great-circle segment length) and
// the spherical-excess area, no turf. Pure functions: no paint, no MapLibre,
// no DOM.
//
// All inputs are [lng, lat] positions (GeoJSON order), matching what a MapLibre
// click gives via e.lngLat.toArray(). Distances are METERS; the formatters
// render to ft/mi and sqft/acres.

export type LngLat = [number, number];

const EARTH_RADIUS_M = 6371008.8; // IUGG mean Earth radius
const M_PER_FT = 0.3048;
const M_PER_MI = 1609.344;
const SQM_PER_SQFT = 0.09290304;
const SQM_PER_ACRE = 4046.8564224;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in METERS between two [lng, lat] positions. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return 0;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length in METERS of a polyline (array of [lng,lat] positions). */
export function polylineLengthMeters(positions: LngLat[]): number {
  if (positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i += 1) {
    total += haversineMeters(positions[i - 1], positions[i]);
  }
  return total;
}

/**
 * Spherical polygon area in SQUARE METERS for a ring of [lng,lat] positions
 * (the spherical-excess formula turf's area uses). Robust for the small
 * parcels/lots this tool measures; absolute value. The ring need not repeat
 * its first point — treated as closed.
 */
export function ringAreaSqMeters(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    total += toRad(p2[0] - p1[0]) * (2 + Math.sin(toRad(p1[1])) + Math.sin(toRad(p2[1])));
  }
  total = (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
  return Math.abs(total);
}

/** Format a METERS distance to a human "1,234 ft" / "2.34 mi" string. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 ft";
  const ft = meters / M_PER_FT;
  if (meters >= M_PER_MI) return `${(meters / M_PER_MI).toFixed(2)} mi`;
  return `${Math.round(ft).toLocaleString()} ft`;
}

/** Format a SQUARE-METERS area to "12,345 sqft" / "1.23 acres". */
export function formatArea(sqMeters: number): string {
  if (!Number.isFinite(sqMeters) || sqMeters <= 0) return "0 sqft";
  if (sqMeters >= SQM_PER_ACRE) return `${(sqMeters / SQM_PER_ACRE).toFixed(2)} acres`;
  return `${Math.round(sqMeters / SQM_PER_SQFT).toLocaleString()} sqft`;
}
