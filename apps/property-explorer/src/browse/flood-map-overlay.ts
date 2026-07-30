// apps/property-explorer/src/browse/flood-map-overlay.ts
//
// FLOOD & DRAINAGE 10x — the MAIN-MAP overlay (the star). While the Flood &
// Drainage report is open for the active property, the drainage study renders
// ON the live map as a striking water-like picture:
//
//   - the engine's water-ramp GRADIENT PNG (FD1 v2 payload, feature-detected)
//     as a MapLibre IMAGE source anchored to its bbox — a raster layer at
//     ~0.8 opacity inserted BELOW the parcel lines so it reads like water
//     under the cadastre;
//   - FALLBACK (study without `gradient`, i.e. pre-v2 engine or cached v1
//     studies): the served drainage-zone + ponding polygons as translucent
//     water fills in the same below-parcels slot — the map overlay ships
//     before the engine v2 deploys, honestly drawn from served geometry;
//   - PROMINENT flow arrows: bold halo-baked arrow icons along the flow lines
//     (bearing from the containing segment) plus larger amber arrows at the
//     flow EXITS (the engine's own bearingDeg) — icon-rotate is data-driven
//     from the feature's bearing, drawn pointing NORTH so rotation == bearing;
//   - the catchment boundary as a soft GLOW line (wide blurred underlay +
//     dashed core line);
//   - a SUBTLE motion treatment: the flow lines carry an animated
//     line-dasharray sequence (the classic dashoffset emulation) advanced on
//     requestAnimationFrame, THROTTLED to ~10 steps/s and paused while the
//     tab is hidden. Every frame writes a LITERAL dasharray — the blank-map
//     crash guard forbids only feature-state-driven dasharrays; static
//     literals are the safe channel. No rAF available (node) → the bold
//     static dash simply stays.
//
// OVERLAY DOMINANCE (2026-07-29 operator feedback: "the hydro study should
// OVERPOWER the other layers"): while the overlay is active the study OWNS
// the map —
//   - competing layers DIM: zoning / land-use fills and contour lines drop
//     to FLOOD_DIM_OPACITY; hydrography stays but THIN (line-width 1). All
//     prior paint values are CAPTURED BEFORE MUTATION (map.getPaintProperty)
//     and restored EXACTLY on teardown — never a hardcoded restore value.
//     Both getPaintProperty and setPaintProperty must exist on the host map
//     or dominance is skipped entirely (exact restoration is the contract).
//   - a SCRIM: one translucent dark-neutral world fill inserted UNDER the
//     flood layers but OVER basemap + zoning/GIS layers (same below-parcels
//     anchor, added first) desaturates everything beneath. The parcel ring
//     (parcel-tile lines) and every flood layer render ABOVE it.
//
// WATERSHED GRAPHICS (engine v3 payload, feature-detected — fallback is the
// exact pre-v3 look when `flowPaths`/`catchmentSwaths` are absent):
//   - catchmentSwaths → translucent blue corridor fills feeding the flow
//     lines, soft-edged by a wider low-opacity blurred line casing (MapLibre
//     has no true blur on fills);
//   - flowPaths → strength-scaled RIBBONS: a darker casing under the bright
//     animated-dash core, line-width interpolated on `strength` (0..1
//     normalized log flow accumulation from the engine), arrows sized and
//     spaced by strength, and "exit" paths boosted boldest with an amber
//     arrowhead at the parcel-boundary crossing.
//
// PAINT DISCIPLINE: no feature-state anywhere. The data-driven inputs are
// `["get","bearing"]` (symbol icon-rotate), layer filters on
// `["get","kind"]`, and width/size/opacity reads of `["get","strength"]` /
// `["get","exitBoost"]` — all plain property reads, never feature-state.
//
// LIFECYCLE (the WB6 setDossierOverlay precedent): the dock tool applies the
// overlay through the host seam when a study loads, clears it on tool
// close / study replacement via its effect cleanup, and the controller ALSO
// auto-clears when the ACTIVE property switches away from the property the
// overlay was drawn for — the overlay never leaks across properties.

import type { FloodDrainageStudyView } from "../lib/floodDrainageClient";

/* ------------------------------- ids ---------------------------------- */

export const FLOOD_SCRIM_SOURCE_ID = "pe-flood-scrim-src";
export const FLOOD_SCRIM_LAYER_ID = "pe-flood-scrim";
export const FLOOD_GRADIENT_SOURCE_ID = "pe-flood-gradient-src";
export const FLOOD_GRADIENT_LAYER_ID = "pe-flood-gradient";
export const FLOOD_VECTOR_SOURCE_ID = "pe-flood-src";
export const FLOOD_ZONE_FILL_ID = "pe-flood-zone-fill";
export const FLOOD_PONDING_FILL_ID = "pe-flood-ponding-fill";
export const FLOOD_SWATH_CASING_ID = "pe-flood-swath-casing";
export const FLOOD_SWATH_FILL_ID = "pe-flood-swath-fill";
export const FLOOD_CATCHMENT_GLOW_ID = "pe-flood-catchment-glow";
export const FLOOD_CATCHMENT_LINE_ID = "pe-flood-catchment-line";
export const FLOOD_FLOW_BASE_ID = "pe-flood-flow-base";
export const FLOOD_FLOW_DASH_ID = "pe-flood-flow-dash";
export const FLOOD_ARROW_LAYER_ID = "pe-flood-arrows";
export const FLOOD_EXIT_LAYER_ID = "pe-flood-exit-arrows";
export const FLOOD_ARROW_ICON_ID = "pe-flood-arrow-flow";
export const FLOOD_EXIT_ICON_ID = "pe-flood-arrow-exit";

/** Every layer this module may add, in add order (bottom → top). */
export const FLOOD_OVERLAY_LAYER_IDS = [
  FLOOD_SCRIM_LAYER_ID,
  FLOOD_GRADIENT_LAYER_ID,
  FLOOD_ZONE_FILL_ID,
  FLOOD_PONDING_FILL_ID,
  FLOOD_SWATH_CASING_ID,
  FLOOD_SWATH_FILL_ID,
  FLOOD_CATCHMENT_GLOW_ID,
  FLOOD_CATCHMENT_LINE_ID,
  FLOOD_FLOW_BASE_ID,
  FLOOD_FLOW_DASH_ID,
  FLOOD_ARROW_LAYER_ID,
  FLOOD_EXIT_LAYER_ID,
] as const;

/* -------------------------- dominance constants ------------------------- */

/** Competing zoning/land-use fills + contour lines drop to this opacity. */
export const FLOOD_DIM_OPACITY = 0.12;

/** Hydrography stays visible but THIN while the study owns the map. */
export const FLOOD_HYDRO_THIN_WIDTH = 1;

/** The scrim: translucent dark-neutral wash under the flood layers. */
export const FLOOD_SCRIM_COLOR = "#0b1016";
export const FLOOD_SCRIM_OPACITY = 0.45;

/** Parcel-line candidates the water raster slides UNDER (first present wins,
 *  in style order); labels/symbols are the generic fallback anchor. */
const BELOW_PARCELS_CANDIDATES = new Set([
  "hauska-parcel-tiles-glow",
  "hauska-parcel-tiles-fill",
  "hauska-parcel-tiles-line",
]);

/* ------------------------- structural map seam ------------------------- */

/** The structural subset of maplibregl.Map this module touches — a fake
 *  object satisfies it in node tests. */
export interface FloodOverlayMapLike {
  getLayer(id: string): unknown;
  addLayer(layer: unknown, beforeId?: string): unknown;
  removeLayer(id: string): unknown;
  getSource(id: string): unknown;
  addSource(id: string, source: unknown): unknown;
  removeSource(id: string): unknown;
  getStyle?(): { layers?: Array<{ id: string; type?: string }> } | undefined;
  setPaintProperty?(layerId: string, prop: string, value: unknown): unknown;
  getPaintProperty?(layerId: string, prop: string): unknown;
  hasImage?(id: string): boolean;
  addImage?(
    id: string,
    image: { width: number; height: number; data: Uint8ClampedArray },
    opts?: { pixelRatio?: number },
  ): unknown;
  isStyleLoaded?(): boolean | void;
  once?(ev: string, cb: () => void): unknown;
}

type FC = { type: "FeatureCollection"; features: unknown[] };
const EMPTY_FC: FC = { type: "FeatureCollection", features: [] };

/* --------------------------- overlay dominance -------------------------- */

export interface FloodDominanceTarget {
  layerId: string;
  prop: string;
  value: number;
}

interface CapturedPaint {
  layerId: string;
  prop: string;
  value: unknown;
}

/** Captured pre-dominance paint per map handle — keyed on the map object so
 *  clear() restores EXACTLY what apply() mutated, and a re-apply while
 *  already dominant never re-captures the dimmed values as "original". */
const dominanceCaptures = new WeakMap<object, CapturedPaint[]>();

/**
 * PURE classifier: which live-style layers compete with the study, and what
 * each gets. Matches by id convention (never our own `pe-flood-` layers):
 *   - zoning / land-use FILLS (`hauska-ovl-live-parcels-fill` is the browse
 *     land-use choropleth; any `*zoning*`/`*land-use*` fill) → dim;
 *   - zoning boundary + contour LINES (`hauska-ovl-live-topography-line`,
 *     fixture `hauska-gis-topography-contours-line`) → dim;
 *   - hydrography LINES stay visible but thin (width 1) — real streams keep
 *     reading under the modeled study, just quietly.
 * The parcel-tile layers are untouched: the cadastre + parcel ring render
 * ABOVE the scrim by insertion order.
 */
export function classifyFloodDominanceTargets(
  layers: ReadonlyArray<{ id: string; type?: string }>,
): FloodDominanceTarget[] {
  const out: FloodDominanceTarget[] = [];
  for (const layer of layers) {
    if (!layer?.id || layer.id.startsWith("pe-flood-")) continue;
    const id = layer.id.toLowerCase();
    const zoningish = /zoning|land-?use|live-parcels-fill/.test(id);
    const contourish = /contour|live-topography/.test(id);
    const hydroish = /hydrograph/.test(id);
    if (layer.type === "fill" && zoningish) {
      out.push({ layerId: layer.id, prop: "fill-opacity", value: FLOOD_DIM_OPACITY });
    } else if (layer.type === "line" && (contourish || /zoning|land-?use/.test(id))) {
      out.push({ layerId: layer.id, prop: "line-opacity", value: FLOOD_DIM_OPACITY });
    } else if (layer.type === "line" && hydroish) {
      out.push({ layerId: layer.id, prop: "line-width", value: FLOOD_HYDRO_THIN_WIDTH });
    }
  }
  return out;
}

/**
 * Dim the competing layers, capturing every prior paint value FIRST.
 * Requires BOTH getPaintProperty and setPaintProperty on the host map —
 * without the read seam an exact restore is impossible, so dominance is
 * skipped entirely (honest no-op) rather than restored-by-guess.
 * Idempotent: a second apply while dominant is a no-op.
 */
export function applyFloodDominance(map: FloodOverlayMapLike): void {
  if (
    typeof map.setPaintProperty !== "function" ||
    typeof map.getPaintProperty !== "function"
  ) {
    return;
  }
  if (dominanceCaptures.has(map as object)) return; // already dominant.
  const layers = map.getStyle?.()?.layers ?? [];
  const captured: CapturedPaint[] = [];
  for (const target of classifyFloodDominanceTargets(layers)) {
    try {
      const prior = map.getPaintProperty(target.layerId, target.prop);
      map.setPaintProperty(target.layerId, target.prop, target.value);
      captured.push({ layerId: target.layerId, prop: target.prop, value: prior });
    } catch {
      /* layer vanished mid-walk; skip it */
    }
  }
  dominanceCaptures.set(map as object, captured);
}

/** Restore every captured paint value exactly; no-op when never applied. */
export function restoreFloodDominance(map: FloodOverlayMapLike): void {
  const captured = dominanceCaptures.get(map as object);
  if (!captured) return;
  dominanceCaptures.delete(map as object);
  if (typeof map.setPaintProperty !== "function") return;
  for (const entry of captured) {
    if (!map.getLayer(entry.layerId)) continue;
    try {
      map.setPaintProperty(entry.layerId, entry.prop, entry.value);
    } catch {
      /* style churn; the layer's own owner re-paints it */
    }
  }
}

/** World-covering ring for the scrim fill (web-mercator-safe latitudes). */
const SCRIM_RING: Array<[number, number]> = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/* --------------------------- pure geometry ----------------------------- */

type LngLat = [number, number];
const METERS_PER_DEG_LAT = 110_574;

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Bearing (deg clockwise from NORTH) of the segment a→b in WGS84. */
export function segmentBearingDeg(a: LngLat, b: LngLat): number {
  const meanLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(meanLat);
  const dy = b[1] - a[1];
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function segmentMeters(a: LngLat, b: LngLat): number {
  const meanLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(meanLat) * METERS_PER_DEG_LAT;
  const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

export interface FlowArrowPoint {
  lng: number;
  lat: number;
  /** Deg clockwise from north — the icon (drawn pointing north) rotates by this. */
  bearingDeg: number;
}

function arrowsAtFractions(
  pts: LngLat[],
  segLens: number[],
  total: number,
  fractions: number[],
): FlowArrowPoint[] {
  const out: FlowArrowPoint[] = [];
  for (const f of fractions) {
    let target = total * f;
    let i = 0;
    while (i < segLens.length - 1 && target > segLens[i]) {
      target -= segLens[i];
      i++;
    }
    const a = pts[i];
    const b = pts[i + 1];
    const t = segLens[i] > 0 ? Math.min(1, target / segLens[i]) : 0;
    out.push({
      lng: a[0] + (b[0] - a[0]) * t,
      lat: a[1] + (b[1] - a[1]) * t,
      bearingDeg: Math.round(segmentBearingDeg(a, b) * 10) / 10,
    });
  }
  return out;
}

function measureLine(line: LngLat[]): { pts: LngLat[]; segLens: number[]; total: number } {
  const pts = (Array.isArray(line) ? line : []).filter(
    (p) => Array.isArray(p) && isFiniteNum(p[0]) && isFiniteNum(p[1]),
  );
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = segmentMeters(pts[i], pts[i + 1]);
    segLens.push(l);
    total += l;
  }
  return { pts, segLens, total };
}

/**
 * PROMINENT arrows along a traced flow line: 1 arrow at the midpoint for
 * short lines, 3 spread along longer (>120 m) lines. Each arrow sits ON the
 * line and points along the CONTAINING segment's bearing (real flow
 * direction, never invented).
 */
export function flowArrowPoints(line: LngLat[]): FlowArrowPoint[] {
  const { pts, segLens, total } = measureLine(line);
  if (pts.length < 2 || total <= 0) return [];
  const fractions = total > 120 ? [0.2, 0.5, 0.8] : [0.5];
  return arrowsAtFractions(pts, segLens, total, fractions);
}

/** Strength-scaled arrow spacing cap — never a wall of arrows. */
const MAX_RIBBON_ARROWS = 8;

/**
 * Arrows along a v3 flow RIBBON, SPACED BY STRENGTH: a strong channel gets
 * an arrow roughly every 60 m, a weak one every ~180 m (always at least the
 * midpoint arrow). Bearing stays the containing segment's — real direction.
 */
export function flowArrowPointsScaled(line: LngLat[], strength: number): FlowArrowPoint[] {
  const { pts, segLens, total } = measureLine(line);
  if (pts.length < 2 || total <= 0) return [];
  const s = Math.min(1, Math.max(0, isFiniteNum(strength) ? strength : 0));
  const spacingM = 180 - 120 * s;
  const count = Math.min(MAX_RIBBON_ARROWS, Math.max(1, Math.floor(total / spacingM)));
  const fractions: number[] = [];
  for (let i = 0; i < count; i++) fractions.push((i + 0.5) / count);
  return arrowsAtFractions(pts, segLens, total, fractions);
}

/** Ray-cast point-in-ring on WGS84 [lng, lat] pairs (the engine's rule). */
function pointInRing(lng: number, lat: number, ring: ReadonlyArray<LngLat>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * The parcel-boundary CROSSING of an exit path: the first vertex outside the
 * ring following an inside vertex (the engine's resolveFlowExits rule), with
 * the crossing segment's bearing. Without a usable ring the path's terminal
 * vertex + last-segment bearing stand in (the trace ends where it left).
 */
export function exitCrossingPoint(
  line: LngLat[],
  ring: ReadonlyArray<LngLat> | undefined,
): FlowArrowPoint | null {
  const pts = (Array.isArray(line) ? line : []).filter(
    (p) => Array.isArray(p) && isFiniteNum(p[0]) && isFiniteNum(p[1]),
  );
  if (pts.length < 2) return null;
  if (Array.isArray(ring) && ring.length >= 3) {
    let prevIn = pointInRing(pts[0][0], pts[0][1], ring);
    for (let i = 1; i < pts.length; i++) {
      const curIn = pointInRing(pts[i][0], pts[i][1], ring);
      if (prevIn && !curIn) {
        return {
          lng: pts[i][0],
          lat: pts[i][1],
          bearingDeg: Math.round(segmentBearingDeg(pts[i - 1], pts[i]) * 10) / 10,
        };
      }
      prevIn = curIn;
    }
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return {
    lng: b[0],
    lat: b[1],
    bearingDeg: Math.round(segmentBearingDeg(a, b) * 10) / 10,
  };
}

/* ---------------------------- overlay model ---------------------------- */

export interface FloodGradientImage {
  /** data: URI for the transparent water-ramp PNG. */
  url: string;
  /** Image-source corner anchors: [TL, TR, BR, BL] = [[w,n],[e,n],[e,s],[w,s]]. */
  coordinates: [LngLat, LngLat, LngLat, LngLat];
}

export interface FloodMapOverlayModel {
  /** The engine v2 water-ramp raster, or null → fallback fills carry the water. */
  gradient: FloodGradientImage | null;
  /** kind-tagged vector features (catchment/flow/arrow/exit + swath ribbons
   *  when the v3 payload is present + zone/ponding fills only when gradient
   *  is absent — every branch feature-detected). */
  vectors: FC;
  /** True when the below-parcels water is the polygon-fill fallback. */
  usesFallbackFills: boolean;
  /** True when the v3 flowPaths payload drives strength-scaled ribbons
   *  (absent payload → the exact pre-v3 flow-line look). */
  usesFlowRibbons: boolean;
}

function fcFeatures(fc: unknown): Array<{ geometry?: unknown }> {
  const f = fc as { features?: unknown } | null | undefined;
  return Array.isArray(f?.features) ? (f!.features as Array<{ geometry?: unknown }>) : [];
}

function lineStringsOf(geometry: unknown): LngLat[][] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates)) return [];
  if (g.type === "LineString") return [g.coordinates as LngLat[]];
  if (g.type === "MultiLineString") return g.coordinates as LngLat[][];
  return [];
}

function validGradient(
  study: FloodDrainageStudyView,
): FloodGradientImage | null {
  const g = study.gradient;
  if (!g || typeof g.pngBase64 !== "string" || g.pngBase64.length === 0) return null;
  const b = g.bbox;
  if (
    !b ||
    ![b.westLng, b.southLat, b.eastLng, b.northLat].every(isFiniteNum) ||
    b.westLng >= b.eastLng ||
    b.southLat >= b.northLat
  ) {
    return null;
  }
  return {
    url: `data:image/png;base64,${g.pngBase64}`,
    coordinates: [
      [b.westLng, b.northLat],
      [b.eastLng, b.northLat],
      [b.eastLng, b.southLat],
      [b.westLng, b.southLat],
    ],
  };
}

/**
 * PURE study → overlay model. Every drawn geometry comes from the served
 * study; an absent layer draws nothing (never a placeholder). honestEmpty
 * studies produce an empty model — the map stays untouched.
 */
interface StudyFlowPathLike {
  coordinates: LngLat[];
  strength: number;
  kind: "interior" | "exit";
}

/** Feature-detect + validate the v3 flowPaths/catchmentSwaths entries: at
 *  least 2 finite vertices, finite strength clamped 0..1, kind coerced to
 *  the enum. Anything malformed is dropped, never guessed. */
function validPathLike(entries: unknown): StudyFlowPathLike[] {
  if (!Array.isArray(entries)) return [];
  const out: StudyFlowPathLike[] = [];
  for (const entry of entries) {
    const e = entry as {
      coordinates?: unknown;
      strength?: unknown;
      kind?: unknown;
    } | null;
    if (!e || !Array.isArray(e.coordinates)) continue;
    const coords = (e.coordinates as unknown[]).filter(
      (p): p is LngLat =>
        Array.isArray(p) && isFiniteNum((p as unknown[])[0]) && isFiniteNum((p as unknown[])[1]),
    );
    if (coords.length < 2) continue;
    const strength = isFiniteNum(e.strength) ? Math.min(1, Math.max(0, e.strength)) : 0;
    out.push({
      coordinates: coords,
      strength,
      kind: e.kind === "exit" ? "exit" : "interior",
    });
  }
  return out;
}

export function buildFloodMapOverlayModel(
  study: FloodDrainageStudyView,
): FloodMapOverlayModel {
  if (study.honestEmpty) {
    return { gradient: null, vectors: EMPTY_FC, usesFallbackFills: false, usesFlowRibbons: false };
  }

  const gradient = validGradient(study);
  const features: unknown[] = [];

  // Feature-detect FALLBACK: no gradient → the served zone/ponding polygons
  // become the translucent below-parcels water fills.
  if (!gradient) {
    for (const f of fcFeatures(study.drainageZonesGeoJson)) {
      if (f?.geometry) {
        features.push({
          type: "Feature",
          geometry: f.geometry,
          properties: { kind: "zone" },
        });
      }
    }
    for (const f of fcFeatures(study.rainfallResultGeoJson ?? null)) {
      if (f?.geometry) {
        features.push({
          type: "Feature",
          geometry: f.geometry,
          properties: { kind: "ponding" },
        });
      }
    }
  }

  // Catchment boundary → the soft glow line pair.
  for (const f of fcFeatures(study.catchmentGeoJson)) {
    if (f?.geometry) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "catchment" },
      });
    }
  }

  // FEATURE-DETECT the v3 watershed payload: flowPaths drive strength-scaled
  // ribbons + swaths; an absent payload renders the exact pre-v3 look.
  const flowPaths = validPathLike(study.flowPaths);
  const usesFlowRibbons = flowPaths.length > 0;

  if (usesFlowRibbons) {
    // Watershed swaths UNDER the ribbons (index-aligned with flowPaths but
    // validated independently — a malformed swath never blocks its ribbon).
    for (const swath of validPathLike(study.catchmentSwaths)) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [swath.coordinates] },
        properties: { kind: "swath", strength: swath.strength },
      });
    }
    let anyExit = false;
    for (const path of flowPaths) {
      const isExit = path.kind === "exit";
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: path.coordinates },
        properties: {
          kind: "flow",
          strength: path.strength,
          // Exit paths get the BOLDEST ribbon treatment (width multiplier).
          exitBoost: isExit ? 1.3 : 1,
        },
      });
      for (const a of flowArrowPointsScaled(path.coordinates, path.strength)) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lng, a.lat] },
          properties: { kind: "arrow", bearing: a.bearingDeg, strength: path.strength },
        });
      }
      // Amber arrowhead AT the parcel-boundary crossing of each exit path.
      if (isExit) {
        const crossing = exitCrossingPoint(path.coordinates, study.parcelRingWgs84);
        if (crossing) {
          anyExit = true;
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [crossing.lng, crossing.lat] },
            properties: { kind: "exit", bearing: crossing.bearingDeg },
          });
        }
      }
    }
    // No exit-kind path traced → the engine's own flowExits (worker-traced
    // boundary crossings) still draw, so an exit is never silently dropped.
    if (!anyExit) {
      for (const e of Array.isArray(study.flowExits) ? study.flowExits : []) {
        if (!isFiniteNum(e?.lng) || !isFiniteNum(e?.lat)) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lng, e.lat] },
          properties: { kind: "exit", bearing: isFiniteNum(e.bearingDeg) ? e.bearingDeg : 0 },
        });
      }
    }
  } else {
    // Pre-v3 fallback: flow lines + their along-line arrows, verbatim.
    for (const f of fcFeatures(study.flowLinesGeoJson)) {
      if (!f?.geometry) continue;
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "flow" },
      });
      for (const line of lineStringsOf(f.geometry)) {
        for (const a of flowArrowPoints(line)) {
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [a.lng, a.lat] },
            properties: { kind: "arrow", bearing: a.bearingDeg },
          });
        }
      }
    }

    // Flow EXITS — the engine's own points + bearings, drawn larger.
    for (const e of Array.isArray(study.flowExits) ? study.flowExits : []) {
      if (!isFiniteNum(e?.lng) || !isFiniteNum(e?.lat)) continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: {
          kind: "exit",
          bearing: isFiniteNum(e.bearingDeg) ? e.bearingDeg : 0,
        },
      });
    }
  }

  return {
    gradient,
    vectors: { type: "FeatureCollection", features },
    usesFallbackFills: !gradient && features.some((f) =>
      ["zone", "ponding"].includes(
        ((f as { properties?: { kind?: string } }).properties?.kind) ?? "",
      ),
    ),
    usesFlowRibbons,
  };
}

/* --------------------------- arrow icon (pure) -------------------------- */

type Rgba = [number, number, number, number];

function inArrowShape(x: number, y: number): boolean {
  // 24-unit space, arrow pointing UP (north): triangle head + shaft.
  // Head: apex (12,3), base (5.5,11)–(18.5,11). Shaft: x∈[10.4,13.6], y∈[10,21].
  if (x >= 10.4 && x <= 13.6 && y >= 10 && y <= 21) return true;
  if (y >= 3 && y <= 11) {
    const half = ((y - 3) / 8) * 6.5; // half-width grows from 0 at apex to 6.5.
    return Math.abs(x - 12) <= half;
  }
  return false;
}

/**
 * Rasterize the bold arrow icon (pointing NORTH) with a baked paper-halo —
 * pure pixel math, no canvas, so it runs in node and in the browser alike.
 */
export function buildArrowIconData(
  size: number,
  fill: Rgba,
  halo: Rgba,
): { width: number; height: number; data: Uint8ClampedArray } {
  const scale = 24 / size;
  const coverage = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // 2x2 supersample for smooth edges.
      let hits = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        if (inArrowShape((px + ox) * scale, (py + oy) * scale)) hits++;
      }
      coverage[py * size + px] = hits / 4;
    }
  }
  const haloR = Math.max(1, Math.round(size / 12)); // ~2 units of halo.
  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const c = coverage[py * size + px];
      let v: Rgba | null = null;
      if (c > 0) {
        v = [fill[0], fill[1], fill[2], Math.round(fill[3] * c)];
      } else {
        // Halo: near the shape but outside it.
        let near = 0;
        for (let dy = -haloR; dy <= haloR && near === 0; dy++) {
          for (let dx = -haloR; dx <= haloR; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (dx * dx + dy * dy > haloR * haloR) continue;
            if (coverage[ny * size + nx] > 0.5) {
              near = 1;
              break;
            }
          }
        }
        if (near) v = halo;
      }
      if (v) {
        const i = (py * size + px) * 4;
        data[i] = v[0];
        data[i + 1] = v[1];
        data[i + 2] = v[2];
        data[i + 3] = v[3];
      }
    }
  }
  return { width: size, height: size, data };
}

/* ------------------------- flow-dash animation -------------------------- */

/** The classic MapLibre animated-dash sequence (line-dashoffset emulation).
 *  Every entry is a LITERAL dasharray — the crash guard's safe channel. */
export const FLOW_DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

/** ~10 dash steps per second — flowing water, not a strobe. */
const DASH_STEP_MS = 100;

function startFlowDashAnimation(map: FloodOverlayMapLike): (() => void) | null {
  if (
    typeof requestAnimationFrame !== "function" ||
    typeof map.setPaintProperty !== "function"
  ) {
    return null; // static-but-bold fallback (node / stripped host).
  }
  let raf = 0;
  let stopped = false;
  let step = 0;
  let lastAt = 0;
  const tick = (now: number) => {
    if (stopped) return;
    const hidden =
      typeof document !== "undefined" && (document as { hidden?: boolean }).hidden;
    if (!hidden && now - lastAt >= DASH_STEP_MS) {
      lastAt = now;
      step = (step + 1) % FLOW_DASH_SEQUENCE.length;
      try {
        if (map.getLayer(FLOOD_FLOW_DASH_ID)) {
          map.setPaintProperty!(
            FLOOD_FLOW_DASH_ID,
            "line-dasharray",
            FLOW_DASH_SEQUENCE[step],
          );
        }
      } catch {
        /* style churn mid-frame; next frame retries */
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    try {
      cancelAnimationFrame(raf);
    } catch {
      /* ignore */
    }
  };
}

/* --------------------------- apply / clear ------------------------------ */

/** The insertion anchor for the below-parcels water: the FIRST (in style
 *  order) parcel-tile layer, else the first symbol (label) layer. */
export function pickBelowParcelsBeforeId(
  map: FloodOverlayMapLike,
): string | undefined {
  try {
    const layers = map.getStyle?.()?.layers;
    if (Array.isArray(layers)) {
      for (const l of layers) {
        if (l && BELOW_PARCELS_CANDIDATES.has(l.id)) return l.id;
      }
      for (const l of layers) {
        if (l?.type === "symbol") return l.id;
      }
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function ensureArrowIcons(map: FloodOverlayMapLike): void {
  if (typeof map.addImage !== "function") return;
  try {
    // Flow arrows: bright water-blue on a dark paper-halo.
    if (!map.hasImage?.(FLOOD_ARROW_ICON_ID)) {
      map.addImage(
        FLOOD_ARROW_ICON_ID,
        buildArrowIconData(48, [224, 242, 254, 255], [6, 9, 13, 215]),
        { pixelRatio: 2 },
      );
    }
    // Exit arrows: amber (the dock viz exit color) on the same halo.
    if (!map.hasImage?.(FLOOD_EXIT_ICON_ID)) {
      map.addImage(
        FLOOD_EXIT_ICON_ID,
        buildArrowIconData(48, [252, 211, 77, 255], [6, 9, 13, 215]),
        { pixelRatio: 2 },
      );
    }
  } catch {
    /* icons are progressive enhancement; layers guard on their own */
  }
}

function addVectorLayers(map: FloodOverlayMapLike, beforeId: string | undefined): void {
  const kindIs = (k: string) => ["==", ["get", "kind"], k];
  // BELOW the parcels: the fallback water fills (no-op with a gradient — the
  // model simply carries no zone/ponding features then).
  if (!map.getLayer(FLOOD_ZONE_FILL_ID)) {
    map.addLayer(
      {
        id: FLOOD_ZONE_FILL_ID,
        type: "fill",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("zone"),
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.22 },
      },
      beforeId,
    );
  }
  if (!map.getLayer(FLOOD_PONDING_FILL_ID)) {
    map.addLayer(
      {
        id: FLOOD_PONDING_FILL_ID,
        type: "fill",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("ponding"),
        paint: {
          "fill-color": "#60a5fa",
          "fill-opacity": 0.45,
          "fill-outline-color": "#93c5fd",
        },
      },
      beforeId,
    );
  }
  // WATERSHED SWATHS (v3 feature-detect — empty filter match when absent):
  // translucent corridor fills feeding the flow ribbons, soft-edged by a
  // wider blurred low-opacity line casing (MapLibre has no blur on fills).
  // Below the parcel lines like the water raster, so the cadastre stays crisp.
  if (!map.getLayer(FLOOD_SWATH_CASING_ID)) {
    map.addLayer(
      {
        id: FLOOD_SWATH_CASING_ID,
        type: "line",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("swath"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#38bdf8",
          "line-width": 14,
          "line-blur": 10,
          "line-opacity": 0.18,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(FLOOD_SWATH_FILL_ID)) {
    map.addLayer(
      {
        id: FLOOD_SWATH_FILL_ID,
        type: "fill",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("swath"),
        paint: {
          "fill-color": "#38bdf8",
          // Stronger corridors read deeper — plain property read, never
          // feature-state (the crash-guard safe channel).
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "strength"], 0.5],
            0,
            0.1,
            1,
            0.28,
          ],
        },
      },
      beforeId,
    );
  }
  // TOP of the stack: catchment glow pair, flow lines, arrows.
  if (!map.getLayer(FLOOD_CATCHMENT_GLOW_ID)) {
    map.addLayer({
      id: FLOOD_CATCHMENT_GLOW_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("catchment"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#38bdf8",
        "line-width": 10,
        "line-blur": 8,
        "line-opacity": 0.35,
      },
    });
  }
  if (!map.getLayer(FLOOD_CATCHMENT_LINE_ID)) {
    map.addLayer({
      id: FLOOD_CATCHMENT_LINE_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("catchment"),
      layout: { "line-cap": "round", "line-join": "round" },
      // STATIC literal dash — the safe channel.
      paint: {
        "line-color": "rgba(125,211,252,0.8)",
        "line-width": 1.8,
        "line-dasharray": [4, 3],
      },
    });
  }
  // FLOW RIBBONS: a darker CASING under the bright animated core. Width is
  // strength-scaled (v3 payload) via a plain `["get","strength"]` read;
  // pre-v3 features carry NO strength → the `has` branch keeps the exact
  // legacy widths/colors. Exit paths multiply by their `exitBoost` (boldest).
  if (!map.getLayer(FLOOD_FLOW_BASE_ID)) {
    map.addLayer({
      id: FLOOD_FLOW_BASE_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("flow"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["has", "strength"], "#082f49", "#7dd3fc"],
        "line-opacity": ["case", ["has", "strength"], 0.9, 0.55],
        "line-width": [
          "case",
          ["has", "strength"],
          [
            "*",
            ["interpolate", ["linear"], ["get", "strength"], 0, 3.5, 1, 12],
            ["coalesce", ["get", "exitBoost"], 1],
          ],
          3,
        ],
      },
    });
  }
  if (!map.getLayer(FLOOD_FLOW_DASH_ID)) {
    map.addLayer({
      id: FLOOD_FLOW_DASH_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("flow"),
      layout: { "line-cap": "round", "line-join": "round" },
      // Animated by literal-swap on rAF; this initial value is itself literal.
      paint: {
        "line-color": "#e0f2fe",
        "line-width": [
          "case",
          ["has", "strength"],
          [
            "*",
            ["interpolate", ["linear"], ["get", "strength"], 0, 2, 1, 9],
            ["coalesce", ["get", "exitBoost"], 1],
          ],
          2.2,
        ],
        "line-dasharray": FLOW_DASH_SEQUENCE[0],
      },
    });
  }
  if (!map.getLayer(FLOOD_ARROW_LAYER_ID)) {
    map.addLayer({
      id: FLOOD_ARROW_LAYER_ID,
      type: "symbol",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("arrow"),
      layout: {
        "icon-image": FLOOD_ARROW_ICON_ID,
        // Strength-SIZED on the v3 payload; legacy arrows keep 0.55 exactly.
        "icon-size": [
          "case",
          ["has", "strength"],
          ["interpolate", ["linear"], ["get", "strength"], 0, 0.4, 1, 0.85],
          0.55,
        ],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  if (!map.getLayer(FLOOD_EXIT_LAYER_ID)) {
    map.addLayer({
      id: FLOOD_EXIT_LAYER_ID,
      type: "symbol",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("exit"),
      layout: {
        "icon-image": FLOOD_EXIT_ICON_ID,
        "icon-size": 0.85,
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

/**
 * Apply (or refresh) the flood overlay on the live map. Idempotent: existing
 * sources get setData/updateImage; missing layers are added. Returns the
 * animation stop handle (null → static fallback).
 */
export function applyFloodMapOverlay(
  map: FloodOverlayMapLike,
  model: FloodMapOverlayModel,
): (() => void) | null {
  const beforeId = pickBelowParcelsBeforeId(map);

  try {
    // DOMINANCE first: dim the competitors (capture-before-mutate) …
    applyFloodDominance(map);

    // … then the SCRIM: one translucent dark-neutral world fill added FIRST
    // at the below-parcels anchor, so every flood layer added after it (same
    // anchor) renders ABOVE it, while basemap + zoning/GIS sit BELOW.
    if (!map.getSource(FLOOD_SCRIM_SOURCE_ID)) {
      map.addSource(FLOOD_SCRIM_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [SCRIM_RING] },
              properties: {},
            },
          ],
        },
      });
    }
    if (!map.getLayer(FLOOD_SCRIM_LAYER_ID)) {
      map.addLayer(
        {
          id: FLOOD_SCRIM_LAYER_ID,
          type: "fill",
          source: FLOOD_SCRIM_SOURCE_ID,
          paint: {
            "fill-color": FLOOD_SCRIM_COLOR,
            "fill-opacity": FLOOD_SCRIM_OPACITY,
          },
        },
        beforeId,
      );
    }

    // The water-ramp raster (feature-detected).
    if (model.gradient) {
      const existing = map.getSource(FLOOD_GRADIENT_SOURCE_ID) as
        | { updateImage?: (o: { url: string; coordinates: unknown }) => void }
        | undefined;
      if (existing) {
        existing.updateImage?.({
          url: model.gradient.url,
          coordinates: model.gradient.coordinates,
        });
      } else {
        map.addSource(FLOOD_GRADIENT_SOURCE_ID, {
          type: "image",
          url: model.gradient.url,
          coordinates: model.gradient.coordinates,
        });
      }
      if (!map.getLayer(FLOOD_GRADIENT_LAYER_ID)) {
        map.addLayer(
          {
            id: FLOOD_GRADIENT_LAYER_ID,
            type: "raster",
            source: FLOOD_GRADIENT_SOURCE_ID,
            paint: {
              "raster-opacity": 0.8,
              "raster-fade-duration": 0,
              "raster-resampling": "linear",
            },
          },
          beforeId,
        );
      }
    } else {
      // No gradient this study → drop any stale raster from a prior one.
      if (map.getLayer(FLOOD_GRADIENT_LAYER_ID)) map.removeLayer(FLOOD_GRADIENT_LAYER_ID);
      if (map.getSource(FLOOD_GRADIENT_SOURCE_ID)) map.removeSource(FLOOD_GRADIENT_SOURCE_ID);
    }

    // The vector picture.
    const vecSrc = map.getSource(FLOOD_VECTOR_SOURCE_ID) as
      | { setData?: (d: unknown) => void }
      | undefined;
    if (vecSrc) {
      vecSrc.setData?.(model.vectors);
    } else {
      map.addSource(FLOOD_VECTOR_SOURCE_ID, {
        type: "geojson",
        data: model.vectors,
      });
    }
    ensureArrowIcons(map);
    addVectorLayers(map, beforeId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[flood-overlay] apply failed:", err);
    return null;
  }
  return startFlowDashAnimation(map);
}

/** Remove every flood-overlay layer + source (icons stay — inert, reusable)
 *  and restore the exact pre-dominance paint on every dimmed layer. */
export function clearFloodMapOverlay(map: FloodOverlayMapLike): void {
  try {
    for (const id of FLOOD_OVERLAY_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(FLOOD_VECTOR_SOURCE_ID)) map.removeSource(FLOOD_VECTOR_SOURCE_ID);
    if (map.getSource(FLOOD_GRADIENT_SOURCE_ID)) map.removeSource(FLOOD_GRADIENT_SOURCE_ID);
    if (map.getSource(FLOOD_SCRIM_SOURCE_ID)) map.removeSource(FLOOD_SCRIM_SOURCE_ID);
  } catch {
    /* style already torn down; ignore */
  }
  restoreFloodDominance(map);
}

/* ---------------------------- the controller ---------------------------- */

export interface FloodMapOverlayController {
  /** Draw (or clear, with null) the study overlay; records the owning property. */
  set(study: FloodDrainageStudyView | null, forParcelNodeId?: string | null): void;
  /** The WB6 auto-clear: active property switched → a stale overlay clears. */
  onActivePropertyChange(activeParcelNodeId: string | null): void;
  /** Which property the overlay currently belongs to (null = none drawn). */
  appliedFor(): string | null;
  /** Clear + stop everything (map unmount). */
  destroy(): void;
}

/**
 * The lifecycle wrapper ExplorerMap owns (the setDossierOverlay precedent):
 * one controller per map handle; the dock tool talks to it through the host
 * seam. `getMap` is read per call — the map may mount after the controller.
 */
export function createFloodMapOverlayController(
  getMap: () => FloodOverlayMapLike | null,
): FloodMapOverlayController {
  let drawnFor: string | null = null;
  let stopAnim: (() => void) | null = null;

  const clear = () => {
    stopAnim?.();
    stopAnim = null;
    drawnFor = null;
    const map = getMap();
    if (map) clearFloodMapOverlay(map);
  };

  return {
    set(study, forParcelNodeId) {
      if (!study || study.honestEmpty) {
        clear();
        return;
      }
      const map = getMap();
      if (!map) return; // map not ready — honest no-op, the tool re-applies.
      const run = () => {
        stopAnim?.();
        stopAnim = applyFloodMapOverlay(map, buildFloodMapOverlayModel(study));
        drawnFor = forParcelNodeId ?? null;
      };
      // Style still loading → defer once; the study apply is user-paced so a
      // single styledata retry is enough in practice.
      const styleLoaded = map.isStyleLoaded ? map.isStyleLoaded() !== false : true;
      if (!styleLoaded && typeof map.once === "function") {
        map.once("styledata", run);
        return;
      }
      run();
    },
    onActivePropertyChange(activeParcelNodeId) {
      if (drawnFor && drawnFor !== activeParcelNodeId) clear();
    },
    appliedFor: () => drawnFor,
    destroy: clear,
  };
}
