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
  hideGisLayer,
} from "./map/gis-map-render.js";
import { DEFAULT_VISIBLE_LAYERS } from "./layer-registry.js";
import { reconcileOverlays, overlaySourceId } from "./map/overlay-render.js";

/**
 * @typedef {Object} MapRendererContext
 * @property {{ latitude: number, longitude: number }} [center]
 * @property {string} [address]
 * @property {boolean} [useFixture]
 * @property {(selection: object) => void} [onParcelSelect]
 * @property {(viewport: import('./postMessage').ViewportState) => void} [onViewportChange]
 */

/** Debounce (ms) for moveend/zoomend viewport emission. */
const VIEWPORT_DEBOUNCE_MS = 350;

/** Source + layer ids for the interactive-overlay hover highlight. */
const HOVER_SOURCE_ID = "hauska-ovl-hover-highlight";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

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
  // Fixture stack gating. Fixture layers (the E6 demo corpus) draw only when
  // context.useFixture is true (legacy default). When they draw, a visible
  // FIXTURE watermark is stamped on the canvas so synthetic data never renders
  // unlabeled. Flipping useFixture at runtime removes/restores the stack.
  let fixtureEnabled = true;
  let viewportTimer = null;
  let hoveredFeatureKey = null;

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

    // Debug/verification seam: expose the Map instance on its container so
    // operator tooling and headless checks can query style sources/layers
    // programmatically (document.querySelector('.spine-map-canvas').__hauskaMap).
    mapEl.__hauskaMap = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    map.on("load", () => {
      applyLayerVisibility();
      applyOverlays();
      // Fit to the fixture corpus only when the fixture stack is actually in
      // play; live-data consumers keep the center/zoom they asked for.
      if (fixtureEnabled) {
        fitToSlots(map, gisSlots, { latitude: center.latitude, longitude: center.longitude }, 48);
      }
      emitViewport();
    });

    map.on("moveend", scheduleViewportEmit);
    map.on("zoomend", scheduleViewportEmit);

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point).filter((f) =>
        String(f.layer?.id || "").includes("-fill"),
      );
      if (!features.length) return;

      // Interactive live overlays win over the fixture stack: a click on a
      // live parcel emits its real properties (apn, situsAddress, owner, …).
      const interactiveKeys = interactiveOverlayKeys();
      const liveHit = features.find((f) => {
        const id = String(f.layer?.id || "");
        const key = f.properties?.layerKey;
        return id.startsWith("hauska-ovl-") && key != null && interactiveKeys.has(String(key));
      });
      if (liveHit) {
        const p = liveHit.properties || {};
        context.onParcelSelect?.({
          apn: p.apn != null ? String(p.apn) : undefined,
          address: p.situsAddress || p.address || undefined,
          lat: e.lngLat?.lat,
          lng: e.lngLat?.lng,
          layerKey: String(p.layerKey),
          properties: p,
          feature: liveHit,
        });
        return;
      }

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

    // Hover highlight + pointer cursor over interactive overlay fills.
    map.on("mousemove", (e) => {
      const layerIds = interactiveOverlayFillIds();
      if (!layerIds.length) {
        if (hoveredFeatureKey !== null) clearHover();
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (!hits.length) {
        clearHover();
        return;
      }
      const f = hits[0];
      map.getCanvas().style.cursor = "pointer";
      const key = `${f.layer.id}::${f.id ?? JSON.stringify(f.properties?.apn ?? "")}`;
      if (key === hoveredFeatureKey) return;
      hoveredFeatureKey = key;
      ensureHoverLayers();
      const src = map.getSource(HOVER_SOURCE_ID);
      if (src && typeof src.setData === "function") {
        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: f.geometry }],
        });
      }
    });

    resizeObs = new ResizeObserver(() => map?.resize());
    resizeObs.observe(mapEl);
  }

  function interactiveOverlayKeys() {
    return new Set(
      overlaySpecs.filter((s) => s && s.interactive).map((s) => String(s.layerKey)),
    );
  }

  function interactiveOverlayFillIds() {
    return overlaySpecs
      .filter((s) => s && s.interactive)
      .map((s) => `${overlaySourceId(s.layerKey)}-fill`)
      .filter((id) => map && map.getLayer(id));
  }

  function ensureHoverLayers() {
    if (!map) return;
    if (!map.getSource(HOVER_SOURCE_ID)) {
      map.addSource(HOVER_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(`${HOVER_SOURCE_ID}-fill`)) {
      map.addLayer({
        id: `${HOVER_SOURCE_ID}-fill`,
        type: "fill",
        source: HOVER_SOURCE_ID,
        paint: { "fill-color": "#7dd3fc", "fill-opacity": 0.18 },
      });
    }
    if (!map.getLayer(`${HOVER_SOURCE_ID}-line`)) {
      map.addLayer({
        id: `${HOVER_SOURCE_ID}-line`,
        type: "line",
        source: HOVER_SOURCE_ID,
        paint: { "line-color": "#7dd3fc", "line-width": 2 },
      });
    }
  }

  function clearHover() {
    hoveredFeatureKey = null;
    if (!map) return;
    map.getCanvas().style.cursor = "";
    const src = map.getSource(HOVER_SOURCE_ID);
    if (src && typeof src.setData === "function") src.setData(EMPTY_FC);
  }

  function emitViewport() {
    if (!map || !context.onViewportChange) return;
    const b = map.getBounds();
    context.onViewportChange({
      bbox: {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      },
      zoom: map.getZoom(),
    });
  }

  function scheduleViewportEmit() {
    if (viewportTimer) clearTimeout(viewportTimer);
    viewportTimer = setTimeout(() => {
      viewportTimer = null;
      emitViewport();
    }, VIEWPORT_DEBOUNCE_MS);
  }

  /** Stamp (or remove) the FIXTURE watermark badge on the map canvas. */
  function updateFixtureWatermark() {
    if (!mapEl) return;
    const existing = mapEl.querySelector(".hauska-fixture-watermark");
    if (fixtureEnabled) {
      if (existing) return;
      const el = document.createElement("div");
      el.className = "hauska-fixture-watermark";
      el.textContent = "FIXTURE DATA";
      el.style.cssText = [
        "position:absolute",
        "top:10px",
        "left:10px",
        "z-index:10",
        "pointer-events:none",
        "padding:4px 10px",
        "font:700 11px/1.4 system-ui,sans-serif",
        "letter-spacing:0.14em",
        "color:#b45309",
        "background:rgba(251,191,36,0.18)",
        "border:1px solid rgba(180,83,9,0.65)",
        "border-radius:4px",
        "text-transform:uppercase",
      ].join(";");
      mapEl.appendChild(el);
    } else if (existing) {
      existing.remove();
    }
  }

  function applyLayerVisibility() {
    if (!map || !map.isStyleLoaded()) return;
    if (!fixtureEnabled) {
      // Fixture stack OFF: hide every fixture layer that may already be drawn
      // and drop the watermark. Live overlays (setOverlays) are unaffected.
      for (const slot of gisSlots) {
        hideGisLayer(map, slot.layerKey);
      }
      updateFixtureWatermark();
      return;
    }
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
    updateFixtureWatermark();
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
      if (typeof ctx.useFixture === "boolean" && ctx.useFixture !== fixtureEnabled) {
        fixtureEnabled = ctx.useFixture;
        if (map && map.isStyleLoaded()) applyLayerVisibility();
      } else if (typeof ctx.useFixture === "boolean") {
        fixtureEnabled = ctx.useFixture;
      }
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
      if (viewportTimer) {
        clearTimeout(viewportTimer);
        viewportTimer = null;
      }
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
  contextFields: ["center", "address", "useFixture", "onParcelSelect", "onViewportChange"],
  preserves: ["center", "zoom", "pitch", "bearing", "visibleLayers"],
};
