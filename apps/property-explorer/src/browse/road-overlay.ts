// apps/property-explorer/src/browse/road-overlay.ts
//
// Track B1: draw attaching road-node centerline + ROW edges on the PE map.
// Reuses road-node atom geometry (centerline + baked leftEdge/rightEdge).
// No second road model. Edges carry approximate-assumed-per-class provenance.

import type { OverlaySpec } from "@hauska/map-renderer";

export const ROAD_CENTERLINE_LAYER_KEY = "road-node-centerline";
export const ROAD_EDGE_LAYER_KEY = "road-node-row-edges";

const ROAD_LINE = "#1a5f9e";
const ROAD_EDGE = "#3b82b0";

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

function lineFeature(
  coordinates: Array<[number, number]>,
  properties: Record<string, unknown>,
): GeoJSON.Feature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

/** Build OverlaySpec[] for attaching road-nodes (centerline + ROW edges). */
export function roadOverlaysFromAttachingRoads(
  roads: ReadonlyArray<AttachingRoadWire>,
): OverlaySpec[] {
  const centerlineFeatures: GeoJSON.Feature[] = [];
  const edgeFeatures: GeoJSON.Feature[] = [];

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
    centerlineFeatures.push(lineFeature(center, { ...baseProps, role: "centerline" }));

    const left = road.row?.leftEdge?.coordinates;
    const right = road.row?.rightEdge?.coordinates;
    if (Array.isArray(left) && left.length >= 2) {
      edgeFeatures.push(
        lineFeature(left, { ...baseProps, role: "leftEdge", rowProvenanceKind: provenanceKind }),
      );
    }
    if (Array.isArray(right) && right.length >= 2) {
      edgeFeatures.push(
        lineFeature(right, { ...baseProps, role: "rightEdge", rowProvenanceKind: provenanceKind }),
      );
    }
  }

  const specs: OverlaySpec[] = [];
  if (edgeFeatures.length > 0) {
    specs.push({
      layerKey: ROAD_EDGE_LAYER_KEY,
      layerKind: "road-node-row-edges",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: edgeFeatures },
      paint: {
        "line-color": ROAD_EDGE,
        "line-width": 1.5,
        "line-opacity": 0.85,
      },
      visible: true,
    });
  }
  if (centerlineFeatures.length > 0) {
    specs.push({
      layerKey: ROAD_CENTERLINE_LAYER_KEY,
      layerKind: "road-node-centerline",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: centerlineFeatures },
      paint: {
        "line-color": ROAD_LINE,
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
      visible: true,
    });
  }
  return specs;
}
