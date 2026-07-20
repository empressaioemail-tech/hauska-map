/**
 * V1 — Decoupled map renderer.
 * Thin contract: mount slot, resize signal, layer-visibility set, context binding.
 * Knows nothing about windows; emits parcel clicks to bound context.
 */

import maplibregl from "maplibre-gl";
import { Protocol as PMTilesProtocol } from "pmtiles";
import { HAUSKA_MAP_STYLE } from "./map/hauska-map-style.js";
import {
  addParcelTiles,
  removeParcelTiles,
  setParcelFeatureState,
  clearParcelFeatureState,
  parcelNodeIdFromFeature,
  PARCEL_TILES_FILL_ID,
  DEFAULT_PROMOTE_ID,
} from "./map/parcel-tiles.js";
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
 * @typedef {Object} ParcelTilesConfig
 * @property {string} url           PMTiles archive URL (pmtiles:// prefix optional).
 * @property {string} sourceLayer   Vector source layer id in the archive.
 * @property {string} [promoteId]   Attribute promoted to feature id (default parcel_node_id).
 */

/**
 * @typedef {Object} MapRendererContext
 * @property {{ latitude: number, longitude: number }} [center]
 * @property {string} [address]
 * @property {number} [zoom]
 * @property {boolean} [useFixture]
 * @property {ParcelTilesConfig | null} [parcelTiles]
 * @property {(selection: object) => void} [onParcelSelect]
 * @property {(parcelNodeId: string, feature: object) => void} [onParcelClick]
 * @property {(viewport: import('./postMessage').ViewportState) => void} [onViewportChange]
 */

/**
 * Register the PMTiles protocol on the maplibregl namespace exactly once per
 * page. Guarded so repeated renderer mounts (and hot-reload) don't double-add.
 * maplibregl v5 accepts the pmtiles v4 `Protocol.tile` as the AddProtocolAction.
 */
let pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesRegistered) return;
  try {
    const protocol = new PMTilesProtocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    pmtilesRegistered = true;
  } catch {
    /* already registered by another instance — treat as done */
    pmtilesRegistered = true;
  }
}

/** Debounce (ms) for moveend/zoomend viewport emission. */
const VIEWPORT_DEBOUNCE_MS = 350;

/** Source + layer ids for the interactive-overlay hover highlight. */
const HOVER_SOURCE_ID = "hauska-ovl-hover-highlight";

/**
 * Bounded attempt cap for the subject-resolve latch. Matches the consumer's
 * SUBJECT_RESOLVE_MAX_ATTEMPTS=8 in spine-map.js: on a property re-point the
 * subject parcel tile may still be streaming, so we re-schedule up to this many
 * times before giving up quietly. NEVER unbounded — an unbounded idle/sourcedata
 * re-schedule is the idle-loop regression this refactor exists to avoid.
 */
const SUBJECT_RESOLVE_MAX_ATTEMPTS = 8;

/** Zoom used when fitting to the subject via a center fallback (no geometry). */
const SUBJECT_FALLBACK_ZOOM = 16.5;

const EMPTY_FC = { type: "FeatureCollection", features: [] };

/**
 * @returns {{
 *   mount: (slot: HTMLElement) => void,
 *   resize: (width?: number, height?: number) => void,
 *   setLayerVisibility: (visible: Set<string>) => void,
 *   getVisibleLayers: () => Set<string>,
 *   getLayerVisibility: (layerKey: string) => boolean,
 *   setOverlays: (specs: import('./postMessage').OverlaySpec[]) => void,
 *   bindContext: (ctx: MapRendererContext) => void,
 *   rebindProperty: (opts: { center?: { latitude: number, longitude: number }, address?: string, parcelState?: { parcelNodeId: string|number, subject?: boolean, inspected?: boolean }, zoom?: number }) => void,
 *   getViewState: () => { center: [number, number], zoom: number, pitch: number, bearing: number },
 *   setViewState: (vs: Partial<{ center: [number, number], zoom: number, pitch: number, bearing: number }>) => void,
 *   setParcelTiles: (cfg: ParcelTilesConfig | null) => void,
 *   setParcelState: (parcelNodeId: string|number, state: { subject?: boolean, inspected?: boolean }) => void,
 *   resolveSubjectAndFit: (opts: { parcelNodeId: string|number, center?: { latitude: number, longitude: number }, fit?: boolean, maxAttempts?: number }) => void,
 *   queryParcelAt: (point: { x: number, y: number } | [number, number]) => { parcelNodeId?: string, countyFips?: string, feature: object } | null,
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
  // PMTiles browse-parcel layer (R1 additive). Null unless a consumer passes
  // parcelTiles. `parcelTilesApplied` tracks whether the source+layers are on
  // the map so config changes reconcile idempotently.
  let parcelTilesCfg = null;
  let parcelTilesApplied = false;
  // Currently-lit subject/inspected node ids, so a new set clears the prior one.
  let subjectNodeId = null;
  let inspectedNodeId = null;
  // True once the map `load` event fired. Style MUTATIONS (addSource/addLayer)
  // are safe from that point on. Do NOT gate overlay writes on isStyleLoaded():
  // MapLibre reports isStyleLoaded()===false whenever any source/tile is still
  // loading (e.g. right after moveend or a live-parcels setData), so a one-shot
  // overlay push (report tiles push exactly once per run) that lands in such a
  // window would be stashed and never re-applied — the report overlays would
  // silently never render.
  let styleReady = false;
  // Subject-resolve latch (W2). A monotonically incrementing generation token is
  // captured at each resolveSubjectAndFit call; an in-flight re-schedule callback
  // bails if its captured token != subjectResolveGen (a newer call superseded it),
  // so a later property never gets clobbered by a stale resolve. subjectResolve-
  // Cleanup tears down whatever listener/timer is pending (sourcedata/idle) and is
  // invoked on supersession and in destroy() — this is what keeps the latch bounded
  // and leak-free.
  let subjectResolveGen = 0;
  let subjectResolveCleanup = null;

  function ensureMap() {
    if (!slotEl || map) return;
    mapEl = document.createElement("div");
    mapEl.className = "spine-map-canvas";
    mapEl.style.width = "100%";
    mapEl.style.height = "100%";
    slotEl.innerHTML = "";
    slotEl.appendChild(mapEl);

    // Register the pmtiles:// protocol before the Map is constructed so a
    // parcelTiles vector source resolves on the first style load.
    ensurePmtilesProtocol();

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
      styleReady = true;
      applyLayerVisibility();
      applyOverlays();
      applyParcelTiles();
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
      // PMTiles browse-parcel click wins first: emit the stable parcel_node_id
      // (+ county_fips) so the consumer can resolve the node + set feature-state.
      if (parcelTilesApplied && context.onParcelClick && map.getLayer(PARCEL_TILES_FILL_ID)) {
        const parcelHits = map.queryRenderedFeatures(e.point, {
          layers: [PARCEL_TILES_FILL_ID],
        });
        if (parcelHits.length) {
          const hit = parcelHits[0];
          const promoteId = parcelTilesCfg?.promoteId || DEFAULT_PROMOTE_ID;
          const { parcelNodeId } = parcelNodeIdFromFeature(hit, promoteId);
          if (parcelNodeId != null) {
            context.onParcelClick(parcelNodeId, hit);
            return;
          }
        }
      }

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
    // Gate on the `load` event (styleReady), NOT isStyleLoaded(): the latter is
    // false during any tile/source load in progress, which dropped one-shot
    // overlay pushes (see styleReady declaration).
    if (!map || !styleReady) return;
    reconcileOverlays(map, overlaySpecs, overlayKeys);
  }

  /**
   * Reconcile the PMTiles browse-parcel layer to the current parcelTilesCfg.
   * Same load-event gating as applyOverlays (styleReady, not isStyleLoaded).
   * Additive: does nothing unless a consumer passed parcelTiles.
   */
  function applyParcelTiles() {
    if (!map || !styleReady) return;
    if (parcelTilesCfg && parcelTilesCfg.url && parcelTilesCfg.sourceLayer) {
      addParcelTiles(map, parcelTilesCfg);
      parcelTilesApplied = true;
      // Re-assert any pending subject/inspected state now the source exists.
      const sl = parcelTilesCfg.sourceLayer;
      if (subjectNodeId != null) {
        setParcelFeatureState(map, sl, subjectNodeId, { subject: true });
      }
      if (inspectedNodeId != null) {
        setParcelFeatureState(map, sl, inspectedNodeId, { inspected: true });
      }
    } else if (parcelTilesApplied) {
      removeParcelTiles(map);
      parcelTilesApplied = false;
    }
  }

  /**
   * Re-point the LIVE map to a new center without unmounting/rebuilding it.
   * Preserves the current zoom/pitch/bearing unless a new zoom is supplied, uses
   * easeTo (animated re-point, not a hard cut), and keeps savedViewState coherent
   * with where the camera is headed so a later capture/restore stays consistent.
   * No-op (returns null) when there is no map yet or no center given.
   * @param {{ latitude: number, longitude: number }} center
   * @param {number} [zoom]
   * @returns {import('./postMessage').ViewState | null}
   */
  function moveCameraTo(center, zoom) {
    if (!map || !center || typeof center.longitude !== "number" || typeof center.latitude !== "number") {
      return null;
    }
    const nextCenter = [center.longitude, center.latitude];
    const nextZoom = typeof zoom === "number" ? zoom : map.getZoom();
    const nextPitch = map.getPitch();
    const nextBearing = map.getBearing();
    map.easeTo({
      center: nextCenter,
      zoom: nextZoom,
      pitch: nextPitch,
      bearing: nextBearing,
    });
    savedViewState = {
      center: nextCenter,
      zoom: nextZoom,
      pitch: nextPitch,
      bearing: nextBearing,
    };
    return savedViewState;
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

  /**
   * Clear any pending subject-resolve listener/timer. Idempotent. Called when a
   * newer resolveSubjectAndFit supersedes an in-flight one and from destroy().
   */
  function clearSubjectResolve() {
    if (subjectResolveCleanup) {
      try {
        subjectResolveCleanup();
      } catch {
        /* ignore teardown errors */
      }
      subjectResolveCleanup = null;
    }
  }

  /**
   * Try to locate the subject parcel feature near `center` on the parcel fill
   * layer. Returns the queryRenderedFeatures hit whose promoted parcel_node_id
   * matches, or null if the tile has not painted it yet. Compose-only: reuses the
   * live parcel fill layer + promoteId; holds no feature-state logic.
   * @returns {object | null}
   */
  function findSubjectFeature(parcelNodeId, center) {
    if (!map || !parcelTilesApplied || !map.getLayer(PARCEL_TILES_FILL_ID)) return null;
    if (typeof map.project !== "function") return null;
    const target = String(parcelNodeId);
    const promoteId = parcelTilesCfg?.promoteId || DEFAULT_PROMOTE_ID;
    // Query a small box around the projected center (the subject sits at center on
    // a re-point); fall back to a full-viewport query if no center was supplied.
    let hits = [];
    try {
      if (center && typeof center.longitude === "number" && typeof center.latitude === "number") {
        const pt = map.project([center.longitude, center.latitude]);
        const pad = 4;
        hits = map.queryRenderedFeatures(
          [
            [pt.x - pad, pt.y - pad],
            [pt.x + pad, pt.y + pad],
          ],
          { layers: [PARCEL_TILES_FILL_ID] },
        );
      } else {
        hits = map.queryRenderedFeatures({ layers: [PARCEL_TILES_FILL_ID] });
      }
    } catch {
      return null;
    }
    for (const hit of hits || []) {
      const { parcelNodeId: nodeId } = parcelNodeIdFromFeature(hit, promoteId);
      if (nodeId != null && String(nodeId) === target) return hit;
    }
    return null;
  }

  /** Extend a LngLatBounds with every coordinate in a GeoJSON geometry. */
  function extendBoundsWithGeometry(bounds, geometry) {
    if (!geometry) return false;
    let has = false;
    const walk = (coords) => {
      if (!Array.isArray(coords)) return;
      // A position is [lng, lat, ...]; otherwise recurse.
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        bounds.extend([coords[0], coords[1]]);
        has = true;
        return;
      }
      for (const c of coords) walk(c);
    };
    walk(geometry.coordinates);
    return has;
  }

  /**
   * Fit/ease the camera to the subject feature's bounds, or (no usable geometry)
   * fall back to easing to `center` at a subject zoom. Never fit-to-fixture.
   */
  function fitToSubject(feature, center) {
    if (!map) return;
    let fitted = false;
    if (feature && feature.geometry) {
      try {
        const bounds = new maplibregl.LngLatBounds();
        if (extendBoundsWithGeometry(bounds, feature.geometry) && !bounds.isEmpty?.()) {
          map.fitBounds(bounds, { padding: 64, maxZoom: 17.5, duration: 600 });
          fitted = true;
        }
      } catch {
        /* fall through to center fallback */
      }
    }
    if (!fitted && center && typeof center.longitude === "number" && typeof center.latitude === "number") {
      map.easeTo({ center: [center.longitude, center.latitude], zoom: SUBJECT_FALLBACK_ZOOM, duration: 600 });
    }
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
     * Read the current layer-visibility toggle set. Returns a COPY of the live
     * `visibleLayers` Set (the toggle set — NOT drawnKeys), so callers can read
     * or iterate it without mutating renderer state.
     * @returns {Set<string>}
     */
    getVisibleLayers() {
      return new Set(visibleLayers);
    },

    /**
     * Whether a single layer key is currently toggled visible.
     * @param {string} layerKey
     * @returns {boolean}
     */
    getLayerVisibility(layerKey) {
      return visibleLayers.has(layerKey);
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
      // applyOverlays self-gates on styleReady; pre-load pushes are stashed in
      // overlaySpecs and applied by the map `load` handler.
      applyOverlays();
    },

    /** Signal 4: context binding */
    bindContext(ctx) {
      context = { ...context, ...ctx };
      // PMTiles browse-parcel config. Reconcile only when the config changed
      // (url/sourceLayer/promoteId), so re-binds for center/address don't churn.
      if ("parcelTiles" in ctx) {
        const next = ctx.parcelTiles || null;
        const changed =
          (next?.url || null) !== (parcelTilesCfg?.url || null) ||
          (next?.sourceLayer || null) !== (parcelTilesCfg?.sourceLayer || null) ||
          (next?.promoteId || null) !== (parcelTilesCfg?.promoteId || null);
        if (changed) {
          parcelTilesCfg = next;
          applyParcelTiles();
        }
      }
      if (typeof ctx.useFixture === "boolean" && ctx.useFixture !== fixtureEnabled) {
        fixtureEnabled = ctx.useFixture;
        if (map && map.isStyleLoaded()) applyLayerVisibility();
      } else if (typeof ctx.useFixture === "boolean") {
        fixtureEnabled = ctx.useFixture;
      }
      if (ctx.center && map) {
        // Re-point the LIVE map to the incoming center. The prior code jumpTo'd
        // captureViewState() — the map's CURRENT center — so ctx.center never
        // moved the camera (the re-point no-op bug). Move to the NEW center,
        // preserving the current zoom/pitch/bearing unless a new zoom is given.
        // Never fit-to-fixture here: a live rebind keeps the requested framing.
        moveCameraTo(
          { longitude: ctx.center.longitude, latitude: ctx.center.latitude },
          typeof ctx.zoom === "number" ? ctx.zoom : undefined,
        );
      }
    },

    /**
     * Re-point the LIVE map for a full property change WITHOUT map.remove().
     * Additive sugar composed over the (fixed) bindContext camera re-point and
     * the existing setParcelState — this method holds no camera or feature-state
     * logic of its own. Updates context (center/address), moves the camera to the
     * new center (via bindContext's re-point), and, when parcelState is given,
     * lights the subject/inspected parcel through setParcelState. The map is
     * never unmounted; the mount-once contract in FloatingMap is preserved.
     * @param {{
     *   center?: { latitude: number, longitude: number },
     *   address?: string,
     *   parcelState?: { parcelNodeId: string|number, subject?: boolean, inspected?: boolean },
     *   zoom?: number,
     * }} opts
     */
    rebindProperty(opts) {
      const o = opts || {};
      // Compose: bindContext does the context merge + camera re-point (with the
      // fixed center handling). Only pass fields that are present so we don't
      // clobber address/center with undefined.
      const ctx = {};
      if (o.center) ctx.center = o.center;
      if (typeof o.address === "string") ctx.address = o.address;
      if (typeof o.zoom === "number") ctx.zoom = o.zoom;
      this.bindContext(ctx);
      // Compose: existing setParcelState lights subject/inspected. No-op unless
      // parcelTiles is configured (setParcelState self-gates on sourceLayer).
      if (o.parcelState && o.parcelState.parcelNodeId != null) {
        const { parcelNodeId, subject, inspected } = o.parcelState;
        this.setParcelState(parcelNodeId, { subject, inspected });
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
      // Tear down any pending subject-resolve latch (idle listener) so destroy()
      // never leaves a re-schedule pending. Bump the generation too, so any
      // callback already queued for the current frame bails on the token check.
      subjectResolveGen += 1;
      clearSubjectResolve();
      resizeObs?.disconnect();
      map?.remove();
      map = null;
      styleReady = false;
      slotEl = null;
    },

    /**
     * Imperatively set/replace the PMTiles browse-parcel config (alternative to
     * bindContext({ parcelTiles })). Pass null to remove the layer.
     * @param {ParcelTilesConfig | null} cfg
     */
    setParcelTiles(cfg) {
      const next = cfg || null;
      const changed =
        (next?.url || null) !== (parcelTilesCfg?.url || null) ||
        (next?.sourceLayer || null) !== (parcelTilesCfg?.sourceLayer || null) ||
        (next?.promoteId || null) !== (parcelTilesCfg?.promoteId || null);
      if (!changed) return;
      parcelTilesCfg = next;
      applyParcelTiles();
    },

    /**
     * Set the subject/inspected feature-state for a parcel node id. Clears the
     * prior subject/inspected node so exactly one of each is lit at a time.
     * Keys on the promoted parcel_node_id via setFeatureState.
     * @param {string|number} parcelNodeId
     * @param {{ subject?: boolean, inspected?: boolean }} state
     */
    setParcelState(parcelNodeId, state) {
      const sl = parcelTilesCfg?.sourceLayer;
      if (!sl) return;
      if (typeof state?.subject === "boolean") {
        if (state.subject) {
          if (subjectNodeId != null && subjectNodeId !== parcelNodeId) {
            clearParcelFeatureState(map, sl, subjectNodeId, ["subject"]);
          }
          subjectNodeId = parcelNodeId;
          setParcelFeatureState(map, sl, parcelNodeId, { subject: true });
        } else {
          clearParcelFeatureState(map, sl, parcelNodeId, ["subject"]);
          if (subjectNodeId === parcelNodeId) subjectNodeId = null;
        }
      }
      if (typeof state?.inspected === "boolean") {
        if (state.inspected) {
          if (inspectedNodeId != null && inspectedNodeId !== parcelNodeId) {
            clearParcelFeatureState(map, sl, inspectedNodeId, ["inspected"]);
          }
          inspectedNodeId = parcelNodeId;
          setParcelFeatureState(map, sl, parcelNodeId, { inspected: true });
        } else {
          clearParcelFeatureState(map, sl, parcelNodeId, ["inspected"]);
          if (inspectedNodeId === parcelNodeId) inspectedNodeId = null;
        }
      }
    },

    /**
     * Query the parcel_node_id (+ county_fips + feature) at a screen point.
     * @param {{ x: number, y: number } | [number, number]} point
     * @returns {{ parcelNodeId: string|undefined, countyFips: string|undefined, feature: object } | null}
     */
    queryParcelAt(point) {
      if (!map || !parcelTilesApplied || !map.getLayer(PARCEL_TILES_FILL_ID)) return null;
      const hits = map.queryRenderedFeatures(point, { layers: [PARCEL_TILES_FILL_ID] });
      if (!hits.length) return null;
      const hit = hits[0];
      const promoteId = parcelTilesCfg?.promoteId || DEFAULT_PROMOTE_ID;
      const { parcelNodeId, countyFips } = parcelNodeIdFromFeature(hit, promoteId);
      return { parcelNodeId, countyFips, feature: hit };
    },

    /**
     * Subject-resolve / fit paint-gate primitive (W2). On a property re-point the
     * subject parcel's vector tile may not be painted yet, so setting feature-state
     * or fitting bounds immediately silently no-ops. This latch schedules, waits for
     * the subject tile to paint (bounded), then lights the subject via setParcelState
     * and fits the camera to it. Pushed down from the consumer (spine-map.js) so the
     * web app and the extension both inherit the discipline.
     *
     * Re-entrant-safe: a newer call supersedes an older in-flight one via a
     * generation token — the older callback bails without clobbering the newer
     * subject. Bounded: gives up quietly after maxAttempts (default 8). Composes
     * over setParcelState/getMap; adds no feature-state logic and no new paint.
     *
     * @param {{
     *   parcelNodeId: string|number,
     *   center?: { latitude: number, longitude: number },
     *   fit?: boolean,
     *   maxAttempts?: number,
     * }} opts
     */
    resolveSubjectAndFit(opts) {
      const o = opts || {};
      const { parcelNodeId, center } = o;
      const fit = o.fit !== false;
      const maxAttempts =
        Number.isInteger(o.maxAttempts) && o.maxAttempts > 0
          ? o.maxAttempts
          : SUBJECT_RESOLVE_MAX_ATTEMPTS;
      if (parcelNodeId == null) return;

      // A newer resolve supersedes any older in-flight one: bump the generation and
      // tear down the prior latch so its pending callback bails on the token check.
      subjectResolveGen += 1;
      const myGen = subjectResolveGen;
      clearSubjectResolve();

      if (!map) return;

      const tryResolve = (attempt) => {
        // Superseded by a newer call (or destroyed) — bail without touching state.
        if (myGen !== subjectResolveGen || !map) return;

        const feature = findSubjectFeature(parcelNodeId, center);
        if (feature) {
          // Found: light the subject through the existing feature-state path, then
          // fit. Re-check the token AFTER setParcelState in case a listener fired.
          this.setParcelState(parcelNodeId, { subject: true });
          if (myGen === subjectResolveGen && fit) fitToSubject(feature, center);
          clearSubjectResolve();
          return;
        }

        // Not painted yet. Give up quietly at the cap — never an unbounded loop.
        if (attempt + 1 >= maxAttempts) {
          clearSubjectResolve();
          // Best-effort: still set feature-state (it re-asserts once the tile paints
          // via applyParcelTiles) and, if fitting, ease to the requested center so a
          // never-painting subject still frames the property rather than doing nothing.
          this.setParcelState(parcelNodeId, { subject: true });
          if (fit && center) fitToSubject(null, center);
          return;
        }

        // Re-schedule on the next idle (tiles settled for this frame). One-shot
        // listener, captured so clearSubjectResolve/destroy can remove it. `once`
        // auto-removes on fire, but we also track an explicit remover so a
        // supersession/destroy before it fires does not leak the listener.
        const onIdle = () => {
          subjectResolveCleanup = null;
          tryResolve(attempt + 1);
        };
        subjectResolveCleanup = () => {
          try {
            map.off("idle", onIdle);
          } catch {
            /* ignore */
          }
        };
        map.once("idle", onIdle);
      };

      // Defer nothing on the first attempt: if the tile is already painted this
      // resolves synchronously (attempt 0), matching found-immediately behavior.
      tryResolve(0);
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
  signals: [
    "mount(slot: HTMLElement)",
    "resize(width?, height?)",
    "setLayerVisibility(Set<string>)",
    "getVisibleLayers(): Set<string>",
    "getLayerVisibility(layerKey): boolean",
    "setOverlays(OverlaySpec[])",
    "setParcelTiles(ParcelTilesConfig | null)",
    "setParcelState(parcelNodeId, { subject?, inspected? })",
    "resolveSubjectAndFit({ parcelNodeId, center?, fit?, maxAttempts? })",
    "queryParcelAt(point)",
    "bindContext(ctx)",
    "rebindProperty({ center?, address?, parcelState?, zoom? })",
  ],
  contextFields: ["center", "address", "zoom", "useFixture", "parcelTiles", "onParcelSelect", "onParcelClick", "onViewportChange"],
  preserves: ["center", "zoom", "pitch", "bearing", "visibleLayers"],
};
