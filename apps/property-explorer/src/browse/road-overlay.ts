// apps/property-explorer/src/browse/road-overlay.ts
//
// Track B1 road render — streets vs pedestrian ways:
//   Streets (isPedestrianWay === false): hairline→soft grey ROW band.
//   Pedestrian (footway/path/…): distinct muted khaki, thinner/lighter,
//   OFF by default (LAYERS toggle `pedestrian-ways`).
// Twin still holds pedestrian geometry — render filter ≠ data filter.
// Crash guard: line-blur / dash only as static/zoom literals (never
// feature-state line-gradient / data-driven dash).

import type { OverlaySpec } from "@hauska/map-renderer";

/** @deprecated No longer emitted — kept for callers that still import the key. */
export const ROAD_CENTERLINE_LAYER_KEY = "road-node-centerline";
/** Soft ROW corridor band for street-eligible roads. */
export const ROAD_ROW_BAND_LAYER_KEY = "road-node-row-band";
/** Delicate pedestrian-way overlay (off by default). */
export const ROAD_PEDESTRIAN_LAYER_KEY = "road-node-pedestrian";
/** LAYERS-panel toggle key for the pedestrian overlay. */
export const PEDESTRIAN_WAYS_TOGGLE_KEY = "pedestrian-ways";
/** @deprecated No longer emitted — kept for callers that still import the key. */
export const ROAD_EDGE_LAYER_KEY = "road-node-row-edges";

/** Band fill — medium grey, readable without washing the map. */
export const ROAD_BAND_GREY = "#9ca3af";
/**
 * Pedestrian hue — MUST match CONTEXT_PEDESTRIAN.line in layer-role-taxonomy.
 * Literal (not a runtime import) so PE vitest does not require renderer dist.
 */
export const ROAD_PEDESTRIAN_COLOR = "#c9b88a";
const PEDESTRIAN_LINE_OPACITY_MAX = 0.48;
const PEDESTRIAN_LINE_WIDTH_MAX = 3.6;
/** @deprecated Edges/centerline are not painted; alias kept for imports. */
export const ROAD_EDGE_GREY = "#4b5563";
/** @deprecated Prefer ROAD_BAND_GREY. */
export const ROAD_GREY = ROAD_BAND_GREY;

/**
 * Must match `@hauska-engine/atoms` PEDESTRIAN_OSM_HIGHWAY_TAGS /
 * FRONT_INELIGIBLE_OSM_HIGHWAY_TAGS. Used only when the wire lacks
 * `isPedestrianWay` (pre-flag corpus / retrieval lag). Prefer the flag.
 */
export const PEDESTRIAN_OSM_HIGHWAY_TAGS = [
  "footway",
  "path",
  "steps",
  "cycleway",
  "pedestrian",
  "bridleway",
  "corridor",
  "platform",
  "bus_guideway",
  "proposed",
  "construction",
] as const;

const PEDESTRIAN_TAG_SET = new Set<string>(PEDESTRIAN_OSM_HIGHWAY_TAGS);

/**
 * Parcel fill sits above roads. Must match map-renderer PARCEL_TILES_FILL_ID.
 * Literal (not a runtime import) so PE vitest does not require renderer dist.
 */
export const ROAD_BEFORE_PARCEL_FILL_ID = "hauska-parcel-tiles-fill";

export interface AttachingRoadWire {
  roadNodeId?: string;
  displayName?: string;
  /** Authoritative street-vs-pedestrian flag from engine/retrieval. */
  isPedestrianWay?: boolean;
  centerline?: { type?: string; coordinates?: Array<[number, number]> };
  row?: {
    assumedWidthFt?: number;
    provenance?: { kind?: string; osmHighwayTag?: string };
    leftEdge?: { coordinates?: Array<[number, number]> };
    rightEdge?: { coordinates?: Array<[number, number]> };
  };
  sourceCitation?: string;
}

export interface RoadOverlayVisibility {
  /** When false, pedestrian overlay is omitted/hidden. Default false. */
  pedestrianVisible?: boolean;
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

/** Resolve pedestrian flag — prefer wire flag; else osmHighwayTag denylist. */
export function roadIsPedestrianWay(road: AttachingRoadWire): boolean {
  if (typeof road.isPedestrianWay === "boolean") return road.isPedestrianWay;
  const tag = road.row?.provenance?.osmHighwayTag?.trim().toLowerCase() ?? "";
  return tag.length > 0 && PEDESTRIAN_TAG_SET.has(tag);
}

/**
 * Hairline under ~z14 (overview), soft pavement band from ~z15.
 * Opacity stays low so overlapping segments do not chalk at intersections.
 */
const ROW_BAND_PAINT = {
  "line-color": ROAD_BAND_GREY,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    1.15,
    13,
    1.4,
    14,
    2.5,
    15,
    7,
    16,
    13,
    17,
    18,
    18,
    24,
  ],
  "line-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0.12,
    13,
    0.14,
    14,
    0.16,
    15,
    0.2,
    16,
    0.24,
    17,
    0.28,
    18,
    0.3,
  ],
  "line-blur": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    0,
    14,
    0.15,
    15,
    0.45,
    16,
    0.75,
    18,
    1.1,
  ],
} as const;

/** Pedestrian — distinct hue, still finer than street band, readable on dark basemap. */
const PEDESTRIAN_PAINT = {
  "line-color": ROAD_PEDESTRIAN_COLOR,
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    1.2,
    14,
    1.8,
    16,
    2.6,
    18,
    PEDESTRIAN_LINE_WIDTH_MAX,
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
    PEDESTRIAN_LINE_OPACITY_MAX,
  ],
  "line-dasharray": [2, 2],
  "line-blur": 0,
} as const;

/**
 * Build OverlaySpec[] for near-bbox road-nodes.
 * Street band always when present; pedestrian layer optional (off by default).
 */
export function roadOverlaysFromAttachingRoads(
  roads: ReadonlyArray<AttachingRoadWire>,
  visibility: RoadOverlayVisibility = {},
): OverlaySpec[] {
  const pedestrianVisible = visibility.pedestrianVisible === true;
  const streetFeatures: LineFeature[] = [];
  const pedestrianFeatures: LineFeature[] = [];

  for (const road of roads) {
    const center = road.centerline?.coordinates;
    if (!Array.isArray(center) || center.length < 2) continue;
    const provenanceKind = road.row?.provenance?.kind ?? "unknown";
    const name = road.displayName?.trim() || road.roadNodeId || "road";
    const pedestrian = roadIsPedestrianWay(road);
    const props = {
      roadNodeId: road.roadNodeId ?? null,
      name,
      rowProvenanceKind: provenanceKind,
      assumedWidthFt: road.row?.assumedWidthFt ?? null,
      sourceCitation: road.sourceCitation ?? null,
      isPedestrianWay: pedestrian,
      osmHighwayTag: road.row?.provenance?.osmHighwayTag ?? null,
    };
    if (pedestrian) {
      pedestrianFeatures.push(
        lineFeature(center, { ...props, role: "pedestrian-way" }),
      );
    } else {
      streetFeatures.push(lineFeature(center, { ...props, role: "row-band" }));
    }
  }

  const specs: OverlaySpec[] = [];

  if (streetFeatures.length > 0) {
    specs.push({
      layerKey: ROAD_ROW_BAND_LAYER_KEY,
      layerKind: "road-node-row-band",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: streetFeatures },
      paint: { ...ROW_BAND_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: true,
    });
  }

  if (pedestrianFeatures.length > 0) {
    specs.push({
      layerKey: ROAD_PEDESTRIAN_LAYER_KEY,
      layerKind: "road-node-pedestrian",
      provider: "hauska-road-node",
      geojson: { type: "FeatureCollection", features: pedestrianFeatures },
      paint: { ...PEDESTRIAN_PAINT },
      beforeId: ROAD_BEFORE_PARCEL_FILL_ID,
      visible: pedestrianVisible,
    });
  }

  return specs;
}
