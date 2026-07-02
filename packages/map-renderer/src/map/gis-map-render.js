/**
 * MapLibre GIS render — Cotality parcel choropleth + FEMA overlay.
 */

import maplibregl from "maplibre-gl";
import {
  LAYER_PAINT,
  fillOpacityExpr,
  LAND_USE_LEGEND,
  FEMA_LEGEND,
  GIS_LAYER_STACK,
  rentHeatPaint,
  bloomHeatmapPaint,
  RENT_HEAT_LEGEND,
  TERRAIN_LEGEND,
  CONTOUR_LEGEND,
  FLOW_LEGEND,
  EXTRUSION_LEGEND,
  LAYER_TOGGLE_TRANSITION,
} from "./gis-map-paint.js";
import {
  buildFixtureDemGrid,
  contoursFromDemGrid,
  hillshadeGridToCanvas,
  TERRAIN_SOURCE_ID,
  HILLSHADE_LAYER_ID,
  CONTOUR_SOURCE_ID,
  HILLSHADE_PAINT,
  CONTOUR_PAINT,
} from "./gis-terrain.js";
import {
  upsertFlowLayers,
  hideFlowLayers,
  FLOW_SOURCE_ID,
} from "./gis-hydrology-flow.js";
import { FIXTURE_CENTER } from "./gis-fixture-data.js";
import {
  isRenderableEnvelope,
  envelopeSaturation,
  extractEnvelopeReadContract,
  formatReadContractSummary,
} from "../read-contract/index.js";
import {
  consequenceFillColorExpr,
  triageFillColorExpr,
} from "./reasoning-layers.js";
import { POSITIONING_FOOTER } from "../positioning.js";

/** Cached fixture DEM per session. */
let cachedDemGrid = null;
let cachedContours = null;

export function gisSourceId(layerKey) {
  return `hauska-gis-${layerKey.replace(/[^a-z0-9-]/gi, "-")}`;
}

export function geoJsonFromSlot(slot) {
  const payload = slot?.envelope?.payload;
  if (!payload || typeof payload !== "object") return null;
  const gj = payload.geojson ?? payload.geometry ?? null;
  if (!gj || typeof gj !== "object") return null;
  return gj;
}

export function normalizeGeoJson(gj, layerKey) {
  if (!gj) return null;
  let fc;
  if (gj.type === "FeatureCollection") fc = gj;
  else if (gj.type === "Feature") {
    fc = {
      type: "FeatureCollection",
      features: [{ ...gj, properties: { ...(gj.properties || {}), layerKey } }],
    };
  } else {
    fc = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { layerKey }, geometry: gj }],
    };
  }
  fc.features = (fc.features || []).map((f, i) => {
    const p = f.properties || {};
    const id =
      f.id ??
      p.clip ??
      p.CLIP ??
      p.apn ??
      p.APN ??
      p.OBJECTID ??
      p.objectid ??
      `${layerKey}-${i}`;
    return {
      ...f,
      id,
      properties: { ...p, layerKey },
    };
  });
  return fc;
}

function paintForLayer(layerKey) {
  return LAYER_PAINT[layerKey] || LAYER_PAINT["parcel-polygon"];
}

function ensureFixtureDem(center = FIXTURE_CENTER) {
  if (!cachedDemGrid) cachedDemGrid = buildFixtureDemGrid(center);
  if (!cachedContours) cachedContours = contoursFromDemGrid(cachedDemGrid);
  return { grid: cachedDemGrid, contours: cachedContours };
}

function applyOpacityTransition(map, layerId, prop, value) {
  if (!map.getLayer(layerId)) return;
  try {
    map.setPaintProperty(layerId, `${prop}-transition`, LAYER_TOGGLE_TRANSITION);
    map.setPaintProperty(layerId, prop, value);
  } catch {
    /* layer type mismatch */
  }
}

function setLayerVisible(map, layerId, visible, opacityProp, visibleOpacity = 1) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  if (opacityProp) {
    applyOpacityTransition(map, layerId, opacityProp, visible ? visibleOpacity : 0);
  }
}

/**
 * Fixture DEM hillshade + MapLibre terrain.
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} visible
 * @param {{ latitude: number, longitude: number }} [center]
 */
export function upsertTerrainLayers(map, visible = true, center = FIXTURE_CENTER) {
  if (!map) return;
  const { grid } = ensureFixtureDem(center);
  const hillCanvas = hillshadeGridToCanvas(grid);
  const coords = [
    [grid.west, grid.north],
    [grid.east, grid.north],
    [grid.east, grid.south],
    [grid.west, grid.south],
  ];

  // 2D hillshade relief ONLY: a flat image raster drawn UNDER the parcel choropleth for depth.
  // No setTerrain / raster-dem — 3D terrain tilt is explicitly deferred to next-pass per operator.
  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, {
      type: "image",
      url: hillCanvas.toDataURL("image/png"),
      coordinates: coords,
    });
  }

  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    map.addLayer({
      id: HILLSHADE_LAYER_ID,
      type: "raster",
      source: TERRAIN_SOURCE_ID,
      paint: {
        "raster-opacity": HILLSHADE_PAINT["hillshade-opacity"],
        "raster-opacity-transition": LAYER_TOGGLE_TRANSITION,
        "raster-fade-duration": 300,
      },
    });
  }

  setLayerVisible(
    map,
    HILLSHADE_LAYER_ID,
    visible,
    "raster-opacity",
    HILLSHADE_PAINT["hillshade-opacity"],
  );
}

export function hideTerrainLayers(map) {
  upsertTerrainLayers(map, false);
}

/**
 * 5 m contour lines from fixture DEM.
 */
export function upsertContourLayers(map, visible = true, center = FIXTURE_CENTER) {
  if (!map) return;
  const { contours } = ensureFixtureDem(center);
  if (map.getSource(CONTOUR_SOURCE_ID)) {
    map.getSource(CONTOUR_SOURCE_ID).setData(contours);
  } else {
    map.addSource(CONTOUR_SOURCE_ID, { type: "geojson", data: contours });
  }
  const lineId = `${CONTOUR_SOURCE_ID}-line`;
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: "line",
      source: CONTOUR_SOURCE_ID,
      paint: {
        ...CONTOUR_PAINT,
        "line-opacity-transition": LAYER_TOGGLE_TRANSITION,
      },
    });
  }
  setLayerVisible(map, lineId, visible, "line-opacity", CONTOUR_PAINT["line-opacity"]);
}

export function hideContourLayers(map) {
  setLayerVisible(map, `${CONTOUR_SOURCE_ID}-line`, false, "line-opacity", 0);
}

/** fill-extrusion from allowedHeightFt on parcel features. */
export function upsertExtrusionLayer(map, slot, visible = true) {
  const gj = geoJsonFromSlot(slot);
  if (!gj || slot.status !== "ok") return false;
  const layerKey = slot.layerKey;
  const sourceId = gisSourceId(layerKey);
  const fc = normalizeGeoJson(gj, layerKey);
  const pid = promoteIdField(fc);

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(fc);
  } else {
    map.addSource(sourceId, { type: "geojson", data: fc, promoteId: pid });
  }

  const extId = `${sourceId}-extrusion`;
  if (!map.getLayer(extId)) {
    map.addLayer({
      id: extId,
      type: "fill-extrusion",
      source: sourceId,
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "allowedHeightFt"], 32],
          28,
          "#2a5080",
          45,
          "#4a8fd4",
          65,
          "#7ec8ff",
          85,
          "#b8ecff",
        ],
        "fill-extrusion-height": [
          "*",
          ["coalesce", ["get", "allowedHeightFt"], 32],
          0.3048,
        ],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.72,
        "fill-extrusion-opacity-transition": LAYER_TOGGLE_TRANSITION,
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }
  setLayerVisible(map, extId, visible, "fill-extrusion-opacity", 0.72);
  reorderGisLayers(map);
  return true;
}

export function hideExtrusionLayer(map, layerKey = "parcel-extrusion") {
  const extId = `${gisSourceId(layerKey)}-extrusion`;
  setLayerVisible(map, extId, false, "fill-extrusion-opacity", 0);
}

function promoteIdField(fc) {
  const f0 = fc.features?.[0]?.properties || {};
  if ("clip" in f0 || "CLIP" in f0) return "clip";
  if ("apn" in f0 || "APN" in f0) return "apn";
  return "OBJECTID";
}

export function upsertGisLayer(map, slot, meshMode = false) {
  const gj = geoJsonFromSlot(slot);
  if (!gj || slot.status !== "ok") return false;

  if (!isRenderableEnvelope(slot?.envelope)) {
    hideGisLayer(map, slot.layerKey);
    slot.renderBlocked = true;
    slot.renderBlockedReason = "scalar-only confidence — read-contract required (V4)";
    return false;
  }
  slot.renderBlocked = false;

  const layerKey = slot.layerKey;
  const sourceId = gisSourceId(layerKey);
  const fc = normalizeGeoJson(gj, layerKey);
  const paint = paintForLayer(layerKey);
  const pid = promoteIdField(fc);
  const saturation = envelopeSaturation(slot.envelope);

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(fc);
  } else {
    map.addSource(sourceId, { type: "geojson", data: fc, promoteId: pid });
  }

  // Rent-heat renders as a glowing heatmap surface, not parcel fills.
  if (paint.heatmap) {
    const heatId = `${sourceId}-heat`;
    const heatPaint = bloomHeatmapPaint(
      rentHeatPaint(paint.heatProperty || "rent"),
    );
    if (!map.getLayer(heatId)) {
      map.addLayer({
        id: heatId,
        type: "heatmap",
        source: sourceId,
        paint: heatPaint,
      });
    } else {
      for (const [k, v] of Object.entries(heatPaint)) {
        map.setPaintProperty(heatId, k, v);
      }
    }
    map.setLayoutProperty(heatId, "visibility", "visible");
    reorderGisLayers(map);
    return true;
  }

  const fillId = `${sourceId}-fill`;
  const lineId = `${sourceId}-line`;

  if (!map.getLayer(fillId)) {
    const fillColor = paint.fillExpr
      ? typeof paint.fillExpr === "function"
        ? paint.fillExpr()
        : paint.fillExpr
      : paint.fill || "rgba(74,122,181,0.5)";
    const baseOpacity = fillOpacityExpr(layerKey, meshMode);
    const opacityExpr =
      typeof baseOpacity === "number"
        ? baseOpacity * saturation
        : baseOpacity;
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColor,
        "fill-opacity": opacityExpr,
        "fill-opacity-transition": LAYER_TOGGLE_TRANSITION,
      },
    });
  } else if (meshMode && layerKey === "parcel-polygon") {
    map.setPaintProperty(fillId, "fill-opacity", fillOpacityExpr(layerKey, true) * saturation);
  } else if (saturation < 1) {
    const baseOpacity = fillOpacityExpr(layerKey, meshMode);
    map.setPaintProperty(
      fillId,
      "fill-opacity",
      typeof baseOpacity === "number" ? baseOpacity * saturation : baseOpacity,
    );
  }

  if (!map.getLayer(lineId)) {
    const lineColor = paint.lineExpr
      ? paint.lineExpr()
      : paint.stroke || "#4a7ab5";
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": lineColor,
        "line-width": paint.strokeWidth || 1.4,
        // NOTE: line-dasharray removed. Combined with a data-driven line-color
        // (paint.lineExpr), MapLibre's setConstantDashPositions throws
        // "Cannot read properties of null (reading 'y')" on EVERY render frame,
        // which kills the render loop and blanks the whole map (the flash-to-dark
        // regression, 1300+ console errors/frame). Solid lines render fine.
        // Reintroduce dashes only on constant-color layers if needed.
      },
    });
  }

  map.setLayoutProperty(fillId, "visibility", "visible");
  map.setLayoutProperty(lineId, "visibility", "visible");
  reorderGisLayers(map);
  return true;
}

export function reorderGisLayers(map) {
  // moveLayer(id) with no anchor lifts a layer to the very top, so the LAST lift wins.
  // Target stack, bottom -> top:
  //   basemap | hillshade relief | choropleth + federal + composite fills | contours | flow | rent-heat glow
  const lift = (id) => {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* layer not ready on first paint */
      }
    }
  };

  // Bottom of the data stack: 2D hillshade relief, drawn UNDER the parcel choropleth.
  lift(HILLSHADE_LAYER_ID);

  // Mid: every fill/line layer except the rent-heat glow (kept for the very top).
  for (const key of GIS_LAYER_STACK) {
    if (key === "rent-heat") continue;
    const sourceId = gisSourceId(key);
    for (const suffix of ["-fill", "-line", "-heat", "-extrusion"]) {
      lift(`${sourceId}${suffix}`);
    }
  }

  // Above the choropleth so they actually read: solid contour lines, then static flow channels.
  lift(`${CONTOUR_SOURCE_ID}-line`);
  for (const flowSuffix of ["-glow", "-core", "-highlight"]) {
    lift(`${FLOW_SOURCE_ID}${flowSuffix}`);
  }

  // Top: the fire rent-heat glow.
  lift(`${gisSourceId("rent-heat")}-heat`);
}

export function hideGisLayer(map, layerKey) {
  if (layerKey === "dem-hillshade") {
    hideTerrainLayers(map);
    return;
  }
  if (layerKey === "topography-contours") {
    hideContourLayers(map);
    return;
  }
  if (layerKey === "hydrology-flow") {
    hideFlowLayers(map);
    return;
  }
  if (layerKey === "parcel-extrusion") {
    hideExtrusionLayer(map, layerKey);
    return;
  }
  const sourceId = gisSourceId(layerKey);
  for (const suffix of ["-fill", "-line", "-heat", "-extrusion"]) {
    const id = `${sourceId}${suffix}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
}

/**
 * Upsert special visual-ceiling layers (terrain, flow, extrusion).
 */
export function upsertVisualCeilingLayer(map, slot, meshMode = false, visible = true) {
  const key = slot?.layerKey;
  if (!slot || slot.status !== "ok") return false;
  if (key === "dem-hillshade") {
    upsertTerrainLayers(map, visible);
    reorderGisLayers(map);
    return true;
  }
  if (key === "topography-contours") {
    upsertContourLayers(map, visible);
    reorderGisLayers(map);
    return true;
  }
  if (key === "hydrology-flow") {
    const gj = geoJsonFromSlot(slot);
    if (gj) upsertFlowLayers(map, normalizeGeoJson(gj, key), visible);
    reorderGisLayers(map);
    return true;
  }
  if (key === "parcel-extrusion") {
    return upsertExtrusionLayer(map, slot, visible);
  }
  return upsertGisLayer(map, slot, meshMode);
}

export function extractParcelAddress(feature) {
  const p = feature?.properties || {};
  const keys = [
    "formattedAddress",
    "situsAddress",
    "SITUS_ADDR",
    "SITE_ADDR",
    "SitusAddr",
    "PROP_ADDR",
    "ADDRESS",
    "address",
    "streetAddress",
    "LOCATION",
    "FullAddr",
  ];
  for (const k of keys) {
    if (p[k]) return String(p[k]).trim();
  }
  const parts = [
    p.streetNumber,
    p.streetName,
    p.SITUS_NUM,
    p.SITUS_STRE,
    p.city,
    p.SITUS_CITY,
    p.state,
    p.SITUS_STATE,
    p.zip,
    p.SITUS_ZIP,
  ].filter(Boolean);
  if (parts.length >= 2) return parts.join(" ").trim();
  return null;
}

export function landUseLabelFromFeature(feature) {
  const p = feature?.properties || {};
  return (
    p.landUseDescription ||
    p.zoningDescription ||
    p.landUseCode ||
    p.zoningCode ||
    p.PlaceTypeClass ||
    p.ZONING ||
    "Land use"
  );
}

export function tooltipHtmlForFeature(feature, layerKey) {
  const addr = extractParcelAddress(feature);
  if (layerKey === "parcel-polygon" || layerKey === "zoning") {
    const land = landUseLabelFromFeature(feature);
    const code = feature?.properties?.zoningCode || feature?.properties?.landUseCode || "";
    const title = addr || feature?.properties?.apn || "Parcel";
    return (
      `<strong>${escapeHtml(title)}</strong>` +
      `<br/><span>${escapeHtml(land)}${code ? ` · ${escapeHtml(code)}` : ""}</span>`
    );
  }
  if (layerKey === "flood-zone") {
    const zone = feature?.properties?.FLD_ZONE || feature?.properties?.FLOOD_ZONE || "Flood zone";
    return `<strong>${escapeHtml(String(zone))}</strong><br/><span>FEMA NFHL</span>`;
  }
  return `<strong>${escapeHtml(String(feature?.properties?.label || layerKey))}</strong>`;
}

export function selectionFromParcelFeature(feature, slot) {
  const p = feature?.properties || {};
  const env = slot?.envelope;
  const addr = extractParcelAddress(feature);
  const land = landUseLabelFromFeature(feature);
  const zoning = p.zoningDescription || p.zoningCode || "";
  const cite =
    p.citation ||
    env?.source?.adapterKey ||
    env?.source?.provider ||
    "Cotality Spatial Tile + Property site-location";
  const readContract =
    extractEnvelopeReadContract(env) || p.readContract || null;
  return {
    kind: "parcel",
    label: addr || p.apn || p.APN || "Parcel",
    detail: `${land}${zoning ? ` · Zoning ${zoning}` : ""}. Assessor land-use codes on parcel — not municipal district boundaries.`,
    citation: cite,
    readContract,
    readContractSummary: readContract ? formatReadContractSummary(readContract) : null,
    envelope: env,
    timestamp: env?.dataVintage,
    renderBlocked: slot?.renderBlocked,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function floatLegendHtml(slots, meshEnabled) {
  const parcelSlot = slots?.find(
    (s) => s.layerKey === "parcel-polygon" && s.status === "ok",
  );
  const n = parcelSlot?.featureCount ?? 0;
  const landRows = LAND_USE_LEGEND.map(
    (row) =>
      `<li class="hp-map-legend__row">` +
      `<span class="hp-map-legend__swatch" style="background:${row.fill};border:1px solid ${row.stroke}"></span>` +
      `<span class="hp-map-legend__key">${escapeHtml(row.key)}</span>` +
      `</li>`,
  ).join("");
  const femaRows = FEMA_LEGEND.map(
    (row) =>
      `<li class="hp-map-legend__row">` +
      `<span class="hp-map-legend__swatch" style="background:${row.fill};border:1px solid ${row.stroke}"></span>` +
      `<span class="hp-map-legend__key">${escapeHtml(row.key)}</span>` +
      `</li>`,
  ).join("");

  const hasRent = slots?.some(
    (s) => s.layerKey === "rent-heat" && s.status === "ok",
  );
  const hasTerrain = slots?.some(
    (s) => s.layerKey === "dem-hillshade" && s.status === "ok",
  );
  const hasFlow = slots?.some(
    (s) => s.layerKey === "hydrology-flow" && s.status === "ok",
  );
  const hasExtrusion = slots?.some(
    (s) => s.layerKey === "parcel-extrusion" && s.status === "ok",
  );

  const terrainRow = hasTerrain
    ? `<li class="hp-map-legend__row">` +
      `<span class="hp-map-legend__swatch" style="background:${TERRAIN_LEGEND.fill};border:1px solid ${TERRAIN_LEGEND.stroke}"></span>` +
      `<span class="hp-map-legend__key">${escapeHtml(TERRAIN_LEGEND.key)}</span>` +
      `</li>`
    : "";
  const contourRow = hasTerrain
    ? `<li class="hp-map-legend__row">` +
      `<span class="hp-map-legend__swatch" style="background:transparent;border:1px solid ${CONTOUR_LEGEND.stroke}"></span>` +
      `<span class="hp-map-legend__key">${escapeHtml(CONTOUR_LEGEND.key)}</span>` +
      `</li>`
    : "";
  const flowRow = hasFlow
    ? `<li class="hp-map-legend__row">` +
      `<span class="hp-map-legend__swatch" style="background:${FLOW_LEGEND.fill};border:1px solid ${FLOW_LEGEND.stroke}"></span>` +
      `<span class="hp-map-legend__key">${escapeHtml(FLOW_LEGEND.key)}</span>` +
      `</li>`
    : "";
  const extrusionBlock = hasExtrusion
    ? `<p class="hp-map-legend__heading">${escapeHtml(EXTRUSION_LEGEND.key)}</p>` +
      `<div class="hp-map-heatkey">` +
      `<span class="hp-map-heatkey__lo">${escapeHtml(EXTRUSION_LEGEND.low)}</span>` +
      `<span class="hp-map-heatkey__bar" style="background:${EXTRUSION_LEGEND.gradient}"></span>` +
      `<span class="hp-map-heatkey__hi">${escapeHtml(EXTRUSION_LEGEND.high)}</span>` +
      `</div>`
    : "";

  const rentBlock = hasRent
    ? `<p class="hp-map-legend__heading">${escapeHtml(RENT_HEAT_LEGEND.key)}</p>` +
      `<div class="hp-map-heatkey">` +
      `<span class="hp-map-heatkey__lo">${escapeHtml(RENT_HEAT_LEGEND.low)}</span>` +
      `<span class="hp-map-heatkey__bar" style="background:${RENT_HEAT_LEGEND.gradient}"></span>` +
      `<span class="hp-map-heatkey__hi">${escapeHtml(RENT_HEAT_LEGEND.high)}</span>` +
      `</div>`
    : "";

  let note = POSITIONING_FOOTER;
  if (n > 1) {
    note = `Parcel mesh · ${n} parcels · width-as-saturation choropleth. ${POSITIONING_FOOTER}`;
  } else if (meshEnabled) {
    note = `Viewport mesh active. ${POSITIONING_FOOTER}`;
  } else if (n === 1) {
    note = `Subject parcel. ${POSITIONING_FOOTER}`;
  }

  return (
    `<p class="hp-map-legend__heading">Terrain</p>` +
    `<ul class="hp-map-legend hp-map-legend--float">${terrainRow}${contourRow}${flowRow}</ul>` +
    extrusionBlock +
    `<p class="hp-map-legend__heading">Land use</p>` +
    `<ul class="hp-map-legend hp-map-legend--float">${landRows}</ul>` +
    rentBlock +
    `<p class="hp-map-legend__heading">FEMA overlay</p>` +
    `<ul class="hp-map-legend hp-map-legend--float">${femaRows}</ul>` +
    `<p class="hp-map-legend__note">${escapeHtml(note)}</p>`
  );
}

export function fitToSlots(map, slots, place, padding = 48) {
  const bounds = new maplibregl.LngLatBounds();
  let has = false;

  for (const slot of slots || []) {
    const gj = geoJsonFromSlot(slot);
    if (!gj) continue;
    const fc = normalizeGeoJson(gj, slot.layerKey);
    for (const f of fc.features || []) {
      const coords = [];
      collectCoords(f.geometry, coords);
      for (const c of coords) {
        bounds.extend(c);
        has = true;
      }
    }
  }

  if (place?.longitude != null && place?.latitude != null) {
    bounds.extend([place.longitude, place.latitude]);
    has = true;
  }

  if (has) {
    map.fitBounds(bounds, { padding, maxZoom: meshEnabledZoom(slots), duration: 600 });
  } else if (place) {
    map.flyTo({ center: [place.longitude, place.latitude], zoom: 16, duration: 600 });
  }
}

function meshEnabledZoom(slots) {
  const parcel = slots?.find((s) => s.layerKey === "parcel-polygon");
  return (parcel?.featureCount ?? 0) > 3 ? 17 : 18;
}

function collectCoords(geom, out) {
  if (!geom) return;
  const t = geom.type;
  if (t === "Point") {
    out.push(geom.coordinates);
    return;
  }
  if (t === "LineString" || t === "MultiPoint") {
    for (const c of geom.coordinates || []) out.push(c);
    return;
  }
  if (t === "Polygon" || t === "MultiLineString") {
    for (const ring of geom.coordinates || []) {
      if (Array.isArray(ring[0])) for (const c of ring) out.push(c);
      else out.push(ring);
    }
    return;
  }
  if (t === "MultiPolygon") {
    for (const poly of geom.coordinates || []) {
      for (const ring of poly) {
        for (const c of ring) out.push(c);
      }
    }
  }
}

export { maplibregl };
