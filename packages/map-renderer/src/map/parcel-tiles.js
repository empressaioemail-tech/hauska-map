/**
 * Parcel tiles — a MapLibre `vector` source backed by a PMTiles archive of the
 * browse-all-Central-TX parcel corpus, plus the subject/inspected feature-state
 * highlight.
 *
 * This is the R1 additive capability alongside the GeoJSON overlays
 * (overlay-render.js). Where overlays draw one-shot high-zoom GeoJSON meshes the
 * SpatialProvider supplies per-viewport, the parcel-tiles layer draws the whole
 * pre-baked parcel corpus at every zoom from a single PMTiles URL, and lights up
 * a subject parcel via `setFeatureState` keyed on a stable `parcel_node_id`.
 *
 * Id contract: each parcel feature in the tileset carries a stable
 * `parcel_node_id` = "{county_fips}:{normalizeCadPropId(prop_id)}". The vector
 * source is created with `promoteId` set to that attribute so MapLibre's
 * feature-state keys on it (rather than the tile-local integer feature id), which
 * lets a consumer set state by node id without holding the tile-local id.
 *
 * CRASH-SAFETY (load-bearing): the subject/inspected glow paint uses ONLY
 * fill-color / fill-opacity / line-color / line-width / line-blur. It never
 * drives line-dasharray or line-gradient from feature-state — a feature-state
 * dasharray/gradient re-triggers a documented per-frame
 * "Cannot read properties of null (setConstantDashPositions)" crash that blanks
 * the map. The glow is a static solid stroke + blur only.
 *
 * This module speaks only to the MapLibre `Map` instance handed to it, so it
 * imports no maplibre-gl symbols directly. Protocol registration (which does
 * need the maplibregl namespace) lives in map-renderer.js at renderer init.
 */

import { landUseFillColorExpr, landUseLineColorExpr } from "./gis-map-paint.js";

/** Source + layer ids for the PMTiles parcel-browse layer. */
export const PARCEL_TILES_SOURCE_ID = "hauska-parcel-tiles";
export const PARCEL_TILES_FILL_ID = "hauska-parcel-tiles-fill";
export const PARCEL_TILES_LINE_ID = "hauska-parcel-tiles-line";
/** Wide translucent halo stroke under the subject line, for the glow bloom. */
export const PARCEL_TILES_GLOW_ID = "hauska-parcel-tiles-glow";

/** Attribute the data track bakes as the stable, promotable parcel id. */
export const DEFAULT_PROMOTE_ID = "parcel_node_id";

/**
 * Base choropleth fill opacity, lifted for the subject and nudged for inspected.
 * Uses ONLY fill-opacity from feature-state (safe — no dasharray/gradient).
 */
function parcelFillOpacityExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    0.92,
    ["boolean", ["feature-state", "inspected"], false],
    0.6,
    0.32,
  ];
}

/**
 * Subject = a bright fill-color boost; inspected + base = the land-use choropleth.
 * Feature-state drives only fill-color (safe).
 */
function parcelFillColorExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    "#fff2b0",
    landUseFillColorExpr(),
  ];
}

/**
 * Line color: subject = bright glow yellow, inspected = light outline, else the
 * land-use stroke. Feature-state drives only line-color (safe).
 */
function parcelLineColorExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    "#ffe14d",
    ["boolean", ["feature-state", "inspected"], false],
    "#cfe8ff",
    landUseLineColorExpr(),
  ];
}

/** Line width: thick for subject, medium for inspected, hairline otherwise. */
function parcelLineWidthExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    3.2,
    ["boolean", ["feature-state", "inspected"], false],
    1.8,
    0.7,
  ];
}

/**
 * Line blur: only the subject glows. Base + inspected stay crisp (blur 0).
 * line-blur is a safe feature-state-driven property (unlike dasharray/gradient).
 */
function parcelLineBlurExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    2.4,
    0,
  ];
}

/**
 * Halo layer paint — a wide translucent stroke that only appears under the
 * subject parcel, producing the outer bloom. Width + color + blur only.
 */
function parcelGlowColorExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    "rgba(255,225,77,0.55)",
    "rgba(0,0,0,0)",
  ];
}

function parcelGlowWidthExpr() {
  return [
    "case",
    ["boolean", ["feature-state", "subject"], false],
    9,
    0,
  ];
}

/**
 * Add the PMTiles vector parcel source + fill/line/glow layers to the map.
 * Idempotent: safe to call repeatedly (skips if the source already exists).
 * Caller MUST have registered the `pmtiles` protocol first and MUST only call
 * this once the style `load` event has fired (styleReady), matching the overlay
 * path's gating.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {{ url: string, sourceLayer: string, promoteId?: string, minzoom?: number, maxzoom?: number }} cfg
 */
export function addParcelTiles(map, cfg) {
  if (!map || !cfg || !cfg.url || !cfg.sourceLayer) return;
  const promoteId = cfg.promoteId || DEFAULT_PROMOTE_ID;
  const sourceLayer = cfg.sourceLayer;

  if (!map.getSource(PARCEL_TILES_SOURCE_ID)) {
    map.addSource(PARCEL_TILES_SOURCE_ID, {
      type: "vector",
      url: cfg.url.startsWith("pmtiles://") ? cfg.url : `pmtiles://${cfg.url}`,
      // promoteId makes setFeatureState key on the baked parcel_node_id rather
      // than the tile-local integer id. Scoped to the source layer.
      promoteId: { [sourceLayer]: promoteId },
    });
  }

  // Glow halo — drawn first so it sits UNDER the crisp line.
  if (!map.getLayer(PARCEL_TILES_GLOW_ID)) {
    map.addLayer({
      id: PARCEL_TILES_GLOW_ID,
      type: "line",
      source: PARCEL_TILES_SOURCE_ID,
      "source-layer": sourceLayer,
      // No minzoom gate: the browse layer renders at all zooms.
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": parcelGlowColorExpr(),
        "line-width": parcelGlowWidthExpr(),
        "line-blur": 4,
      },
    });
  }

  if (!map.getLayer(PARCEL_TILES_FILL_ID)) {
    map.addLayer({
      id: PARCEL_TILES_FILL_ID,
      type: "fill",
      source: PARCEL_TILES_SOURCE_ID,
      "source-layer": sourceLayer,
      paint: {
        "fill-color": parcelFillColorExpr(),
        "fill-opacity": parcelFillOpacityExpr(),
      },
    });
  }

  if (!map.getLayer(PARCEL_TILES_LINE_ID)) {
    map.addLayer({
      id: PARCEL_TILES_LINE_ID,
      type: "line",
      source: PARCEL_TILES_SOURCE_ID,
      "source-layer": sourceLayer,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": parcelLineColorExpr(),
        "line-width": parcelLineWidthExpr(),
        // line-blur from feature-state is SAFE (unlike dasharray/gradient).
        "line-blur": parcelLineBlurExpr(),
      },
    });
  }
}

/** Remove the parcel-tiles layers + source (for reconfigure / teardown). */
export function removeParcelTiles(map) {
  if (!map) return;
  for (const id of [PARCEL_TILES_LINE_ID, PARCEL_TILES_FILL_ID, PARCEL_TILES_GLOW_ID]) {
    if (map.getLayer(id)) {
      try {
        map.removeLayer(id);
      } catch {
        /* ignore */
      }
    }
  }
  if (map.getSource(PARCEL_TILES_SOURCE_ID)) {
    try {
      map.removeSource(PARCEL_TILES_SOURCE_ID);
    } catch {
      /* still referenced — ignore */
    }
  }
}

/**
 * Set (or clear) the subject/inspected feature-state for one parcel node id.
 * Keyed on the promoted `parcel_node_id`. Passing `{}` clears both flags.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {string} sourceLayer  the vector source layer id
 * @param {string|number} parcelNodeId
 * @param {{ subject?: boolean, inspected?: boolean }} state
 */
export function setParcelFeatureState(map, sourceLayer, parcelNodeId, state) {
  if (!map || parcelNodeId == null) return;
  if (!map.getSource(PARCEL_TILES_SOURCE_ID)) return;
  const next = {};
  if (typeof state?.subject === "boolean") next.subject = state.subject;
  if (typeof state?.inspected === "boolean") next.inspected = state.inspected;
  try {
    map.setFeatureState(
      { source: PARCEL_TILES_SOURCE_ID, sourceLayer, id: parcelNodeId },
      next,
    );
  } catch {
    /* source layer not yet loaded — ignore; caller re-applies on next set */
  }
}

/** Clear a flag on a parcel node id (used when swapping the subject/inspected). */
export function clearParcelFeatureState(map, sourceLayer, parcelNodeId, keys) {
  if (!map || parcelNodeId == null) return;
  if (!map.getSource(PARCEL_TILES_SOURCE_ID)) return;
  try {
    for (const key of keys) {
      map.removeFeatureState(
        { source: PARCEL_TILES_SOURCE_ID, sourceLayer, id: parcelNodeId },
        key,
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * Read the parcel_node_id (+ county_fips) off a queried parcel feature.
 * With promoteId set, MapLibre exposes the promoted value as `feature.id`; the
 * raw attribute is also still on `properties`.
 *
 * @param {any} feature  a queryRenderedFeatures result from the parcel fill layer
 * @param {string} promoteId
 * @returns {{ parcelNodeId: string|undefined, countyFips: string|undefined }}
 */
export function parcelNodeIdFromFeature(feature, promoteId = DEFAULT_PROMOTE_ID) {
  const props = (feature && feature.properties) || {};
  const fromProp = props[promoteId];
  const parcelNodeId =
    fromProp != null
      ? String(fromProp)
      : feature?.id != null
        ? String(feature.id)
        : undefined;
  const countyFips =
    props.county_fips != null
      ? String(props.county_fips)
      : parcelNodeId && parcelNodeId.includes(":")
        ? parcelNodeId.split(":")[0]
        : undefined;
  return { parcelNodeId, countyFips };
}
