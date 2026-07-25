/**
 * Thin re-export — ONE shared live-GIS module (WDLL 6 / F1b).
 * Source of truth: packages/map-renderer/src/live-gis.ts
 *
 * Relative import (not the package barrel) so app tests that mock
 * `@hauska/map-renderer` (FloatingMap) do not erase these helpers.
 */
export {
  LIVE_PARCELS_KEY,
  LIVE_FEMA_KEY,
  MIN_PARCEL_ZOOM,
  MIN_FEMA_ZOOM,
  layersForZoom,
  fetchGisLayer,
  parcelFillColor,
  toLiveOverlays,
  parcelNodeIdFromSelection,
  selectionToCard,
} from "../../../../packages/map-renderer/src/live-gis";
export type {
  LiveLayerKey,
  GeoJsonFeature,
  FeatureCollectionLike,
  GisLayerResponse,
  LiveLayerState,
  ParcelCardData,
} from "../../../../packages/map-renderer/src/live-gis";
