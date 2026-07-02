/**
 * V1 — Decoupled map renderer.
 * Thin contract: mount slot, resize signal, layer-visibility set, context binding.
 * Knows nothing about windows; emits parcel clicks to bound context.
 */

import maplibregl from "maplibre-gl";
import { HAUSKA_MAP_STYLE } from "./map/hauska-map-style.js";
import { getGisFixtureSlots } from "./map/gis-fixture-data.js";
import {
  upsertGisLayer,
  upsertVisualCeilingLayer,
  reorderGisLayers,
  fitToSlots,
  selectionFromParcelFeature,
  extractParcelAddress,
} from "./map/gis-map-render.js";
import { DEFAULT_VISIBLE_LAYERS } from "./layer-registry.js";
import { reconcileOverlays } from "./map/overlay-render.js";

/**
 * @typedef {Object} MapRendererContext
 * @property {{ latitude: number, longitude: number }} [center]
 * @property {string} [address]
 * @property {boolean} [useFixture]
 * @property {(selection: object) => void} [onParcelSelect]
 */

/**
 * @returns {{
 *   mount: (slot: HTMLElement) => void,
 *   resize: (width?: number, height?: number) => void,
 *   setLayerVisibility: (visible: Set<string>) => void,
 *   setOverlays: (specs: import('./postMessage').OverlaySpec[]) => void,
 *   bindContext: (ctx: MapRendererContext) => void,
 *   getViewState: () => { center: [number, number], zoom: number, pitch: number, bearing: number },
 *   setViewState: (vs: Partial<{ center: [number, number], zoom: number, pitch: number, bearing: number }>) => void,
 *   destroy: () => void,
 *   getMap: () => import('maplibre-gl').Map | null,
 *   getSlots: () => object[],
 * }}
 */
export function createMapRenderer() {
  let slotEl = null;
  let mapEl = null;
  let map = null;
  let resizeObs = null;
  let context = {};
  let visibleLayers = new Set(DEFAULT_VISIBLE_LAYERS);
  let gisSlots = [];
  let savedViewState = null;
  // Live SpatialProvider overlays (the `overlays` prop). Kept separate from the
  // fixture layer stack. `overlayKeys` tracks what is currently drawn so
  // setOverlays can diff and remove idempotently.
  let overlaySpecs = [];
  let overlayKeys = new Set();

  function ensureMap() {
    if (!slotEl || map) return;
    mapEl = document.createElement("div");
    mapEl.className = "spine-map-canvas";
    mapEl.style.width = "100%";
    mapEl.style.height = "100%";
    slotEl.innerHTML = "";
    slotEl.appendChild(mapEl);

    const center = context.center || { latitude: 30.1109, longitude: -97.3153 };
    gisSlots = getGisFixtureSlots(center);

    map = new maplibregl.Map({
      container: mapEl,
      style: HAUSKA_MAP_STYLE,
      center: savedViewState?.center || [center.longitude, center.latitude],
      zoom: savedViewState?.zoom ?? 15.2,
      pitch: savedViewState?.pitch ?? 0,
      bearing: savedViewState?.bearing ?? 0,
      maxPitch: 68,
      attributionControl: true,
      fadeDuration: 300,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    map.on("load", () => {
      applyLayerVisibility();
      applyOverlays();
      fitToSlots(map, gisSlots, { latitude: center.latitude, longitude: center.longitude }, 48);
    });

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point).filter((f) =>
        String(f.layer?.id || "").includes("-fill"),
      );
      if (!features.length) return;
      const f = features[0];
      const layerKey =
        f.properties?.layerKey ||
        f.layer.id.replace(/^hauska-gis-/, "").replace(/-fill$/, "");
      const slot = gisSlots.find((s) => s.layerKey === layerKey);
      if (layerKey === "parcel-polygon" || layerKey === "zoning") {
        const sel = selectionFromParcelFeature(f, slot);
        const addr = extractParcelAddress(f);
        context.onParcelSelect?.({
          ...sel,
          address: addr || context.address,
          feature: f,
          layerKey,
          properties: f.properties,
        });
      }
    });

    resizeObs = new ResizeObserver(() => map?.resize());
    resizeObs.observe(mapEl);
  }

  function applyLayerVisibility() {
    if (!map || !map.isStyleLoaded()) return;
    const visualKeys = new Set([
      "dem-hillshade",
      "topography-contours",
      "hydrology-flow",
      "parcel-extrusion",
    ]);
    for (const slot of gisSlots) {
      const show = visibleLayers.has(slot.layerKey);
      if (visualKeys.has(slot.layerKey)) {
        upsertVisualCeilingLayer(map, slot, show, show);
      } else if (slot.layerKey !== "buildable-envelope" || show) {
        upsertGisLayer(map, slot, show);
      }
    }
    reorderGisLayers(map);
  }

  function applyOverlays() {
    if (!map || !map.isStyleLoaded()) return;
    reconcileOverlays(map, overlaySpecs, overlayKeys);
  }

  function captureViewState() {
    if (!map) return savedViewState;
    const c = map.getCenter();
    savedViewState = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    return savedViewState;
  }

  return {
    /** Signal 1: mount into content slot */
    mount(slot) {
      slotEl = slot;
      ensureMap();
    },

    /** Signal 2: resize */
    resize() {
      map?.resize();
    },

    /** Signal 3: layer visibility set */
    setLayerVisibility(visible) {
      visibleLayers = new Set(visible);
      applyLayerVisibility();
    },

    /**
     * Signal 5: live SpatialProvider overlays.
     * Accepts an OverlaySpec[] and reconciles MapLibre sources+layers to exactly
     * that set — adding new overlays, updating data/paint on existing ones, and
     * removing overlays no longer present. Idempotent: repeated calls with the
     * same specs neither leak sources nor duplicate layers. If the style is not
     * yet loaded the specs are stashed and applied on `load`.
     * @param {import('./postMessage').OverlaySpec[]} specs
     */
    setOverlays(specs) {
      overlaySpecs = Array.isArray(specs) ? specs : [];
      if (map && map.isStyleLoaded()) {
        applyOverlays();
      }
      // else: applied by the map `load` handler once the style is ready.
    },

    /** Signal 4: context binding */
    bindContext(ctx) {
      context = { ...context, ...ctx };
      if (ctx.center && map) {
        const vs = savedViewState || captureViewState();
        if (vs) map.jumpTo(vs);
      }
    },

    getViewState() {
      return captureViewState() || { center: [-97.3153, 30.1109], zoom: 15.2, pitch: 0, bearing: 0 };
    },

    setViewState(vs) {
      savedViewState = { ...savedViewState, ...vs };
      if (map && vs.center) {
        map.jumpTo({
          center: vs.center,
          zoom: vs.zoom ?? map.getZoom(),
          pitch: vs.pitch ?? map.getPitch(),
          bearing: vs.bearing ?? map.getBearing(),
        });
      }
    },

    destroy() {
      resizeObs?.disconnect();
      map?.remove();
      map = null;
      slotEl = null;
    },

    getMap() {
      return map;
    },

    getSlots() {
      return gisSlots;
    },
  };
}

/** Contract surface documentation for close notes */
export const RENDERER_CONTRACT = {
  signals: ["mount(slot: HTMLElement)", "resize(width?, height?)", "setLayerVisibility(Set<string>)", "setOverlays(OverlaySpec[])", "bindContext(ctx)"],
  contextFields: ["center", "address", "useFixture", "onParcelSelect"],
  preserves: ["center", "zoom", "pitch", "bearing", "visibleLayers"],
};
