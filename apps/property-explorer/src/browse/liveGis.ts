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
  LIVE_TOPO_KEY,
  LIVE_HYDRO_KEY,
  MIN_PARCEL_ZOOM,
  MIN_FEMA_ZOOM,
  MIN_TOPO_ZOOM,
  MIN_HYDRO_ZOOM,
  layersForZoom,
  fetchGisLayer,
  fetchTopographyLayer,
  fetchHydrologyLayer,
  contourTierLabel,
  contourLinesOnly,
  isHydrologyHonestEmpty,
  hydrologyHonestReason,
  parcelFillColor,
  toLiveOverlays,
  toTopoOverlay,
  toHydroOverlay,
  parcelNodeIdFromSelection,
  selectionToCard,
} from "../../../../packages/map-renderer/src/live-gis";
export type {
  LiveLayerKey,
  GeoJsonFeature,
  FeatureCollectionLike,
  GisLayerResponse,
  LiveLayerState,
  ContourTier,
  TopoLayerResponse,
  TopoLayerState,
  HydroLayerResponse,
  HydroLayerState,
  ParcelCardData,
} from "../../../../packages/map-renderer/src/live-gis";
