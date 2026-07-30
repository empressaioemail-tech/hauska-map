// apps/property-explorer/src/browse/flood-map-overlay.ts
//
// FLOOD & DRAINAGE — the MAIN-MAP overlay, FEMA-ZONE STYLE (FD4 restyle,
// 2026-07-29 operator direction: "crisp FEMA-zone-style categorical polygons;
// small arrows are fine but I want to see how it affects the property in
// question"). While the Flood & Drainage report is open for the active
// property, the drainage study renders on the live map in the SAME visual
// language as the app's live FEMA flood-zone layer (live-gis toLiveOverlays:
// solid semi-transparent categorical fills, crisp thin outlines — no glow,
// no gradient, no animation):
//
//   - PONDING (rainfallResultGeoJson) — the headline layer: solid blue fill
//     at 0.42 opacity with a crisp 1px darker-blue outline (the payload has
//     no graded depth classes, so ponding is one categorical class);
//   - DRAINAGE ZONES (drainageZonesGeoJson) — light categorical tint (0.18)
//     with the live-FEMA outline (rgba(59,130,246,0.55) at 0.8px), visually
//     subordinate to ponding;
//   - CATCHMENT (catchmentGeoJson) — no fill; a single dashed boundary line;
//   - PARCEL-RELEVANT FLOW ONLY: flow paths are filtered to those that
//     matter to the subject parcel — kind "exit" paths, plus any path whose
//     geometry intersects the parcel ring or comes within ~15 m of it.
//     Everything else is DROPPED. Survivors draw as thin clean lines with
//     SMALL static direction arrows (map-annotation style, sparse), plus one
//     clear arrow at each point where flow crosses the parcel boundary.
//     Total arrows are capped at 6, boundary-crossing arrows first.
//
// REMOVED in the FD4 restyle (operator rejection of PR #114/#116): the scrim
// + layer-dimming dominance mechanism, the water-gradient raster image, the
// catchment swath corridors, the strength-scaled animated ribbons, and all
// far-field arrows. The dock mini-grid in FloodTool is untouched.
//
// LAYER ORDER: zone/ponding fills + outlines insert at the same below-parcels
// anchor the overlay always used (below parcel ring/tiles, above basemap);
// the catchment dash, flow lines, and arrows draw on top of the stack.
//
// PAINT DISCIPLINE: no feature-state anywhere. The only data-driven inputs
// are `["get","bearing"]` (symbol icon-rotate) and layer filters on
// `["get","kind"]` — plain property reads, never feature-state. No animated
// dash: every dasharray is a static literal (the crash-guard safe channel).
//
// FEATURE-DETECT: studies without the v3 `flowPaths` payload filter their
// legacy `flowLinesGeoJson` traces through the same parcel-relevance rule;
// the zone/catchment/ponding GeoJSON fields always render. honestEmpty
// studies produce an empty model — the map stays untouched.
//
// LIFECYCLE (the WB6 setDossierOverlay precedent): the dock tool applies the
// overlay through the host seam when a study loads, clears it on tool
// close / study replacement via its effect cleanup, and the controller ALSO
// auto-clears when the ACTIVE property switches away from the property the
// overlay was drawn for — the overlay never leaks across properties.

import type { FloodDrainageStudyView } from "../lib/floodDrainageClient";

/* ------------------------------- ids ---------------------------------- */

export const FLOOD_VECTOR_SOURCE_ID = "pe-flood-src";
export const FLOOD_ZONE_FILL_ID = "pe-flood-zone-fill";
export const FLOOD_ZONE_LINE_ID = "pe-flood-zone-line";
export const FLOOD_PONDING_FILL_ID = "pe-flood-ponding-fill";
export const FLOOD_PONDING_LINE_ID = "pe-flood-ponding-line";
export const FLOOD_CATCHMENT_LINE_ID = "pe-flood-catchment-line";
export const FLOOD_FLOW_LINE_ID = "pe-flood-flow-line";
export const FLOOD_ARROW_LAYER_ID = "pe-flood-arrows";
export const FLOOD_EXIT_LAYER_ID = "pe-flood-exit-arrows";
export const FLOOD_ARROW_ICON_ID = "pe-flood-arrow-flow";
export const FLOOD_EXIT_ICON_ID = "pe-flood-arrow-exit";

/** Every layer this module may add, in add order (bottom → top). */
export const FLOOD_OVERLAY_LAYER_IDS = [
  FLOOD_ZONE_FILL_ID,
  FLOOD_ZONE_LINE_ID,
  FLOOD_PONDING_FILL_ID,
  FLOOD_PONDING_LINE_ID,
  FLOOD_CATCHMENT_LINE_ID,
  FLOOD_FLOW_LINE_ID,
  FLOOD_ARROW_LAYER_ID,
  FLOOD_EXIT_LAYER_ID,
] as const;

/* --------------------------- style constants ---------------------------- */
// The FEMA visual language, matched from the live flood layer (live-gis
// toLiveOverlays LIVE_FEMA_KEY paint): SFHA fill hue rgb(59,130,246) /
// X-tint hue rgb(96,165,250), fill-opacity 0.4, thin 0.8px outline
// rgba(59,130,246,0.55). Solid categorical fills, crisp edges, no gradient.

/** Ponding — the headline class: the FEMA SFHA blue, solid. */
export const FLOOD_PONDING_FILL_COLOR = "#3b82f6";
export const FLOOD_PONDING_FILL_OPACITY = 0.42;
/** Crisp 1px darker-blue ponding edge. */
export const FLOOD_PONDING_LINE_COLOR = "#1d4ed8";
export const FLOOD_PONDING_LINE_WIDTH = 1;

/** Drainage zones — the light X-tint hue, visually subordinate to ponding. */
export const FLOOD_ZONE_FILL_COLOR = "#60a5fa";
export const FLOOD_ZONE_FILL_OPACITY = 0.18;
/** The live-FEMA outline verbatim. */
export const FLOOD_ZONE_LINE_COLOR = "rgba(59,130,246,0.55)";
export const FLOOD_ZONE_LINE_WIDTH = 0.8;

/** Catchment — a single dashed boundary line, no fill (STATIC literal dash). */
export const FLOOD_CATCHMENT_LINE_COLOR = "rgba(59,130,246,0.8)";
export const FLOOD_CATCHMENT_LINE_WIDTH = 1.4;
export const FLOOD_CATCHMENT_DASH = [4, 3];

/** Parcel-relevant flow — thin clean lines, no casing, no animation. */
export const FLOOD_FLOW_LINE_COLOR = "#7dd3fc";
export const FLOOD_FLOW_LINE_WIDTH = 1.5;
export const FLOOD_FLOW_LINE_OPACITY = 0.85;

/** Small map-annotation arrows (icons are drawn at 48px / pixelRatio 2). */
export const FLOOD_ARROW_ICON_SIZE = 0.4;
export const FLOOD_EXIT_ICON_SIZE = 0.55;

/** A path is parcel-relevant within this distance of the parcel ring. */
export const PARCEL_RELEVANCE_BUFFER_M = 15;

/** Hard cap on TOTAL direction arrows — a handful, never a field of them. */
export const MAX_FLOW_ARROWS = 6;

/** Parcel-line candidates the zone fills slide UNDER (first present wins,
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

/**
 * SPARSE static arrows along a surviving flow line: 1 midpoint arrow for
 * short lines, 2 spread along longer (>200 m) lines. Each arrow sits ON the
 * line and points along the CONTAINING segment's bearing (real flow
 * direction, never invented). Small map-annotation style — the global
 * MAX_FLOW_ARROWS cap is applied by the model builder on top of this.
 */
export function flowArrowPoints(line: LngLat[]): FlowArrowPoint[] {
  const { pts, segLens, total } = measureLine(line);
  if (pts.length < 2 || total <= 0) return [];
  const fractions = total > 200 ? [0.3, 0.7] : [0.5];
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

/** Distance in meters from point p to segment a→b (equirectangular local). */
function pointToSegmentMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const meanLat = ((p[1] + a[1] + b[1]) / 3) * (Math.PI / 180);
  const kx = Math.cos(meanLat) * METERS_PER_DEG_LAT;
  const ky = METERS_PER_DEG_LAT;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const vx = (b[0] - a[0]) * kx;
  const vy = (b[1] - a[1]) * ky;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / len2)) : 0;
  return Math.hypot(px - vx * t, py - vy * t);
}

/** 2D segment-segment intersection in lng/lat space (parcel scale). */
function segmentsIntersect(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean {
  const cross = (o: LngLat, p: LngLat, q: LngLat) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * PURE parcel-relevance rule (the operator's ask: "I want to see how it
 * affects the property in question"): a flow path matters when its geometry
 * INTERSECTS the parcel ring, or comes within `bufferM` (~15 m) of it —
 * any vertex inside the ring, any vertex within the buffer of a ring edge,
 * or any path segment crossing a ring edge. Without a usable ring the path
 * is KEPT (relevance is unprovable; honest inclusion over silent dropping).
 * `kind: "exit"` paths are always relevant — the model builder short-circuits
 * them before calling this.
 */
export function isParcelRelevantPath(
  line: LngLat[],
  ring: ReadonlyArray<LngLat> | undefined,
  bufferM: number = PARCEL_RELEVANCE_BUFFER_M,
): boolean {
  const pts = (Array.isArray(line) ? line : []).filter(
    (p) => Array.isArray(p) && isFiniteNum(p[0]) && isFiniteNum(p[1]),
  );
  if (pts.length === 0) return false;
  if (!Array.isArray(ring) || ring.length < 3) return true;
  for (const p of pts) {
    if (pointInRing(p[0], p[1], ring)) return true;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (pointToSegmentMeters(p, ring[j], ring[i]) <= bufferM) return true;
    }
  }
  for (let s = 0; s < pts.length - 1; s++) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentsIntersect(pts[s], pts[s + 1], ring[j], ring[i])) return true;
    }
  }
  return false;
}

/**
 * Every parcel-boundary CROSSING of a path (enter AND exit points): each
 * vertex where inside-ness flips, with the crossing segment's bearing.
 * These are the "one clear arrow where flow crosses the parcel boundary"
 * anchors. No usable ring → no crossings (never invented).
 */
export function ringCrossingPoints(
  line: LngLat[],
  ring: ReadonlyArray<LngLat> | undefined,
): FlowArrowPoint[] {
  const pts = (Array.isArray(line) ? line : []).filter(
    (p) => Array.isArray(p) && isFiniteNum(p[0]) && isFiniteNum(p[1]),
  );
  if (pts.length < 2 || !Array.isArray(ring) || ring.length < 3) return [];
  const out: FlowArrowPoint[] = [];
  let prevIn = pointInRing(pts[0][0], pts[0][1], ring);
  for (let i = 1; i < pts.length; i++) {
    const curIn = pointInRing(pts[i][0], pts[i][1], ring);
    if (curIn !== prevIn) {
      out.push({
        lng: pts[i][0],
        lat: pts[i][1],
        bearingDeg: Math.round(segmentBearingDeg(pts[i - 1], pts[i]) * 10) / 10,
      });
    }
    prevIn = curIn;
  }
  return out;
}

/* ---------------------------- overlay model ---------------------------- */

export interface FloodMapOverlayModel {
  /** kind-tagged vector features: zone / ponding / catchment / flow /
   *  arrow (small along-line) / exit (boundary-crossing) — every branch
   *  feature-detected from the served study, never a placeholder. */
  vectors: FC;
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

interface StudyFlowPathLike {
  coordinates: LngLat[];
  kind: "interior" | "exit";
}

/** Feature-detect + validate the v3 flowPaths entries: at least 2 finite
 *  vertices, kind coerced to the enum. Anything malformed is dropped. */
function validPathLike(entries: unknown): StudyFlowPathLike[] {
  if (!Array.isArray(entries)) return [];
  const out: StudyFlowPathLike[] = [];
  for (const entry of entries) {
    const e = entry as { coordinates?: unknown; kind?: unknown } | null;
    if (!e || !Array.isArray(e.coordinates)) continue;
    const coords = (e.coordinates as unknown[]).filter(
      (p): p is LngLat =>
        Array.isArray(p) && isFiniteNum((p as unknown[])[0]) && isFiniteNum((p as unknown[])[1]),
    );
    if (coords.length < 2) continue;
    out.push({ coordinates: coords, kind: e.kind === "exit" ? "exit" : "interior" });
  }
  return out;
}

/**
 * PURE study → overlay model. Every drawn geometry comes from the served
 * study; an absent layer draws nothing (never a placeholder). honestEmpty
 * studies produce an empty model — the map stays untouched.
 */
export function buildFloodMapOverlayModel(
  study: FloodDrainageStudyView,
): FloodMapOverlayModel {
  if (study.honestEmpty) {
    return { vectors: EMPTY_FC };
  }

  const features: unknown[] = [];

  // DRAINAGE ZONES — light categorical tint, always drawn when served.
  for (const f of fcFeatures(study.drainageZonesGeoJson)) {
    if (f?.geometry) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "zone" },
      });
    }
  }

  // PONDING — the headline class, always drawn when served.
  for (const f of fcFeatures(study.rainfallResultGeoJson ?? null)) {
    if (f?.geometry) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "ponding" },
      });
    }
  }

  // CATCHMENT — the single dashed boundary line.
  for (const f of fcFeatures(study.catchmentGeoJson)) {
    if (f?.geometry) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "catchment" },
      });
    }
  }

  // FLOW — v3 flowPaths when present, else the legacy flowLinesGeoJson
  // traces; EITHER way filtered to the parcel-relevant survivors only.
  const ring = study.parcelRingWgs84;
  const v3Paths = validPathLike(study.flowPaths);
  const candidates: StudyFlowPathLike[] =
    v3Paths.length > 0
      ? v3Paths
      : fcFeatures(study.flowLinesGeoJson).flatMap((f) =>
          lineStringsOf(f?.geometry).map((line) => ({
            coordinates: line,
            kind: "interior" as const,
          })),
        );

  const survivors = candidates.filter(
    (p) => p.kind === "exit" || isParcelRelevantPath(p.coordinates, ring),
  );

  const crossingArrows: FlowArrowPoint[] = [];
  const alongArrows: FlowArrowPoint[] = [];
  for (const path of survivors) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: path.coordinates },
      properties: { kind: "flow" },
    });
    crossingArrows.push(...ringCrossingPoints(path.coordinates, ring));
    alongArrows.push(...flowArrowPoints(path.coordinates));
  }

  // No path-derived boundary crossing → the engine's own flowExits (worker-
  // traced crossings) stand in, so a real exit is never silently dropped.
  if (crossingArrows.length === 0) {
    for (const e of Array.isArray(study.flowExits) ? study.flowExits : []) {
      if (!isFiniteNum(e?.lng) || !isFiniteNum(e?.lat)) continue;
      crossingArrows.push({
        lng: e.lng,
        lat: e.lat,
        bearingDeg: isFiniteNum(e.bearingDeg) ? e.bearingDeg : 0,
      });
    }
  }

  // ARROW CAP: a handful total (≤ MAX_FLOW_ARROWS). Boundary-crossing
  // arrows are the point of the picture — they claim slots first; small
  // along-line arrows fill what remains.
  const crossingsDrawn = crossingArrows.slice(0, MAX_FLOW_ARROWS);
  const alongDrawn = alongArrows.slice(
    0,
    Math.max(0, MAX_FLOW_ARROWS - crossingsDrawn.length),
  );
  for (const a of alongDrawn) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { kind: "arrow", bearing: a.bearingDeg },
    });
  }
  for (const a of crossingsDrawn) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { kind: "exit", bearing: a.bearingDeg },
    });
  }

  return { vectors: { type: "FeatureCollection", features } };
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
 * Rasterize the arrow icon (pointing NORTH) with a baked paper-halo —
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

/* --------------------------- apply / clear ------------------------------ */

/** The insertion anchor for the below-parcels zone fills: the FIRST (in
 *  style order) parcel-tile layer, else the first symbol (label) layer. */
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
  // BELOW the parcels: the categorical zone + ponding fills with their crisp
  // thin outlines — the FEMA-zone visual language.
  if (!map.getLayer(FLOOD_ZONE_FILL_ID)) {
    map.addLayer(
      {
        id: FLOOD_ZONE_FILL_ID,
        type: "fill",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("zone"),
        paint: {
          "fill-color": FLOOD_ZONE_FILL_COLOR,
          "fill-opacity": FLOOD_ZONE_FILL_OPACITY,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(FLOOD_ZONE_LINE_ID)) {
    map.addLayer(
      {
        id: FLOOD_ZONE_LINE_ID,
        type: "line",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("zone"),
        paint: {
          "line-color": FLOOD_ZONE_LINE_COLOR,
          "line-width": FLOOD_ZONE_LINE_WIDTH,
        },
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
          "fill-color": FLOOD_PONDING_FILL_COLOR,
          "fill-opacity": FLOOD_PONDING_FILL_OPACITY,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(FLOOD_PONDING_LINE_ID)) {
    map.addLayer(
      {
        id: FLOOD_PONDING_LINE_ID,
        type: "line",
        source: FLOOD_VECTOR_SOURCE_ID,
        filter: kindIs("ponding"),
        paint: {
          "line-color": FLOOD_PONDING_LINE_COLOR,
          "line-width": FLOOD_PONDING_LINE_WIDTH,
        },
      },
      beforeId,
    );
  }
  // TOP of the stack: catchment dash, flow lines, arrows.
  if (!map.getLayer(FLOOD_CATCHMENT_LINE_ID)) {
    map.addLayer({
      id: FLOOD_CATCHMENT_LINE_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("catchment"),
      layout: { "line-cap": "round", "line-join": "round" },
      // STATIC literal dash — the crash-guard safe channel.
      paint: {
        "line-color": FLOOD_CATCHMENT_LINE_COLOR,
        "line-width": FLOOD_CATCHMENT_LINE_WIDTH,
        "line-dasharray": FLOOD_CATCHMENT_DASH,
      },
    });
  }
  if (!map.getLayer(FLOOD_FLOW_LINE_ID)) {
    map.addLayer({
      id: FLOOD_FLOW_LINE_ID,
      type: "line",
      source: FLOOD_VECTOR_SOURCE_ID,
      filter: kindIs("flow"),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": FLOOD_FLOW_LINE_COLOR,
        "line-width": FLOOD_FLOW_LINE_WIDTH,
        "line-opacity": FLOOD_FLOW_LINE_OPACITY,
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
        "icon-size": FLOOD_ARROW_ICON_SIZE,
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
        "icon-size": FLOOD_EXIT_ICON_SIZE,
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

/**
 * Apply (or refresh) the flood overlay on the live map. Idempotent: an
 * existing vector source gets setData; missing layers are added. No scrim,
 * no dimming of other layers, no raster, no animation — crisp categorical
 * polygons in the FEMA-zone visual language, nothing else touched.
 */
export function applyFloodMapOverlay(
  map: FloodOverlayMapLike,
  model: FloodMapOverlayModel,
): void {
  const beforeId = pickBelowParcelsBeforeId(map);
  try {
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
  }
}

/** Remove every flood-overlay layer + source (icons stay — inert, reusable). */
export function clearFloodMapOverlay(map: FloodOverlayMapLike): void {
  try {
    for (const id of FLOOD_OVERLAY_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(FLOOD_VECTOR_SOURCE_ID)) map.removeSource(FLOOD_VECTOR_SOURCE_ID);
  } catch {
    /* style already torn down; ignore */
  }
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

  const clear = () => {
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
        applyFloodMapOverlay(map, buildFloodMapOverlayModel(study));
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
