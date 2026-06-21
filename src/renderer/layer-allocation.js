/**
 * V3 — per-app layer allocation config.
 * Seeded from cc-agent-R Wave 1 binding table (endstate D §5).
 */

/** @typedef {'cortex'|'radar'|'brief'|'smartcity-os'|'codex-reviewer'} AppId */
/** @typedef {'property-brief'|'site-context'|'hydrology'|'codex-plan-review'|'cortex-deliverable-site-bound'|'radar-baseline'|'radar-cotality'|'cotality-property-intel'|'subsurface'|'precedence-jurisdiction'|'plan-set-locator'} ReportType */

/**
 * @typedef {Object} LayerAllocation
 * @property {string[]} visibleLayers
 * @property {string[]} defaultOn
 * @property {string[]} fuelGated
 * @property {{ contestedGround?: boolean, triage?: boolean, consequenceChoropleth?: boolean }} reasoningOverlays
 * @property {{ aspectRatio: '16/9'|'4/3'|'auto', minHeightPx: number }} layout
 */

const REASONING = {
  consequence: "consequence-choropleth",
  contested: "contested-ground",
  triage: "triage-state",
};

/** Registry keys used in allocation rows (short aliases → registry keys). */
const ALIAS = {
  parcel: "parcel-polygon",
  flood: "flood-zone",
  contours: "topography-contours",
  "D8 flow": "hydrology-flow",
  "D8": "hydrology-flow",
  "flood depth": "flood-zone",
  "national heat": "rent-heat",
  "national baseline": "rent-heat",
  "area heat": "rent-heat",
  "municipal overlay": "zoning",
  "site locator": "parcel-polygon",
  "zoning/setback": "zoning",
  "finding pins": "parcel-polygon",
  EJ: "zoning",
  consequence: REASONING.consequence,
  triage: REASONING.triage,
  contested: REASONING.contested,
};

function expandKeys(keys) {
  return keys.map((k) => ALIAS[k] || k);
}

/** @type {Record<string, LayerAllocation>} */
export const LAYER_ALLOCATIONS = {
  "cortex:property-brief": {
    visibleLayers: expandKeys([
      "parcel",
      "zoning",
      "flood",
      "consequence",
      "triage",
      "contested",
    ]),
    defaultOn: expandKeys(["parcel", "flood", "consequence", "triage"]),
    fuelGated: ["rent-heat", "calibrated-accuracy"],
    reasoningOverlays: { consequenceChoropleth: true, triage: true, contestedGround: true },
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "cortex:site-context": {
    visibleLayers: expandKeys(["flood", "contours", "EJ", "parcel"]),
    defaultOn: expandKeys(["flood", "contours", "parcel"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "cortex:hydrology": {
    visibleLayers: expandKeys(["D8 flow", "flood depth", "contours", "contested"]),
    defaultOn: expandKeys(["D8 flow", "flood depth", "contours", "contested"]),
    fuelGated: [],
    reasoningOverlays: { contestedGround: true },
    layout: { aspectRatio: "4/3", minHeightPx: 360 },
  },
  "cortex:codex-plan-review": {
    visibleLayers: expandKeys(["site locator", "zoning/setback", "finding pins"]),
    defaultOn: expandKeys(["site locator", "zoning/setback"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "cortex:cortex-deliverable-site-bound": {
    visibleLayers: expandKeys(["flood", "contours", "parcel"]),
    defaultOn: expandKeys(["flood", "parcel"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "radar:radar-baseline": {
    visibleLayers: expandKeys(["national baseline", "area heat"]),
    defaultOn: expandKeys(["national baseline"]),
    fuelGated: ["rent-heat"],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "radar:property-brief": {
    visibleLayers: expandKeys(["parcel", "flood", "national heat"]),
    defaultOn: expandKeys(["parcel", "flood"]),
    fuelGated: ["rent-heat"],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "brief:property-brief": {
    visibleLayers: expandKeys(["parcel", "zoning", "flood", "consequence", "triage", "contested"]),
    defaultOn: expandKeys(["parcel", "flood", "consequence"]),
    fuelGated: ["rent-heat"],
    reasoningOverlays: { consequenceChoropleth: true, triage: true, contestedGround: true },
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "brief:site-context": {
    visibleLayers: expandKeys(["flood", "parcel", "contours"]),
    defaultOn: expandKeys(["flood", "parcel"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "brief:hydrology": {
    visibleLayers: expandKeys(["D8", "flood"]),
    defaultOn: expandKeys(["D8", "flood"]),
    fuelGated: [],
    reasoningOverlays: { contestedGround: true },
    layout: { aspectRatio: "4/3", minHeightPx: 360 },
  },
  "smartcity-os:property-brief": {
    visibleLayers: expandKeys(["parcel", "flood", "municipal overlay"]),
    defaultOn: expandKeys(["parcel", "flood"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "smartcity-os:site-context": {
    visibleLayers: expandKeys(["flood", "parcel"]),
    defaultOn: expandKeys(["flood", "parcel"]),
    fuelGated: [],
    reasoningOverlays: {},
    layout: { aspectRatio: "16/9", minHeightPx: 320 },
  },
  "smartcity-os:hydrology": {
    visibleLayers: expandKeys(["D8", "flood"]),
    defaultOn: expandKeys(["D8", "flood"]),
    fuelGated: [],
    reasoningOverlays: { contestedGround: true },
    layout: { aspectRatio: "4/3", minHeightPx: 360 },
  },
};

/**
 * Resolve allocation for (appId, reportType).
 * @param {{ appId: AppId, reportType: ReportType, tier?: 'free'|'pro'|'max', allocationKey?: string }} input
 * @returns {LayerAllocation}
 */
export function resolveLayerAllocation(input) {
  const key = input.allocationKey || `${input.appId}:${input.reportType}`;
  const base = LAYER_ALLOCATIONS[key];
  if (!base) {
    return {
      visibleLayers: ["parcel-polygon", "flood-zone"],
      defaultOn: ["parcel-polygon", "flood-zone"],
      fuelGated: [],
      reasoningOverlays: {},
      layout: { aspectRatio: "16/9", minHeightPx: 320 },
    };
  }
  const tier = input.tier || "free";
  const fuelGated = [...base.fuelGated];
  let defaultOn = [...base.defaultOn];
  if (tier === "free") {
    defaultOn = defaultOn.filter((k) => !fuelGated.includes(k));
  }
  return {
    ...base,
    defaultOn,
    fuelGated,
    allocationKey: key,
  };
}

export function listAllocationKeys() {
  return Object.keys(LAYER_ALLOCATIONS);
}
