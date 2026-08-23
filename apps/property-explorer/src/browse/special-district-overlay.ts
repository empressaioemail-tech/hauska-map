// apps/property-explorer/src/browse/special-district-overlay.ts
//
// P-60 mud-pid registry slot — TCEQ water-district polygons from retrieval
// near-bbox (same source layer cited by special-district-fact atoms).

import type { OverlaySpec } from "@hauska/map-renderer";
import { ROAD_BEFORE_PARCEL_FILL_ID } from "./road-overlay";

/** LAYERS-panel toggle key (registry row mud-pid). */
export const MUD_PID_TOGGLE_KEY = "mud-pid";

/** Stable overlay / paint stack key. */
export const MUD_PID_LAYER_KEY = "mud-pid";

const DISTRICT_FILL = "#8a5cff";
const DISTRICT_LINE = "#d4b8ff";

export interface SpecialDistrictWire {
  districtRowId?: string;
  districtId?: string;
  districtName?: string;
  districtType?: string;
  countyFips?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  sourceCitation?: string;
}

type PolygonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: unknown };
};

function polygonFeature(
  district: SpecialDistrictWire,
): PolygonFeature | null {
  const geom = district.geometry;
  if (!geom || geom.type !== "Polygon" || !geom.coordinates) return null;
  return {
    type: "Feature",
    properties: {
      districtId: district.districtId ?? null,
      districtName: district.districtName ?? null,
      districtType: district.districtType ?? null,
      countyFips: district.countyFips ?? null,
      sourceCitation: district.sourceCitation ?? null,
      provider: "hauska-special-district-fact",
    },
    geometry: { type: "Polygon", coordinates: geom.coordinates },
  };
}

/**
 * Build OverlaySpec[] for near-bbox special-district polygons.
 * Off unless `visible === true` (LAYERS toggle mud-pid).
 */
export function specialDistrictOverlaysFromWires(
  districts: ReadonlyArray<SpecialDistrictWire>,
  visible = false,
): OverlaySpec[] {
  const features: PolygonFeature[] = [];
  for (const d of districts) {
    const feat = polygonFeature(d);
    if (feat) features.push(feat);
  }
  if (features.length === 0) return [];
  return [
    {
      layerKey: MUD_PID_LAYER_KEY,
      layerKind: "mud-pid",
      provider: "hauska-special-district-fact",
      geojson: { type: "FeatureCollection", features },
      paint: {
        "fill-color": DISTRICT_FILL,
        "fill-opacity": 0.35,
        "line-color": DISTRICT_LINE,
        "line-width": 1,
        "line-dasharray": [3, 2],
      },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible,
    },
  ];
}
