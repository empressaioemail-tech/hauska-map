// apps/property-explorer/src/browse/road-overlay.ts
//
// Track B1 / QA1: soft feathered light-grey ROW corridor under parcels.
// Data path unchanged (road-node centerline). Art direction only:
//   (1) wide low-opacity grey band with line-blur (the ROW)
//   (2) super-faint hairline centerline
//   (3) no hard ROW-edge strokes — the feathered band IS the ROW
// Crash guard: line-blur only (never feature-state line-gradient).

import type { OverlaySpec } from "@hauska/map-renderer";

export const ROAD_CENTERLINE_LAYER_KEY = "road-node-centerline";
/** Soft feathered ROW corridor (replaces hard left/right edge strokes). */
export const ROAD_ROW_BAND_LAYER_KEY = "road-node-row-band";
/** @deprecated Use ROAD_ROW_BAND_LAYER_KEY — hard edge strokes retired. */
export const ROAD_EDGE_LAYER_KEY = ROAD_ROW_BAND_LAYER_KEY;

/** Single light-grey for band + hairline (not blue). */
export const ROAD_GREY = "#c4c4c4";

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

/** Zoom-scaled width / blur / opacity — not fixed pixels. */
const ROW_BAND_PAINT = {
  "line-color": ROAD_GREY,
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
    0.1,
    14,
    0.16,
    16,
    0.22,
    18,
    0.28,
  ],
  "line-blur": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    3,
    14,
    5,
    16,
    8,
    18,
    12,
  ],
} as const;

const CENTERLINE_PAINT = {
  "line-color": ROAD_GREY,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.35,
    14,
    0.55,
    16,
    0.8,
    18,
    1.1,
  ],
  "line-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.12,
    14,
    0.18,
    16,
    0.24,
    18,
    0.3,
  ],
} as const;

/**
 * Build OverlaySpec[] for attaching / near-bbox road-nodes.
 * ROW is a feathered grey band on the centerline; edge geometries are not drawn.
 */
export function roadOverlaysFromAttachingRoads(
  roads: ReadonlyArray<AttachingRoadWire>,
): OverlaySpec[] {
  const centerlineFeatures: LineFeature[] = [];

  for (const road of roads) {
    const center = road.centerline?.coordinates;
    if (!Array.isArray(center) || center.length < 2) continue;
    const provenanceKind = road.row?.provenance?.kind ?? "unknown";
    const name = road.displayName?.trim() || road.roadNodeId || "road";
    const baseProps = {
      roadNodeId: road.roadNodeId ?? null,
      name,
      rowProvenanceKind: provenanceKind,
      assumedWidthFt: road.row?.assumedWidthFt ?? null,
      sourceCitation: road.sourceCitation ?? null,
    };
    centerlineFeatures.push(
      lineFeature(center, { ...baseProps, role: "centerline" }),
    );
  }

  if (centerlineFeatures.length === 0) return [];

  const fc = { type: "FeatureCollection" as const, features: centerlineFeatures };

  // Band first (under), hairline second — both beneath parcels via beforeId.
  return [
    {
      layerKey: ROAD_ROW_BAND_LAYER_KEY,
      layerKind: "road-node-row-band",
      provider: "hauska-road-node",
      geojson: fc,
      paint: { ...ROW_BAND_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    },
    {
      layerKey: ROAD_CENTERLINE_LAYER_KEY,
      layerKind: "road-node-centerline",
      provider: "hauska-road-node",
      geojson: fc,
      paint: { ...CENTERLINE_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    },
  ];
}
