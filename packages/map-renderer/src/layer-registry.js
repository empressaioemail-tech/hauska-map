/**
 * V3 — dynamic layer registry + per-app allocation metadata.
 */

import { resolveLayerAllocation, listAllocationKeys } from "./layer-allocation.js";
import { reasoningLayerAwaitingReason } from "./input-gates.js";

/** @typedef {'live'|'awaiting-input'|'fuel-gated'|'fixture'|'pending'|'no-data'} LayerStatus */

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
 */

export const LAYER_REGISTRY = [
  { key: "parcel-polygon", label: "Parcel boundary", group: "parcel", fixture: true, live: true, fuelGated: false },
  { key: "parcel-extrusion", label: "Allowed height (3D)", group: "parcel", fixture: true, live: false, fuelGated: false },
  { key: "zoning", label: "Zoning / land use", group: "regulatory", fixture: true, live: true, fuelGated: true },
  { key: "flood-zone", label: "FEMA flood zone", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "floodway", label: "Regulatory floodway", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "dem-hillshade", label: "Hillshade relief", group: "terrain", fixture: true, live: false, fuelGated: false },
  { key: "topography-contours", label: "5 m contours", group: "terrain", fixture: true, live: true, fuelGated: false },
  { key: "hydrology-flow", label: "Hydrology flow (D8)", group: "hydrology", fixture: true, live: false, fuelGated: false },
  { key: "buildable-envelope", label: "Buildable envelope", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "constraint-density", label: "Constraint density", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "oz-deal-crossfilter", label: "OZ × deal score", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "motivated-seller", label: "Motivated seller heat", group: "investor", fixture: true, live: false, fuelGated: true },
  { key: "ssurgo-soils", label: "SSURGO soils", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "groundwater", label: "Groundwater (NWIS)", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "mud-pid", label: "MUD/PID districts", group: "regulatory", fixture: false, live: false, fuelGated: false },
  { key: "edwards-aquifer", label: "Edwards Aquifer", group: "regulatory", fixture: false, live: false, fuelGated: false },
  { key: "texas-rrc", label: "Texas RRC O&G", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "opportunity-zone-tract", label: "Opportunity Zone tract", group: "regulatory", fixture: true, live: true, fuelGated: false },
  { key: "rent-heat", label: "Rent heat (AVM)", group: "investor", fixture: true, live: false, fuelGated: true },
  { key: "etj", label: "Extraterritorial jurisdiction", group: "regulatory", fixture: false, live: false, fuelGated: true, pending: true },
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

/** Spine console default — cortex site-context + reasoning when inputs live. */
export const DEFAULT_VISIBLE_LAYERS = new Set([
  "parcel-polygon",
  "flood-zone",
  "dem-hillshade",
  "topography-contours",
  "hydrology-flow",
  "rent-heat",
  "zoning",
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
    "dem-hillshade": "Synthetic DEM relief under data",
    "topography-contours": "5 m elevation contours from fixture DEM",
    "hydrology-flow": "D8-style flow channels (fixture)",
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
