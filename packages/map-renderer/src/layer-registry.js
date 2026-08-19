/**
 * V3 — dynamic layer registry + per-app allocation metadata.
 */

import { resolveLayerAllocation, listAllocationKeys } from "./layer-allocation.js";
import { reasoningLayerAwaitingReason } from "./input-gates.js";

/** @typedef {'live'|'awaiting-input'|'fuel-gated'|'fixture'|'pending'|'no-data'} LayerStatus */

/**
 * REACH — a layer's own reachable ceiling, never the 254-county map total.
 *
 * SS-W10 / P-46. A layer control that shows or implies coverage must divide by
 * what its SOURCE can reach, not by Texas. `rrc-wells` reaches 1 county of 254
 * because its source is a Harris-County endpoint mirror; scoring it against 254
 * manufactures 253 statewide holes that are really one source ceiling.
 *
 * `ceiling: null` means UNKNOWN and is rendered as unknown. It is never
 * back-filled with the denominator — an absent probe is not a full one.
 * `asOf` is the timestamp of the measurement, because a ceiling read from a
 * materialized ledger is a claim about that instant and nothing later.
 *
 * @typedef {Object} LayerReach
 * @property {number|null} ceiling   Counties this layer's source can reach; null = no probe.
 * @property {number} denominator    What the ceiling is out of (254 Texas counties).
 * @property {string} basis          Why the ceiling is what it is, quoted from the probe.
 * @property {string} asOf           ISO instant the ceiling was measured.
 */

/**
 * @typedef {Object} LayerRegistryEntry
 * @property {string} key
 * @property {string} label
 * @property {string} group
 * @property {boolean} fixture
 * @property {boolean} live
 * @property {boolean} fuelGated
 * @property {boolean} [pending]
 * @property {boolean} [reasoning]
 * @property {{ input?: 'F2'|'F5'|'F2+F4', description: string }} [inputGate]
 * @property {string} [emptyBasis]   Why this layer draws nothing today. Required
 *   reading for any row whose status resolves to `no-data`: an empty layer must
 *   read as honestly empty, never as a broken one. An absence carries its basis.
 * @property {LayerReach} [reach]    Reachable ceiling; see LayerReach above.
 */

export const LAYER_REGISTRY = [
  { key: "parcel-polygon", label: "GIS Parcel Boundary", group: "parcel", fixture: true, live: true, fuelGated: false },
  { key: "parcel-extrusion", label: "Allowed height (3D)", group: "parcel", fixture: true, live: false, fuelGated: false },
  { key: "zoning", label: "Zoning / land use", group: "regulatory", fixture: true, live: true, fuelGated: true },
  { key: "flood-zone", label: "FEMA flood zone", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "floodway", label: "Regulatory floodway", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "dem-hillshade", label: "3D terrain (TxGIO LiDAR)", group: "terrain", fixture: true, live: true, fuelGated: false },
  { key: "topography-contours", label: "Contours (1 ft / 3DEP)", group: "terrain", fixture: false, live: true, fuelGated: false },
  { key: "hydrography", label: "Hydrography", group: "hydrology", fixture: false, live: true, fuelGated: false },
  // SS-W10 / P-46. The Hauska road-node ROW band. It painted unconditionally
  // until this key existed — `road-overlay.ts` set `visible: true` as a literal
  // with no way to switch it off. Operator, 2026-08-19: "in the map tools i need
  // a way to turn our road nodes on and off and they should probably be
  // defaulted to off for now". OFF-by-default is carried by
  // COLD_OPEN_OFF_BY_DEFAULT on PE and by the parcel-only cold-open set on CC,
  // NOT by this row — a registry row states what a layer IS, not when it shows.
  {
    key: "road-nodes",
    label: "Road nodes (ROW)",
    group: "parcel",
    fixture: false,
    live: true,
    fuelGated: false,
  },
  {
    key: "pedestrian-ways",
    label: "Sidewalks / footpaths",
    group: "parcel",
    fixture: false,
    live: true,
    fuelGated: false,
  },
  // INTERNAL/DEBUG: the derived D8 flow layer is no longer a customer layer
  // (replaced by `hydrography` on browse surfaces); CC may keep it for debug.
  { key: "hydrology-flow", label: "Hydrology flow (D8)", group: "hydrology", fixture: false, live: true, fuelGated: false },
  { key: "buildable-envelope", label: "Buildable envelope", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "constraint-density", label: "Constraint density", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "oz-deal-crossfilter", label: "OZ × deal score", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "motivated-seller", label: "Motivated seller heat", group: "investor", fixture: true, live: false, fuelGated: true },
  // The five rows below resolve to status `no-data`: they carry paint, a stack
  // slot and a role, and NO source. Each states why, so the LAYERS panel can
  // draw them as honestly empty instead of as a checkbox that silently does
  // nothing. Verified 2026-08-19 (SS-W10): no fetch in live-gis.ts, no slot in
  // gis-fixture-data.js, no route under api/ for any of them.
  {
    key: "ssurgo-soils",
    label: "SSURGO soils",
    group: "subsurface",
    fixture: false,
    live: false,
    fuelGated: false,
    emptyBasis: "No source wired in map-renderer — no live fetch and no fixture. Turning this on draws nothing anywhere.",
  },
  {
    key: "groundwater",
    label: "Groundwater (NWIS)",
    group: "subsurface",
    fixture: false,
    live: false,
    fuelGated: false,
    emptyBasis: "No source wired in map-renderer — no live fetch and no fixture. Turning this on draws nothing anywhere.",
  },
  {
    key: "mud-pid",
    label: "MUD/PID districts",
    group: "regulatory",
    fixture: false,
    live: false,
    fuelGated: false,
    emptyBasis: "No source wired in map-renderer — no live fetch and no fixture. Turning this on draws nothing anywhere.",
  },
  {
    key: "edwards-aquifer",
    label: "Edwards Aquifer",
    group: "regulatory",
    fixture: false,
    live: false,
    fuelGated: false,
    emptyBasis: "No source wired in map-renderer — no live fetch and no fixture. Turning this on draws nothing anywhere.",
  },
  // RRC is ONE key over TWO subjects with two different reaches, which is why
  // its ceiling cannot be stated as a single number. Wells reach 1 county of
  // 254 (a Harris-County endpoint mirror, not per-county ingest); pipelines
  // have no capability probe at all, so their ceiling is UNKNOWN rather than
  // large. Splitting this row is proposed, not shipped — see
  // _inbox/2026-08-19_ss-w10_cp1.json in doc_repo. Until an operator ruling
  // lands, the row states its own ignorance rather than implying statewide O&G.
  {
    key: "texas-rrc",
    label: "Texas RRC O&G",
    group: "subsurface",
    fixture: false,
    live: false,
    fuelGated: false,
    emptyBasis: "No source wired in map-renderer — no live fetch and no fixture. Turning this on draws nothing anywhere.",
    reach: {
      ceiling: null,
      denominator: 254,
      basis:
        "One key over two subjects with different ceilings, so no single number is true. RRC wells reach 1 of 254 counties — \"Point layer mirrored from Harris endpoint; not per-county ingest\". RRC pipelines carry \"no capability probe defined for this rail\", so their ceiling is unknown, not 254.",
      asOf: "2026-08-14T17:41:22.500Z",
    },
  },
  { key: "opportunity-zone-tract", label: "Opportunity Zone tract", group: "regulatory", fixture: true, live: true, fuelGated: false },
  { key: "rent-heat", label: "Rent heat (AVM)", group: "investor", fixture: true, live: false, fuelGated: true },
  {
    key: "etj",
    label: "Extraterritorial jurisdiction",
    group: "regulatory",
    fixture: false,
    live: false,
    fuelGated: true,
    pending: true,
    emptyBasis: "Declared pending and fuel-gated — no source wired in map-renderer. Turning this on draws nothing anywhere.",
  },
  {
    key: "consequence-choropleth",
    label: "Consequence choropleth",
    group: "reasoning",
    fixture: true,
    live: false,
    fuelGated: false,
    reasoning: true,
    inputGate: { input: "F2", description: "ASCE 7 risk category + IBC occupancy/importance on code-section atoms" },
  },
  {
    key: "contested-ground",
    label: "Contested ground overlay",
    group: "calibration",
    fixture: true,
    live: false,
    fuelGated: false,
    reasoning: true,
    inputGate: { input: "F5", description: "Raw-conflict log — disagreeing inputs with provenance and vintage" },
  },
  {
    key: "triage-state",
    label: "Triage state",
    group: "calibration",
    fixture: true,
    live: false,
    fuelGated: false,
    reasoning: true,
    inputGate: { input: "F2+F4", description: "Consequence stratum × interval width — verify / human-required" },
  },
  {
    key: "calibrated-accuracy",
    label: "Calibrated accuracy",
    group: "calibration",
    fixture: false,
    live: false,
    fuelGated: true,
    inputGate: { description: "Fuel-gated — awaits M1 + X (Wave 3+, not Wave 2)" },
  },
  {
    key: "development-pulse",
    label: "Development pulse",
    group: "investor",
    fixture: false,
    live: false,
    fuelGated: true,
    inputGate: { description: "Fuel-gated — awaits X3 (not Wave 2)" },
  },
];

/** Spine console default — Phase 0A cold-open: parcel line-only (zoning OFF). */
export const DEFAULT_VISIBLE_LAYERS = new Set([
  "parcel-polygon",
]);

export function registryEntry(key) {
  return LAYER_REGISTRY.find((l) => l.key === key);
}

/** Operator toggles — sync legend when a layer is disabled in E3. */
const disabledLayerKeys = new Set();

export function setLayerDisabled(key, disabled) {
  if (disabled) disabledLayerKeys.add(key);
  else disabledLayerKeys.delete(key);
}

export function isLayerDisabled(key) {
  return disabledLayerKeys.has(key);
}

/**
 * SS-W10 / P-46. Statuses at which a layer draws nothing, so its row must read
 * as honestly empty. `no-data` and `pending` both mean "the checkbox works and
 * the map stays blank"; a user cannot tell those apart from a broken layer
 * without being told. `fuel-gated` is deliberately NOT here — those two rows
 * already carry their own inputGate copy.
 */
const DRAWS_NOTHING_STATUSES = new Set(["no-data", "pending"]);

/**
 * The reason a layer draws nothing, or null when it draws something.
 *
 * An empty result is not an absence: this returns a basis only for a POSITIVE
 * determination that the layer has no source, taken from the registry row
 * itself. A row that resolves to a drawing status returns null even if it
 * carries an `emptyBasis`, and a non-drawing row with no declared basis returns
 * a generic-but-true statement rather than silence.
 *
 * @param {string} key
 * @param {import('./input-gates.js').InputGateState} [gates]
 * @returns {string|null}
 */
export function layerEmptyBasis(key, gates = null) {
  const entry = registryEntry(key);
  if (!entry) return null;
  const status = gates
    ? layerStatusForGates(gates, key)
    : entry.pending
      ? "pending"
      : entry.fixture
        ? "fixture"
        : entry.live
          ? "live"
          : entry.fuelGated
            ? "fuel-gated"
            : "no-data";
  if (!DRAWS_NOTHING_STATUSES.has(status)) return null;
  return entry.emptyBasis ?? "No source wired for this layer — it draws nothing.";
}

/**
 * The layer's reachable ceiling, or null when the registry declares none.
 *
 * Callers MUST render `ceiling: null` as unknown. Substituting the denominator
 * for a missing ceiling is the failure this field exists to prevent: it turns
 * "nobody measured" into "reaches everywhere".
 *
 * @param {string} key
 * @returns {import('./layer-registry.js').LayerReach|null}
 */
export function layerReach(key) {
  return registryEntry(key)?.reach ?? null;
}

/**
 * One-line reach sentence for a layer row, or null when the registry declares
 * no reach. Always carries the denominator and the measurement instant, per
 * DEV_PROCESS 1.1 and 1.2 — a coverage figure travels with its counting rule at
 * the point of use, never in an appendix.
 *
 * @param {string} key
 * @returns {string|null}
 */
export function layerReachSummary(key) {
  const reach = layerReach(key);
  if (!reach) return null;
  const asOfDay = String(reach.asOf).slice(0, 10);
  const head =
    reach.ceiling === null
      ? `Reach unknown of ${reach.denominator} counties`
      : `Reaches ${reach.ceiling} of ${reach.denominator} counties`;
  return `${head} (as of ${asOfDay}): ${reach.basis}`;
}

export function productSurfaceForLayer(entry) {
  const byGroup = {
    parcel: "map",
    regulatory: "map",
    hazard: "map",
    terrain: "map",
    hydrology: "map",
    subsurface: "map",
    reasoning: "reporting",
    calibration: "reporting",
    investor: "reporting",
  };
  return byGroup[entry.group] || "map";
}

export function stylingForLayer(key) {
  return {
    encodes: legendEncodes(key),
    colorScale: legendColorScale(key),
  };
}

function legendColorScale(key) {
  const scales = {
    "parcel-polygon": "land-use choropleth (width → saturation)",
    "flood-zone": "NFHL zone class ramp",
    "rent-heat": "AVM intensity (fire ramp)",
    "consequence-choropleth": "routine → essential stratum",
    "contested-ground": "disagreement highlight",
    "triage-state": "verify / human-required",
  };
  return scales[key] || "GIS default";
}

/**
 * @param {import('../lib/input-gates.js').InputGateState} gates
 * @param {string} key
 * @returns {LayerStatus}
 */
export function layerStatusForGates(gates, key) {
  if (isLayerDisabled(key)) return "disabled";
  const entry = registryEntry(key);
  if (!entry) return "no-data";
  if (entry.pending) return "pending";
  if (entry.fuelGated && (key === "calibrated-accuracy" || key === "development-pulse")) {
    return "fuel-gated";
  }
  if (entry.reasoning) {
    const awaiting = reasoningLayerAwaitingReason(key, gates);
    return awaiting ? "awaiting-input" : entry.fixture ? "fixture" : "live";
  }
  if (entry.fixture) return "fixture";
  if (entry.live) return "live";
  return "no-data";
}

export function visibleLayersForAllocation(appId, reportType, tier = "pro") {
  const alloc = resolveLayerAllocation({ appId, reportType, tier });
  return new Set(alloc.defaultOn);
}

export function legendEntriesForRegistry(_visibleKeys = null, gates = null) {
  return LAYER_REGISTRY.map((l) => {
    const status = gates ? layerStatusForGates(gates, l.key) : l.pending ? "pending" : l.fixture ? "fixture" : l.live ? "live" : l.fuelGated ? "fuel-gated" : "no-data";
    return {
      key: l.key,
      label: l.label,
      group: l.group,
      productSurface: productSurfaceForLayer(l),
      status,
      encodes: legendEncodes(l.key),
      colorScale: legendColorScale(l.key),
      awaiting: gates ? reasoningLayerAwaitingReason(l.key, gates) : null,
    };
  });
}

function legendEncodes(key) {
  const map = {
    "parcel-polygon": "Assessor parcel polygon; land-use choropleth with width-as-saturation",
    "flood-zone": "FEMA NFHL zone class",
    "rent-heat": "Rent AVM intensity (fixture fire ramp)",
    "dem-hillshade": "3D terrain from TxGIO LiDAR (1:1 scale). Downtown floodplain relief is subtle (~6 m); tilt + pan west toward the Colorado River for bluff depth. Hillshade accentuates relief without changing elevation data.",
    "topography-contours": "Live elevation contours from the engine topography-1ft slot. Inside the Bastrop County footprint the AUTHORITATIVE 1-ft LiDAR contours are served; everywhere else an honest 3DEP-derived fallback. The map chip labels the TRUE tier served for the current viewport (1-ft in Bastrop, 3DEP elsewhere) — never a static claim.",
    hydrography: "Real county-mapped streams from the engine hydrography slot — the county's own GIS hydrography source, with provenance (source, layer name, vintage) on the layer row. Where the county has no configured source, or the slot is not yet served, the layer is honestly unavailable — never a derived squiggle.",
    "opportunity-zone-tract": "IRS §1400Z designated Opportunity Zone census tracts (Texas) — statewide CDFI Fund pockets at a glance, full-detail Census TIGER/Line 2010 tract polygons when zoomed in. Every rendered tract carries designation + geometry source and vintage on its properties.",
    "hydrology-flow": "Live D8 flow channels from the engine hydrology-flow slot — a real flow-accumulation over the viewport 3DEP DEM, emitting channels above the accumulation threshold. On flat terrain / no channels / DEM void it is honest-empty (draws nothing, with the reason on the chip) — never a synthetic meander.",
    "parcel-extrusion": "Allowed build height extrusion (ft)",
    zoning: "Municipal zoning / land-use code",
    "consequence-choropleth": "ASCE/IBC consequence stratum — routine / elevated / critical / essential",
    "contested-ground": "Layers disagree — hydrology D8 vs FEMA headline case",
    "triage-state": "Thin interval width × high consequence → verify or human-required",
    "calibrated-accuracy": "Fuel-gated — asserted-with-provenance until M1 thickening (not Wave 2)",
    "development-pulse": "Fuel-gated — permit/inspection pulse (not Wave 2)",
  };
  return map[key] || "GIS layer — read-contract required on envelope";
}

export { resolveLayerAllocation, listAllocationKeys };
