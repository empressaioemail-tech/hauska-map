// apps/property-explorer/src/browse/road-overlay.ts
//
// Track B1 road render — gradient band only (Phase 0A polish):
//   soft medium-grey ROW band (pavement mass). Edge strokes and centerline
//   stay out of the paint stack so the corridor reads as a wash, not wireframe.
// Crash guard: line-blur only as a static/zoom literal (never feature-state
// line-gradient / data-driven dash).

import type { OverlaySpec } from "@hauska/map-renderer";

/** @deprecated No longer emitted — kept for callers that still import the key. */
export const ROAD_CENTERLINE_LAYER_KEY = "road-node-centerline";
/** Soft ROW corridor band (the only road paint we emit). */
export const ROAD_ROW_BAND_LAYER_KEY = "road-node-row-band";
/** @deprecated No longer emitted — kept for callers that still import the key. */
export const ROAD_EDGE_LAYER_KEY = "road-node-row-edges";

/** Band fill — medium grey, readable without washing the map. */
export const ROAD_BAND_GREY = "#9ca3af";
/** @deprecated Edges/centerline are not painted; alias kept for imports. */
export const ROAD_EDGE_GREY = "#4b5563";
/** @deprecated Prefer ROAD_BAND_GREY. */
export const ROAD_GREY = ROAD_BAND_GREY;

/**
 * Parcel fill sits above roads. Must match map-renderer PARCEL_TILES_FILL_ID.
 * Literal (not a runtime import) so PE vitest does not require renderer dist.
 */
export const ROAD_BEFORE_PARCEL_FILL_ID = "hauska-parcel-tiles-fill";

export interface AttachingRoadWire {
  roadNodeId?: string;
  displayName?: string;
  centerline?: { type?: string; coordinates?: Array<[number, number]> };
  row?: {
    assumedWidthFt?: number;
    provenance?: { kind?: string };
    leftEdge?: { coordinates?: Array<[number, number]> };
    rightEdge?: { coordinates?: Array<[number, number]> };
  };
  sourceCitation?: string;
}

type LineFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};

function lineFeature(
  coordinates: Array<[number, number]>,
  properties: Record<string, unknown>,
): LineFeature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

/** ROW mass — light blur only; opacity high enough to read as pavement. */
const ROW_BAND_PAINT = {
  "line-color": ROAD_BAND_GREY,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    10,
    14,
    18,
    16,
    28,
    18,
    40,
  ],
  "line-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.28,
    14,
    0.36,
    16,
    0.42,
    18,
    0.48,
  ],
  // Light feather — enough to soften, not enough to wash out the edges.
  "line-blur": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.4,
    14,
    0.7,
    16,
    1.0,
    18,
    1.4,
  ],
} as const;

/**
 * Build OverlaySpec[] for attaching / near-bbox road-nodes.
 * Gradient band only (beneath parcels). Edge/centerline geometry is not painted.
 */
export function roadOverlaysFromAttachingRoads(
  roads: ReadonlyArray<AttachingRoadWire>,
): OverlaySpec[] {
  const bandFeatures: LineFeature[] = [];

  for (const road of roads) {
    const center = road.centerline?.coordinates;
    if (!Array.isArray(center) || center.length < 2) continue;
    const provenanceKind = road.row?.provenance?.kind ?? "unknown";
    const name = road.displayName?.trim() || road.roadNodeId || "road";
    bandFeatures.push(
      lineFeature(center, {
        roadNodeId: road.roadNodeId ?? null,
        name,
        rowProvenanceKind: provenanceKind,
        assumedWidthFt: road.row?.assumedWidthFt ?? null,
        sourceCitation: road.sourceCitation ?? null,
        role: "row-band",
      }),
    );
  }

  if (bandFeatures.length === 0) return [];

  return [
    {
      layerKey: ROAD_ROW_BAND_LAYER_KEY,
      layerKind: "road-node-row-band",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: bandFeatures },
      paint: { ...ROW_BAND_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    },
  ];
}
