/**
 * Layer-role taxonomy + channel budget (Phase 0A / T-H01).
 *
 * Canonical paint authority for hauska-map. Every map layer is assigned
 * exactly one role. Roles own reserved hues and opacity budgets so layers
 * cannot wash each other out. Consumers MUST read from this module — inline
 * role hues are how the pre-0A collisions happened.
 *
 * Roles:
 *   GROUND      — basemap / satellite. Position only. Desaturated, low opacity.
 *   CONTEXT     — FEMA, topo, hydro, roads, ROW, flood-study. Line/dash/hatch;
 *                 one muted hue each; NO saturated area fill.
 *   DATA        — land-use choropleth, rent-heat, constraint density. Full
 *                 categorical hue + area fill. NEVER on by default. At most
 *                 ONE visible at a time; turning one on dims Context.
 *   SUBJECT     — inspected parcel, buildable envelope, envelope volume.
 *                 RESERVED AMBER. Full saturation. Highest z. Nothing else.
 *   INTERACTION — hover / search / glow. RESERVED CYAN. Transient only.
 */

import {
  DATA_LAND_USE_COLORS as LAND_USE_PALETTE,
  LAND_USE_LEGEND,
} from "./land-use-classes.js";
import {
  CONTEXT_FEMA_ZONES,
  FEMA_LEGEND,
  femaZoneFillColorExpr,
  femaZoneFillOpacityExpr,
  femaZoneLineColorExpr,
  femaZoneLineWidthExpr,
} from "./fema-zones.js";

/** @typedef {'GROUND'|'CONTEXT'|'DATA'|'SUBJECT'|'INTERACTION'} LayerRole */

/** Reserved SUBJECT amber — buildable envelope + subject parcel only. */
export const SUBJECT_AMBER = "#f2a23c";
export const SUBJECT_AMBER_LINE = "#f2a23c";
export const SUBJECT_AMBER_BRIGHT = "#ffe14d";
export const SUBJECT_AMBER_SOFT = "#fff2b0";

/** Reserved INTERACTION cyan — hover / search / transient glow only. */
export const INTERACTION_CYAN = "#7dd3fc";

/**
 * CONTEXT flood-study slate-teal family (NOT amber — amber is SUBJECT;
 * NOT FEMA blue — FEMA keeps its own muted blue).
 */
export const CONTEXT_FLOOD_TEAL = {
  low: "#8ebfc9",
  med: "#4f8f9e",
  high: "#2a5f6d",
  pondingFill: "#1a4552",
  pondingRim: "#0d2a33",
  line: "#2a5f6d",
};

/**
 * CONTEXT FEMA — the full NFHL zone set. The zone table, the classifier and the
 * legend live in `fema-zones.js`; this constant is the taxonomy-facing view of
 * it, kept so existing consumers (live-gis.ts, gis-map-paint.js) keep compiling
 * against one authority rather than two.
 *
 * The ramp keys real NFHL fields ONLY — FLD_ZONE, ZONE_SUBTY and SFHA_TF, all
 * three verified present on every feature of a live 204-feature Bastrop probe
 * (2026-08-18). No proximity heuristics, no invented darkness. Every opacity
 * stays at or below CONTEXT fillOpacityMax, and minimal-hazard land carries no
 * fill at all so that in-versus-out reads at a glance.
 */
export const CONTEXT_FEMA = {
  /** Solid hues; opacity is applied via fill-opacity (do not double-alpha). */
  fillFloodway: CONTEXT_FEMA_ZONES.floodway.fill,
  fillAe: CONTEXT_FEMA_ZONES.sfhaBfe.fill,
  fillX: CONTEXT_FEMA_ZONES.shadedX.fill,
  fillOpacityFloodway: CONTEXT_FEMA_ZONES.floodway.fillOpacity,
  fillOpacityAe: CONTEXT_FEMA_ZONES.sfhaBfe.fillOpacity,
  fillOpacityX: CONTEXT_FEMA_ZONES.shadedX.fillOpacity,
  line: CONTEXT_FEMA_ZONES.sfhaBfe.line,
  lineWidth: CONTEXT_FEMA_ZONES.sfhaBfe.lineWidth,
  legendAe: CONTEXT_FEMA_ZONES.sfhaBfe.fill,
  legendX: CONTEXT_FEMA_ZONES.shadedX.fill,
  legendFloodway: CONTEXT_FEMA_ZONES.floodway.fill,
  legendStrokeAe: CONTEXT_FEMA_ZONES.sfhaBfe.line,
  legendStrokeX: CONTEXT_FEMA_ZONES.shadedX.line,
  legendStrokeFloodway: CONTEXT_FEMA_ZONES.floodway.line,
  /** The full nine-class table + its legend rows. */
  zones: CONTEXT_FEMA_ZONES,
  legend: FEMA_LEGEND,
};

/**
 * True when NFHL marks the feature as floodway (FLD_ZONE or ZONE_SUBTY).
 * Uses only published FEMA attributes — no geometry heuristics.
 */
export function femaNfhlIsFloodwayExpr() {
  return [
    "any",
    ["==", ["get", "FLD_ZONE"], "FLOODWAY"],
    [
      "in",
      "FLOODWAY",
      ["upcase", ["to-string", ["coalesce", ["get", "ZONE_SUBTY"], ""]]],
    ],
  ];
}

/**
 * Live FEMA fill-color across the FULL zone set.
 *
 * Previously this matched only `X` and `X500` and sent everything else to the
 * one mid-blue, so a 204-feature Bastrop viewport carrying six distinct real
 * classes rendered as three colours — and the 0.2% shaded-X band (86 features)
 * was painted identically to the minimal-hazard band (36 features), which is why
 * "in" and "out" could not be told apart. It also defaulted unrecognised zones
 * to the 100-year fill, over-claiming hazard. Both are fixed in `fema-zones.js`.
 */
export function femaNfhlFillColorExpr() {
  return femaZoneFillColorExpr();
}

/** Live FEMA fill-opacity companion. Minimal-hazard resolves to 0 (no fill). */
export function femaNfhlFillOpacityExpr() {
  return femaZoneFillOpacityExpr();
}

/** Live FEMA line colour — the identity channel that survives over imagery. */
export function femaNfhlLineColorExpr() {
  return femaZoneLineColorExpr();
}

/** Live FEMA line width, severity-weighted (floodway widest). */
export function femaNfhlLineWidthExpr() {
  return femaZoneLineWidthExpr();
}

/** CONTEXT parcel boundary (line-only cold-open) — muted slate, never cyan. */
export const CONTEXT_PARCEL_LINE = "#8a9aab";
export const CONTEXT_PARCEL_FILL_NEUTRAL = "#9ec9e8";

/** CONTEXT roads / ROW — gradient band only (no edge/centerline wireframe). */
export const CONTEXT_ROAD = "#6b7280";
export const CONTEXT_ROAD_BAND = "#9ca3af";
export const CONTEXT_ROAD_EDGE = "#4b5563";
/**
 * CONTEXT pedestrian ways (footway/path/cycleway/…) — brighter blue dots,
 * NOT road grey and NOT INTERACTION cyan. Stronger presence on aerial
 * (wider line/opacity budget; dotted dasharray, not solid/dash strokes).
 * Must stay off SUBJECT amber and INTERACTION cyan.
 */
export const CONTEXT_PEDESTRIAN = {
  /** Brighter blue for aerial/dark basemap contrast (distinct from interaction cyan). */
  line: "#8fd0ff",
  lineOpacityMax: 0.9,
  lineWidthMax: 4.5,
  /** Dot pattern (short on / longer gap) — not a dash stroke. */
  lineDasharray: Object.freeze([0.8, 1.2]),
};
export const CONTEXT_HYDROGRAPHY = "#5b7c8a";
export const CONTEXT_TOPO = "#7a6f5f";

/**
 * DATA land-use categorical palette (full hue; off by default).
 *
 * Defined in `land-use-classes.js` alongside the classifier it paints, and
 * re-exported here so this file stays the single paint authority consumers read
 * from. The previous inline palette broke this file's own reserved-hue rule
 * twice — measured on 2026-08-18, `multiFamily` #3f8efc sat 3.2 OKLab ΔE from
 * the FEMA 100-year fill and `commercial` #ff8c1a sat 4.9 ΔE from SUBJECT amber,
 * against a normal-vision floor of 15.
 */
export const DATA_LAND_USE_COLORS = LAND_USE_PALETTE;

/**
 * Opacity / channel budgets per role.
 * Context fill MUST stay ≤ fillOpacityMax (the wash-out kill).
 */
export const ROLE_BUDGET = Object.freeze({
  GROUND: Object.freeze({
    basemapOpacity: 0.48,
    basemapSaturation: -0.55,
    satelliteOpacity: 0.55,
    permitted: Object.freeze(["low-opacity", "desaturated"]),
    forbidden: Object.freeze(["saturated-hue", "categorical-fill"]),
  }),
  CONTEXT: Object.freeze({
    fillOpacityMax: 0.2,
    lineOpacity: 0.9,
    /** When any DATA layer is visible, multiply Context paint by this. */
    dimWhenDataVisible: 0.45,
    permitted: Object.freeze(["line", "dash", "hatch", "texture", "muted-hue"]),
    forbidden: Object.freeze(["saturated-area-fill", "subject-amber", "interaction-cyan"]),
  }),
  DATA: Object.freeze({
    baseFillOpacity: 0.22,
    inspectedFillOpacity: 0.4,
    /** Subject selection uses SUBJECT role paint, not boosted choropleth. */
    subjectUsesSubjectRole: true,
    defaultVisible: false,
    mutex: true,
    permitted: Object.freeze(["categorical-hue", "area-fill"]),
    forbidden: Object.freeze(["default-on", "simultaneous-with-other-data"]),
  }),
  SUBJECT: Object.freeze({
    fillOpacity: 0.12,
    fillOpacityStrong: 0.55,
    lineWidth: 2.2,
    reservedHue: SUBJECT_AMBER,
    permitted: Object.freeze(["amber", "full-saturation", "highest-z"]),
    forbidden: Object.freeze(["use-by-other-roles"]),
  }),
  INTERACTION: Object.freeze({
    reservedHue: INTERACTION_CYAN,
    fillOpacity: 0.18,
    lineWidth: 2,
    permitted: Object.freeze(["cyan", "transient"]),
    forbidden: Object.freeze(["persist-past-interaction"]),
  }),
});

/**
 * Every map layer key → exactly one role.
 * Keys cover LAYER_REGISTRY + PE overlay keys + live overlay keys.
 */
export const LAYER_ROLE_BY_KEY = Object.freeze({
  // GROUND
  basemap: "GROUND",
  satellite: "GROUND",
  "hauska-basemap": "GROUND",

  // CONTEXT
  "flood-zone": "CONTEXT",
  floodway: "CONTEXT",
  "parcel-polygon": "CONTEXT",
  "topography-contours": "CONTEXT",
  "dem-hillshade": "CONTEXT",
  "hydrology-flow": "CONTEXT",
  hydrography: "CONTEXT",
  etj: "CONTEXT",
  groundwater: "CONTEXT",
  "mud-pid": "CONTEXT",
  "edwards-aquifer": "CONTEXT",
  "texas-rrc": "CONTEXT",
  "pe-flood-zone-fill": "CONTEXT",
  "pe-flood-ponding-fill": "CONTEXT",
  "pe-flood-ponding-line": "CONTEXT",
  "pe-flood-catchment-line": "CONTEXT",
  "pe-flood-flow-line": "CONTEXT",
  "pe-flood-arrows": "CONTEXT",
  "pe-flood-exit-arrows": "CONTEXT",
  "live-fema": "CONTEXT",
  "live-parcels": "CONTEXT",
  "live-topography": "CONTEXT",
  "live-hydrography": "CONTEXT",
  "road-centerline": "CONTEXT",
  "road-band": "CONTEXT",
  "road-node-row-band": "CONTEXT",
  "road-node-pedestrian": "CONTEXT",
  // SS-W10 / P-46 — LAYERS-panel toggle key for the road-node ROW band.
  // CONTEXT like every other road key: line paint, muted hue, never a fill.
  "road-nodes": "CONTEXT",
  "pedestrian-ways": "CONTEXT",
  row: "CONTEXT",

  // DATA
  zoning: "DATA",
  "rent-heat": "DATA",
  "consequence-choropleth": "DATA",
  "contested-ground": "DATA",
  "triage-state": "DATA",

  // SUBJECT
  "buildable-envelope": "SUBJECT",
  "buildable-envelope-setback": "SUBJECT",
  "parcel-subject": "SUBJECT",
  "parcel-inspected": "SUBJECT",

  // INTERACTION
  "search-street-highlight": "INTERACTION",
  "parcel-glow": "INTERACTION",
  "hover-highlight": "INTERACTION",
  measure: "INTERACTION",
  draw: "INTERACTION",
});

/** Layer keys that are DATA-role (mutex set). */
export const DATA_LAYER_KEYS = Object.freeze(
  Object.entries(LAYER_ROLE_BY_KEY)
    .filter(([, role]) => role === "DATA")
    .map(([key]) => key),
);

/**
 * Full role catalog — palette + budget + channel rules in one export.
 * This is the constant the brief's DoD refers to.
 */
export const LAYER_ROLE_TAXONOMY = Object.freeze({
  GROUND: Object.freeze({
    role: "GROUND",
    budget: ROLE_BUDGET.GROUND,
    paint: Object.freeze({
      basemapOpacity: ROLE_BUDGET.GROUND.basemapOpacity,
      basemapSaturation: ROLE_BUDGET.GROUND.basemapSaturation,
      satelliteOpacity: ROLE_BUDGET.GROUND.satelliteOpacity,
    }),
  }),
  CONTEXT: Object.freeze({
    role: "CONTEXT",
    budget: ROLE_BUDGET.CONTEXT,
    paint: Object.freeze({
      fema: CONTEXT_FEMA,
      floodStudy: CONTEXT_FLOOD_TEAL,
      parcelLine: CONTEXT_PARCEL_LINE,
      parcelFillNeutral: CONTEXT_PARCEL_FILL_NEUTRAL,
      road: CONTEXT_ROAD,
      roadBand: CONTEXT_ROAD_BAND,
      roadEdge: CONTEXT_ROAD_EDGE,
      pedestrian: CONTEXT_PEDESTRIAN,
      hydrography: CONTEXT_HYDROGRAPHY,
      topo: CONTEXT_TOPO,
      fillOpacityMax: ROLE_BUDGET.CONTEXT.fillOpacityMax,
      dimWhenDataVisible: ROLE_BUDGET.CONTEXT.dimWhenDataVisible,
    }),
  }),
  DATA: Object.freeze({
    role: "DATA",
    budget: ROLE_BUDGET.DATA,
    paint: Object.freeze({
      landUse: DATA_LAND_USE_COLORS,
      landUseLegend: LAND_USE_LEGEND,
      baseFillOpacity: ROLE_BUDGET.DATA.baseFillOpacity,
      inspectedFillOpacity: ROLE_BUDGET.DATA.inspectedFillOpacity,
    }),
  }),
  SUBJECT: Object.freeze({
    role: "SUBJECT",
    budget: ROLE_BUDGET.SUBJECT,
    paint: Object.freeze({
      amber: SUBJECT_AMBER,
      amberLine: SUBJECT_AMBER_LINE,
      amberBright: SUBJECT_AMBER_BRIGHT,
      amberSoft: SUBJECT_AMBER_SOFT,
      fillOpacity: ROLE_BUDGET.SUBJECT.fillOpacity,
      fillOpacityStrong: ROLE_BUDGET.SUBJECT.fillOpacityStrong,
      lineWidth: ROLE_BUDGET.SUBJECT.lineWidth,
    }),
  }),
  INTERACTION: Object.freeze({
    role: "INTERACTION",
    budget: ROLE_BUDGET.INTERACTION,
    paint: Object.freeze({
      cyan: INTERACTION_CYAN,
      fillOpacity: ROLE_BUDGET.INTERACTION.fillOpacity,
      lineWidth: ROLE_BUDGET.INTERACTION.lineWidth,
    }),
  }),
  byKey: LAYER_ROLE_BY_KEY,
  dataKeys: DATA_LAYER_KEYS,
});

/** @param {string} layerKey */
export function roleForLayer(layerKey) {
  return LAYER_ROLE_BY_KEY[layerKey] ?? null;
}

/**
 * Assert / enforce: at most one DATA layer in a visible set.
 * If multiple are present, keep `prefer` when provided, else the first in
 * DATA_LAYER_KEYS order; drop the rest.
 *
 * @param {Iterable<string>} visible
 * @param {string} [prefer]
 * @returns {Set<string>}
 */
export function enforceDataLayerMutex(visible, prefer) {
  const next = new Set(visible);
  const present = DATA_LAYER_KEYS.filter((k) => next.has(k));
  if (present.length <= 1) return next;
  const keep =
    prefer && present.includes(prefer) ? prefer : present[0];
  for (const k of present) {
    if (k !== keep) next.delete(k);
  }
  return next;
}

/**
 * True iff the visible set has more than one DATA layer (mutex violation).
 * @param {Iterable<string>} visible
 */
export function hasDataLayerMutexViolation(visible) {
  const set = visible instanceof Set ? visible : new Set(visible);
  return DATA_LAYER_KEYS.filter((k) => set.has(k)).length > 1;
}

/** True when any DATA layer is visible (Context should dim). */
export function isDataLayerVisible(visible) {
  const set = visible instanceof Set ? visible : new Set(visible);
  return DATA_LAYER_KEYS.some((k) => set.has(k));
}

/**
 * Context fill opacity capped to the role budget, optionally dimmed when
 * a Data layer is on.
 * @param {number} requested
 * @param {boolean} [dataVisible]
 */
export function contextFillOpacity(requested, dataVisible = false) {
  const capped = Math.min(requested, ROLE_BUDGET.CONTEXT.fillOpacityMax);
  return dataVisible ? capped * ROLE_BUDGET.CONTEXT.dimWhenDataVisible : capped;
}

/**
 * Named progressive-disclosure presets (T-H03).
 * Each activates 2–3 coherent layers; cold-open is parcel line-only.
 */
export const MAP_LAYER_PRESETS = Object.freeze({
  Default: Object.freeze(["parcel-polygon"]),
  Flood: Object.freeze(["parcel-polygon", "flood-zone", "hydrography"]),
  Entitlement: Object.freeze(["parcel-polygon", "zoning"]),
  Terrain: Object.freeze(["parcel-polygon", "topography-contours"]),
});

/** Cold-open visible set — basemap (always) + parcel line-only. */
export const COLD_OPEN_VISIBLE_LAYERS = Object.freeze(["parcel-polygon"]);
