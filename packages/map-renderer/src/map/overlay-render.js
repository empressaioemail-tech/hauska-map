/**
 * Overlay renderer — draws SpatialProvider OverlaySpec[] on the MapLibre map.
 *
 * This is the wiring behind FloatingMap's `overlays` prop. Where the fixture
 * layers (gis-map-render.js) come from the E6 demo corpus keyed by the layer
 * registry, overlays are the LIVE SpatialProvider contract: flood zones,
 * topography, drainage, rent-heat, parcel meshes, choropleths supplied by the
 * consumer (cortex SpatialProvider) as GeoJSON payloads.
 *
 * Contract (OverlaySpec, see postMessage.ts):
 *   { layerKey, geojson, paint?, visible? }
 *
 * Design constraints:
 *   - Idempotent. setOverlays(specs) diffs against the currently-drawn overlay
 *     set: adds new sources+layers, updates data/paint on existing ones, and
 *     REMOVES sources+layers whose layerKey is no longer present. Repeated calls
 *     with the same specs must not leak sources or duplicate layers.
 *   - CSP-safe / main-thread. Pure MapLibre source+layer API, no eval, no worker
 *     beyond MapLibre's own internal tile worker.
 *   - Namespaced. Overlay source/layer ids are prefixed `hauska-ovl-` so they
 *     never collide with the fixture `hauska-gis-` layers.
 *
 * Geometry shape support:
 *   - Polygon / MultiPolygon -> fill + line layers.
 *   - Point / MultiPoint     -> circle layer.
 *   - LineString / MultiLineString -> line layer.
 *   - choropleth: when a spec sets `choropleth` (property + stops) OR the paint
 *     override carries a data-driven `fill-color`, the fill uses the data-driven
 *     expression.
 *
 * This module speaks only to the MapLibre `Map` instance handed to it, so it
 * imports no maplibre-gl symbols directly.
 */

/** All overlay source/layer ids share this prefix so they are cleanly separable. */
export const OVERLAY_PREFIX = "hauska-ovl-";

/** Suffixes for the concrete layers an overlay can spawn. */
const LAYER_SUFFIXES = ["-fill", "-line", "-circle"];

export function overlaySourceId(layerKey) {
  return `${OVERLAY_PREFIX}${String(layerKey).replace(/[^a-z0-9-]/gi, "-")}`;
}

/** Coerce any Feature / bare-geometry / FeatureCollection into a FeatureCollection. */
function toFeatureCollection(geojson, layerKey) {
  if (!geojson || typeof geojson !== "object") {
    return { type: "FeatureCollection", features: [] };
  }
  if (geojson.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: (geojson.features || []).map((f, i) =>
        stampFeature(f, layerKey, i),
      ),
    };
  }
  if (geojson.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [stampFeature(geojson, layerKey, 0)],
    };
  }
  // Bare geometry.
  return {
    type: "FeatureCollection",
    features: [
      stampFeature(
        { type: "Feature", properties: {}, geometry: geojson },
        layerKey,
        0,
      ),
    ],
  };
}

function stampFeature(f, layerKey, i) {
  const p = (f && f.properties) || {};
  return {
    type: "Feature",
    id: f?.id ?? p.id ?? p.OBJECTID ?? p.clip ?? p.CLIP ?? p.apn ?? `${layerKey}-${i}`,
    properties: { ...p, layerKey },
    geometry: f?.geometry ?? null,
  };
}

/**
 * Inspect a FeatureCollection and report which geometry families are present.
 * @returns {{ polygon: boolean, line: boolean, point: boolean }}
 */
function geometryFamilies(fc) {
  const fam = { polygon: false, line: false, point: false };
  for (const f of fc.features || []) {
    const t = f?.geometry?.type;
    if (t === "Polygon" || t === "MultiPolygon") fam.polygon = true;
    else if (t === "LineString" || t === "MultiLineString") fam.line = true;
    else if (t === "Point" || t === "MultiPoint") fam.point = true;
  }
  return fam;
}

/** Data-driven fill-color expression for a choropleth spec. */
function choroplethFillColor(choropleth) {
  const prop = choropleth.property || choropleth.field;
  const stops = choropleth.stops || [];
  if (!prop || stops.length < 2) return null;
  // stops: [[value, color], ...] -> interpolate expression.
  const expr = ["interpolate", ["linear"], ["coalesce", ["get", prop], 0]];
  for (const [value, color] of stops) {
    expr.push(value, color);
  }
  return expr;
}

const DEFAULT_FILL = "rgba(74,122,181,0.35)";
const DEFAULT_LINE = "#4a7ab5";
const DEFAULT_CIRCLE = "#f2a23c";

/**
 * Add or update a single overlay's source + layers. Idempotent per layerKey.
 * @param {import('maplibre-gl').Map} map
 * @param {import('../postMessage').OverlaySpec} spec
 */
function upsertOverlay(map, spec) {
  const layerKey = spec.layerKey;
  const sourceId = overlaySourceId(layerKey);
  const fc = toFeatureCollection(spec.geojson, layerKey);
  const fam = geometryFamilies(fc);
  const visible = spec.visible !== false;
  const vis = visible ? "visible" : "none";
  const paint = spec.paint || {};

  // Source: create or update data in place (no leak on re-render).
  const existing = map.getSource(sourceId);
  if (existing && typeof existing.setData === "function") {
    existing.setData(fc);
  } else if (!existing) {
    map.addSource(sourceId, { type: "geojson", data: fc });
  }

  const choroExpr = spec.choropleth ? choroplethFillColor(spec.choropleth) : null;

  // Polygon -> fill + line.
  if (fam.polygon) {
    const fillId = `${sourceId}-fill`;
    const fillColor = choroExpr || paint["fill-color"] || DEFAULT_FILL;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": fillColor,
          "fill-opacity": paint["fill-opacity"] ?? 0.45,
        },
      });
    } else {
      safeSetPaint(map, fillId, "fill-color", fillColor);
      if (paint["fill-opacity"] != null)
        safeSetPaint(map, fillId, "fill-opacity", paint["fill-opacity"]);
    }
    map.setLayoutProperty(fillId, "visibility", vis);

    const lineId = `${sourceId}-line`;
    const lineColor = paint["line-color"] || DEFAULT_LINE;
    const lineDash = staticDash(paint["line-dasharray"]);
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": lineColor,
          "line-width": paint["line-width"] ?? 1.4,
          // STATIC literal dash only (crash guard): a feature-state-driven
          // line-dasharray is the setConstantDashPositions per-frame crash;
          // a literal array is safe. staticDash() drops anything non-literal.
          ...(lineDash ? { "line-dasharray": lineDash } : {}),
        },
      });
    } else {
      safeSetPaint(map, lineId, "line-color", lineColor);
      if (paint["line-width"] != null)
        safeSetPaint(map, lineId, "line-width", paint["line-width"]);
      if (lineDash) safeSetPaint(map, lineId, "line-dasharray", lineDash);
    }
    map.setLayoutProperty(lineId, "visibility", vis);
  } else {
    removeLayerIfPresent(map, `${sourceId}-fill`);
  }

  // Standalone LineString overlays (no polygon) -> line.
  if (fam.line && !fam.polygon) {
    const lineId = `${sourceId}-line`;
    const lineColor = paint["line-color"] || DEFAULT_LINE;
    const lineDash = staticDash(paint["line-dasharray"]);
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": lineColor,
          "line-width": paint["line-width"] ?? 1.6,
          ...(lineDash ? { "line-dasharray": lineDash } : {}),
        },
      });
    } else {
      safeSetPaint(map, lineId, "line-color", lineColor);
      if (lineDash) safeSetPaint(map, lineId, "line-dasharray", lineDash);
    }
    map.setLayoutProperty(lineId, "visibility", vis);
  } else if (!fam.polygon) {
    removeLayerIfPresent(map, `${sourceId}-line`);
  }

  // Point -> circle.
  if (fam.point) {
    const circleId = `${sourceId}-circle`;
    const circleColor = choroExpr || paint["circle-color"] || DEFAULT_CIRCLE;
    if (!map.getLayer(circleId)) {
      map.addLayer({
        id: circleId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": circleColor,
          "circle-radius": paint["circle-radius"] ?? 5,
          "circle-opacity": paint["circle-opacity"] ?? 0.85,
          "circle-stroke-color": paint["circle-stroke-color"] ?? "#ffffff",
          "circle-stroke-width": paint["circle-stroke-width"] ?? 0.8,
        },
      });
    } else {
      safeSetPaint(map, circleId, "circle-color", circleColor);
    }
    map.setLayoutProperty(circleId, "visibility", vis);
  } else {
    removeLayerIfPresent(map, `${sourceId}-circle`);
  }
}

/**
 * Accept a line-dasharray ONLY when it is a STATIC literal array of finite
 * numbers (e.g. [3, 2]). Anything else — a MapLibre expression, a feature-state
 * lookup, a non-array — is dropped. This is the crash guard: a feature-state
 * -driven dasharray triggers the setConstantDashPositions per-frame crash; a
 * literal array is safe.
 * @returns {number[]|null} the literal dash, or null to omit it.
 */
function staticDash(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return value.slice();
}

function safeSetPaint(map, layerId, prop, value) {
  try {
    map.setPaintProperty(layerId, prop, value);
  } catch {
    /* type mismatch — ignore */
  }
}

function removeLayerIfPresent(map, layerId) {
  if (map.getLayer(layerId)) {
    try {
      map.removeLayer(layerId);
    } catch {
      /* ignore */
    }
  }
}

/** Remove every layer + source for one overlay layerKey. */
function removeOverlay(map, layerKey) {
  const sourceId = overlaySourceId(layerKey);
  for (const suffix of LAYER_SUFFIXES) {
    removeLayerIfPresent(map, `${sourceId}${suffix}`);
  }
  if (map.getSource(sourceId)) {
    try {
      map.removeSource(sourceId);
    } catch {
      /* source still referenced — ignore */
    }
  }
}

/**
 * Reconcile the map's overlay layers to exactly the given spec set.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {import('../postMessage').OverlaySpec[]} specs  target overlay set
 * @param {Set<string>} currentKeys  layerKeys currently drawn (mutated in place)
 * @returns {Set<string>} the new set of drawn layerKeys
 */
export function reconcileOverlays(map, specs, currentKeys) {
  const next = new Set();
  const list = Array.isArray(specs) ? specs : [];

  for (const spec of list) {
    if (!spec || spec.layerKey == null) continue;
    const key = String(spec.layerKey);
    next.add(key);
    try {
      upsertOverlay(map, spec);
    } catch {
      /* one bad spec must not kill the batch */
    }
  }

  // Remove overlays that were present before but are gone now.
  for (const key of currentKeys) {
    if (!next.has(key)) removeOverlay(map, key);
  }

  currentKeys.clear();
  for (const key of next) currentKeys.add(key);
  return currentKeys;
}
