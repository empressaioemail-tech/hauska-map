// Shared layered-map chrome — PE + CC (CC-A WDLL 7).
// One module both surfaces import; no second map shell fork.

export { LayersControl } from "./LayersControl";
export { MapTools } from "./MapTools";
export { MapToolset, ToolsetToolsSection } from "./MapToolset";
export type { LayerStateBadge } from "./MapToolset";
export {
  asMaplibreMap,
  setSatelliteBase,
  SATELLITE_LABELS_SOURCE_ID,
  SATELLITE_LABELS_LAYER_ID,
  SATELLITE_LABELS_ATTRIBUTION,
  SATELLITE_ATTRIBUTION,
} from "./satelliteBase";
export { installMapTools } from "./mapToolsController";
export type {
  MapToolsController,
  ToolsSnapshot,
  ToolKind,
  MeasureMode,
} from "./mapToolsController";
export {
  SHARED_DEFAULT_CENTER,
  SHARED_PARCEL_TILES,
  SHARED_TERRAIN_RGB,
  COLD_OPEN_VISIBLE_LAYERS,
  MAP_LAYER_PRESETS,
  coldOpenVisibleLayers,
  visibleLayersForPreset,
} from "./sharedMapDefaults";
export {
  haversineMeters,
  polylineLengthMeters,
  ringAreaSqMeters,
  formatDistance,
  formatArea,
} from "./geoMeasure";
export type { LngLat } from "./geoMeasure";
