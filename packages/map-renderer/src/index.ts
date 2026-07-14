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

// postMessage / overlay contract types.
export type {
  LayerKey,
  LayerDef,
  OverlaySpec,
  ParcelSelection,
  ViewState,
  ViewportState,
  GisBBox,
  Center,
  PostMessageContract,
  WindowState,
} from "./postMessage";
