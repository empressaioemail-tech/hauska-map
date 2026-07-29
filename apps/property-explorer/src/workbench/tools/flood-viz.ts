// apps/property-explorer/src/workbench/tools/flood-viz.ts
//
// FLOOD & DRAINAGE dock visualization — the PURE geometry model (R3).
//
// Turns the engine study (all real hydrology output, WGS84) into a
// self-contained SVG model: parcel ring + catchment boundary + drainage
// zones (graded subtle fills) + rainfall ponding + flow lines + flow-exit
// arrows. NOT the old cryptic squiggle: a legible, sharply-drawn drainage
// picture on/around the parcel. Pure data -> path strings, so the renderer
// is trivially testable over a fixture study.
//
// Projection: local equirectangular around the study extent (lng scaled by
// cos(meanLat) so shapes keep their real aspect), y-flipped for SVG, fitted
// into the viewport with padding. Every path comes from served geometry —
// nothing is invented; an empty/absent layer renders as absent.

import type {
  FloodDrainageStudyView,
  GeoJsonFeatureCollection,
} from "../../lib/floodDrainageClient";

export interface FloodVizZonePath {
  d: string;
  /** 0..1 grade for the subtle fill ramp (accumulation ordering). */
  grade: number;
}

export interface FloodVizExitArrow {
  x: number;
  y: number;
  /** SVG rotation (deg) — 0 points east; derived from the outbound bearing. */
  angleDeg: number;
}

export interface FloodVizModel {
  width: number;
  height: number;
  viewBox: string;
  /** Parcel boundary ring (the property under study). */
  parcelPath: string | null;
  /** Upstream catchment boundary polygons. */
  catchmentPaths: string[];
  /** Drainage accumulation zones — graded fills. */
  zonePaths: FloodVizZonePath[];
  /** Modeled rainfall ponding on the parcel at the design storm. */
  pondingPaths: string[];
  /** Traced flow lines. */
  flowPaths: string[];
  /** Flow-exit arrows (where water leaves the parcel). */
  exitArrows: FloodVizExitArrow[];
  /** True when the study carried honestEmpty — nothing is drawn but the ring. */
  empty: boolean;
}

const METERS_PER_DEG_LAT = 110_574;

type LngLat = [number, number];

interface Extent {
  west: number;
  south: number;
  east: number;
  north: number;
}

function collectPositions(geometry: { type: string; coordinates: unknown } | null): LngLat[][] {
  // Returns an array of RINGS/LINES (each an array of [lng,lat]) for the
  // geometry types the study produces. Points are handled separately.
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  const c = coordinates as unknown;
  if (!Array.isArray(c)) return [];
  switch (type) {
    case "Polygon":
      return c as LngLat[][];
    case "MultiPolygon":
      return (c as LngLat[][][]).flat().filter((r) => Array.isArray(r));
    case "LineString":
      return [c as LngLat[]];
    case "MultiLineString":
      return c as LngLat[][];
    default:
      return [];
  }
}

function fcLines(fc: GeoJsonFeatureCollection | null | undefined): LngLat[][] {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out: LngLat[][] = [];
  for (const f of fc.features) {
    for (const line of collectPositions(f?.geometry ?? null)) {
      if (Array.isArray(line) && line.length >= 2) out.push(line);
    }
  }
  return out;
}

/** Per-feature outer rings (fill paths want feature grouping preserved). */
function fcFeatureRings(fc: GeoJsonFeatureCollection | null | undefined): LngLat[][][] {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out: LngLat[][][] = [];
  for (const f of fc.features) {
    const rings = collectPositions(f?.geometry ?? null).filter(
      (r) => Array.isArray(r) && r.length >= 3,
    );
    if (rings.length) out.push(rings);
  }
  return out;
}

function growExtent(ext: Extent | null, lines: LngLat[][]): Extent | null {
  let e = ext;
  for (const line of lines) {
    for (const pos of line) {
      const lng = pos?.[0];
      const lat = pos?.[1];
      if (typeof lng !== "number" || typeof lat !== "number") continue;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (!e) e = { west: lng, east: lng, south: lat, north: lat };
      else {
        e.west = Math.min(e.west, lng);
        e.east = Math.max(e.east, lng);
        e.south = Math.min(e.south, lat);
        e.north = Math.max(e.north, lat);
      }
    }
  }
  return e;
}

export interface FloodVizOptions {
  width?: number;
  height?: number;
  /** Viewport padding in px. */
  pad?: number;
}

/**
 * Build the viz model from a study. Every layer is optional-honest: absent
 * or empty served geometry produces no paths (never a placeholder shape).
 */
export function buildFloodVizModel(
  study: FloodDrainageStudyView,
  opts: FloodVizOptions = {},
): FloodVizModel {
  const width = opts.width ?? 340;
  const height = opts.height ?? 270;
  const pad = opts.pad ?? 12;

  const emptyModel: FloodVizModel = {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    parcelPath: null,
    catchmentPaths: [],
    zonePaths: [],
    pondingPaths: [],
    flowPaths: [],
    exitArrows: [],
    empty: study.honestEmpty !== undefined,
  };

  const parcelRing: LngLat[] = Array.isArray(study.parcelRingWgs84)
    ? (study.parcelRingWgs84 as LngLat[])
    : [];

  const catchmentRings = fcFeatureRings(study.catchmentGeoJson);
  const zoneRings = fcFeatureRings(study.drainageZonesGeoJson);
  const pondingRings = fcFeatureRings(study.rainfallResultGeoJson ?? null);
  const flowLines = fcLines(study.flowLinesGeoJson);
  const exits = Array.isArray(study.flowExits) ? study.flowExits : [];

  // Extent: prefer the served catchment bbox (the study's own frame), else
  // grow from every drawn geometry.
  let ext: Extent | null = null;
  const bbox = study.catchmentBbox;
  if (
    bbox &&
    [bbox.westLng, bbox.eastLng, bbox.southLat, bbox.northLat].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) &&
    bbox.westLng < bbox.eastLng &&
    bbox.southLat < bbox.northLat
  ) {
    ext = {
      west: bbox.westLng,
      east: bbox.eastLng,
      south: bbox.southLat,
      north: bbox.northLat,
    };
  } else {
    ext = growExtent(ext, [parcelRing]);
    for (const rings of catchmentRings) ext = growExtent(ext, rings);
    for (const rings of zoneRings) ext = growExtent(ext, rings);
    for (const rings of pondingRings) ext = growExtent(ext, rings);
    ext = growExtent(ext, flowLines);
  }
  if (!ext || ext.west >= ext.east || ext.south >= ext.north) {
    return emptyModel;
  }

  // Local meters projection (aspect-true), fitted into the padded viewport.
  const meanLat = (ext.south + ext.north) / 2;
  const mPerDegLng = METERS_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);
  const spanX = (ext.east - ext.west) * mPerDegLng;
  const spanY = (ext.north - ext.south) * METERS_PER_DEG_LAT;
  const scale = Math.min(
    (width - pad * 2) / spanX,
    (height - pad * 2) / spanY,
  );
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;

  const px = (lng: number, lat: number): [number, number] => [
    offX + (lng - ext.west) * mPerDegLng * scale,
    // y flipped: north at the top.
    offY + (ext.north - lat) * METERS_PER_DEG_LAT * scale,
  ];

  const r1 = (n: number) => Math.round(n * 10) / 10;

  const pathFrom = (line: LngLat[], close: boolean): string | null => {
    const pts = line.filter(
      (p) =>
        typeof p?.[0] === "number" &&
        typeof p?.[1] === "number" &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    );
    if (pts.length < 2) return null;
    const d = pts
      .map((p, i) => {
        const [x, y] = px(p[0], p[1]);
        return `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`;
      })
      .join(" ");
    return close ? `${d} Z` : d;
  };

  const ringsToPath = (rings: LngLat[][]): string | null => {
    const parts = rings
      .map((ring) => pathFrom(ring, true))
      .filter((d): d is string => d !== null);
    return parts.length ? parts.join(" ") : null;
  };

  const zonePaths: FloodVizZonePath[] = [];
  zoneRings.forEach((rings, i) => {
    const d = ringsToPath(rings);
    if (d) {
      zonePaths.push({
        d,
        grade: zoneRings.length > 1 ? i / (zoneRings.length - 1) : 1,
      });
    }
  });

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    parcelPath: parcelRing.length >= 3 ? pathFrom(parcelRing, true) : null,
    catchmentPaths: catchmentRings
      .map((rings) => ringsToPath(rings))
      .filter((d): d is string => d !== null),
    zonePaths,
    pondingPaths: pondingRings
      .map((rings) => ringsToPath(rings))
      .filter((d): d is string => d !== null),
    flowPaths: flowLines
      .map((line) => pathFrom(line, false))
      .filter((d): d is string => d !== null),
    exitArrows: exits
      .filter(
        (e) =>
          typeof e?.lng === "number" &&
          typeof e?.lat === "number" &&
          Number.isFinite(e.lng) &&
          Number.isFinite(e.lat),
      )
      .map((e) => {
        const [x, y] = px(e.lng, e.lat);
        // Bearing: degrees clockwise from NORTH. SVG rotation: 0 = east,
        // clockwise (y down). north(0) -> -90, east(90) -> 0.
        const bearing =
          typeof e.bearingDeg === "number" && Number.isFinite(e.bearingDeg)
            ? e.bearingDeg
            : 0;
        return { x: r1(x), y: r1(y), angleDeg: r1(bearing - 90) };
      }),
    empty: study.honestEmpty !== undefined,
  };
}
