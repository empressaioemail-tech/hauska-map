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

/** GeoJSON-ish overlay spec applied to the map as a source + layer. */
export interface OverlaySpec {
  /** Registry layer key this overlay corresponds to. */
  layerKey: LayerKey;
  /** GeoJSON FeatureCollection or Feature payload. */
  geojson: unknown;
  /** Optional MapLibre paint overrides. */
  paint?: Record<string, unknown>;
  /** Whether the overlay starts visible. */
  visible?: boolean;
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
