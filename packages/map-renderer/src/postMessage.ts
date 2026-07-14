/**
 * postMessage / overlay contract types for @hauska/map-renderer.
 *
 * These are the message-shaped contracts the FloatingMap accepts as props and
 * that a future worker transport (if MapLibre ever supports OffscreenCanvas)
 * would speak over. Today the map runs on the main thread; these types remain
 * the stable public contract so consumers program against them regardless of
 * transport.
 */

/** A registry layer key (see LAYER_REGISTRY). */
export type LayerKey = string;

/**
 * A layer definition entry from the dynamic layer registry.
 * Mirrors the runtime shape produced by layer-registry.js.
 */
export interface LayerDef {
  key: LayerKey;
  label: string;
  group: string;
  fixture: boolean;
  live: boolean;
  fuelGated: boolean;
  pending?: boolean;
  reasoning?: boolean;
  inputGate?: { input?: "F2" | "F5" | "F2+F4"; description: string };
}

/**
 * A live SpatialProvider overlay applied to the map as a source + layer(s).
 *
 * The renderer picks layer type by geometry: Polygon/MultiPolygon -> fill+line,
 * Point/MultiPoint -> circle, LineString/MultiLineString -> line. Provide
 * `choropleth` for a data-driven fill (e.g. rent-heat, drainage risk).
 */
export interface OverlaySpec {
  /** Stable key for this overlay; identifies its sources/layers for diffing. */
  layerKey: LayerKey;
  /**
   * Optional overlay-kind tag from the SpatialProvider contract
   * (e.g. "fema-nfhl-flood-zone", "parcel-mesh", "rent-heat"). Informational;
   * the renderer keys off geometry + `choropleth`, not this field.
   */
  layerKind?: string;
  /** Optional provider tag (e.g. "cotality", "fema"). Informational. */
  provider?: string;
  /** GeoJSON FeatureCollection, Feature, or bare geometry payload. */
  geojson: unknown;
  /**
   * Data-driven choropleth fill. When set, the polygon fill (or point circle)
   * color interpolates over `property` across `stops` ([value, color] pairs).
   */
  choropleth?: {
    property: string;
    stops: Array<[number, string]>;
  };
  /**
   * Optional MapLibre paint overrides, keyed by the concrete paint property
   * (`fill-color`, `fill-opacity`, `line-color`, `line-width`, `circle-color`,
   * `circle-radius`, `circle-opacity`, `circle-stroke-color`,
   * `circle-stroke-width`).
   */
  paint?: Record<string, unknown>;
  /** Whether the overlay starts visible (default true). */
  visible?: boolean;
  /**
   * Interactive overlays get hover highlight + pointer cursor, and clicks on
   * their features fire `onParcelSelect` with the feature's properties
   * (apn / situsAddress / owner etc. pass through untouched). Live parcel
   * layers set this; passive overlays (flood bands, heat) leave it unset.
   */
  interactive?: boolean;
}

/** A geographic bounding box in WGS84 degrees. */
export interface GisBBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Viewport snapshot emitted by `onViewportChange` after map load and after
 * every (debounced) moveend/zoomend — the hook live-data consumers use to
 * fetch bbox-scoped GIS layers for the current view.
 */
export interface ViewportState {
  bbox: GisBBox;
  zoom: number;
}

/** A selected parcel context, emitted on parcel click and accepted as a prop. */
export interface ParcelSelection {
  apn?: string;
  address?: string;
  lng?: number;
  lat?: number;
  layerKey?: LayerKey;
  properties?: Record<string, unknown>;
  feature?: unknown;
}

/** Map view state preserved across window-manager transitions. */
export interface ViewState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Center in {latitude, longitude} form as consumed by the renderer context. */
export interface Center {
  latitude: number;
  longitude: number;
}

/**
 * The transport message contract. The main-thread renderer dispatches these
 * internally; a worker transport would serialize them over postMessage.
 */
export type PostMessageContract =
  | { type: "INIT"; payload: { style: unknown; center: Center; zoom?: number } }
  | { type: "SET_VIEWPORT"; payload: Partial<ViewState> }
  | { type: "ADD_OVERLAY"; payload: { overlay: OverlaySpec } }
  | { type: "SET_PARCEL"; payload: ParcelSelection }
  | { type: "SET_LAYER_VISIBILITY"; payload: { visible: LayerKey[] } }
  | { type: "READY" };

/** Floating-window FSM state. */
export type WindowState =
  | "floating"
  | "snapped"
  | "minimized"
  | "header-docked"
  | "maximized"
  | "closed";
