/**
 * @hauska/map-renderer — public barrel.
 *
 * The spatial-surface package of the shared-surface family. Renders MapLibre
 * on a main-thread canvas (see close report re: OffscreenCanvas) wrapped by the
 * E6 floating-window FSM, driven by the dynamic layer registry.
 */

export { FloatingMap } from "./FloatingMap";
export type { FloatingMapProps, FloatingMapHandle } from "./FloatingMap";

// Layer registry — the dynamic per-app layer catalog.
export {
  LAYER_REGISTRY,
  // `LayerRegistry` is the ergonomic alias the dispatch barrel names.
  LAYER_REGISTRY as LayerRegistry,
  DEFAULT_VISIBLE_LAYERS,
  registryEntry,
  setLayerDisabled,
  isLayerDisabled,
  visibleLayersForAllocation,
  legendEntriesForRegistry,
  layerStatusForGates,
  stylingForLayer,
  productSurfaceForLayer,
  resolveLayerAllocation,
  listAllocationKeys,
} from "./layer-registry.js";

// Renderer contract (documented signal surface).
export {
  createMapRenderer,
  RENDERER_CONTRACT,
} from "./map-renderer.js";

// Overlay renderer (the `overlays` prop wiring — SpatialProvider OverlaySpec[]).
export {
  reconcileOverlays,
  overlaySourceId,
  OVERLAY_PREFIX,
} from "./map/overlay-render.js";

// PMTiles browse-parcel source + feature-state highlight (R1, `parcelTiles`).
export {
  addParcelTiles,
  removeParcelTiles,
  setParcelFeatureState,
  clearParcelFeatureState,
  parcelNodeIdFromFeature,
  PARCEL_TILES_SOURCE_ID,
  PARCEL_TILES_FILL_ID,
  PARCEL_TILES_LINE_ID,
  PARCEL_TILES_GLOW_ID,
  DEFAULT_PROMOTE_ID,
} from "./map/parcel-tiles.js";

// Floating-window FSM (for consumers wiring their own chrome).
export {
  createFloatingWindow,
  WINDOW_STATES,
} from "./window-manager/floating-window.js";

// Input-gate helpers (reasoning-layer readiness).
export {
  probeInputGates,
  reasoningLayerLive,
  reasoningLayerAwaitingReason,
} from "./input-gates.js";

// Report-layer manifest resolution.
export {
  REPORT_LAYER_MANIFEST_VERSION,
  REPORT_LAYER_MANIFESTS,
  resolveReportLayerManifest,
  visibleLayersFromManifest,
  parseReportLayerManifest,
} from "./report-layer-manifest.js";

// Read-contract envelope helpers (confidence rendering).
export {
  isReadContract,
  isRenderableEnvelope,
  envelopeSaturation,
  envelopeIntervalWidth,
  isLegacyScalarConfidence,
  isWidthedConfidence,
  formatWidthedConfidence,
  formatReadContractSummary,
} from "./read-contract/index.js";

// Positioning copy strings.
export {
  POSITIONING_FOOTER,
  POSITIONING_TAGLINE,
  POSITIONING_MAP_NOTE,
} from "./positioning.js";

// Fixture data (the E6 Bastrop demo corpus) for consumers that build their
// own renderer on top of the registry.
export {
  getGisFixtureSlots,
  FIXTURE_CENTER,
} from "./map/gis-fixture-data.js";

// Phase 0A layer-role taxonomy — canonical paint authority.
export {
  LAYER_ROLE_TAXONOMY,
  LAYER_ROLE_BY_KEY,
  ROLE_BUDGET,
  DATA_LAYER_KEYS,
  DATA_LAND_USE_COLORS,
  CONTEXT_FEMA,
  CONTEXT_FLOOD_TEAL,
  CONTEXT_PARCEL_LINE,
  CONTEXT_PEDESTRIAN,
  SUBJECT_AMBER,
  SUBJECT_AMBER_LINE,
  SUBJECT_AMBER_BRIGHT,
  SUBJECT_AMBER_SOFT,
  INTERACTION_CYAN,
  roleForLayer,
  enforceDataLayerMutex,
  hasDataLayerMutexViolation,
  isDataLayerVisible,
  contextFillOpacity,
  femaNfhlIsFloodwayExpr,
  femaNfhlFillColorExpr,
  femaNfhlFillOpacityExpr,
} from "./map/layer-role-taxonomy.js";

// postMessage / overlay contract types.
export type {
  LayerKey,
  LayerDef,
  OverlaySpec,
  ParcelHighlightState,
  ParcelSelection,
  ParcelTilesConfig,
  ViewState,
  ViewportState,
  GisBBox,
  Center,
  PostMessageContract,
  WindowState,
} from "./postMessage";

// Live GIS client (shared PE + CC — WDLL 6 / F1b de-fork).
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
  isHydrologyHonestEmpty,
  hydrologyHonestReason,
  parcelFillColor,
  toLiveOverlays,
  contourLinesOnly,
  toTopoOverlay,
  toHydroOverlay,
  parcelNodeIdFromSelection,
  selectionToCard,
} from "./live-gis";
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
} from "./live-gis";

// Shared layered-map chrome (CC-A WDLL 7 — one shell for PE + CC).
export {
  LayersControl,
  MapTools,
  MapToolset,
  ToolsetToolsSection,
  asMaplibreMap,
  setSatelliteBase,
  SATELLITE_ATTRIBUTION,
  installMapTools,
  SHARED_DEFAULT_CENTER,
  SHARED_PARCEL_TILES,
  SHARED_TERRAIN_RGB,
  COLD_OPEN_VISIBLE_LAYERS,
  MAP_LAYER_PRESETS,
  coldOpenVisibleLayers,
  visibleLayersForPreset,
} from "./chrome/index";
export type {
  LayerStateBadge,
  MapToolsController,
  ToolsSnapshot,
  ToolKind,
  MeasureMode,
  LngLat,
} from "./chrome/index";
export {
  haversineMeters,
  polylineLengthMeters,
  ringAreaSqMeters,
  formatDistance,
  formatArea,
} from "./chrome/index";
