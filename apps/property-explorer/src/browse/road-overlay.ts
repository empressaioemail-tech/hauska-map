// apps/property-explorer/src/browse/road-overlay.ts
//
// Track B1 road render — DEFINED corridor (Phase 0A polish):
//   (1) medium-grey ROW band with light blur (the pavement mass)
//   (2) crisp dark edge strokes from leftEdge/rightEdge when present
//   (3) readable centerline
// Crash guard: line-blur only as a static/zoom literal (never feature-state
// line-gradient / data-driven dash).

import type { OverlaySpec } from "@hauska/map-renderer";

export const ROAD_CENTERLINE_LAYER_KEY = "road-node-centerline";
/** Soft ROW corridor band under the crisp edges. */
export const ROAD_ROW_BAND_LAYER_KEY = "road-node-row-band";
/** Crisp ROW edge strokes (left + right). */
export const ROAD_EDGE_LAYER_KEY = "road-node-row-edges";

/** Band fill — medium grey, readable without washing the map. */
export const ROAD_BAND_GREY = "#9ca3af";
/** Crisp edge + centerline — darker, defines the corridor. */
export const ROAD_EDGE_GREY = "#4b5563";
/** @deprecated Prefer ROAD_BAND_GREY / ROAD_EDGE_GREY. */
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

function isUsableRing(
  coords: Array<[number, number]> | undefined,
): coords is Array<[number, number]> {
  return Array.isArray(coords) && coords.length >= 2;
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

/** Crisp ROW edges — zero blur, darker stroke. */
const ROW_EDGE_PAINT = {
  "line-color": ROAD_EDGE_GREY,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    1.1,
    14,
    1.4,
    16,
    1.8,
    18,
    2.2,
  ],
  "line-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.7,
    14,
    0.78,
    16,
    0.85,
    18,
    0.9,
  ],
  "line-blur": 0,
} as const;

const CENTERLINE_PAINT = {
  "line-color": ROAD_EDGE_GREY,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.6,
    14,
    0.9,
    16,
    1.2,
    18,
    1.6,
  ],
  "line-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.45,
    14,
    0.55,
    16,
    0.65,
    18,
    0.75,
  ],
} as const;

/**
 * Build OverlaySpec[] for attaching / near-bbox road-nodes.
 * Band + optional crisp edges + centerline, all beneath parcels.
 */
export function roadOverlaysFromAttachingRoads(
  roads: ReadonlyArray<AttachingRoadWire>,
): OverlaySpec[] {
  const centerlineFeatures: LineFeature[] = [];
  const edgeFeatures: LineFeature[] = [];

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
    if (isUsableRing(road.row?.leftEdge?.coordinates)) {
      edgeFeatures.push(
        lineFeature(road.row!.leftEdge!.coordinates!, {
          ...baseProps,
          role: "leftEdge",
        }),
      );
    }
    if (isUsableRing(road.row?.rightEdge?.coordinates)) {
      edgeFeatures.push(
        lineFeature(road.row!.rightEdge!.coordinates!, {
          ...baseProps,
          role: "rightEdge",
        }),
      );
    }
  }

  if (centerlineFeatures.length === 0) return [];

  const centerFc = {
    type: "FeatureCollection" as const,
    features: centerlineFeatures,
  };
  const specs: OverlaySpec[] = [
    {
      layerKey: ROAD_ROW_BAND_LAYER_KEY,
      layerKind: "road-node-row-band",
      provider: "hauska-road-node",
      geojson: centerFc,
      paint: { ...ROW_BAND_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    },
  ];

  if (edgeFeatures.length > 0) {
    specs.push({
      layerKey: ROAD_EDGE_LAYER_KEY,
      layerKind: "road-node-row-edges",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: edgeFeatures },
      paint: { ...ROW_EDGE_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    });
  }

  specs.push({
    layerKey: ROAD_CENTERLINE_LAYER_KEY,
    layerKind: "road-node-centerline",
    provider: "hauska-road-node",
    geojson: centerFc,
    paint: { ...CENTERLINE_PAINT },
    beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
    visible: true,
  });

  return specs;
}
