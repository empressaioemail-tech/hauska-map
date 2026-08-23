// apps/property-explorer/src/browse/building-footprint-overlay.ts
//
// P-60 viewport building-footprint layer — present building-footprint atoms
// from retrieval near-bbox (same spine pattern as road-nodes).

import type { OverlaySpec } from "@hauska/map-renderer";
import { ROAD_BEFORE_PARCEL_FILL_ID } from "./road-overlay";

/** LAYERS-panel toggle key for building footprints (P-60). */
export const BUILDING_FOOTPRINT_TOGGLE_KEY = "building-footprint";

/** Map overlay layer key (matches layer-registry + gis-map-paint). */
export const BUILDING_FOOTPRINT_LAYER_KEY = "building-footprint";

const FOOTPRINT_FILL = "#c4a882";
const FOOTPRINT_LINE = "#e8d4b8";

export interface BuildingFootprintWire {
  parcelNodeId?: string;
  footprintId?: string;
  footprintGeometry?: {
    type?: string;
    coordinates?: Array<Array<[number, number]>>;
  };
  structureRole?: string;
  sourceCitation?: string;
}

type PolygonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
};

function isPolygonGeometry(
  g: BuildingFootprintWire["footprintGeometry"],
): g is { type: "Polygon"; coordinates: Array<Array<[number, number]>> } {
  return (
    !!g &&
    g.type === "Polygon" &&
    Array.isArray(g.coordinates) &&
    g.coordinates.length > 0
  );
}

/**
 * Build OverlaySpec[] for near-bbox building-footprint atoms.
 * Off unless `visible === true` (LAYERS toggle).
 */
export function buildingFootprintOverlaysFromWires(
  footprints: ReadonlyArray<BuildingFootprintWire>,
  visible = false,
): OverlaySpec[] {
  const features: PolygonFeature[] = [];
  for (const fp of footprints) {
    const geom = fp.footprintGeometry;
    if (!isPolygonGeometry(geom)) continue;
    features.push({
      type: "Feature",
      properties: {
        parcelNodeId: fp.parcelNodeId ?? null,
        footprintId: fp.footprintId ?? null,
        structureRole: fp.structureRole ?? null,
        sourceCitation: fp.sourceCitation ?? null,
        provider: "hauska-building-footprint",
      },
      geometry: { type: "Polygon", coordinates: geom.coordinates },
    });
  }
  if (features.length === 0) return [];
  return [
    {
      layerKey: BUILDING_FOOTPRINT_LAYER_KEY,
      layerKind: "building-footprint",
      provider: "hauska-building-footprint",
      geojson: { type: "FeatureCollection", features },
      paint: {
        "fill-color": FOOTPRINT_FILL,
        "fill-opacity": 0.55,
        "line-color": FOOTPRINT_LINE,
        "line-width": 1.2,
      },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible,
    },
  ];
}
