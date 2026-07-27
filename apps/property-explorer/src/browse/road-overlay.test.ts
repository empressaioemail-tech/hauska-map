import { describe, expect, it } from "vitest";

import {
  roadOverlaysFromAttachingRoads,
  ROAD_CENTERLINE_LAYER_KEY,
  ROAD_EDGE_LAYER_KEY,
} from "./road-overlay";

describe("roadOverlaysFromAttachingRoads (Track B1)", () => {
  it("draws centerline + ROW edges with approximate-assumed-per-class provenance", () => {
    const specs = roadOverlaysFromAttachingRoads([
      {
        roadNodeId: "48021:road:123",
        displayName: "Chestnut St",
        centerline: {
          type: "LineString",
          coordinates: [
            [-97.3153, 30.1101],
            [-97.3153, 30.1105],
          ],
        },
        row: {
          assumedWidthFt: 50,
          provenance: { kind: "approximate-assumed-per-class" },
          leftEdge: {
            coordinates: [
              [-97.31535, 30.1101],
              [-97.31535, 30.1105],
            ],
          },
          rightEdge: {
            coordinates: [
              [-97.31525, 30.1101],
              [-97.31525, 30.1105],
            ],
          },
        },
        sourceCitation: "OpenStreetMap way/123",
      },
    ]);

    expect(specs.map((s) => s.layerKey)).toEqual([
      ROAD_EDGE_LAYER_KEY,
      ROAD_CENTERLINE_LAYER_KEY,
    ]);
    const edges = specs.find((s) => s.layerKey === ROAD_EDGE_LAYER_KEY)!;
    const center = specs.find((s) => s.layerKey === ROAD_CENTERLINE_LAYER_KEY)!;
    const edgeFc = edges.geojson as GeoJSON.FeatureCollection;
    const centerFc = center.geojson as GeoJSON.FeatureCollection;
    expect(edgeFc.features).toHaveLength(2);
    expect(centerFc.features).toHaveLength(1);
    expect(edgeFc.features[0]!.properties?.rowProvenanceKind).toBe(
      "approximate-assumed-per-class",
    );
    expect(centerFc.features[0]!.properties?.name).toBe("Chestnut St");
  });

  it("returns empty overlays when no road-node attaches (honest absence)", () => {
    expect(roadOverlaysFromAttachingRoads([])).toEqual([]);
  });
});
