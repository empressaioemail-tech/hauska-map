/**
 * Thin re-export — ONE shared live-GIS module (WDLL 6 / F1b).
 * Source of truth: packages/map-renderer/src/live-gis.ts
 *
 * Relative import (not the package barrel) so app tests that mock
 * `@hauska/map-renderer` (FloatingMap) do not erase these helpers.
 */
// NOTE: the derived D8 hydrology helpers (LIVE_HYDRO_KEY, fetchHydrologyLayer,
// toHydroOverlay, …) are intentionally NOT re-exported: the D8 flow squiggle is
// no longer a customer layer on the browse map. PE's water layer is the REAL
// county-mapped `hydrography` slot below. The D8 helpers remain in the shared
// module for internal (CC/debug) use.
export {
  LIVE_PARCELS_KEY,
  LIVE_FEMA_KEY,
  LIVE_TOPO_KEY,
  LIVE_HYDROGRAPHY_KEY,
  MIN_PARCEL_ZOOM,
  MIN_FEMA_ZOOM,
  MIN_TOPO_ZOOM,
  MIN_HYDROGRAPHY_ZOOM,
  layersForZoom,
  fetchGisLayer,
  fetchTopographyLayer,
  fetchHydrographyLayer,
  contourTierLabel,
  contourLinesOnly,
  isHydrographyHonestEmpty,
  hydrographyHonestReason,
  hydrographyProvenanceLabel,
  parcelFillColor,
  toLiveOverlays,
  toTopoOverlay,
  toHydrographyOverlay,
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
  HydrographyProvenance,
  HydrographyLayerResponse,
  HydrographyLayerState,
  ParcelCardData,
} from "../../../../packages/map-renderer/src/live-gis";
